import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ids = {
  project: 'demo-gpr-bank-project',
  module: 'demo-gpr-complaints-module',
  provider: 'demo-ollama-provider',
  model: 'demo-llama3-1-model',
  cloudProvider: 'ollama-cloud-provider',
  cloudModel: 'nemotron-3-super-model',
  prompt: 'demo-gpr-complaint-analysis-prompt',
  policy: 'demo-gpr-global-policy',
  version: 'demo-core-version-1-0-0',
  settings: 'demo-core-settings',
  knowledgeBase: 'demo-gpr-regulatory-kb',
  document: 'demo-gpr-document-escalation',
  apiKey: 'demo-gpr-api-key',
  risk: 'demo-gpr-risk-001',
  execution: 'demo-gpr-execution-001',
  audit: 'demo-gpr-audit-001',
  apiLog: 'demo-gpr-api-log-001',
};

const now = new Date();
const daysAgo = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const useCases = [
  {
    key: 'analyse-reclamation',
    name: 'Analyse et qualification d’une réclamation',
    description: 'Classe une réclamation bancaire, estime sa priorité et propose une prochaine action.',
    prompt_name: 'gpr:analyse-reclamation',
    input_schema: [
      { name: 'canal', type: 'string', required: true, description: 'Canal de réception de la réclamation.' },
      { name: 'produit', type: 'string', required: true, description: 'Produit ou service bancaire concerné.' },
      { name: 'motif', type: 'string', required: true, description: 'Description du motif de réclamation.' },
      { name: 'anciennete_client', type: 'number', required: false, description: 'Ancienneté du client en années.' },
    ],
    rag_config: { enabled: true, collection: 'gpr_claims_regulatory', knowledge_base_id: 'demo-gpr-regulatory-kb', top_k: 5 },
    output_schema: [
      { name: 'categorie', type: 'string', required: true, description: 'Catégorie normalisée.' },
      { name: 'priorite', type: 'string', required: true, description: 'Priorité basse, normale, haute ou critique.' },
      { name: 'score_risque', type: 'number', required: true, description: 'Score de risque de 0 à 100.' },
      { name: 'prochaine_action', type: 'string', required: true, description: 'Action recommandée au gestionnaire.' },
      { name: 'justification', type: 'string', required: true, description: 'Justification traçable de la recommandation.' },
    ],
  },
  {
    key: 'reponse-client',
    name: 'Préparation d’une réponse client',
    description: 'Prépare une réponse claire, empathique et conforme aux règles de communication bancaire.',
    prompt_name: 'gpr:reponse-client',
    input_schema: [
      { name: 'contexte', type: 'string', required: true, description: 'Contexte de la réclamation.' },
      { name: 'decision', type: 'string', required: true, description: 'Décision ou action prise par la banque.' },
      { name: 'ton', type: 'string', required: false, description: 'Ton souhaité pour la réponse.' },
    ],
    output_schema: [
      { name: 'objet', type: 'string', required: true, description: 'Objet de la réponse.' },
      { name: 'message', type: 'string', required: true, description: 'Réponse proposée au client.' },
      { name: 'pieces_a_fournir', type: 'array', required: false, description: 'Pièces ou informations à demander.' },
    ],
  },
];

