const http = require('http');

const payload = JSON.stringify({
  module: 'gpr',
  use_case: 'test-pipeline',
  output_strategy: 'merge_all',
  input: {
    texte: 'Mon compte a été débité frauduleusement de 50000 FCFA hier soir au distributeur automatique.'
  },
  steps: [
    {
      id: 'step_eval',
      name: 'Evaluation Sévérité',
      system_prompt: 'Evalue la plainte : {{input.texte}}',
      output_schema: [
        { name: 'urgence', type: 'string' },
        { name: 'sentiment', type: 'string' }
      ]
    },
    {
      id: 'step_qualif',
      name: 'Qualification Bancaire',
      system_prompt: 'Qualifie la plainte sachant que urgence={{steps.step_eval.urgence}}',
      output_schema: [
        { name: 'categorie', type: 'string' },
        { name: 'motif', type: 'string' }
      ]
    }
  ]
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 8001,
  path: '/api/execute',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    const parsed = JSON.parse(data);
    console.log('Response status:', parsed.status);
    console.log('Parsed result:', parsed.parsed_result);
    console.log('Pipeline metrics:', parsed.pipeline_metrics);
    if (parsed.status === 'success' && parsed.pipeline_metrics && parsed.pipeline_metrics.total_steps === 2) {
      console.log('✅ TEST PIPELINE CORE API SUCCESSFUL');
      process.exit(0);
    } else {
      console.error('❌ TEST PIPELINE FAILED', parsed);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('Error:', err);
  process.exit(1);
});

req.write(payload);
req.end();
