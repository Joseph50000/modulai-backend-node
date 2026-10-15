import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function parseConfiguration(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

function corsConfigForProject(project) {
  return parseConfiguration(project?.configuration).cors || {};
}

function matchesOrigin(origin, allowedOrigins) {
  if (!Array.isArray(allowedOrigins)) return false;
  return allowedOrigins.includes(origin) || allowedOrigins.includes('*');
}

export async function projectCors(req, res, next) {
  const origin = req.get('Origin');
  if (!origin) return next();

  try {
    // 1. Résolution de l'identifiant du projet ciblé
    let projectId = req.get('x-project-id') || req.query?.project_id || null;

    // Si pas de projectId dans les headers ou query, tenter de le résoudre via la clé API (Bearer ou x-api-key)
    if (!projectId) {
      const authHeader = req.get('authorization') || '';
      const apiKeyHeader = req.get('x-api-key') || '';
      const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : apiKeyHeader.trim();
      if (rawToken) {
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const keyRecord = await prisma.apiKey.findFirst({
          where: {
            OR: [
              { secret_hash: tokenHash },
              { secret_hash: rawToken }
            ]
          }
        });
        if (keyRecord?.project_id) {
          projectId = keyRecord.project_id;
        }
      }
    }

    // Si toujours pas de projectId (ex: requête preflight OPTIONS émise par le navigateur),
    // tenter de le résoudre via le module_key présent dans le chemin d'URL
    if (!projectId) {
      const cleanPath = (req.path || '').replace(/^\/+/, '');
      const moduleKeyFromPath = cleanPath.split('/')[0];
      if (moduleKeyFromPath) {
        try {
          const mod = await prisma.module.findFirst({
            where: { module_key: moduleKeyFromPath }
          });
          if (mod) {
            const linkedProject = await prisma.project.findFirst({
              where: { modules: { contains: mod.id } }
            });
            if (linkedProject) {
              projectId = linkedProject.id;
            }
          }
        } catch (_) {}
      }
    }

    // En cas de requête preflight OPTIONS sans project_id identifiable,
    // vérifier si l'origine est autorisée par au moins un projet actif
    if (!projectId && req.method === 'OPTIONS') {
      try {
        const allProjects = await prisma.project.findMany();
        const originAllowedAnywhere = allProjects.some((p) => {
          const conf = corsConfigForProject(p);
          if (conf.enabled === false) return false;
          const allowedOrigins = Array.isArray(conf.allowed_origins) ? conf.allowed_origins : [];
          return matchesOrigin(origin, allowedOrigins);
        });

        if (originAllowedAnywhere) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-project-id, x-project-name, x-api-key, x-caller');
          res.setHeader('Access-Control-Max-Age', '600');
          return res.sendStatus(204);
        }
      } catch (_) {}
    }

    if (!projectId) {
      return res.status(403).json({
        error: 'Project CORS error: Missing x-project-id header or valid project API key to resolve project CORS policy.',
        origin,
      });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return res.status(404).json({
        error: `Project CORS error: Project '${projectId}' not found.`,
        origin,
      });
    }

    const cors = corsConfigForProject(project);

    // Si CORS est explicitement désactivé pour ce projet
    if (cors.enabled === false) {
      return res.status(403).json({
        error: 'CORS is disabled for this project.',
        projectId,
        origin,
      });
    }

    // Récupération des origines autorisées pour CE projet uniquement
    const allowedOrigins = Array.isArray(cors.allowed_origins)
      ? cors.allowed_origins.filter((o) => typeof o === 'string' && o.trim())
      : [];

    const allowed = matchesOrigin(origin, allowedOrigins);

    if (!allowed) {
      return res.status(403).json({
        error: 'Origin not allowed by project CORS policy.',
        projectId,
        origin,
        allowedOrigins,
      });
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-project-id, x-project-name, x-api-key, x-caller');
    res.setHeader('Access-Control-Max-Age', '600');

    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  } catch (error) {
    console.error('Project CORS error:', error);
    return res.status(500).json({ error: 'Unable to resolve project CORS policy.' });
  }
}
