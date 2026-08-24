import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import entityRoutes from './routes/entities.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes de test
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'modulai-backend' });
});

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api', entityRoutes);

app.listen(PORT, () => {
  console.log("Serveur Backend Node.js démarré sur http://localhost:" + PORT);
});
