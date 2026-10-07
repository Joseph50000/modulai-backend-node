import('node:assert').then(async ({ default: assert }) => {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  console.log('--- Test de Routage de la Passerelle Dynamique (Phase 6) ---');

  try {
    const modules = await prisma.module.findMany({
      where: { lifecycle: 'published' }
    });

    const targetPaths = [
      { path: 'gpr/v1/claims/analyze', expectedType: 'nlp_analysis', expectedUseCase: 'gpr:analyse-reclamation' },
      { path: 'gpr/v1/claims/resolve', expectedType: 'rag_resolution', expectedUseCase: 'gpr:resolution-reclamation' },
      { path: 'gpr/v1/audio/transcribe', expectedType: 'audio', expectedUseCase: 'gpr:transcription-appel' },
      { path: 'gpr/v1/analytics/query', expectedType: 'analytics', expectedUseCase: 'gpr:reporting-naturel' },
    ];

    for (const target of targetPaths) {
      let matchedEndpoint = null;
      let matchedModule = null;

      for (const mod of modules) {
        if (!mod.endpoints) continue;
        let endpoints = [];
        try { endpoints = JSON.parse(mod.endpoints); } catch (e) { continue; }

        const ep = endpoints.find(e => {
          const epPath = (e.path || '').replace(/^\/+|\/+$/g, '');
          return epPath === target.path && e.method === 'POST';
        });

        if (ep) {
          matchedEndpoint = ep;
          matchedModule = mod;
          break;
        }
      }

      assert(matchedEndpoint, `Aucun endpoint routé pour le chemin : ${target.path}`);
      assert.strictEqual(matchedEndpoint.type, target.expectedType, `Type erroné pour ${target.path} : attendu ${target.expectedType}, reçu ${matchedEndpoint.type}`);
      assert.strictEqual(matchedEndpoint.use_case_key, target.expectedUseCase, `Use Case erroné pour ${target.path}`);

      console.log(`✅ Routage validé pour /api/dynamic/${target.path} ➔ Type: ${matchedEndpoint.type} ➔ Use Case: ${matchedEndpoint.use_case_key}`);
    }

    console.log('\n🎉 TOUS LES 4 ENDPOINTS SONT PARFAITEMENT ROUTÉS PAR LA GATEWAY DYNAMIQUE !');
  } catch (err) {
    console.error('❌ Erreur de test Gateway :', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
});
