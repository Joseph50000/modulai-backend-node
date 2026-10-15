const http = require('http');

async function testPipelineGateway() {
  console.log('Testing Dynamic Gateway with Pipeline Use Case...');
  
  // We send a request to the dynamic gateway with steps in the body
  const payload = JSON.stringify({
    text: "URGENT : On a débité 150000 FCFA sur mon compte hier au DAB de Cocody sans mon consentement. Si je ne suis pas remboursé je saisis la BCEAO et mon avocat !",
    steps: [
      {
        id: "evaluation",
        name: "Évaluation Sévérité & Sentiment",
        system_prompt: "Analyse la sévérité du message : {{input.text}}",
        output_schema: [
          { name: "sentiment", type: "string" },
          { name: "urgence", type: "string" },
          { name: "mots_sensibles_detectes", type: "array" },
          { name: "contentieux", type: "boolean" }
        ]
      },
      {
        id: "qualification",
        name: "Qualification Bancaire",
        system_prompt: "Sachant que urgence={{steps.evaluation.urgence}} et contentieux={{steps.evaluation.contentieux}}, qualifie la réclamation.",
        output_schema: [
          { name: "categorie_suggeree", type: "string" },
          { name: "motif_suggere", type: "string" }
        ]
      },
      {
        id: "synthese",
        name: "Synthèse",
        system_prompt: "Rédige une phrase de synthèse pour le dossier.",
        output_schema: [
          { name: "resume", type: "string" }
        ]
      }
    ]
  });

  const req = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/dynamic/gpr/v1/claims/analyze',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'sk_demo_gpr_claims_active_key_123',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Gateway Response Status:', res.statusCode);
      try {
        const parsed = JSON.parse(data);
        console.log('Gateway Response Status Field:', parsed.status);
        console.log('Urgence:', parsed.urgence);
        console.log('Sentiment:', parsed.sentiment);
        console.log('Catégorie:', parsed.categorie_suggeree);
        console.log('Motif:', parsed.motif_suggere);
        console.log('Résumé:', parsed.resume);
        console.log('Pipeline metrics:', parsed.pipeline_metrics);

        if (res.statusCode === 200 && parsed.status === 'success' && parsed.pipeline_metrics?.total_steps === 3) {
          console.log('\n🎉 GATEWAY PIPELINE EXECUTION SUCCESSFUL ! (All 3 steps executed & merged)');
          process.exit(0);
        } else {
          console.error('\n❌ GATEWAY PIPELINE FAILED:', parsed);
          process.exit(1);
        }
      } catch (e) {
        console.error('Failed to parse response JSON:', data);
        process.exit(1);
      }
    });
  });

  req.on('error', err => {
    console.error('Request error:', err);
    process.exit(1);
  });

  req.write(payload);
  req.end();
}

testPipelineGateway();
