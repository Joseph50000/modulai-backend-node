import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

const AI_CORE_URL = (process.env.AI_CORE_URL || 'http://localhost:8001').replace(/\/$/, '');

// Intercepte toutes les requêtes dynamiques
router.all('/*', async (req, res) => {
  const startedAt = Date.now();
  const method = req.method;
  const requestPath = req.params[0].replace(/^\/+|\/+$/g, '');
  const projectId = req.headers['x-project-id'] || null;
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const persistLog = async (statusCode) => {
    try {
      await prisma.apiLog.create({
        data: {
          request_id: requestId,
          project_id: projectId,
          endpoint: `/api/dynamic/${requestPath}`,
          method,
          status_code: statusCode,
          duration: Date.now() - startedAt,
          user_id: req.user?.id || null,
        },
      });
    } catch (logError) {
      console.error('API log persistence error:', logError);
    }
  };

  try {

    // 1. Chercher un module actif qui expose cet endpoint
    const modules = await prisma.module.findMany({
      where: { lifecycle: 'published' }
    });

    let matchedEndpoint = null;
    let matchedModule = null;

    for (const mod of modules) {
      if (!mod.endpoints) continue;
      let endpoints = [];
      try {
        endpoints = JSON.parse(mod.endpoints);
      } catch (e) { continue; }

      const ep = endpoints.find(e => {
        const epPath = (e.path || '').replace(/^\/+|\/+$/g, '');
        return epPath === requestPath && e.method === method;
      });
      if (ep) {
        matchedEndpoint = ep;
        matchedModule = mod;
        break;
      }
    }

    if (!matchedEndpoint) {
      await persistLog(404);
      return res.status(404).json({ error: 'Dynamic endpoint not found in any published module.' });
    }

    // 2. Extraire la clé du Use Case
    const useCaseKeyFull = matchedEndpoint.use_case_key; // ex: "gpr:analyse-plainte"
    if (!useCaseKeyFull) {
      await persistLog(400);
      return res.status(400).json({ error: 'Endpoint is not linked to any AI Use Case.' });
    }

    const parts = String(useCaseKeyFull).split(':');
    const moduleKey = matchedModule.module_key || parts[0];
    const useCaseKey = parts.length > 1 ? parts.slice(1).join(':') : parts[0];
    const canonicalUseCaseKey = `${moduleKey}:${useCaseKey}`;

    // Résoudre le vrai nom du prompt (prompt_name) défini dans le Use Case
    let resolvedPromptName = useCaseKey;
    let outputSchema = null;
    let useCaseRagConfig = {};
    
    if (matchedModule.use_cases) {
      try {
        const useCases = JSON.parse(matchedModule.use_cases);
        const uc = useCases.find(u => u.key === useCaseKey || `${moduleKey}:${u.key}` === canonicalUseCaseKey);
        if (uc) {
          if (uc.prompt_name) resolvedPromptName = uc.prompt_name;
          if (uc.rag_config && typeof uc.rag_config === 'object') useCaseRagConfig = uc.rag_config;
          if (uc.output_schema && uc.output_schema.length > 0) {
            outputSchema = uc.output_schema;
          }
        }
      } catch (e) {}
    }

    let modelOptions = {};
    let ragConfig = {};
    
    if (matchedModule.configuration) {
      try {
        const config = JSON.parse(matchedModule.configuration);
        modelOptions = {
          provider: config.provider,
          model: config.model || undefined,
          temperature: config.temperature,
          num_predict: config.max_tokens // Ollama uses num_predict for max tokens
        };
        ragConfig = {
          enabled: !!config.rag_enabled,
          knowledge_base_id: config.knowledge_base_id || config.knowledgeBaseId || undefined,
          collection: config.knowledge_base_collection || config.collection || undefined,
        };
        // Nettoyer les valeurs undefined
        Object.keys(modelOptions).forEach(key => modelOptions[key] === undefined && delete modelOptions[key]);
      } catch (e) {}
    }
    ragConfig = { ...ragConfig, ...useCaseRagConfig };

    // 3. Préparer le payload pour l'AI Core
    const userPrompt = Object.entries(req.body || {})
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value ?? ''}`)
      .join('\n');
    if (ragConfig.enabled && !ragConfig.query) ragConfig.query = userPrompt;
    const payload = {
      module: moduleKey, // Utiliser la vraie clé métier du module
      use_case: resolvedPromptName,
      user_prompt: userPrompt,
      variables: req.body, // On passe le body brut de la requête comme variables
      output_schema: outputSchema,
      model_options: modelOptions,
      rag_config: ragConfig,
      project_id: req.headers['x-project-id'] || null,
      project_name: req.headers['x-project-name'] ? decodeURIComponent(req.headers['x-project-name']) : null,
      input_reference: req.body, // The input form data
      context_reference: {
        "base_de_donnees": ragConfig.enabled,
        "historique": false
      }
    };

    // 4. Envoyer à l'AI Core
    const aiResponse = await fetch(`${AI_CORE_URL}/api/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!aiResponse.ok) {
      const errorData = await aiResponse.text();
      await persistLog(aiResponse.status);
      return res.status(aiResponse.status).json({ error: 'AI Core Error', details: errorData });
    }

    const data = await aiResponse.json();
    await persistLog(200);
    
    // 5. Retourner le résultat généré par l’IA au client
    return res.json(data);

  } catch (error) {
    console.error('API Gateway Error:', error);
    await persistLog(500);
    return res.status(500).json({ error: 'Internal Gateway Error', message: error.message });
  }
});

export default router;