async function upsertAll() {
  const provider = await prisma.aiProvider.upsert({
    where: { id: ids.provider },
    update: {
      name: 'Ollama local — Démonstration',
      type: 'ollama',
      endpoint_url: process.env.LLM_BASE_URL || 'http://localhost:11434',
      base_url: process.env.LLM_BASE_URL || 'http://localhost:11434',
      status: 'active',
      is_default: false,
      api_key_set: false,
      updated_date: now,
    },
    create: {
      id: ids.provider,
      name: 'Ollama local — Démonstration',
      type: 'ollama',
      endpoint_url: process.env.LLM_BASE_URL || 'http://localhost:11434',
      base_url: process.env.LLM_BASE_URL || 'http://localhost:11434',
      status: 'active',
      is_default: true,
      api_key_set: false,
    },
  });

  const model = await prisma.aiModel.upsert({
    where: { id: ids.model },
    update: {
      name: 'Llama 3.1 8B — GPR Demo',
      model_id: 'llama3.1:8b',
      provider_id: provider.id,
      provider_name: provider.name,
      type: 'chat',
      version: '3.1',
      context_window: 8192,
      max_tokens: 2048,
      max_output_tokens: 2048,
      temperature: 0.2,
      capabilities: JSON.stringify(['chat', 'json', 'classification']),
      status: 'active',
      updated_date: now,
    },
    create: {
      id: ids.model,
      name: 'Llama 3.1 8B — GPR Demo',
      model_id: 'llama3.1:8b',
      provider_id: provider.id,
      provider_name: provider.name,
      type: 'chat',
      version: '3.1',
      context_window: 8192,
      max_tokens: 2048,
      max_output_tokens: 2048,
      temperature: 0.2,
      capabilities: JSON.stringify(['chat', 'json', 'classification']),
      status: 'active',
    },
  });

  const existingCloudProvider = await prisma.aiProvider.findFirst({ where: { name: 'Ollama Cloud', api_key_set: true } });
  const cloudApiKey = process.env.OLLAMA_API_KEY || process.env.LLM_API_KEY || existingCloudProvider?.api_key || '';
  const cloudProvider = await prisma.aiProvider.upsert({
    where: { id: ids.cloudProvider },
    update: {
      name: 'Ollama Cloud',
      type: 'ollama',
      endpoint_url: 'https://ollama.com',
      base_url: 'https://ollama.com',
      api_key: cloudApiKey || undefined,
      status: 'active',
      is_default: true,
      api_key_set: cloudApiKey ? true : undefined,
      updated_date: now,
    },
    create: {
      id: ids.cloudProvider,
      name: 'Ollama Cloud',
      type: 'ollama',
      endpoint_url: 'https://ollama.com',
      base_url: 'https://ollama.com',
      api_key: cloudApiKey || null,
      status: 'active',
      is_default: true,
      api_key_set: Boolean(cloudApiKey),
    },
  });

  const cloudModel = await prisma.aiModel.upsert({
    where: { id: ids.cloudModel },
    update: {
      name: 'Nemotron 3 super',
      model_id: 'nemotron-3-super',
      provider_id: cloudProvider.id,
      provider_name: cloudProvider.name,
      type: 'chat',
      version: '3',
      context_window: 32768,
      max_output_tokens: 4096,
      temperature: 0.2,
      capabilities: JSON.stringify(['chat', 'json', 'classification', 'reasoning']),
      status: 'active',
      updated_date: now,
    },
    create: {
      id: ids.cloudModel,
      name: 'Nemotron 3 super',
      model_id: 'nemotron-3-super',
      provider_id: cloudProvider.id,
      provider_name: cloudProvider.name,
      type: 'chat',
      version: '3',
      context_window: 32768,
      max_output_tokens: 4096,
      temperature: 0.2,
      capabilities: JSON.stringify(['chat', 'json', 'classification', 'reasoning']),
      status: 'active',
    },
  });

  const project = await prisma.project.upsert({
    where: { id: ids.project },
    update: {
      name: 'Banque Horizon — Gestion des réclamations',
      description: 'Application de démonstration pour qualifier, traiter et auditer les plaintes et réclamations des clients bancaires.',
      core_version: '1.0.0',
      modules: JSON.stringify([{ module_id: ids.module, module_key: 'gpr', name: 'GPR Banking', version: '1.0.0' }]),
      configuration: JSON.stringify({ environment: 'demo', sector: 'banking', regulatory_scope: ['KYC', 'PSD2', 'protection_client'] }),
      updated_date: now,
    },
    create: {
      id: ids.project,
      name: 'Banque Horizon — Gestion des réclamations',
      description: 'Application de démonstration pour qualifier, traiter et auditer les plaintes et réclamations des clients bancaires.',
      core_version: '1.0.0',
      modules: JSON.stringify([{ module_id: ids.module, module_key: 'gpr', name: 'GPR Banking', version: '1.0.0' }]),
      configuration: JSON.stringify({ environment: 'demo', sector: 'banking', regulatory_scope: ['KYC', 'PSD2', 'protection_client'] }),
      created_date: daysAgo(12),
    },
  });

  await prisma.module.upsert({
    where: { id: ids.module },
    update: {
      module_key: 'gpr',
      name: 'GPR Banking — Plaintes & Réclamations',
      version: '1.0.0',
      description: 'Module métier pour l’analyse, la qualification, l’escalade et le suivi des réclamations bancaires.',
      core_version: '1.0.0',
      category: 'Risque',
      status: 'active',
      lifecycle: 'published',
      features: JSON.stringify(['Qualification automatique', 'Priorisation', 'Réponse client', 'Traçabilité réglementaire']),
      use_cases: JSON.stringify(useCases),
      data_sources: JSON.stringify([{ name: 'Dossiers clients', type: 'database', enabled: true }, { name: 'Référentiel réglementaire', type: 'documents', enabled: true }, { name: 'Historique des interactions', type: 'history', enabled: true }]),
      dependencies: JSON.stringify([{ name: 'AI Core', type: 'core', version: '>=1.0.0' }]),
      configuration: JSON.stringify({ provider: cloudProvider.id, provider_id: cloudProvider.id, model: cloudModel.id, temperature: 0.2, max_tokens: 2048, rag_enabled: true, human_validation_required: true, audit_enabled: true }),
      capabilities: JSON.stringify(['classification', 'risk_scoring', 'structured_output', 'rag']),
      endpoints: JSON.stringify([
        { key: 'analyse-reclamation', name: 'Analyser une réclamation', method: 'POST', path: '/gpr/analyse-reclamation', use_case_key: 'gpr:analyse-reclamation', required_scopes: ['execute'], description: 'Qualifie et priorise une réclamation bancaire.' },
        { key: 'reponse-client', name: 'Préparer une réponse client', method: 'POST', path: '/gpr/reponse-client', use_case_key: 'gpr:reponse-client', required_scopes: ['execute'], description: 'Génère une proposition de réponse contrôlable.' },
      ]),
      updated_date: now,
    },
    create: {
      id: ids.module,
      module_key: 'gpr',
      name: 'GPR Banking — Plaintes & Réclamations',
      version: '1.0.0',
      description: 'Module métier pour l’analyse, la qualification, l’escalade et le suivi des réclamations bancaires.',
      core_version: '1.0.0',
      category: 'Risque',
      status: 'active',
      lifecycle: 'published',
      features: JSON.stringify(['Qualification automatique', 'Priorisation', 'Réponse client', 'Traçabilité réglementaire']),
      use_cases: JSON.stringify(useCases),
      data_sources: JSON.stringify([{ name: 'Dossiers clients', type: 'database', enabled: true }, { name: 'Référentiel réglementaire', type: 'documents', enabled: true }, { name: 'Historique des interactions', type: 'history', enabled: true }]),
      dependencies: JSON.stringify([{ name: 'AI Core', type: 'core', version: '>=1.0.0' }]),
      configuration: JSON.stringify({ provider: cloudProvider.id, provider_id: cloudProvider.id, model: cloudModel.id, temperature: 0.2, max_tokens: 2048, rag_enabled: true, human_validation_required: true, audit_enabled: true }),
      capabilities: JSON.stringify(['classification', 'risk_scoring', 'structured_output', 'rag']),
      endpoints: JSON.stringify([
        { key: 'analyse-reclamation', name: 'Analyser une réclamation', method: 'POST', path: '/gpr/analyse-reclamation', use_case_key: 'gpr:analyse-reclamation', required_scopes: ['execute'], description: 'Qualifie et priorise une réclamation bancaire.' },
        { key: 'reponse-client', name: 'Préparer une réponse client', method: 'POST', path: '/gpr/reponse-client', use_case_key: 'gpr:reponse-client', required_scopes: ['execute'], description: 'Génère une proposition de réponse contrôlable.' },
      ]),
      created_date: daysAgo(12),
    },
  });

  await prisma.prompt.upsert({
    where: { id: ids.prompt },
    update: {
      name: 'GPR — Analyse de réclamation bancaire',
      use_case: 'gpr:analyse-reclamation',
      module_id: ids.module,
      project_id: project.id,
      version: '1.0.0',
      description: 'Prompt de qualification et de priorisation des réclamations clients.',
      instructions: 'Tu es un analyste expert des réclamations bancaires. Analyse les éléments fournis, respecte les règles de protection du client et retourne uniquement un JSON valide conforme au schéma demandé. Ne déduis jamais une information absente du dossier. Si un risque réglementaire ou une vulnérabilité client est possible, augmente la priorité et recommande une revue humaine.\n\nContexte réglementaire : {{context}}',
      input_schema: JSON.stringify(useCases[0].input_schema),
      output_schema: JSON.stringify(useCases[0].output_schema),
      variables: JSON.stringify(['canal', 'produit', 'motif', 'anciennete_client']),
      status: 'active',
      updated_date: now,
    },
    create: {
      id: ids.prompt,
      name: 'GPR — Analyse de réclamation bancaire',
      use_case: 'gpr:analyse-reclamation',
      module_id: ids.module,
      project_id: project.id,
      version: '1.0.0',
      description: 'Prompt de qualification et de priorisation des réclamations clients.',
      instructions: 'Tu es un analyste expert des réclamations bancaires. Analyse les éléments fournis, respecte les règles de protection du client et retourne uniquement un JSON valide conforme au schéma demandé. Ne déduis jamais une information absente du dossier. Si un risque réglementaire ou une vulnérabilité client est possible, augmente la priorité et recommande une revue humaine.\n\nContexte réglementaire : {{context}}',
      input_schema: JSON.stringify(useCases[0].input_schema),
      output_schema: JSON.stringify(useCases[0].output_schema),
      variables: JSON.stringify(['canal', 'produit', 'motif', 'anciennete_client']),
      status: 'active',
      created_date: daysAgo(11),
    },
  });

  await prisma.aiPolicy.upsert({
    where: { id: ids.policy },
    update: { name: 'Politique GPR Banque — Contrôle humain', scope: 'global', description: 'Impose une validation humaine pour les réclamations à risque et limite la température du modèle.', strict_mode: true, max_tokens: 2048, max_execution_time: 30, temperature_max: 0.3, max_cost_per_month: 50, allowed_models: JSON.stringify([cloudModel.id]), fallback_model_id: cloudModel.id, rag_required: false, human_validation_required: true, status: 'active', updated_date: now },
    create: { id: ids.policy, name: 'Politique GPR Banque — Contrôle humain', scope: 'global', description: 'Impose une validation humaine pour les réclamations à risque et limite la température du modèle.', strict_mode: true, max_tokens: 2048, max_execution_time: 30, temperature_max: 0.3, max_cost_per_month: 50, allowed_models: JSON.stringify([cloudModel.id]), fallback_model_id: cloudModel.id, rag_required: false, human_validation_required: true, status: 'active', created_date: daysAgo(10) },
  });

  await prisma.coreVersion.upsert({
    where: { id: ids.version },
    update: { version: '1.0.0', release_date: '2026-08-01', status: 'stable', changelog: 'Version initiale du AI Core pour la démonstration GPR bancaire.', is_latest: true, updated_date: now },
    create: { id: ids.version, version: '1.0.0', release_date: '2026-08-01', status: 'stable', changelog: 'Version initiale du AI Core pour la démonstration GPR bancaire.', is_latest: true, created_date: daysAgo(12) },
  });

  await prisma.coreSettings.upsert({
    where: { id: ids.settings },
    update: { default_provider: cloudProvider.name, default_model_id: cloudModel.id, default_model_name: cloudModel.name, default_embedding_model: 'all-MiniLM-L6-v2', default_vector_store: 'chromadb', default_temperature: 0.2, default_token_limit: 2048, default_rag_strategy: 'similarity', default_validation_policy: ids.policy, current_core_version: '1.0.0', updated_date: now },
    create: { id: ids.settings, default_provider: cloudProvider.name, default_model_id: cloudModel.id, default_model_name: cloudModel.name, default_embedding_model: 'all-MiniLM-L6-v2', default_vector_store: 'chromadb', default_temperature: 0.2, default_token_limit: 2048, default_rag_strategy: 'similarity', default_validation_policy: ids.policy, current_core_version: '1.0.0', created_date: daysAgo(10) },
  });

  await prisma.knowledgeBase.upsert({
    where: { id: ids.knowledgeBase },
    update: { name: 'Référentiel réclamations & protection client', description: 'Corpus de démonstration sur les délais de traitement, l’escalade et la communication client.', project_id: project.id, module_id: ids.module, vector_store: 'chromadb', embedding_model: 'all-MiniLM-L6-v2', chunk_size: 600, chunk_overlap: 80, status: 'ready', documents_count: 1, embeddings_count: 3, updated_date: now },
    create: { id: ids.knowledgeBase, name: 'Référentiel réclamations & protection client', description: 'Corpus de démonstration sur les délais de traitement, l’escalade et la communication client.', project_id: project.id, module_id: ids.module, vector_store: 'chromadb', embedding_model: 'all-MiniLM-L6-v2', chunk_size: 600, chunk_overlap: 80, status: 'ready', documents_count: 1, embeddings_count: 3, created_date: daysAgo(9) },
  });

  await prisma.ragCollection.upsert({
    where: { id: 'demo-gpr-claims-regulatory-collection' },
    update: { name: 'GPR — Réglementation réclamations', collection_name: 'gpr_claims_regulatory', description: 'Collection réglementaire utilisée par analyse-reclamation.', project_id: project.id, module_id: ids.module, knowledge_base_id: ids.knowledgeBase, embedding_model: 'all-MiniLM-L6-v2', distance_metric: 'cosine', status: 'active', updated_date: now },
    create: { id: 'demo-gpr-claims-regulatory-collection', name: 'GPR — Réglementation réclamations', collection_name: 'gpr_claims_regulatory', description: 'Collection réglementaire utilisée par analyse-reclamation.', project_id: project.id, module_id: ids.module, knowledge_base_id: ids.knowledgeBase, embedding_model: 'all-MiniLM-L6-v2', distance_metric: 'cosine', status: 'active', created_date: daysAgo(9) },
  });

  await prisma.document.upsert({
    where: { id: ids.document },
    update: { name: 'Procédure interne — Réclamations sensibles', knowledge_base_id: ids.knowledgeBase, kb_id: ids.knowledgeBase, type: 'policy', source: 'demo-seed', size: 1340, status: 'indexed', content: 'Toute réclamation concernant une fraude présumée, une opération non autorisée, un client vulnérable ou un risque de non-conformité doit être classée en priorité haute ou critique et faire l’objet d’une revue humaine. Le gestionnaire documente la décision, les pièces examinées et la réponse adressée au client. Les délais et engagements communiqués doivent être vérifiés avant envoi.', metadata: JSON.stringify({ language: 'fr', domain: 'banking', version: '1.0' }), chunks: JSON.stringify(['Fraude ou opération non autorisée : priorité critique et revue humaine.', 'Client vulnérable ou risque réglementaire : priorité haute.', 'Documenter la décision, les pièces et la réponse.']), chunk_count: 3, updated_date: now },
    create: { id: ids.document, name: 'Procédure interne — Réclamations sensibles', knowledge_base_id: ids.knowledgeBase, kb_id: ids.knowledgeBase, type: 'policy', source: 'demo-seed', size: 1340, status: 'indexed', content: 'Toute réclamation concernant une fraude présumée, une opération non autorisée, un client vulnérable ou un risque de non-conformité doit être classée en priorité haute ou critique et faire l’objet d’une revue humaine. Le gestionnaire documente la décision, les pièces examinées et la réponse adressée au client. Les délais et engagements communiqués doivent être vérifiés avant envoi.', metadata: JSON.stringify({ language: 'fr', domain: 'banking', version: '1.0' }), chunks: JSON.stringify(['Fraude ou opération non autorisée : priorité critique et revue humaine.', 'Client vulnérable ou risque réglementaire : priorité haute.', 'Documenter la décision, les pièces et la réponse.']), chunk_count: 3, created_date: daysAgo(9) },
  });

  await prisma.apiKey.upsert({
    where: { id: ids.apiKey },
    update: { name: 'Clé de démonstration GPR', project_id: project.id, project_name: project.name, key_prefix: 'sk_demo_gpr_', secret_hash: 'demo-only-not-a-real-secret', status: 'active', environment: 'sandbox', scopes: JSON.stringify(['execute']), rate_limit_per_min: 30, rate_limit_per_day: 500, created_by_name: 'Administrateur Démo', updated_date: now },
    create: { id: ids.apiKey, name: 'Clé de démonstration GPR', project_id: project.id, project_name: project.name, key_prefix: 'sk_demo_gpr_', secret_hash: 'demo-only-not-a-real-secret', status: 'active', environment: 'sandbox', scopes: JSON.stringify(['execute']), rate_limit_per_min: 30, rate_limit_per_day: 500, created_by_name: 'Administrateur Démo', created_date: daysAgo(8) },
  });

  await prisma.risk.upsert({
    where: { id: ids.risk },
    update: { project_id: project.id, project_name: project.name, module_id: ids.module, module_name: 'GPR Banking — Plaintes & Réclamations', use_case: 'analyse-reclamation', score: 78, status: 'review_required', created_date: daysAgo(2) },
    create: { id: ids.risk, project_id: project.id, project_name: project.name, module_id: ids.module, module_name: 'GPR Banking — Plaintes & Réclamations', use_case: 'analyse-reclamation', score: 78, status: 'review_required', created_date: daysAgo(2) },
  });

  await prisma.aIExecution.upsert({
    where: { id: ids.execution },
    update: { project_id: project.id, project_name: project.name, use_case: 'analyse-reclamation', provider: cloudProvider.name, model: cloudModel.model_id, status: 'success', prompt_name: 'GPR — Analyse de réclamation bancaire', prompt_version: '1.0.0', module_name: 'GPR Banking — Plaintes & Réclamations', execution_time: 842, user_name: 'Sophie Martin — Gestionnaire réclamations', error: null, context_reference: JSON.stringify({ knowledge_base: ids.knowledgeBase, documents: 1 }), input_reference: JSON.stringify({ canal: 'Application mobile', produit: 'Carte bancaire', motif: 'Retrait non reconnu de 240 EUR', anciennete_client: 6 }), output: JSON.stringify({ categorie: 'Opération contestée', priorite: 'haute', score_risque: 78, prochaine_action: 'Bloquer temporairement la carte et ouvrir une investigation fraude.', justification: 'Opération non reconnue signalée depuis un canal authentifié.' }), human_validation: 'approved', justification: 'Dossier vérifié par le service fraude.', resources_used: 'Prompt: 486 chars | Provider: Ollama Cloud | RAG', created_date: daysAgo(1) },
    create: { id: ids.execution, project_id: project.id, project_name: project.name, use_case: 'analyse-reclamation', provider: cloudProvider.name, model: cloudModel.model_id, status: 'success', prompt_name: 'GPR — Analyse de réclamation bancaire', prompt_version: '1.0.0', module_name: 'GPR Banking — Plaintes & Réclamations', execution_time: 842, user_name: 'Sophie Martin — Gestionnaire réclamations', context_reference: JSON.stringify({ knowledge_base: ids.knowledgeBase, documents: 1 }), input_reference: JSON.stringify({ canal: 'Application mobile', produit: 'Carte bancaire', motif: 'Retrait non reconnu de 240 EUR', anciennete_client: 6 }), output: JSON.stringify({ categorie: 'Opération contestée', priorite: 'haute', score_risque: 78, prochaine_action: 'Bloquer temporairement la carte et ouvrir une investigation fraude.', justification: 'Opération non reconnue signalée depuis un canal authentifié.' }), human_validation: 'approved', justification: 'Dossier vérifié par le service fraude.', resources_used: 'Prompt: 486 chars | Provider: Ollama Cloud | RAG', created_date: daysAgo(1) },
  });

  await prisma.auditEvent.upsert({
    where: { id: ids.audit },
    update: { action: 'ai_execution_approved', project_id: project.id, project_name: project.name, user_name: 'Sophie Martin — Gestionnaire réclamations', user_id: 'demo-user-sophie-martin', module_name: 'GPR Banking — Plaintes & Réclamations', module_id: ids.module, use_case: 'analyse-reclamation', entity_type: 'AIExecution', entity_id: ids.execution, comment: 'Validation humaine de la recommandation et autorisation de poursuivre l’investigation.', new_value: JSON.stringify({ status: 'approved', score: 78 }), created_date: daysAgo(1) },
    create: { id: ids.audit, action: 'ai_execution_approved', project_id: project.id, project_name: project.name, user_name: 'Sophie Martin — Gestionnaire réclamations', user_id: 'demo-user-sophie-martin', module_name: 'GPR Banking — Plaintes & Réclamations', module_id: ids.module, use_case: 'analyse-reclamation', entity_type: 'AIExecution', entity_id: ids.execution, comment: 'Validation humaine de la recommandation et autorisation de poursuivre l’investigation.', new_value: JSON.stringify({ status: 'approved', score: 78 }), created_date: daysAgo(1) },
  });

  await prisma.apiLog.upsert({
    where: { id: ids.apiLog },
    update: { request_id: 'req_demo_gpr_001', project_id: project.id, endpoint: '/api/dynamic/gpr/analyse-reclamation', method: 'POST', status_code: 200, duration: 842, user_id: 'demo-user-sophie-martin', updated_date: now },
    create: { id: ids.apiLog, request_id: 'req_demo_gpr_001', project_id: project.id, endpoint: '/api/dynamic/gpr/analyse-reclamation', method: 'POST', status_code: 200, duration: 842, user_id: 'demo-user-sophie-martin', created_date: daysAgo(1) },
  });

  return { project, provider: cloudProvider, model: cloudModel };
}

try {
  const result = await upsertAll();
  console.log(`Seed GPR bancaire terminé : ${result.project.name}`);
  console.log(`Provider: ${result.provider.name}`);
  console.log(`Modèle: ${result.model.name}`);
  console.log('Le seed est idempotent : vous pouvez le relancer sans créer de doublons.');
} catch (error) {
  console.error('Échec du seed GPR bancaire:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
