import express from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

const AI_CORE_URL = (process.env.AI_CORE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');

/**
 * Extrait de façon agnostique le texte principal d'une requête
 * en s'appuyant sur les métadonnées déclaratives du Use Case (input_schema).
 */
function extractPrimaryTextField(body, inputSchema = []) {
  if (!body || typeof body !== 'object') return '';

  // 1. Priorité aux clés universelles canoniques
  if (typeof body.text === 'string' && body.text.trim()) return body.text.trim();
  if (typeof body.texte === 'string' && body.texte.trim()) return body.texte.trim();
  if (typeof body.content === 'string' && body.content.trim()) return body.content.trim();
  if (typeof body.query === 'string' && body.query.trim()) return body.query.trim();

  // 2. Résolution déclarative basée sur le input_schema du Use Case
  let schemaList = [];
  if (Array.isArray(inputSchema)) {
    schemaList = inputSchema;
  } else if (typeof inputSchema === 'string') {
    try { schemaList = JSON.parse(inputSchema); } catch (_) {}
  }

  if (Array.isArray(schemaList) && schemaList.length > 0) {
    const stringFields = schemaList.filter(f => f && f.type === 'string');

    // 2.a. Chercher en priorité un champ string obligatoire (required: true) présent dans le body
    const requiredField = stringFields.find(f => f.required && typeof body[f.name] === 'string' && body[f.name].trim());
    if (requiredField) {
      return body[requiredField.name].trim();
    }

    // 2.b. Chercher n'importe quel champ string déclaré présent dans le body
    for (const f of stringFields) {
      if (typeof body[f.name] === 'string' && body[f.name].trim()) {
        return body[f.name].trim();
      }
    }
  }

  // 3. Repli universel : première propriété string non vide qui n'est pas un identifiant, métadonnée ou flux binaire/base64
  const metaKeys = new Set(['id', 'token', 'action', 'type', 'channel', 'canal', 'produit', 'product', 'lang', 'language', 'category', 'categorie', 'motif', 'filename', 'file_name']);
  for (const [key, val] of Object.entries(body)) {
    const k = key.toLowerCase();
    if (typeof val === 'string' && val.trim().length > 0 && !metaKeys.has(k) && !k.includes('base64') && !k.includes('audio')) {
      return val.trim();
    }
  }

  return '';
}

// Intercepte toutes les requêtes dynamiques
router.all('/*', async (req, res) => {
  const startedAt = Date.now();
  const method = req.method;
  const requestPath = req.params[0].replace(/^\/+|\/+$/g, '');
  let projectId = req.headers['x-project-id'] || null;
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let matchedEndpoint = null;
  let matchedModule = null;
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

  let resolvedModelName = null;
  let resolvedProviderName = null;
  let resolvedPromptName = null;

  const persistExecution = async ({
    status = 'success',
    outputData = null,
    errorMsg = null,
    configSnapshot = null,
    resourcesUsed = null,
    provider = null,
    model = null,
    humanValidation = null,
    justification = null,
    contextReference = null,
  }) => {
    try {
      const duration = Date.now() - startedAt;
      let projectName = req.headers['x-project-name'] ? decodeURIComponent(req.headers['x-project-name']) : null;
      if (!projectName && projectId) {
        try {
          const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
          if (proj?.name) projectName = proj.name;
        } catch (_) {}
      }
      const defaultValidation = configSnapshot?.human_validation_required
        ? 'required'
        : (status === 'success' ? 'pending' : 'none');

      const defaultJustification = configSnapshot?.human_validation_required
        ? 'Validation humaine requise par la policy'
        : (status === 'success' ? 'En attente de justification humaine' : null);

      const createdExec = await prisma.aIExecution.create({
        data: {
          project_id: projectId,
          project_name: projectName,
          module_name: matchedModule?.module_key || matchedModule?.name || 'unknown',
          use_case: matchedEndpoint?.use_case_key || null,
          prompt_name: resolvedPromptName || matchedEndpoint?.use_case_key || null,
          prompt_version: matchedModule?.version || '1.0.0',
          provider: provider || resolvedProviderName || null,
          model: model || resolvedModelName || null,
          status,
          execution_time: duration,
          user_name: req.headers['x-user-name'] || req.user?.username || req.user?.email || 'API User',
          error: errorMsg || null,
          input_reference: req.body ? JSON.stringify(req.body) : null,
          output: outputData ? (typeof outputData === 'string' ? outputData : JSON.stringify(outputData)) : null,
          configuration_snapshot: configSnapshot ? JSON.stringify(configSnapshot) : (matchedModule?.configuration || null),
          resources_used: resourcesUsed ? (typeof resourcesUsed === 'string' ? resourcesUsed : JSON.stringify(resourcesUsed)) : null,
          context_reference: contextReference ? (typeof contextReference === 'string' ? contextReference : JSON.stringify(contextReference)) : null,
          human_validation: humanValidation || defaultValidation,
          justification: justification || defaultJustification,
        },
      });
      if (createdExec?.id && !res.headersSent) {
        res.setHeader('x-execution-id', createdExec.id);
      }
      await prisma.auditEvent.create({
        data: {
          action: 'DYNAMIC_AI_EXECUTION',
          project_id: projectId,
          project_name: projectName,
          module_id: matchedModule?.id || null,
          module_name: matchedModule?.module_key || matchedModule?.name || null,
          use_case: matchedEndpoint?.use_case_key || null,
          entity_type: 'AIExecution',
          new_value: status,
          comment: `Dynamic execution via ${method} /api/dynamic/${requestPath} (${duration}ms)`,
          user_name: req.user?.username || 'api-gateway',
        },
      });
    } catch (auditError) {
      console.error('Audit persistence error:', auditError);
    }
  };

  try {

    // 1. Chercher un module actif ou publié qui expose cet endpoint (exclut uniquement les modules archivés)
    const modules = await prisma.module.findMany({
      where: {
        NOT: { lifecycle: 'archived' }
      }
    });

    matchedEndpoint = null;
    matchedModule = null;

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

    // Résolution automatique du project_id via le module si non fourni dans les en-têtes
    if (!projectId && matchedModule?.id) {
      try {
        const linkedProject = await prisma.project.findFirst({
          where: { modules: { contains: matchedModule.id } }
        });
        if (linkedProject) {
          projectId = linkedProject.id;
        }
      } catch (_) {}
    }

    // 2. Contrôle de l'authentification et des autorisations
    const isInternalRunner = req.headers['x-caller'] === 'modulai-internal-runner';
    const authRequired = matchedEndpoint.auth_required !== false;
    const authHeader = req.headers['authorization'] || '';
    const apiKeyHeader = req.headers['x-api-key'] || '';
    const rawApiKey = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : (apiKeyHeader.trim() || (authHeader ? authHeader.trim() : null));

    let authenticatedKey = null;

    if (isInternalRunner) {
      // Exécution interne depuis la console d'administration ModulAI (UseCaseRunner)
      // Aucun besoin de clé d'API développeur externe
    } else if (rawApiKey) {
      const keyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

      authenticatedKey = await prisma.apiKey.findFirst({
        where: {
          OR: [
            { secret_hash: keyHash },
            { secret_hash: rawApiKey }
          ]
        }
      });

      if (!authenticatedKey) {
        await persistLog(401);
        return res.status(401).json({
          status: 'error',
          error: 'Invalid API Key',
          message: 'The provided API key is invalid or unrecognized.'
        });
      }

      if (authenticatedKey.status && authenticatedKey.status !== 'active') {
        await persistLog(403);
        return res.status(403).json({
          status: 'error',
          error: 'API Key Revoked',
          message: `The API key is currently ${authenticatedKey.status}.`
        });
      }

      if (authenticatedKey.expires_at && new Date(authenticatedKey.expires_at) < new Date()) {
        await persistLog(403);
        return res.status(403).json({
          status: 'error',
          error: 'API Key Expired',
          message: 'The provided API key has expired.'
        });
      }

      // Vérification des scopes requis par l'endpoint
      const requiredScopes = Array.isArray(matchedEndpoint.required_scopes)
        ? matchedEndpoint.required_scopes
        : [];

      if (requiredScopes.length > 0) {
        let keyScopes = [];
        try {
          keyScopes = typeof authenticatedKey.scopes === 'string'
            ? JSON.parse(authenticatedKey.scopes)
            : (Array.isArray(authenticatedKey.scopes) ? authenticatedKey.scopes : []);
        } catch (_) {
          keyScopes = String(authenticatedKey.scopes || '').split(',').map(s => s.trim()).filter(Boolean);
        }

        const hasRequiredScope = keyScopes.includes('*') ||
          keyScopes.includes('admin') ||
          keyScopes.includes('execute') ||
          requiredScopes.some(rs => keyScopes.includes(rs));

        if (!hasRequiredScope) {
          await persistLog(403);
          return res.status(403).json({
            status: 'error',
            error: 'Forbidden',
            message: `API Key does not possess the required scopes: [${requiredScopes.join(', ')}]. Granted: [${keyScopes.join(', ')}].`
          });
        }
      }

      if (!projectId && authenticatedKey.project_id) {
        projectId = authenticatedKey.project_id;
      }

      // Mise à jour asynchrone du dernier usage
      prisma.apiKey.update({
        where: { id: authenticatedKey.id },
        data: { last_used_at: new Date() }
      }).catch(err => console.error('Error updating apiKey last_used_at:', err));

    } else if (authRequired) {
      await persistLog(401);
      return res.status(401).json({
        status: 'error',
        error: 'Unauthorized',
        message: 'Missing API Key. Please provide a valid API Key via Authorization: Bearer <key> or x-api-key header.'
      });
    }

    // 3. Extraire la clé du Use Case
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
    resolvedPromptName = useCaseKey;
    let matchedUseCase = null;
    let outputSchema = null;
    let inputSchema = null;
    let useCaseRagConfig = {};
    let useCaseSteps = null;
    let useCaseOutputStrategy = 'merge_all';
    
    if (matchedModule.use_cases) {
      try {
        const useCases = JSON.parse(matchedModule.use_cases);
        const uc = useCases.find(u => u.key === useCaseKey || `${moduleKey}:${u.key}` === canonicalUseCaseKey);
        if (uc) {
          matchedUseCase = uc;
          if (uc.prompt_name) resolvedPromptName = uc.prompt_name;
          if (uc.rag_config && typeof uc.rag_config === 'object') useCaseRagConfig = uc.rag_config;
          if (uc.output_schema && uc.output_schema.length > 0) {
            outputSchema = uc.output_schema;
          }
          if (uc.input_schema && uc.input_schema.length > 0) {
            inputSchema = uc.input_schema;
          }
          if (Array.isArray(uc.steps)) {
            useCaseSteps = uc.steps;
          }
          if (uc.configuration) {
            try {
              const parsedConf = typeof uc.configuration === 'string' ? JSON.parse(uc.configuration) : uc.configuration;
              if (Array.isArray(parsedConf.steps)) useCaseSteps = parsedConf.steps;
              if (parsedConf.output_strategy) useCaseOutputStrategy = parsedConf.output_strategy;
            } catch (_) {}
          }
          if (uc.output_strategy) useCaseOutputStrategy = uc.output_strategy;
        }
      } catch (e) {}
    }

    if (req.body?.output_schema) {
      outputSchema = req.body.output_schema;
    }
    if (req.body?.input_schema) {
      inputSchema = req.body.input_schema;
    }

    let resolvedPromptInstructions = matchedUseCase?.instructions || matchedUseCase?.prompt || null;
    if (!resolvedPromptInstructions) {
      try {
        const promptRecord = await prisma.prompt.findFirst({
          where: {
            OR: [
              { use_case: canonicalUseCaseKey },
              { use_case: resolvedPromptName },
              { name: resolvedPromptName },
            ],
            status: 'active',
          },
        });
        if (promptRecord?.instructions) {
          resolvedPromptInstructions = promptRecord.instructions;
        }
      } catch (_) {}
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

    let defaultSettings = null;
    try {
      defaultSettings = await prisma.coreSettings.findFirst();
    } catch (_) {}

    resolvedModelName = defaultSettings?.default_model_name || defaultSettings?.default_model_id || null;
    resolvedProviderName = defaultSettings?.default_provider || null;

    if (!resolvedModelName) {
      try {
        const defaultModel = (await prisma.aiModel.findFirst({ where: { is_default: true } })) || (await prisma.aiModel.findFirst());
        resolvedModelName = defaultModel?.name || defaultModel?.model_id || 'default';
      } catch (_) {
        resolvedModelName = 'default';
      }
    }

    if (!resolvedProviderName) {
      try {
        const defaultProvider = (await prisma.aiProvider.findFirst({ where: { is_default: true } })) || (await prisma.aiProvider.findFirst());
        resolvedProviderName = defaultProvider?.name || defaultProvider?.type || 'default';
      } catch (_) {
        resolvedProviderName = 'default';
      }
    }

    let matchedAiModel = null;
    if (modelOptions.model) {
      try {
        matchedAiModel = await prisma.aiModel.findFirst({
          where: {
            OR: [
              { id: modelOptions.model },
              { model_id: modelOptions.model },
              { name: modelOptions.model },
            ]
          }
        });
        if (matchedAiModel?.model_id) {
          resolvedModelName = matchedAiModel.model_id;
        } else if (matchedAiModel?.name) {
          resolvedModelName = matchedAiModel.name;
        } else {
          resolvedModelName = modelOptions.model;
        }
      } catch (_) {
        resolvedModelName = modelOptions.model;
      }
    }

    let matchedAiProvider = null;
    if (modelOptions.provider) {
      try {
        matchedAiProvider = await prisma.aiProvider.findFirst({
          where: {
            OR: [
              { id: modelOptions.provider },
              { name: modelOptions.provider },
            ]
          }
        });
        if (matchedAiProvider?.name) {
          resolvedProviderName = matchedAiProvider.name;
        } else {
          resolvedProviderName = modelOptions.provider;
        }
      } catch (_) {
        resolvedProviderName = modelOptions.provider;
      }
    } else if (matchedAiModel?.provider_id) {
      try {
        matchedAiProvider = await prisma.aiProvider.findUnique({
          where: { id: matchedAiModel.provider_id }
        });
        if (matchedAiProvider?.name) {
          resolvedProviderName = matchedAiProvider.name;
        }
      } catch (_) {}
    } else {
      try {
        matchedAiProvider = (await prisma.aiProvider.findFirst({ where: { is_default: true } })) || (await prisma.aiProvider.findFirst());
      } catch (_) {}
    }

    // Helper pour résoudre le provider audio dédié (Groq / OpenAI / Whisper)
    const resolveAudioProviderConfig = async () => {
      let audioProvider = matchedAiProvider;
      let audioModel = resolvedModelName;
      if (!audioProvider || !['groq', 'openai'].includes(audioProvider.type?.toLowerCase())) {
        try {
          const allActiveProviders = await prisma.aiProvider.findMany({ where: { status: 'active' } });
          const dedicatedAudioProvider = allActiveProviders.find(p => 
            p.type?.toLowerCase() === 'groq' ||
            p.type?.toLowerCase() === 'openai' ||
            p.name?.toLowerCase().includes('groq') ||
            p.name?.toLowerCase().includes('whisper')
          );
          if (dedicatedAudioProvider) {
            audioProvider = dedicatedAudioProvider;
            const allActiveModels = await prisma.aiModel.findMany({ where: { status: 'active' } });
            const whisperModel = allActiveModels.find(m => 
              m.provider_id === dedicatedAudioProvider.id && 
              m.name?.toLowerCase().includes('whisper')
            );
            if (whisperModel) {
              audioModel = whisperModel.model_id || whisperModel.name;
            } else if (dedicatedAudioProvider.type?.toLowerCase() === 'groq') {
              audioModel = 'whisper-large-v3';
            }
          }
        } catch (e) {
          console.error("Erreur lors de la résolution du provider audio :", e);
        }
      }
      return {
        provider: audioProvider?.name || resolvedProviderName,
        model: audioModel || resolvedModelName,
        apiKey: audioProvider?.api_key || audioProvider?.secret_hash || undefined,
        endpointUrl: audioProvider?.endpoint_url?.includes('/audio/transcriptions') ? audioProvider.endpoint_url : undefined,
      };
    };

    // Détermination sémantique du type de Use Case (Architecture Découplée)
    const candidateType = (matchedUseCase?.type || matchedEndpoint.type || 'standard').toLowerCase();

    // -------------------------------------------------------------------------
    // PILIER 2 (STANDALONE) : Recherche RAG Pure (Recherche Documentaire sans LLM)
    // -------------------------------------------------------------------------
    if (candidateType === 'search' || matchedEndpoint.type === 'search') {
      const searchPayload = {
        query: req.body?.query || req.body?.search || extractPrimaryTextField(req.body, inputSchema),
        collection: req.body?.collection || ragConfig.collection || ragConfig.documentary_collection || ragConfig.historical_collection || 'default',
        top_k: Number(req.body?.top_k || ragConfig.top_k || 3),
        filter_metadata: req.body?.filter_metadata || ragConfig.filter_metadata || undefined,
        min_similarity_score: req.body?.min_similarity_score !== undefined
          ? Number(req.body.min_similarity_score)
          : (ragConfig.min_similarity_score !== undefined ? Number(ragConfig.min_similarity_score) : 0.0),
      };

      const aiResponse = await fetch(`${AI_CORE_URL}/api/rag/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchPayload),
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.text();
        await persistLog(aiResponse.status);
        await persistExecution({ status: 'failed', errorMsg: errorData });
        return res.status(aiResponse.status).json({ error: 'AI Core RAG Search Error', details: errorData });
      }

      const data = await aiResponse.json();
      const docsCount = Array.isArray(data.results) ? data.results.length : (Array.isArray(data) ? data.length : 0);
      const responseData = { status: 'success', ...data };
      await persistLog(200);
      await persistExecution({
        status: 'success',
        outputData: responseData,
        resourcesUsed: { documents_found: docsCount, collection: searchPayload.collection }
      });
      return res.json(responseData);
    }

    // -------------------------------------------------------------------------
    // PILIER 1 (STANDALONE) : Moteur Audio Pur (Speech-to-Text sans LLM forcé)
    // -------------------------------------------------------------------------
    const isExplicitComposite = candidateType === 'composite' || matchedEndpoint.type === 'composite' || req.body?.transcribe_and_analyze === true;
    if ((candidateType === 'audio' || matchedEndpoint.type === 'audio' || req.body?.audio_base64) && !isExplicitComposite && candidateType !== 'standard') {
      let vocabularyTerms = [];
      let speakerRoles = undefined;
      if (matchedModule.configuration) {
        try {
          const modConf = JSON.parse(matchedModule.configuration);
          if (Array.isArray(modConf.vocabulary_terms)) vocabularyTerms = modConf.vocabulary_terms;
          if (Array.isArray(modConf.speaker_roles)) speakerRoles = modConf.speaker_roles;
        } catch (e) {}
      }

      const audioConfig = await resolveAudioProviderConfig();
      const audioPayload = {
        audio_base64: req.body?.audio_base64,
        filename: req.body?.filename || 'audio.mp3',
        project_id: projectId,
        module_key: moduleKey,
        use_case_key: useCaseKey,
        provider: audioConfig.provider,
        model: audioConfig.model,
        api_key: req.body?.api_key || audioConfig.apiKey,
        endpoint_url: req.body?.endpoint_url || audioConfig.endpointUrl,
        language: req.body?.language || 'fr',
        vocabulary_terms: req.body?.vocabulary_terms || vocabularyTerms,
        enable_correction: req.body?.enable_correction !== false,
        diarization: req.body?.diarization ?? Boolean(speakerRoles),
        speaker_roles: req.body?.speaker_roles || speakerRoles,
        custom_correction_prompt: req.body?.custom_correction_prompt,
      };

      const aiResponse = await fetch(`${AI_CORE_URL}/api/audio/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audioPayload),
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.text();
        await persistLog(aiResponse.status);
        await persistExecution({ status: 'failed', errorMsg: errorData });
        return res.status(aiResponse.status).json({ error: 'AI Core Audio Error', details: errorData });
      }

      const data = await aiResponse.json();
      const wordCount = data.structure?.word_count || (data.text ? data.text.split(/\s+/).filter(Boolean).length : 0);
      const responseData = { status: 'success', ...data };
      await persistLog(200);
      await persistExecution({
        status: 'success',
        outputData: responseData,
        resourcesUsed: { audio_seconds: data.duration_seconds || 0, duration_seconds: data.duration_seconds || 0, word_count: wordCount }
      });
      return res.json(responseData);
    }

    // -------------------------------------------------------------------------
    // PILIERS COMPOSÉS : Audio ➔ LLM Orchestrator (Composite Chained Execution)
    // -------------------------------------------------------------------------
    if (isExplicitComposite || (req.body?.audio_base64 && candidateType === 'standard')) {
      let vocabularyTerms = [];
      let speakerRoles = undefined;
      if (matchedModule.configuration) {
        try {
          const modConf = JSON.parse(matchedModule.configuration);
          if (Array.isArray(modConf.vocabulary_terms)) vocabularyTerms = modConf.vocabulary_terms;
          if (Array.isArray(modConf.speaker_roles)) speakerRoles = modConf.speaker_roles;
        } catch (e) {}
      }

      const audioConfig = await resolveAudioProviderConfig();
      const audioPayload = {
        audio_base64: req.body?.audio_base64,
        filename: req.body?.filename || 'audio.mp3',
        project_id: projectId,
        module_key: moduleKey,
        use_case_key: useCaseKey,
        provider: audioConfig.provider,
        model: audioConfig.model,
        api_key: req.body?.api_key || audioConfig.apiKey,
        endpoint_url: req.body?.endpoint_url || audioConfig.endpointUrl,
        language: req.body?.language || 'fr',
        vocabulary_terms: req.body?.vocabulary_terms || vocabularyTerms,
        enable_correction: req.body?.enable_correction !== false,
        diarization: req.body?.diarization ?? Boolean(speakerRoles),
        speaker_roles: req.body?.speaker_roles || speakerRoles,
        custom_correction_prompt: req.body?.custom_correction_prompt,
      };

      const audioResponse = await fetch(`${AI_CORE_URL}/api/audio/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audioPayload),
      });

      if (!audioResponse.ok) {
        const errorData = await audioResponse.text();
        await persistLog(audioResponse.status);
        await persistExecution({ status: 'failed', errorMsg: `Transcription audio échouée: ${errorData}` });
        return res.status(audioResponse.status).json({ error: 'AI Core Audio Error', details: errorData });
      }

      const audioData = await audioResponse.json();
      const transcribedText = audioData.text || '';

      const compositeInput = {
        ...req.body,
        text: transcribedText,
        transcribed_text: transcribedText,
        transcription: transcribedText,
        audio_duration: audioData.duration_seconds || 0,
        audio_meta: {
          duration_seconds: audioData.duration_seconds || 0,
          speakers: audioData.speakers || [],
          segments: audioData.segments || []
        }
      };

      const userPrompt = Object.entries(compositeInput)
        .filter(([key]) => key !== 'audio_base64')
        .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value ?? ''}`)
        .join('\n');

      if (ragConfig.enabled && !ragConfig.query) {
        ragConfig.query = transcribedText || userPrompt;
      }
      const requestOptions = {};
      if (ragConfig.query) requestOptions.rag_query = ragConfig.query;
      if (ragConfig.top_k !== undefined) requestOptions.top_k = ragConfig.top_k;

      const executePayload = {
        module_id: matchedModule.id,
        module_key: moduleKey,
        use_case_key: useCaseKey,
        module: moduleKey,
        use_case: resolvedPromptName,
        system_prompt_template: resolvedPromptInstructions,
        user_prompt: userPrompt,
        input: compositeInput,
        variables: compositeInput,
        request_options: requestOptions,
        output_schema: outputSchema,
        model_options: modelOptions,
        rag_config: ragConfig,
        project_id: projectId,
        project_name: req.headers['x-project-name'] ? decodeURIComponent(req.headers['x-project-name']) : null,
        input_reference: { ...req.body, audio_base64: '[AUDIO_BASE64_STREAM]' },
        context_reference: {
          base_de_donnees: Boolean(ragConfig.enabled),
          historique: Boolean(ragConfig.historical_collection),
          audio: true
        },
        delegate_audit: true,
      };

      const aiResponse = await fetch(`${AI_CORE_URL}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(executePayload),
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.text();
        await persistLog(aiResponse.status);
        await persistExecution({ status: 'failed', errorMsg: `Exécution LLM composite échouée: ${errorData}` });
        return res.status(aiResponse.status).json({ error: 'AI Core LLM Error', details: errorData });
      }

      const executeData = await aiResponse.json();
      let parsedResult = null;
      try {
        if (typeof executeData.result === 'string') {
          parsedResult = JSON.parse(executeData.result);
        } else if (typeof executeData.result === 'object' && executeData.result !== null) {
          parsedResult = executeData.result;
        }
      } catch (_) {}

      const combinedData = {
        status: 'success',
        ...(parsedResult && typeof parsedResult === 'object' ? parsedResult : {}),
        ...executeData,
        result: parsedResult || executeData.result,
        audio_transcription: audioData,
        transcription: audioData
      };

      const wordCount = audioData.structure?.word_count || transcribedText.split(/\s+/).filter(Boolean).length;
      const combinedResources = {
        audio_seconds: audioData.duration_seconds || 0,
        word_count: wordCount,
        ...(executeData.resources_used || {})
      };

      await persistLog(200);
      await persistExecution({
        status: 'success',
        outputData: combinedData,
        resourcesUsed: combinedResources,
        contextReference: executePayload.context_reference,
        provider: executeData.resolved_configuration?.provider?.name || null,
        model: executeData.resolved_configuration?.model?.name || null,
        configSnapshot: executeData.resolved_configuration || null,
      });
      return res.json(combinedData);
    }

    // -------------------------------------------------------------------------
    // RÉTROCOMPATIBILITÉ LEGACY : Support des pipelines spécialisés GPR v1
    // (Conserve 100% de conformité tant que le Use Case n'est pas déclaré "standard")
    // -------------------------------------------------------------------------
    if (matchedUseCase?.type !== 'standard' && matchedUseCase?.type !== 'pipeline' && !req.body?.steps && !useCaseSteps) {
      // Endpoint NLP & Classification sémantique legacy
      if (matchedEndpoint.type === 'nlp_analysis' || matchedEndpoint.type === 'classification' || req.body?.taxonomy || (req.body?.text && req.body?.sensitive_keywords)) {
        let modTaxonomy = undefined;
        let modKeywords = [];
        let modUrgencyLevels = undefined;
        let modContextNature = undefined;
        let modContextDef = undefined;

        if (matchedModule.configuration) {
          try {
            const modConf = JSON.parse(matchedModule.configuration);
            if (modConf.taxonomy) modTaxonomy = modConf.taxonomy;
            if (Array.isArray(modConf.sensitive_keywords)) modKeywords = modConf.sensitive_keywords;
            if (Array.isArray(modConf.urgency_levels)) modUrgencyLevels = modConf.urgency_levels;
            if (modConf.context_nature) modContextNature = modConf.context_nature;
            if (modConf.context_definition) modContextDef = modConf.context_definition;
          } catch (e) {}
        }

        const nlpPayload = {
          text: extractPrimaryTextField(req.body, inputSchema),
          project_id: projectId,
          module_key: moduleKey,
          use_case_key: useCaseKey,
          provider: resolvedProviderName,
          model: resolvedModelName,
          taxonomy: req.body?.taxonomy || req.body?.categories_motifs || modTaxonomy,
          sensitive_keywords: req.body?.sensitive_keywords || req.body?.mots_sensibles || modKeywords,
          urgency_levels: req.body?.urgency_levels || modUrgencyLevels || ['MINEUR', 'MOYEN', 'GRAVE'],
          context_nature: req.body?.context_nature || req.body?.nature_dossier || modContextNature || 'DOSSIER',
          context_definition: req.body?.context_definition || req.body?.definition_nature || modContextDef || '',
          enable_llm_reasoning: req.body?.enable_llm_reasoning !== false,
          generate_summary: req.body?.generate_summary !== false,
          summary_type: req.body?.summary_type || 'extractive',
          max_summary_words: req.body?.max_summary_words || 50,
          language: req.body?.language || 'fr',
        };

        const aiResponse = await fetch(`${AI_CORE_URL}/api/nlp/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nlpPayload),
        });

        if (!aiResponse.ok) {
          const errorData = await aiResponse.text();
          await persistLog(aiResponse.status);
          await persistExecution({ status: 'failed', errorMsg: errorData });
          return res.status(aiResponse.status).json({ error: 'AI Core NLP Error', details: errorData });
        }

        const data = await aiResponse.json();
        await persistLog(200);
        await persistExecution({ status: 'success', outputData: data, resourcesUsed: { execution_time_ms: data.execution_time_ms } });
        return res.json(data);
      }

      // Endpoint RAG Résolution assistée legacy
      if (matchedEndpoint.type === 'rag_resolution' || req.body?.historical_collection || (matchedEndpoint.type === 'search' && (ragConfig.enabled || req.body?.query))) {
        let modHistCol = undefined;
        let modDocCol = undefined;
        let modHistFilter = undefined;
        let modDocFilter = undefined;
        let modNumProps = undefined;

        if (matchedModule.configuration) {
          try {
            const modConf = JSON.parse(matchedModule.configuration);
            if (modConf.historical_collection) modHistCol = modConf.historical_collection;
            if (modConf.documentary_collection) modDocCol = modConf.documentary_collection;
            if (modConf.history_filter) modHistFilter = modConf.history_filter;
            if (modConf.documentary_filter) modDocFilter = modConf.documentary_filter;
            if (modConf.num_propositions) modNumProps = modConf.num_propositions;
          } catch (e) {}
        }

        const ragResolvePayload = {
          query: req.body?.query || req.body?.texte_actuel || extractPrimaryTextField(req.body, inputSchema),
          project_id: projectId,
          module_key: moduleKey,
          use_case_key: useCaseKey,
          provider: resolvedProviderName,
          model: resolvedModelName,
          historical_collection: req.body?.historical_collection || ragConfig.collection || modHistCol,
          documentary_collection: req.body?.documentary_collection || modDocCol,
          top_k_history: req.body?.top_k_history || ragConfig.top_k || 3,
          top_k_docs: req.body?.top_k_docs || 3,
          min_similarity_score: req.body?.min_similarity_score,
          history_filter: req.body?.history_filter || ragConfig.filter_metadata || modHistFilter,
          documentary_filter: req.body?.documentary_filter || modDocFilter,
          num_propositions: req.body?.num_propositions || modNumProps || 3,
          system_role_instruction: req.body?.system_role_instruction,
          custom_resolution_prompt: req.body?.custom_resolution_prompt,
          target_solution_field: req.body?.target_solution_field,
        };

        const aiResponse = await fetch(`${AI_CORE_URL}/api/rag/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ragResolvePayload),
        });

        if (!aiResponse.ok) {
          const errorData = await aiResponse.text();
          await persistLog(aiResponse.status);
          await persistExecution({ status: 'failed', errorMsg: errorData });
          return res.status(aiResponse.status).json({ error: 'AI Core RAG Error', details: errorData });
        }

        const data = await aiResponse.json();
        await persistLog(200);
        await persistExecution({ status: 'success', outputData: data, resourcesUsed: { propositions_count: data.propositions?.length, sources_count: data.sources_used?.length } });
        return res.json(data);
      }

      // Endpoint Analytics & Text-to-Viz legacy
      if (matchedEndpoint.type === 'analytics' || matchedEndpoint.type === 'text_to_viz' || req.body?.dataset_schema || (req.body?.query && req.body?.records)) {
        let modSchema = undefined;
        if (matchedModule.configuration) {
          try {
            const modConf = JSON.parse(matchedModule.configuration);
            if (modConf.dataset_schema) modSchema = modConf.dataset_schema;
          } catch (e) {}
        }

        const analyticsPayload = {
          query: req.body?.query || req.body?.question || '',
          dataset_schema: req.body?.dataset_schema || modSchema || { fields: [] },
          records: req.body?.records || req.body?.data || [],
          project_id: projectId,
          module_key: moduleKey,
          use_case_key: useCaseKey,
          provider: resolvedProviderName,
          model: resolvedModelName,
        };

        const aiResponse = await fetch(`${AI_CORE_URL}/api/analytics/chart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(analyticsPayload),
        });

        if (!aiResponse.ok) {
          const errorData = await aiResponse.text();
          await persistLog(aiResponse.status);
          await persistExecution({ status: 'failed', errorMsg: errorData });
          return res.status(aiResponse.status).json({ error: 'AI Core Analytics Error', details: errorData });
        }

        const data = await aiResponse.json();
        await persistLog(200);
        await persistExecution({ status: 'success', outputData: data, resourcesUsed: { chart_type: data.chart_type, row_count: data.raw_aggregations?.length } });
        return res.json(data);
      }
    }

    // -------------------------------------------------------------------------
    // PILIER 3 (UNIVERSEL) : Orchestrateur LLM Prompt-First & Context-Driven
    // Endpoint cible : POST /api/execute
    // -------------------------------------------------------------------------
    const userPrompt = Object.entries(req.body || {})
      .filter(([key]) => key !== 'audio_base64')
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value ?? ''}`)
      .join('\n');

    if (ragConfig.enabled && !ragConfig.query) {
      ragConfig.query = extractPrimaryTextField(req.body, inputSchema) || userPrompt;
    }
    const requestOptions = {};
    if (ragConfig.query) requestOptions.rag_query = ragConfig.query;
    if (ragConfig.top_k !== undefined) requestOptions.top_k = ragConfig.top_k;

    const payload = {
      module_id: matchedModule.id,
      module_key: moduleKey,
      use_case_key: useCaseKey,
      module: moduleKey,
      use_case: resolvedPromptName,
      system_prompt_template: resolvedPromptInstructions,
      user_prompt: userPrompt,
      input: req.body || {},
      variables: req.body || {},
      steps: req.body?.steps || useCaseSteps || undefined,
      output_strategy: req.body?.output_strategy || useCaseOutputStrategy || 'merge_all',
      request_options: requestOptions,
      output_schema: outputSchema,
      model_options: modelOptions,
      rag_config: ragConfig,
      project_id: projectId,
      project_name: req.headers['x-project-name'] ? decodeURIComponent(req.headers['x-project-name']) : null,
      input_reference: req.body,
      context_reference: {
        base_de_donnees: Boolean(ragConfig.enabled),
        historique: Boolean(ragConfig.historical_collection),
      },
      delegate_audit: true,
    };

    const aiResponse = await fetch(`${AI_CORE_URL}/api/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      let errorMsg = errorText;
      try {
        const parsed = JSON.parse(errorText);
        errorMsg = parsed.detail || parsed.message || parsed.error || errorText;
      } catch (_) {}
      await persistLog(aiResponse.status);
      await persistExecution({ status: 'failed', errorMsg });
      return res.status(aiResponse.status).json({
        status: 'error',
        error: errorMsg,
        message: errorMsg,
      });
    }

    const data = await aiResponse.json();

    if (data.status === 'error') {
      const errorMsg = data.message || data.error || 'Erreur d’exécution IA';
      await persistLog(502);
      await persistExecution({ status: 'failed', errorMsg });
      return res.status(502).json({
        status: 'error',
        error: errorMsg,
        message: errorMsg,
        ...data,
      });
    }

    let parsedResult = null;
    try {
      if (typeof data.result === 'string') {
        parsedResult = JSON.parse(data.result);
      } else if (typeof data.result === 'object' && data.result !== null) {
        parsedResult = data.result;
      }
    } catch (_) {}

    let finalData = data;
    if (parsedResult && typeof parsedResult === 'object') {
      if (data.pipeline_metrics && !parsedResult.pipeline_metrics) {
        parsedResult.pipeline_metrics = data.pipeline_metrics;
      }
      if (data.steps_detail && !parsedResult.steps_detail) {
        parsedResult.steps_detail = data.steps_detail;
      }
      finalData = {
        status: 'success',
        ...parsedResult,
        ...data,
        result: parsedResult,
      };
    }

    const cleanOutput = (parsedResult !== null && parsedResult !== undefined)
      ? parsedResult
      : (data.result !== undefined ? data.result : finalData);

    const combinedExecutionResources = {
      ...(data.resources_used || {}),
      ...(data.pipeline_metrics ? { pipeline: data.pipeline_metrics } : {}),
      ...(data.execution_time_ms ? { inference_time_ms: data.execution_time_ms } : {}),
    };

    await persistLog(200);
    await persistExecution({
      status: 'success',
      outputData: finalData,
      resourcesUsed: Object.keys(combinedExecutionResources).length > 0 ? combinedExecutionResources : null,
      provider: data.resolved_configuration?.provider?.name || null,
      model: data.resolved_configuration?.model?.name || null,
      configSnapshot: data.resolved_configuration || null,
      contextReference: payload.context_reference,
      humanValidation: data.resolved_configuration?.human_validation_required ? 'required' : 'pending',
      justification: data.resolved_configuration?.human_validation_required ? 'Validation humaine requise par la policy' : 'En attente de justification humaine',
    });
    return res.json(finalData);

  } catch (error) {
    console.error('API Gateway Error:', error);
    await persistLog(500);
    await persistExecution({ status: 'error', errorMsg: error.message });
    return res.status(500).json({ error: 'Internal Gateway Error', message: error.message });
  }
});

export default router;
