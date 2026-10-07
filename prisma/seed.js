import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ids = {
  project: 'demo-gpr-bank-project',
  module: 'demo-gpr-complaints-module',
  provider: 'demo-ollama-provider',
  model: 'demo-llama3-1-model',
  cloudProvider: 'ollama-cloud-provider',
  cloudModel: 'nemotron-3-super-model',
  policy: 'demo-gpr-global-policy',
  version: 'demo-core-version-1-0-0',
  settings: 'demo-core-settings',
  regulatoryKb: 'demo-gpr-regulatory-kb',
  regulatoryCollection: 'demo-gpr-claims-regulatory-collection',
  historicalKb: 'demo-gpr-historical-kb',
  historicalCollection: 'demo-gpr-claims-historical-collection',
  apiKey: 'demo-gpr-api-key',
  risk: 'demo-gpr-risk-001',
  execution: 'demo-gpr-execution-001',
  audit: 'demo-gpr-audit-001',
  apiLog: 'demo-gpr-api-log-001',
};

const now = new Date();
const daysAgo = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

// ============================================================================
// 1. Spécification des 4 Use Cases du Module GPR
// ============================================================================
const useCases = [
  {
    key: 'analyse-reclamation',
    name: 'Analyse et qualification d’une réclamation',
    description: 'Analyse le texte brut d’une réclamation bancaire, évalue l’urgence, détecte les mots clés sensibles et propose la catégorie.',
    prompt_name: 'gpr:analyse-reclamation',
    input_schema: [
      { name: 'texte_plainte', type: 'string', required: true, description: 'Contenu brut de la réclamation déposée par le client.' },
      { name: 'canal', type: 'string', required: false, description: 'Canal d’entrée (agence, mobile, web, courrier, téléphone).' },
      { name: 'produit', type: 'string', required: false, description: 'Produit bancaire concerné (compte, carte, virement, crédit).' },
      { name: 'anciennete_client', type: 'number', required: false, description: 'Ancienneté du client en années.' },
    ],
    output_schema: [
      { name: 'urgence', type: 'string', required: true, description: 'Niveau d’urgence évalué : MINEUR, MOYEN, GRAVE.' },
      { name: 'sentiment', type: 'string', required: true, description: 'Tonalité émotionnelle détectée.' },
      { name: 'mots_cles_sensibles', type: 'array', required: true, description: 'Termes juridiques ou critiques repérés (fraude, avocat, BCEAO).' },
      { name: 'categorie_suggeree', type: 'string', required: true, description: 'Catégorie bancaire recommandée.' },
      { name: 'motif_suggere', type: 'string', required: true, description: 'Motif précis identifié.' },
      { name: 'resume', type: 'string', required: true, description: 'Synthèse factuelle en une phrase.' },
      { name: 'score_risque', type: 'number', required: true, description: 'Score de risque opérationnel de 0 à 100.' },
      { name: 'justification', type: 'string', required: true, description: 'Justification argumentée de la qualification.' },
    ],
  },
  {
    key: 'resolution-reclamation',
    name: 'Résolution assistée de réclamation (RAG)',
    description: 'Recherche les réclamations historiques similaires résolues et consulte les directives BCEAO pour générer 3 propositions de solution.',
    prompt_name: 'gpr:resolution-reclamation',
    rag_config: {
      enabled: true,
      collection: 'gpr_claims',
      historical_collection: 'gpr_claims',
      documentary_collection: 'gpr_claims_regulatory',
      top_k: 3,
      filter_metadata: { statut: 'Résolu' },
    },
    input_schema: [
      { name: 'texte_plainte', type: 'string', required: true, description: 'Exposé du problème client à résoudre.' },
      { name: 'categorie', type: 'string', required: false, description: 'Catégorie de la réclamation.' },
      { name: 'motif', type: 'string', required: false, description: 'Motif de réclamation.' },
      { name: 'montant_conteste', type: 'number', required: false, description: 'Montant financier contesté en euros.' },
    ],
    output_schema: [
      { name: 'propositions', type: 'array', required: true, description: '3 propositions de solution argumentées avec faisabilité et délai.' },
      { name: 'sources_utilisees', type: 'array', required: true, description: 'Identifiants des cas historiques et textes réglementaires exploités.' },
      { name: 'recommandation_principale', type: 'string', required: true, description: 'Recommandation prioritaire pour le gestionnaire.' },
      { name: 'preconisations_conformite', type: 'string', required: false, description: 'Rappels de conformité (BCEAO, délais légaux).' },
    ],
  },
  {
    key: 'transcription-appel',
    name: 'Transcription et diarisation d’appel réclamation',
    description: 'Retranscrit les enregistrements téléphoniques du service client, sépare conseiller et client, et corrige les termes bancaires phonétiques.',
    prompt_name: 'gpr:transcription-appel',
    input_schema: [
      { name: 'audio_base64', type: 'string', required: true, description: 'Fichier audio de l’appel encodé en base64.' },
      { name: 'diarization', type: 'boolean', required: false, description: 'Activer la séparation des locuteurs.' },
      { name: 'language', type: 'string', required: false, description: 'Code langue ISO (ex: fr).' },
    ],
    output_schema: [
      { name: 'raw_transcript', type: 'string', required: true, description: 'Transcription brute.' },
      { name: 'corrected_transcript', type: 'string', required: true, description: 'Transcription corrigée préservant le vocabulaire bancaire.' },
      { name: 'turns', type: 'array', required: false, description: 'Tours de parole horodatés.' },
      { name: 'speaker_stats', type: 'object', required: false, description: 'Statistiques de temps de parole.' },
      { name: 'detected_issues', type: 'array', required: false, description: 'Objets de contestation évoqués durant l’appel.' },
    ],
  },
  {
    key: 'reporting-naturel',
    name: 'Reporting dynamique & visualisations (Text-to-Viz)',
    description: 'Traduit une question en langage naturel en requête analytique tabulaire avec génération automatique de graphiques Apache ECharts.',
    prompt_name: 'gpr:reporting-naturel',
    input_schema: [
      { name: 'query', type: 'string', required: true, description: 'Question analytique (ex: Répartition des réclamations par agence et montant moyen).' },
      { name: 'records', type: 'array', required: false, description: 'Échantillon de réclamations tabulaires à analyser.' },
    ],
    output_schema: [
      { name: 'intent', type: 'object', required: true, description: 'Intention extraite (chart_type, group_by, metrics, filters).' },
      { name: 'aggregated_data', type: 'array', required: true, description: 'Données agrégées sous forme tabulaire.' },
      { name: 'chart_options', type: 'object', required: true, description: 'Options de rendu compatibles Apache ECharts.' },
      { name: 'summary_insight', type: 'string', required: true, description: 'Synthèse analytique et constats clés formulés par l’IA.' },
    ],
  },
];

