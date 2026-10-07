import('node:assert').then(async ({ default: assert }) => {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  console.log('--- Test de Validation du Module GPR & Seed (Phase 6) ---');

  try {
    // 1. Vérification du Projet
    const project = await prisma.project.findFirst({
      where: { id: 'demo-gpr-bank-project' }
    });
    assert(project, 'Projet demo-gpr-bank-project introuvable');
    console.log('✅ Projet vérifié :', project.name);

    // 2. Vérification du Module GPR
    const moduleGpr = await prisma.module.findFirst({
      where: { module_key: 'gpr' }
    });
    assert(moduleGpr, 'Module gpr introuvable');
    assert.strictEqual(moduleGpr.status, 'active', 'Le module gpr doit être actif');
    assert.strictEqual(moduleGpr.lifecycle, 'published', 'Le module gpr doit être publié');

    const useCases = JSON.parse(moduleGpr.use_cases || '[]');
    assert.strictEqual(useCases.length, 4, 'Le module gpr doit contenir 4 Use Cases');
    const expectedKeys = ['analyse-reclamation', 'resolution-reclamation', 'transcription-appel', 'reporting-naturel'];
    for (const key of expectedKeys) {
      assert(useCases.some(u => u.key === key), `Use case manquant : ${key}`);
    }
    console.log('✅ 4 Use Cases vérifiés :', useCases.map(u => u.key).join(', '));

    // 3. Vérification des 4 Endpoints Dynamiques
    const endpoints = JSON.parse(moduleGpr.endpoints || '[]');
    assert.strictEqual(endpoints.length, 4, 'Le module gpr doit exposer 4 endpoints');
    const expectedPaths = [
      '/gpr/v1/claims/analyze',
      '/gpr/v1/claims/resolve',
      '/gpr/v1/audio/transcribe',
      '/gpr/v1/analytics/query'
    ];
    for (const p of expectedPaths) {
      assert(endpoints.some(e => e.path === p), `Endpoint manquant : ${p}`);
    }
    console.log('✅ 4 Endpoints dynamiques vérifiés :', endpoints.map(e => e.path).join(', '));

    // 4. Vérification des Prompts enregistrés
    const prompts = await prisma.prompt.findMany({
      where: { module_id: moduleGpr.id }
    });
    assert.strictEqual(prompts.length, 4, '4 prompts doivent être rattachés au module gpr');
    console.log('✅ 4 Prompts vérifiés en base');

    // 5. Vérification des Collections RAG et Documents
    const ragCols = await prisma.ragCollection.findMany({
      where: { module_id: moduleGpr.id }
    });
    assert(ragCols.some(c => c.collection_name === 'gpr_claims'), 'Collection gpr_claims manquante');
    assert(ragCols.some(c => c.collection_name === 'gpr_claims_regulatory'), 'Collection gpr_claims_regulatory manquante');
    console.log('✅ 2 Collections RAG vérifiées : gpr_claims & gpr_claims_regulatory');

    const docs = await prisma.document.findMany({
      where: {
        OR: [
          { knowledge_base_id: 'demo-gpr-regulatory-kb' },
          { knowledge_base_id: 'demo-gpr-historical-kb' }
        ]
      }
    });
    assert(docs.length >= 6, `Nombre insuffisant de documents de test : ${docs.length}`);
    console.log(`✅ ${docs.length} Documents de test vérifiés`);

    // 6. Vérification de la Clé API
    const apiKey = await prisma.apiKey.findFirst({
      where: { key_prefix: 'sk_demo_gpr_' }
    });
    assert(apiKey, 'Clé API sk_demo_gpr_ introuvable');
    assert.strictEqual(apiKey.status, 'active', 'La clé API doit être active');
    console.log('✅ Clé API active vérifiée :', apiKey.name);

    // 7. Vérification de la configuration du module (Taxonomie, Vocabulaire, Schéma Analytics)
    const config = JSON.parse(moduleGpr.configuration || '{}');
    assert(config.taxonomy && Array.isArray(config.taxonomy.categories), 'Taxonomie absente de la config module');
    assert(Array.isArray(config.vocabulary_terms) && config.vocabulary_terms.length >= 10, 'Vocabulaire audio absent');
    assert(config.dataset_schema && Array.isArray(config.dataset_schema.fields), 'Schéma analytics absent');
    console.log('✅ Configuration déclarative vérifiée (Taxonomie, Vocabulaire, Dataset Schema)');

    console.log('\n🎉 TOUS LES TESTS DE VALIDATION DU MODULE GPR (PHASE 6) SONT RÉUSSIS !');
  } catch (err) {
    console.error('❌ Erreur de test :', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
});
