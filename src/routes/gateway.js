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

  const persistExecution = async ({ status = 'success', outputData = null, errorMsg = null, configSnapshot = null, resourcesUsed = null }) => {
    try {
      const duration = Date.now() - startedAt;
      await prisma.aIExecution.create({
        data: {
          project_id: projectId,
          project_name: req.headers['x-project-name'] ? decodeURIComponent(req.headers['x-project-name']) : null,
          module_name: matchedModule?.module_key || matchedModule?.name || 'unknown',
          use_case: matchedEndpoint?.use_case_key || null,
          status,
          execution_time: duration,
          user_name: req.user?.username || req.user?.email || 'api-gateway',
          error: errorMsg || null,
          input_reference: req.body ? JSON.stringify(req.body) : null,
          output: outputData ? (typeof outputData === 'string' ? outputData : JSON.stringify(outputData)) : null,
          configuration_snapshot: configSnapshot ? JSON.stringify(configSnapshot) : (matchedModule?.configuration || null),
          resources_used: resourcesUsed ? JSON.stringify(resourcesUsed) : null,
        },
      });
      await prisma.auditEvent.create({
        data: {
          action: 'DYNAMIC_AI_EXECUTION',
          project_id: projectId,
          project_name: req.headers['x-project-name'] ? decodeURIComponent(req.headers['x-project-name']) : null,
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

    // Support des endpoints audio (Transcription)
    if (matchedEndpoint.type === 'audio' || req.body?.audio_base64) {
      let vocabularyTerms = [];
      let speakerRoles = undefined;
      if (matchedModule.configuration) {
        try {
          const modConf = JSON.parse(matchedModule.configuration);
          if (Array.isArray(modConf.vocabulary_terms)) vocabularyTerms = modConf.vocabulary_terms;
          if (Array.isArray(modConf.speaker_roles)) speakerRoles = modConf.speaker_roles;
        } catch (e) {}
      }

      const audioPayload = {
        audio_base64: req.body?.audio_base64,
        filename: req.body?.filename || 'audio.mp3',
        project_id: projectId,
        module_key: moduleKey,
        use_case_key: useCaseKey,
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
      await persistLog(200);
      await persistExecution({ status: 'success', outputData: data, resourcesUsed: { audio_seconds: data.duration_seconds } });
      return res.json(data);
    }

    // Support des endpoints NLP & Classification sémantique
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
        text: req.body?.text || req.body?.texte || req.body?.content || '',
        project_id: projectId,
        module_key: moduleKey,
        use_case_key: useCaseKey,
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

    // Support des endpoints RAG Résolution assistée
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
        query: req.body?.query || req.body?.texte_actuel || req.body?.text || req.body?.texte || '',
        project_id: projectId,
        module_key: moduleKey,
        use_case_key: useCaseKey,
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

    // Support des endpoints Analytics & Text-to-Viz
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

    // 3. Préparer le payload pour l'AI Core
    const userPrompt = Object.entries(req.body || {})
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value ?? ''}`)
      .join('\n');
    if (ragConfig.enabled && !ragConfig.query) ragConfig.query = userPrompt;
    const requestOptions = {};
    if (ragConfig.query) requestOptions.rag_query = ragConfig.query;
    if (ragConfig.top_k !== undefined) requestOptions.top_k = ragConfig.top_k;
    const payload = {
      // Contrat canonique : les identifiants et les donnees d'appel sont
      // transmis separement de la configuration legacy conservee ci-dessous.
      module_id: matchedModule.id,
      module_key: moduleKey,
      use_case_key: useCaseKey,
      input: req.body || {},
      request_options: requestOptions,
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
      await persistExecution({ status: 'failed', errorMsg: errorData });
      return res.status(aiResponse.status).json({ error: 'AI Core Error', details: errorData });
    }

    const data = await aiResponse.json();
    await persistLog(200);
    await persistExecution({ status: 'success', outputData: data, resourcesUsed: data.resources_used || null });
    
    // 5. Retourner le résultat généré par l’IA au client
    return res.json(data);

  } catch (error) {
    console.error('API Gateway Error:', error);
    await persistLog(500);
    await persistExecution({ status: 'error', errorMsg: error.message });
    return res.status(500).json({ error: 'Internal Gateway Error', message: error.message });
  }
});

export default router;