// ============================================================================
// 2. Configuration Métier Détaillée du Module GPR
// ============================================================================
const gprModuleConfiguration = {
  temperature: 0.2,
  max_tokens: 2048,
  rag_enabled: true,
  historical_collection: 'gpr_claims',
  documentary_collection: 'gpr_claims_regulatory',
  history_filter: { statut: 'Résolu' },
  num_propositions: 3,
  vocabulary_terms: [
    'BCEAO', 'DAB', 'GAB', 'agio', 'agios débiteurs', 'opposition',
    'virement SEPA', 'débit immédiat', 'carte Visa', 'Mastercard',
    'IBAN', 'SWIFT', 'prélèvement automatique', 'frais de tenue de compte',
    'délai de forclusion', 'médiateur bancaire'
  ],
  speaker_roles: ['Conseiller Clientèle', 'Client'],
  taxonomy: {
    categories: [
      {
        name: 'Cartes & DAB',
        subcategories: ['Retrait non distribué', 'Double débit DAB', 'Carte avalée', 'Paiement frauduleux', 'Blocage code PIN']
      },
      {
        name: 'Virements & Prélèvements',
        subcategories: ['Virement non reçu', 'Délai anormal SEPA', 'Prélèvement non autorisé', 'Rejet de prélèvement injustifié']
      },
      {
        name: 'Frais & Tarification',
        subcategories: ['Frais de tenue de compte', 'Agios débiteurs contestés', 'Commission d intervention', 'Cotisation carte']
      },
      {
        name: 'Crédits & Prêts',
        subcategories: ['Erreur tableau d amortissement', 'Retard déblocage fonds', 'Pénalités remboursement anticipé']
      },
      {
        name: 'Épargne & Placements',
        subcategories: ['Erreur calcul intérêts', 'Blocage retrait livret', 'Frais d arbitrage']
      },
      {
        name: 'Service Client & Agence',
        subcategories: ['Accueil agence', 'Délai de traitement réclamation', 'Absence de réponse conseiller']
      }
    ]
  },
  sensitive_keywords: [
    'fraude', 'escroquerie', 'tribunal', 'avocat', 'huissier', 'BCEAO',
    'médiateur bancaire', 'plainte pénale', 'forclusion', 'chèque volé',
    'usurpation', 'blanchiment', 'procédure judiciaire'
  ],
  urgency_levels: ['MINEUR', 'MOYEN', 'GRAVE'],
  context_nature: 'RÉCLAMATION BANCAIRE',
  context_definition: 'Dossier de réclamation ou plainte déposé par un client bancaire requérant qualification et conformité réglementaire.',
  dataset_schema: {
    fields: [
      { name: 'id', type: 'string', label: 'Numéro Dossier' },
      { name: 'categorie', type: 'string', label: 'Catégorie Bancaire' },
      { name: 'motif', type: 'string', label: 'Motif de Réclamation' },
      { name: 'canal', type: 'string', label: 'Canal d Entrée' },
      { name: 'agence', type: 'string', label: 'Agence Rattachée' },
      { name: 'montant_conteste', type: 'number', label: 'Montant Contesté (€)' },
      { name: 'delai_jours', type: 'number', label: 'Délai de Résolution (Jours)' },
      { name: 'statut', type: 'string', label: 'Statut Final' }
    ]
  }
};

