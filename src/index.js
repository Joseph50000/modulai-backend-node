import express from 'express';
import { projectCors } from './middleware/projectCors.js';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import entityRoutes from './routes/entities.js';
import aiRoutes from './routes/ai.js';
import gatewayRoutes from './routes/gateway.js';
import ragRoutes from './routes/rag.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Les routes dynamiques appliquent la policy CORS du projet ciblé.
app.use(express.json({ limit: process.env.RAG_UPLOAD_LIMIT || '25mb' }));

// Routes de test
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'modulai-backend' });
});

// Routes API internes
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/rag', ragRoutes);

// Gateway dynamique pour les endpoints des modules
app.use('/api/dynamic', projectCors, gatewayRoutes);

// Generic CRUD API (doit être en dernier pour ne pas intercepter les autres)
app.use('/api', entityRoutes);

app.listen(PORT, () => {
  console.log("Serveur Backend Node.js démarré sur http://localhost:" + PORT);
});
