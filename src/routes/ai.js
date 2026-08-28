import express from 'express';


const router = express.Router();

const AI_CORE_URL = process.env.AI_CORE_URL || 'http://localhost:8001';

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

export default router;