// ============================================================================
// 3. Déclaration des 4 Endpoints Dynamiques du Module GPR
// ============================================================================
const gprEndpoints = [
  {
    key: 'claims-analyze',
    name: 'Qualifier une réclamation',
    method: 'POST',
    path: '/gpr/v1/claims/analyze',
    type: 'nlp_analysis',
    use_case_key: 'gpr:analyse-reclamation',
    required_scopes: ['execute'],
    description: 'Analyse le texte brut, évalue l urgence et classifie la réclamation selon la taxonomie bancaire.'
  },
  {
    key: 'claims-resolve',
    name: 'Résoudre une réclamation',
    method: 'POST',
    path: '/gpr/v1/claims/resolve',
    type: 'rag_resolution',
    use_case_key: 'gpr:resolution-reclamation',
    required_scopes: ['execute'],
    description: 'Formule 3 propositions de solution basées sur l historique résolu et les directives BCEAO.'
  },
  {
    key: 'audio-transcribe',
    name: 'Transcrire un appel réclamation',
    method: 'POST',
    path: '/gpr/v1/audio/transcribe',
    type: 'audio',
    use_case_key: 'gpr:transcription-appel',
    required_scopes: ['execute'],
    description: 'Retranscrit l appel enregistré avec diarisation et correction phonétique bancaire (DAB, BCEAO).'
  },
  {
    key: 'analytics-query',
    name: 'Interrogation analytique des réclamations',
    method: 'POST',
    path: '/gpr/v1/analytics/query',
    type: 'analytics',
    use_case_key: 'gpr:reporting-naturel',
    required_scopes: ['execute'],
    description: 'Génère un tableau de bord analytique et des graphiques ECharts en réponse à une question en langage naturel.'
  }
];

// ============================================================================
// 4. Jeux de Données de Démonstration (RAG & Historique)
// ============================================================================
const regulatoryDocuments = [
  {
    id: 'doc-bceao-circulaire-2024-01',
    name: 'Directive BCEAO — Délais légaux et protection du client',
    type: 'regulatory',
    content: `Directive de la BCEAO relative au traitement des réclamations de la clientèle bancaire :
1. Tout établissement de crédit doit accuser réception de toute réclamation sous un délai maximal de 48 heures ouvrables.
2. Le délai maximal pour formuler une réponse définitive et motivée au client est de 15 jours ouvrables. En cas de situation complexe (investigation internationale SWIFT), ce délai peut être porté à 30 jours avec notification obligatoire au client.
3. Le traitement de toute réclamation est strictement gratuit. Aucun frais de dossier ne peut être débité.
4. En cas de désaccord persistant, le client doit être informé des voies de recours auprès du Médiateur Bancaire.`,
    metadata: { domain: 'banking', authority: 'BCEAO', topic: 'delais_reclamations', version: '2024.1' }
  },
  {
    id: 'doc-proc-interne-dab-fraude',
    name: 'Procédure interne — Retraits DAB non distribués et contestations carte',
    type: 'procedure',
    content: `Procédure interne Banque Horizon — Incidents DAB et Carte Bancaire :
1. Retrait DAB avec débit de compte sans distribution d espèces : Le gestionnaire consulte le journal électronique du GAB (journal d audit). Si le débit est constaté sans distribution physique de billets, un crédit immédiat provisoire de régularisation est opéré dans les 48 heures.
2. Double débit carte pour une seule transaction commerçant : Réclamation éligible à un remboursement immédiat sur présentation du ticket ou du relevé d opération.
3. Carte avalée par le distributeur : Opposition automatique préventive et réémission gratuite sous 3 jours ouvrés.`,
    metadata: { domain: 'banking', service: 'monetique', topic: 'dab_cartes', version: '2.0' }
  }
];

const historicalClaimsDocuments = [
  {
    id: 'claim-hist-001',
    name: 'Réclamation résolue #001 — Double débit carte Visa',
    type: 'historical_claim',
    content: `Plainte (Cartes & DAB - Double débit DAB): Le 12 octobre, j ai été débité deux fois de la somme de 80€ lors d un paiement en station service.
Solution apportée: Remboursement du second débit sous 24h après vérification de la duplication du numéro d autorisation commerçant. Geste commercial accordé.`,
    metadata: { categorie: 'Cartes & DAB', motif: 'Double débit DAB', statut: 'Résolu', canal: 'mobile', montant: 80 }
  },
  {
    id: 'claim-hist-002',
    name: 'Réclamation résolue #002 — Retrait DAB non distribué',
    type: 'historical_claim',
    content: `Plainte (Cartes & DAB - Retrait non distribué): Lors de mon retrait de 200€ au distributeur de l agence République, le DAB a redémarré sans me donner mes billets mais mon compte a été débité.
Solution apportée: Consultation de l arrêté comptable du GAB confirmant un excédent de caisse de 200€. Recrédit intégral opéré sous 48h conformément aux règles BCEAO.`,
    metadata: { categorie: 'Cartes & DAB', motif: 'Retrait non distribué', statut: 'Résolu', canal: 'agence', montant: 200 }
  },
  {
    id: 'claim-hist-003',
    name: 'Réclamation résolue #003 — Frais d agios contestés suite à retard de virement',
    type: 'historical_claim',
    content: `Plainte (Frais & Tarification - Agios débiteurs contestés): J ai eu 45€ d agios débiteurs suite à un retard de versement de mon salaire indépendant de ma volonté.
Solution apportée: Analyse du compte montrant une ancienneté de 8 ans sans incident préalable. Rétrocession totale des agios et régularisation de la date de valeur.`,
    metadata: { categorie: 'Frais & Tarification', motif: 'Agios débiteurs contestés', statut: 'Résolu', canal: 'web', montant: 45 }
  },
  {
    id: 'claim-hist-004',
    name: 'Réclamation résolue #004 — Blocage virement SEPA vers nouveau bénéficiaire',
    type: 'historical_claim',
    content: `Plainte (Virements & Prélèvements - Virement non reçu): Mon virement de 1200€ vers mon notaire est bloqué depuis 4 jours sans explication.
Solution apportée: Levée du blocage de sécurité après vérification d identité téléphonique par le service conformité. Exécution en virement instantané sans surcoût.`,
    metadata: { categorie: 'Virements & Prélèvements', motif: 'Virement non reçu', statut: 'Résolu', canal: 'telephone', montant: 1200 }
  }
];

