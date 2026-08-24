import express from 'express';
const router = express.Router();

router.post('/login', (req, res) => {
  const { email } = req.body;
  res.json({ id: 'u_1', email, name: 'Admin', role: 'admin', token: 'mock_jwt_token' });
});

router.get('/me', (req, res) => {
  // En situation réelle, on valide le JWT ici
  res.json({ id: 'u_1', email: 'admin@modulai.com', name: 'Admin', role: 'admin' });
});

export default router;
