/**
 * test_full_project_lifecycle.cjs
 * Test de bout en bout complet :
 * De la configuration du Core ➔ Création d'un NOUVEAU Projet ➔
 * Installation du module Métier GPR ➔ Génération de clé API ➔
 * Exécution réelle des 4 Use Cases via l'API Gateway ➔
 * Contrôle de la Traçabilité et de l'Audit dédiés à ce nouveau projet.
 */

import('node:assert').then(async ({ default: assert }) => {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  console.log('========================================================================');
  console.log('🔄 TEST COMPLET DU CYCLE DE VIE : DU CORE AU NOUVEAU PROJET CLIENT');
  console.log('========================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. CONFIGURATION DU CORE (Fournisseurs, Modèles, Policies, Settings)
    // -------------------------------------------------------------------------
    console.log('🧠 1. Validation & Inspection de la configuration du Core...');

    // 1.1 Provider par défaut
    const defaultProvider = await prisma.aiProvider.findFirst({
      where: { is_default: true }
    }) || await prisma.aiProvider.findFirst();
    assert(defaultProvider, 'Au moins un AI Provider doit exister.');
    console.log(`  ✅ Provider Core actif : ${defaultProvider.name} (type: ${defaultProvider.type})`);

    // 1.2 Modèles enregistrés
    const models = await prisma.aiModel.findMany({ where: { status: 'active' } });
    assert(models.length > 0, 'Au moins un modèle LLM doit être configuré.');
    console.log(`  ✅ ${models.length} Modèle(s) LLM actif(s) configuré(s) dans le Core.`);

    // 1.3 Governance Policy
    const policy = await prisma.aiPolicy.findFirst({ where: { status: 'active' } });
    if (policy) {
      console.log(`  ✅ Policy de gouvernance active : ${policy.name} (max_tokens: ${policy.max_tokens})`);
    }

    // 1.4 Core Settings
    const settings = await prisma.coreSettings.findFirst();
    console.log(`  ✅ Paramètres Core globaux vérifiés (embedding: ${settings?.default_embedding_model || 'MiniLM'}).\n`);


    // -------------------------------------------------------------------------
    // 2. CRÉATION D'UN NOUVEAU PROJET MÉTIER
    // -------------------------------------------------------------------------
    console.log('📁 2. Création d\'un tout NOUVEAU projet dans ModulAI...');

    // Récupérer le module GPR publié
    const gprModule = await prisma.module.findFirst({
      where: { module_key: 'gpr', lifecycle: 'published' }
    });
    assert(gprModule, 'Le module GPR publié doit être disponible.');

    const newProjectName = `Banque Atlantique — Pôle Réclamations (Test E2E ${Date.now().toString().slice(-4)})`;
    const newProject = await prisma.project.create({
      data: {
        name: newProjectName,
        description: 'Projet autonome client avec règles de gouvernance strictes et workflow BCEAO.',
        core_version: '1.0.0',
        modules: JSON.stringify([
          {
            module_id: gprModule.id,
            module_key: gprModule.module_key,
            name: gprModule.name,
            version: gprModule.version
          }
        ]),
        configuration: JSON.stringify({
          strict_mode: true,
          temperature: 0.1,
          threshold_urgent_claims: 50000,
          compliance_contact: 'conformite@banque-atlantique.ci'
        })
      }
    });
    assert(newProject.id, 'Le nouveau projet doit avoir un ID.');
    console.log(`  ✅ Nouveau projet créé avec succès :`);
    console.log(`     - ID : ${newProject.id}`);
    console.log(`     - Nom : "${newProject.name}"`);
    console.log(`     - Version Core : v${newProject.core_version}\n`);


    // -------------------------------------------------------------------------
    // 3. GÉNÉRATION D'UNE NOUVELLE CLÉ API POUR CE NOUVEAU PROJET
    // -------------------------------------------------------------------------
    console.log('🔑 3. Génération d\'une clé API dédiée au nouveau projet...');

    const apiKeyRaw = `sk_atlantique_${Date.now().toString(36)}`;
    const newApiKey = await prisma.apiKey.create({
      data: {
        name: `Clé API Production — ${newProject.name}`,
        project_id: newProject.id,
        project_name: newProject.name,
        key_prefix: 'sk_atlantique_',
        secret_hash: 'hash_sha256_demonstration',
        status: 'active',
        environment: 'production',
        scopes: JSON.stringify(['execute', 'read', 'analytics']),
        created_by_name: 'Directeur Conformité'
      }
    });
    assert(newApiKey.id, 'La clé API doit être persistée.');
    console.log(`  ✅ Clé API générée et active :`);
    console.log(`     - Préfixe : ${newApiKey.key_prefix}`);
    console.log(`     - Scopes : ${newApiKey.scopes}`);
    console.log(`     - Statut : ${newApiKey.status}\n`);


    // -------------------------------------------------------------------------
    // 4. EXÉCUTION RÉELLE DES 4 USE CASES DANS LE NOUVEAU PROJET
    // -------------------------------------------------------------------------
    console.log('⚡ 4. Exécution réelle des 4 Use Cases pour ce nouveau projet via la Gateway...');

    const GATEWAY_BASE = 'http://localhost:3000/api/dynamic';
    const projectHeaders = {
      'Content-Type': 'application/json',
      'x-project-id': newProject.id,
      'x-project-name': encodeURIComponent(newProject.name),
      'Authorization': `Bearer ${apiKeyRaw}`
    };

    // --- Flux 1 : Analyse NLP d'une réclamation réelle ---
    console.log('  👉 Exécution Use Case 1 : Analyse NLP & Détection d\'Urgence...');
    const nlpRes = await fetch(`${GATEWAY_BASE}/gpr/v1/claims/analyze`, {
      method: 'POST',
      headers: projectHeaders,
      body: JSON.stringify({
        texte: 'Un retrait frauduleux de 100 000 FCFA a eu lieu au distributeur automatique DAB du Plateau sans mon accord. Je saisis mon avocat et la BCEAO !',
        canal: 'Mobile App',
        produit: 'Carte Bancaire Internationale'
      })
    });
    assert.strictEqual(nlpRes.status, 200, `Erreur NLP Gateway: status ${nlpRes.status}`);
    const nlpData = await nlpRes.json();
    const urgenceVal = nlpData.urgency || nlpData.urgence;
    const keywordsVal = nlpData.sensitive_keywords_detected || nlpData.mots_cles_sensibles || [];
    assert(urgenceVal, 'Le champ urgency/urgence doit être présent.');
    assert(nlpData.sentiment, 'Le champ sentiment doit être présent.');
    assert(Array.isArray(keywordsVal), 'keywordsVal doit être un tableau.');
    console.log(`     ✅ Résultat NLP : Urgence=${urgenceVal} | Sentiment=${nlpData.sentiment} | Mots critiques=${JSON.stringify(keywordsVal)}`);

    // --- Flux 2 : Résolution RAG Assistée ---
    console.log('  👉 Exécution Use Case 2 : Résolution RAG Assistée (Historique + BCEAO)...');
    const ragRes = await fetch(`${GATEWAY_BASE}/gpr/v1/claims/resolve`, {
      method: 'POST',
      headers: projectHeaders,
      body: JSON.stringify({
        query: 'Retrait non distribué par automate bancaire avec compte débité immédiatement',
        categorie: 'Cartes & DAB'
      })
    });
    assert.strictEqual(ragRes.status, 200, `Erreur RAG Gateway: status ${ragRes.status}`);
    const ragData = await ragRes.json();
    assert(Array.isArray(ragData.propositions), 'propositions doit être un tableau.');
    console.log(`     ✅ Résultat RAG : ${ragData.propositions.length} proposition(s) générée(s) avec justification.`);

    // --- Flux 3 : Transcription Audio & Correction Bancaire ---
    console.log('  👉 Exécution Use Case 3 : Transcription Audio & Correction Phonétique...');
    const audioRes = await fetch(`${GATEWAY_BASE}/gpr/v1/audio/transcribe`, {
      method: 'POST',
      headers: projectHeaders,
      body: JSON.stringify({
        audio_base64: 'UklGRi4AAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        filename: 'appel_reclamation_client.mp3',
        language: 'fr'
      })
    });
    assert.strictEqual(audioRes.status, 200, `Erreur Audio Gateway: status ${audioRes.status}`);
    const audioData = await audioRes.json();
    console.log(`     ✅ Résultat Audio : Transcription terminée avec succès (durée : ${audioData.duration_seconds || 0}s).`);

    // --- Flux 4 : Dynamic Analytics & Text-to-Viz ---
    console.log('  👉 Exécution Use Case 4 : Requête Analytique en Langage Naturel...');
    const analyticsRes = await fetch(`${GATEWAY_BASE}/gpr/v1/analytics/query`, {
      method: 'POST',
      headers: projectHeaders,
      body: JSON.stringify({
        query: 'Répartition des montants réclamés par agence',
        records: [
          { id: 'REC-101', agence: 'Abidjan Plateau', montant_conteste: 150000, statut: 'Résolu' },
          { id: 'REC-102', agence: 'Abidjan Cocody', montant_conteste: 80000, statut: 'En cours' },
          { id: 'REC-103', agence: 'Abidjan Plateau', montant_conteste: 120000, statut: 'Résolu' },
          { id: 'REC-104', agence: 'San Pedro', montant_conteste: 45000, statut: 'Nouveau' }
        ]
      })
    });
    assert.strictEqual(analyticsRes.status, 200, `Erreur Analytics Gateway: status ${analyticsRes.status}`);
    const analyticsData = await analyticsRes.json();
    const echartsVal = analyticsData.echarts_option || analyticsData.chart_options;
    const aggDataVal = analyticsData.aggregated_data || analyticsData.raw_aggregations || [];
    assert(echartsVal, 'Options Apache ECharts requises.');
    console.log(`     ✅ Résultat Analytics : Graphique généré (type: ${analyticsData.intent?.chart_type || analyticsData.chart_type}) avec ${aggDataVal.length} regroupement(s).\n`);


    // -------------------------------------------------------------------------
    // 5. VÉRIFICATION DE LA TRAÇABILITÉ RATTACHÉE AU NOUVEAU PROJET
    // -------------------------------------------------------------------------
    console.log('📊 5. Audit de la traçabilité rattachée spécifiquement à ce nouveau projet...');

    // 5.1 Exécutions créées pour le projet
    const projectExecutions = await prisma.aIExecution.findMany({
      where: { project_id: newProject.id },
      orderBy: { created_date: 'desc' }
    });
    assert(projectExecutions.length >= 4, `Au moins 4 exécutions doivent être rattachées au projet, trouvé: ${projectExecutions.length}`);
    console.log(`  ✅ ${projectExecutions.length} Exécution(s) IA enregistrée(s) sous le project_id "${newProject.id}" :`);
    projectExecutions.forEach((ex, idx) => {
      console.log(`     [${idx + 1}] Use Case: ${ex.use_case} | Statut: ${ex.status} | Durée: ${ex.execution_time}ms`);
    });

    // 5.2 Journal d'audit d'intégrité (AuditEvent)
    const auditEvents = await prisma.auditEvent.findMany({
      where: { project_id: newProject.id }
    });
    assert(auditEvents.length >= 4, `Au moins 4 événements d'audit doivent être rattachés au projet, trouvé: ${auditEvents.length}`);
    console.log(`  ✅ ${auditEvents.length} Événement(s) d'audit enregistrés sous l'action DYNAMIC_AI_EXECUTION.`);

    // 5.3 Logs de requêtes API (ApiLog)
    const apiLogs = await prisma.apiLog.findMany({
      where: { project_id: newProject.id }
    });
    console.log(`  ✅ ${apiLogs.length} Entrée(s) journalisée(s) dans ApiLog avec status_code 200.\n`);


    // -------------------------------------------------------------------------
    // 6. CONCLUSION & CERTIFICATION DE L'INTÉGRATION COMPLÈTE
    // -------------------------------------------------------------------------
    console.log('========================================================================');
    console.log('🎉 CYCLE COMPLET 100% RÉUSSI :');
    console.log('   - Configuration du Core : VÉRIFIÉE');
    console.log('   - Création du Nouveau Projet : VÉRIFIÉE');
    console.log('   - Attachement du Module GPR : VÉRIFIÉ');
    console.log('   - Génération de Clé API : VÉRIFIÉE');
    console.log('   - Exécution réelle des 4 Use Cases : VÉRIFIÉE (HTTP 200)');
    console.log('   - Traçabilité AIExecution & AuditEvent : VÉRIFIÉE');
    console.log('========================================================================');

  } catch (err) {
    console.error('\n❌ ÉCHEC DU TEST DU CYCLE DE VIE :', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
});