// ============================================================================
// 5. Fonction Principale d'Exécution du Seed
// ============================================================================
async function upsertAll() {
  console.log('--- Initialisation du Seed GPR Banking (ModulAI Phase 6) ---');

  // 1. Fournisseurs & Modèles IA
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

  // 2. Projet Métier
  const project = await prisma.project.upsert({
    where: { id: ids.project },
    update: {
      name: 'Banque Horizon — Gestion des Réclamations',
      description: 'Plateforme unifiée pour qualifier, résoudre et analyser les réclamations des clients bancaires selon les normes BCEAO.',
      core_version: '1.0.0',
      modules: JSON.stringify([{ module_id: ids.module, module_key: 'gpr', name: 'GPR Banking', version: '1.0.0' }]),
      configuration: JSON.stringify({ environment: 'production', sector: 'banking', regulatory_scope: ['BCEAO', 'DSP2', 'Protection Consommateur'] }),
      updated_date: now,
    },
    create: {
      id: ids.project,
      name: 'Banque Horizon — Gestion des Réclamations',
      description: 'Plateforme unifiée pour qualifier, résoudre et analyser les réclamations des clients bancaires selon les normes BCEAO.',
      core_version: '1.0.0',
      modules: JSON.stringify([{ module_id: ids.module, module_key: 'gpr', name: 'GPR Banking', version: '1.0.0' }]),
      configuration: JSON.stringify({ environment: 'production', sector: 'banking', regulatory_scope: ['BCEAO', 'DSP2', 'Protection Consommateur'] }),
      created_date: daysAgo(15),
    },
  });

  // 3. Module Métier GPR Enrichi
  const moduleConfigMerged = {
    provider: cloudProvider.id,
    provider_id: cloudProvider.id,
    model: cloudModel.id,
    ...gprModuleConfiguration,
  };

  const moduleGpr = await prisma.module.upsert({
    where: { id: ids.module },
    update: {
      module_key: 'gpr',
      name: 'GPR Banking — Plaintes & Réclamations',
      version: '1.0.0',
      description: 'Module métier bancaire complet : qualification NLP, résolution RAG, transcription audio et reporting analytique.',
      core_version: '1.0.0',
      category: 'Banque & Risque',
      status: 'active',
      lifecycle: 'published',
      features: JSON.stringify([
        'Qualification automatique NLP',
        'Résolution assistée par RAG hybride',
        'Transcription d appels avec diarisation',
        'Reporting en langage naturel (Text-to-Viz)',
        'Traçabilité et audit réglementaire BCEAO'
      ]),
      use_cases: JSON.stringify(useCases),
      data_sources: JSON.stringify([
        { name: 'Dossiers réclamations clients', type: 'database', enabled: true },
        { name: 'Référentiel réglementaire BCEAO', type: 'documents', enabled: true },
        { name: 'Historique des appels enregistrés', type: 'audio', enabled: true }
      ]),
      dependencies: JSON.stringify([{ name: 'AI Core', type: 'core', version: '>=1.0.0' }]),
      configuration: JSON.stringify(moduleConfigMerged),
      capabilities: JSON.stringify(['audio_transcription', 'nlp_classification', 'hybrid_rag', 'dynamic_analytics']),
      endpoints: JSON.stringify(gprEndpoints),
      updated_date: now,
    },
    create: {
      id: ids.module,
      module_key: 'gpr',
      name: 'GPR Banking — Plaintes & Réclamations',
      version: '1.0.0',
      description: 'Module métier bancaire complet : qualification NLP, résolution RAG, transcription audio et reporting analytique.',
      core_version: '1.0.0',
      category: 'Banque & Risque',
      status: 'active',
      lifecycle: 'published',
      features: JSON.stringify([
        'Qualification automatique NLP',
        'Résolution assistée par RAG hybride',
        'Transcription d appels avec diarisation',
        'Reporting en langage naturel (Text-to-Viz)',
        'Traçabilité et audit réglementaire BCEAO'
      ]),
      use_cases: JSON.stringify(useCases),
      data_sources: JSON.stringify([
        { name: 'Dossiers réclamations clients', type: 'database', enabled: true },
        { name: 'Référentiel réglementaire BCEAO', type: 'documents', enabled: true },
        { name: 'Historique des appels enregistrés', type: 'audio', enabled: true }
      ]),
      dependencies: JSON.stringify([{ name: 'AI Core', type: 'core', version: '>=1.0.0' }]),
      configuration: JSON.stringify(moduleConfigMerged),
      capabilities: JSON.stringify(['audio_transcription', 'nlp_classification', 'hybrid_rag', 'dynamic_analytics']),
      endpoints: JSON.stringify(gprEndpoints),
      created_date: daysAgo(15),
    },
  });

  // 4. Prompts Spécifiques aux 4 Use Cases
  // Nettoyage préventif des anciens prompts redondants
  await prisma.prompt.deleteMany({
    where: { id: { in: ['demo-gpr-prompt-nlp-analyse'] } }
  }).catch(() => {});

  const promptsData = [
    {
      id: 'demo-gpr-complaint-analysis-prompt',
      name: 'GPR — Analyse et qualification de réclamation',
      use_case: 'gpr:analyse-reclamation',
      description: 'Prompt de qualification sémantique, détection de criticité et extraction d urgence.',
      instructions: `Tu es un expert en conformité et gestion des réclamations bancaires.
Analyse la réclamation client fournie, détecte le sentiment, évalue l'urgence (MINEUR, MOYEN, GRAVE) selon la présence de mots sensibles (fraude, avocat, BCEAO) et détermine la catégorie bancaire adéquate.
Réponds exclusivement au format JSON conforme au schéma de sortie sans markdown superflu.`,
      input_schema: JSON.stringify(useCases[0].input_schema),
      output_schema: JSON.stringify(useCases[0].output_schema),
      variables: JSON.stringify(['texte_plainte', 'canal', 'produit', 'anciennete_client']),
    },
    {
      id: 'demo-gpr-prompt-rag-resolution',
      name: 'GPR — Résolution assistée par RAG',
      use_case: 'gpr:resolution-reclamation',
      description: 'Prompt de génération de propositions de solution guidées par l historique et la réglementation.',
      instructions: `Tu es un conseiller expert en résolution des litiges bancaires.
En t'appuyant sur les cas similaires résolus et les directives réglementaires fournies dans le contexte :
Contexte historique : {{historical_context}}
Directives réglementaires : {{documentary_context}}

Rédige 3 propositions de solution équilibrées, conformes aux règles de la banque et protectrices pour le client.
Retourne uniquement un JSON valide conforme au schéma.`,
      input_schema: JSON.stringify(useCases[1].input_schema),
      output_schema: JSON.stringify(useCases[1].output_schema),
      variables: JSON.stringify(['texte_plainte', 'categorie', 'motif', 'montant_conteste']),
    },
    {
      id: 'demo-gpr-prompt-audio-transcribe',
      name: 'GPR — Transcription et correction d appel',
      use_case: 'gpr:transcription-appel',
      description: 'Prompt de structuration de la transcription et correction des acronymes bancaires.',
      instructions: `Tu es un système de transcription bancaire haute précision.
Corrige les fautes phonétiques sur les termes bancaires (DAB, GAB, BCEAO, SEPA, IBAN, agio) tout en respectant l intégrité stricte des propos tenus.`,
      input_schema: JSON.stringify(useCases[2].input_schema),
      output_schema: JSON.stringify(useCases[2].output_schema),
      variables: JSON.stringify(['audio_base64', 'diarization', 'language']),
    },
    {
      id: 'demo-gpr-prompt-analytics-query',
      name: 'GPR — Requêtage analytique en langage naturel',
      use_case: 'gpr:reporting-naturel',
      description: 'Prompt d extraction d intention analytique et de commentaire d insights.',
      instructions: `Tu es un analyste de données bancaires.
Traduis la question en langage naturel en regroupements et calculs statistiques précis sur le portefeuille de réclamations.`,
      input_schema: JSON.stringify(useCases[3].input_schema),
      output_schema: JSON.stringify(useCases[3].output_schema),
      variables: JSON.stringify(['query', 'records']),
    },
  ];

  for (const p of promptsData) {
    await prisma.prompt.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        use_case: p.use_case,
        module_id: moduleGpr.id,
        project_id: project.id,
        version: '1.0.0',
        description: p.description,
        instructions: p.instructions,
        input_schema: p.input_schema,
        output_schema: p.output_schema,
        variables: p.variables,
        status: 'active',
        updated_date: now,
      },
      create: {
        id: p.id,
        name: p.name,
        use_case: p.use_case,
        module_id: moduleGpr.id,
        project_id: project.id,
        version: '1.0.0',
        description: p.description,
        instructions: p.instructions,
        input_schema: p.input_schema,
        output_schema: p.output_schema,
        variables: p.variables,
        status: 'active',
        created_date: daysAgo(14),
      },
    });
  }

  // 5. Bases de Connaissances & Collections Vectorielles
  // Base 1 : Réglementaire
  const regulatoryKb = await prisma.knowledgeBase.upsert({
    where: { id: ids.regulatoryKb },
    update: {
      name: 'Directives Réglementaires BCEAO & Protection Client',
      description: 'Corpus officiel sur les obligations bancaires, délais de réponse (15 jours) et médiation.',
      project_id: project.id,
      module_id: moduleGpr.id,
      vector_store: 'chromadb',
      embedding_model: 'paraphrase-multilingual-MiniLM-L12-v2',
      chunk_size: 600,
      chunk_overlap: 80,
      status: 'ready',
      documents_count: regulatoryDocuments.length,
      embeddings_count: regulatoryDocuments.length * 2,
      updated_date: now,
    },
    create: {
      id: ids.regulatoryKb,
      name: 'Directives Réglementaires BCEAO & Protection Client',
      description: 'Corpus officiel sur les obligations bancaires, délais de réponse (15 jours) et médiation.',
      project_id: project.id,
      module_id: moduleGpr.id,
      vector_store: 'chromadb',
      embedding_model: 'paraphrase-multilingual-MiniLM-L12-v2',
      chunk_size: 600,
      chunk_overlap: 80,
      status: 'ready',
      documents_count: regulatoryDocuments.length,
      embeddings_count: regulatoryDocuments.length * 2,
      created_date: daysAgo(14),
    },
  });

  await prisma.ragCollection.upsert({
    where: { id: ids.regulatoryCollection },
    update: {
      name: 'GPR — Directives réglementaires BCEAO',
      collection_name: 'gpr_claims_regulatory',
      description: 'Collection vectorielle des obligations légales et procédures internes.',
      project_id: project.id,
      module_id: moduleGpr.id,
      knowledge_base_id: regulatoryKb.id,
      embedding_model: 'paraphrase-multilingual-MiniLM-L12-v2',
      distance_metric: 'cosine',
      status: 'active',
      documents_count: regulatoryDocuments.length,
      embeddings_count: regulatoryDocuments.length * 2,
      updated_date: now,
    },
    create: {
      id: ids.regulatoryCollection,
      name: 'GPR — Directives réglementaires BCEAO',
      collection_name: 'gpr_claims_regulatory',
      description: 'Collection vectorielle des obligations légales et procédures internes.',
      project_id: project.id,
      module_id: moduleGpr.id,
      knowledge_base_id: regulatoryKb.id,
      embedding_model: 'paraphrase-multilingual-MiniLM-L12-v2',
      distance_metric: 'cosine',
      status: 'active',
      documents_count: regulatoryDocuments.length,
      embeddings_count: regulatoryDocuments.length * 2,
      created_date: daysAgo(14),
    },
  });

  // Base 2 : Historique des réclamations résolues
  const historicalKb = await prisma.knowledgeBase.upsert({
    where: { id: ids.historicalKb },
    update: {
      name: 'Historique des Réclamations Résolues',
      description: 'Base de cas réels résolus avec solutions éprouvées pour l aide à la décision RAG.',
      project_id: project.id,
      module_id: moduleGpr.id,
      vector_store: 'chromadb',
      embedding_model: 'paraphrase-multilingual-MiniLM-L12-v2',
      chunk_size: 600,
      chunk_overlap: 80,
      status: 'ready',
      documents_count: historicalClaimsDocuments.length,
      embeddings_count: historicalClaimsDocuments.length * 2,
      updated_date: now,
    },
    create: {
      id: ids.historicalKb,
      name: 'Historique des Réclamations Résolues',
      description: 'Base de cas réels résolus avec solutions éprouvées pour l aide à la décision RAG.',
      project_id: project.id,
      module_id: moduleGpr.id,
      vector_store: 'chromadb',
      embedding_model: 'paraphrase-multilingual-MiniLM-L12-v2',
      chunk_size: 600,
      chunk_overlap: 80,
      status: 'ready',
      documents_count: historicalClaimsDocuments.length,
      embeddings_count: historicalClaimsDocuments.length * 2,
      created_date: daysAgo(14),
    },
  });

  await prisma.ragCollection.upsert({
    where: { id: ids.historicalCollection },
    update: {
      name: 'GPR — Réclamations résolues',
      collection_name: 'gpr_claims',
      description: 'Collection vectorielle des cas passés utilisée par resolution-reclamation.',
      project_id: project.id,
      module_id: moduleGpr.id,
      knowledge_base_id: historicalKb.id,
      embedding_model: 'paraphrase-multilingual-MiniLM-L12-v2',
      distance_metric: 'cosine',
      status: 'active',
      documents_count: historicalClaimsDocuments.length,
      embeddings_count: historicalClaimsDocuments.length * 2,
      updated_date: now,
    },
    create: {
      id: ids.historicalCollection,
      name: 'GPR — Réclamations résolues',
      collection_name: 'gpr_claims',
      description: 'Collection vectorielle des cas passés utilisée par resolution-reclamation.',
      project_id: project.id,
      module_id: moduleGpr.id,
      knowledge_base_id: historicalKb.id,
      embedding_model: 'paraphrase-multilingual-MiniLM-L12-v2',
      distance_metric: 'cosine',
      status: 'active',
      documents_count: historicalClaimsDocuments.length,
      embeddings_count: historicalClaimsDocuments.length * 2,
      created_date: daysAgo(14),
    },
  });

  // 6. Documents de Démonstration (Prisma SQLite)
  for (const doc of regulatoryDocuments) {
    await prisma.document.upsert({
      where: { id: doc.id },
      update: {
        name: doc.name,
        knowledge_base_id: regulatoryKb.id,
        kb_id: regulatoryKb.id,
        type: doc.type,
        source: 'seed-bceao',
        size: Buffer.byteLength(doc.content, 'utf8'),
        status: 'indexed',
        content: doc.content,
        metadata: JSON.stringify({ ...doc.metadata, rag_collection: 'gpr_claims_regulatory' }),
        updated_date: now,
      },
      create: {
        id: doc.id,
        name: doc.name,
        knowledge_base_id: regulatoryKb.id,
        kb_id: regulatoryKb.id,
        type: doc.type,
        source: 'seed-bceao',
        size: Buffer.byteLength(doc.content, 'utf8'),
        status: 'indexed',
        content: doc.content,
        metadata: JSON.stringify({ ...doc.metadata, rag_collection: 'gpr_claims_regulatory' }),
        created_date: daysAgo(12),
      },
    });
  }

  for (const doc of historicalClaimsDocuments) {
    await prisma.document.upsert({
      where: { id: doc.id },
      update: {
        name: doc.name,
        knowledge_base_id: historicalKb.id,
        kb_id: historicalKb.id,
        type: doc.type,
        source: 'seed-claims-history',
        size: Buffer.byteLength(doc.content, 'utf8'),
        status: 'indexed',
        content: doc.content,
        metadata: JSON.stringify({ ...doc.metadata, rag_collection: 'gpr_claims' }),
        updated_date: now,
      },
      create: {
        id: doc.id,
        name: doc.name,
        knowledge_base_id: historicalKb.id,
        kb_id: historicalKb.id,
        type: doc.type,
        source: 'seed-claims-history',
        size: Buffer.byteLength(doc.content, 'utf8'),
        status: 'indexed',
        content: doc.content,
        metadata: JSON.stringify({ ...doc.metadata, rag_collection: 'gpr_claims' }),
        created_date: daysAgo(10),
      },
    });
  }

  // 7. Clé API Active pour la Démonstration
  await prisma.apiKey.upsert({
    where: { id: ids.apiKey },
    update: {
      name: 'Clé Démo Banque Horizon 2026',
      project_id: project.id,
      project_name: project.name,
      key_prefix: 'sk_demo_gpr_',
      secret_hash: 'demo-only-not-a-real-secret',
      status: 'active',
      environment: 'production',
      scopes: JSON.stringify(['execute', 'read', 'analytics']),
      rate_limit_per_min: 60,
      rate_limit_per_day: 5000,
      created_by_name: 'Directeur Conformité Horizon',
      updated_date: now,
    },
    create: {
      id: ids.apiKey,
      name: 'Clé Démo Banque Horizon 2026',
      project_id: project.id,
      project_name: project.name,
      key_prefix: 'sk_demo_gpr_',
      secret_hash: 'demo-only-not-a-real-secret',
      status: 'active',
      environment: 'production',
      scopes: JSON.stringify(['execute', 'read', 'analytics']),
      rate_limit_per_min: 60,
      rate_limit_per_day: 5000,
      created_by_name: 'Directeur Conformité Horizon',
      created_date: daysAgo(14),
    },
  });

  // 8. Politique de Sécurité IA & Paramètres Globaux
  await prisma.aiPolicy.upsert({
    where: { id: ids.policy },
    update: {
      name: 'Politique GPR Banque — Contrôle Humain & Protection Données',
      scope: 'global',
      description: 'Obligation de validation humaine pour les réclamations sensibles, encadrement de la température et traçabilité.',
      strict_mode: true,
      max_tokens: 2048,
      max_execution_time: 30,
      temperature_max: 0.3,
      max_cost_per_month: 100,
      allowed_models: JSON.stringify([cloudModel.id, model.id]),
      fallback_model_id: model.id,
      rag_required: false,
      human_validation_required: true,
      status: 'active',
      updated_date: now
    },
    create: {
      id: ids.policy,
      name: 'Politique GPR Banque — Contrôle Humain & Protection Données',
      scope: 'global',
      description: 'Obligation de validation humaine pour les réclamations sensibles, encadrement de la température et traçabilité.',
      strict_mode: true,
      max_tokens: 2048,
      max_execution_time: 30,
      temperature_max: 0.3,
      max_cost_per_month: 100,
      allowed_models: JSON.stringify([cloudModel.id, model.id]),
      fallback_model_id: model.id,
      rag_required: false,
      human_validation_required: true,
      status: 'active',
      created_date: daysAgo(14)
    },
  });

  await prisma.coreSettings.upsert({
    where: { id: ids.settings },
    update: {
      default_provider: cloudProvider.name,
      default_model_id: cloudModel.id,
      default_model_name: cloudModel.name,
      default_embedding_model: 'paraphrase-multilingual-MiniLM-L12-v2',
      default_vector_store: 'chromadb',
      default_temperature: 0.2,
      default_token_limit: 2048,
      default_rag_strategy: 'hybrid_similarity',
      default_validation_policy: ids.policy,
      current_core_version: '1.0.0',
      updated_date: now
    },
    create: {
      id: ids.settings,
      default_provider: cloudProvider.name,
      default_model_id: cloudModel.id,
      default_model_name: cloudModel.name,
      default_embedding_model: 'paraphrase-multilingual-MiniLM-L12-v2',
      default_vector_store: 'chromadb',
      default_temperature: 0.2,
      default_token_limit: 2048,
      default_rag_strategy: 'hybrid_similarity',
      default_validation_policy: ids.policy,
      current_core_version: '1.0.0',
      created_date: daysAgo(14)
    },
  });

  // 9. Données d'Exemple pour le Dashboard (Exécution, Risque, Audit)
  await prisma.risk.upsert({
    where: { id: ids.risk },
    update: {
      project_id: project.id,
      project_name: project.name,
      module_id: moduleGpr.id,
      module_name: moduleGpr.name,
      use_case: 'analyse-reclamation',
      score: 82,
      status: 'review_required',
      created_date: daysAgo(1)
    },
    create: {
      id: ids.risk,
      project_id: project.id,
      project_name: project.name,
      module_id: moduleGpr.id,
      module_name: moduleGpr.name,
      use_case: 'analyse-reclamation',
      score: 82,
      status: 'review_required',
      created_date: daysAgo(1)
    },
  });

  await prisma.aIExecution.upsert({
    where: { id: ids.execution },
    update: {
      project_id: project.id,
      project_name: project.name,
      use_case: 'analyse-reclamation',
      provider: cloudProvider.name,
      model: cloudModel.model_id,
      status: 'success',
      prompt_name: 'GPR — Analyse et qualification de réclamation',
      prompt_version: '1.0.0',
      module_name: moduleGpr.name,
      execution_time: 412,
      user_name: 'Karim Traoré — Gestionnaire Risque',
      error: null,
      context_reference: JSON.stringify({ knowledge_base: regulatoryKb.id, documents: 1 }),
      input_reference: JSON.stringify({ canal: 'Agence République', produit: 'Carte Visa Premier', motif: 'Double débit DAB de 200 EUR' }),
      output: JSON.stringify({
        urgence: 'GRAVE',
        sentiment: 'negatif',
        mots_cles_sensibles: ['DAB', 'débit'],
        categorie_suggeree: 'Cartes & DAB',
        motif_suggere: 'Double débit DAB',
        score_risque: 82,
        resume: 'Double débit non reconnu sur retrait DAB en agence.'
      }),
      human_validation: 'approved',
      justification: 'Vérification effectuée avec le journal DAB, anomalie confirmée.',
      resources_used: 'AI Core FastAPI | NLP Engine | Ollama Cloud',
      created_date: daysAgo(1)
    },
    create: {
      id: ids.execution,
      project_id: project.id,
      project_name: project.name,
      use_case: 'analyse-reclamation',
      provider: cloudProvider.name,
      model: cloudModel.model_id,
      status: 'success',
      prompt_name: 'GPR — Analyse et qualification de réclamation',
      prompt_version: '1.0.0',
      module_name: moduleGpr.name,
      execution_time: 412,
      user_name: 'Karim Traoré — Gestionnaire Risque',
      context_reference: JSON.stringify({ knowledge_base: regulatoryKb.id, documents: 1 }),
      input_reference: JSON.stringify({ canal: 'Agence République', produit: 'Carte Visa Premier', motif: 'Double débit DAB de 200 EUR' }),
      output: JSON.stringify({
        urgence: 'GRAVE',
        sentiment: 'negatif',
        mots_cles_sensibles: ['DAB', 'débit'],
        categorie_suggeree: 'Cartes & DAB',
        motif_suggere: 'Double débit DAB',
        score_risque: 82,
        resume: 'Double débit non reconnu sur retrait DAB en agence.'
      }),
      human_validation: 'approved',
      justification: 'Vérification effectuée avec le journal DAB, anomalie confirmée.',
      resources_used: 'AI Core FastAPI | NLP Engine | Ollama Cloud',
      created_date: daysAgo(1)
    },
  });

  await prisma.auditEvent.upsert({
    where: { id: ids.audit },
    update: {
      action: 'ai_execution_approved',
      project_id: project.id,
      project_name: project.name,
      user_name: 'Karim Traoré — Gestionnaire Risque',
      user_id: 'user-karim-traore',
      module_name: moduleGpr.name,
      module_id: moduleGpr.id,
      use_case: 'analyse-reclamation',
      entity_type: 'AIExecution',
      entity_id: ids.execution,
      comment: 'Approbation de la qualification et déclenchement du crédit d urgence.',
      new_value: JSON.stringify({ status: 'approved', risk_score: 82 }),
      created_date: daysAgo(1)
    },
    create: {
      id: ids.audit,
      action: 'ai_execution_approved',
      project_id: project.id,
      project_name: project.name,
      user_name: 'Karim Traoré — Gestionnaire Risque',
      user_id: 'user-karim-traore',
      module_name: moduleGpr.name,
      module_id: moduleGpr.id,
      use_case: 'analyse-reclamation',
      entity_type: 'AIExecution',
      entity_id: ids.execution,
      comment: 'Approbation de la qualification et déclenchement du crédit d urgence.',
      new_value: JSON.stringify({ status: 'approved', risk_score: 82 }),
      created_date: daysAgo(1)
    },
  });

  return { project, module: moduleGpr, provider: cloudProvider, model: cloudModel };
}

try {
  const result = await upsertAll();
  console.log(`✅ Seed GPR Banking terminé avec succès pour le projet : ${result.project.name}`);
  console.log(`   Module actif : ${result.module.name} (${result.module.module_key})`);
  console.log(`   4 Use Cases IA initialisés : ${useCases.map(u => u.key).join(', ')}`);
  console.log(`   4 Endpoints dynamiques routés sous /api/dynamic/gpr/v1/...`);
  console.log('   Le seed est 100% idempotent et réentrant sans duplication.');
} catch (error) {
  console.error('❌ Échec du seed GPR Banking:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
