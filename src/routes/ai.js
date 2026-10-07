import express from 'express';


const router = express.Router();

const AI_CORE_URL = (process.env.AI_CORE_URL || 'http://localhost:8001').replace(/\/$/, '');

router.get('/health', async (_req, res) => {
  try {
    const response = await fetch(`${AI_CORE_URL}/`, { signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    return res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    return res.status(503).json({ status: 'offline', service: 'ModulAI Core', message: error.message });
  }
});

router.post('/execute', async (req, res) => {
  try {
    const payload = req.body;
    
    // Forward the request to the AI Core service
    const response = await fetch(`${AI_CORE_URL}/api/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).json({ error: 'AI Core Error', details: errorData });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error proxying to AI Core:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

router.post('/audio/transcribe', async (req, res) => {
  try {
    const payload = req.body;

    const response = await fetch(`${AI_CORE_URL}/api/audio/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorData);
      } catch (e) {
        parsedError = { detail: errorData };
      }
      return res.status(response.status).json({
        error: 'AI Core Audio Error',
        details: parsedError.detail || parsedError.error || errorData,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error proxying audio transcribe to AI Core:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

router.post('/nlp/analyze', async (req, res) => {
  try {
    const payload = req.body;

    const response = await fetch(`${AI_CORE_URL}/api/nlp/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorData);
      } catch (e) {
        parsedError = { detail: errorData };
      }
      return res.status(response.status).json({
        error: 'AI Core NLP Error',
        details: parsedError.detail || parsedError.error || errorData,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error proxying NLP analyze to AI Core:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

router.post('/nlp/analyze/stream', async (req, res) => {
  try {
    const payload = req.body;

    const response = await fetch(`${AI_CORE_URL}/api/nlp/analyze/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).send(errorData);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value));
      }
      res.end();
    } else {
      const text = await response.text();
      res.send(text);
    }
  } catch (error) {
    console.error('Error proxying NLP analyze stream to AI Core:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

router.post('/rag/resolve', async (req, res) => {
  try {
    const payload = req.body;

    const response = await fetch(`${AI_CORE_URL}/api/rag/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorData);
      } catch (e) {
        parsedError = { detail: errorData };
      }
      return res.status(response.status).json({
        error: 'AI Core RAG Error',
        details: parsedError.detail || parsedError.error || errorData,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error proxying RAG resolve to AI Core:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

router.post('/rag/resolve/stream', async (req, res) => {
  try {
    const payload = req.body;

    const response = await fetch(`${AI_CORE_URL}/api/rag/resolve/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).send(errorData);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value));
      }
      res.end();
    } else {
      const text = await response.text();
      res.send(text);
    }
  } catch (error) {
    console.error('Error proxying RAG resolve stream to AI Core:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

router.post('/analytics/chart', async (req, res) => {
  try {
    const payload = req.body;

    const response = await fetch(`${AI_CORE_URL}/api/analytics/chart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorData);
      } catch (e) {
        parsedError = { detail: errorData };
      }
      return res.status(response.status).json({
        error: 'AI Core Analytics Error',
        details: parsedError.detail || parsedError.error || errorData,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error proxying Analytics chart to AI Core:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

router.post('/analytics/query', async (req, res) => {
  try {
    const payload = req.body;

    const response = await fetch(`${AI_CORE_URL}/api/analytics/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorData);
      } catch (e) {
        parsedError = { detail: errorData };
      }
      return res.status(response.status).json({
        error: 'AI Core Analytics Error',
        details: parsedError.detail || parsedError.error || errorData,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error proxying Analytics query to AI Core:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

router.post('/sync/execute', async (req, res) => {
  try {
    const payload = req.body;
    const response = await fetch(`${AI_CORE_URL}/api/sync/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      let parsedError;
      try { parsedError = JSON.parse(errorData); } catch (e) { parsedError = { detail: errorData }; }
      return res.status(response.status).json({
        error: 'AI Core Sync Error',
        details: parsedError.detail || parsedError.error || errorData,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error proxying Sync execute to AI Core:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

router.post('/sync/schedule', async (req, res) => {
  try {
    const payload = req.body;
    const response = await fetch(`${AI_CORE_URL}/api/sync/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      let parsedError;
      try { parsedError = JSON.parse(errorData); } catch (e) { parsedError = { detail: errorData }; }
      return res.status(response.status).json({
        error: 'AI Core Sync Schedule Error',
        details: parsedError.detail || parsedError.error || errorData,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error proxying Sync schedule to AI Core:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

router.get('/sync/jobs', async (_req, res) => {
  try {
    const response = await fetch(`${AI_CORE_URL}/api/sync/jobs`);
    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).json({ error: 'AI Core Sync Jobs Error', details: errorData });
    }
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error fetching Sync jobs from AI Core:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

export default router;

