import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function parseConfiguration(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

function originsForProject(project) {
  const cors = parseConfiguration(project?.configuration).cors || {};
  return Array.isArray(cors.allowed_origins)
    ? cors.allowed_origins.filter((origin) => typeof origin === 'string' && origin.trim())
    : [];
}

function matchesOrigin(origin, allowedOrigins) {
  return allowedOrigins.includes(origin) || allowedOrigins.includes('*');
}

export async function projectCors(req, res, next) {
  const origin = req.get('Origin');
  if (!origin) return next();

  try {
    const projectId = req.get('x-project-id');
    const projects = projectId
      ? await prisma.project.findMany({ where: { id: projectId }, take: 1 })
      : await prisma.project.findMany({ take: 200 });
    const projectOrigins = projects.flatMap(originsForProject);
    const allowed = matchesOrigin(origin, [...configuredOrigins, ...projectOrigins]);

    if (!allowed) {
      return res.status(403).json({
        error: 'Origin not allowed by project CORS policy.',
        origin,
      });
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-project-id, x-project-name');
    res.setHeader('Access-Control-Max-Age', '600');

    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  } catch (error) {
    console.error('Project CORS error:', error);
    return res.status(500).json({ error: 'Unable to resolve project CORS policy.' });
  }
}
