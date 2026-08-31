import express from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const prisma = new PrismaClient();

const DB_FILE = path.resolve('mock_db.json');
let mockDb = {};
if (fs.existsSync(DB_FILE)) {
  try { mockDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); } catch (e) {}
}
const saveMockDb = () => fs.writeFileSync(DB_FILE, JSON.stringify(mockDb, null, 2));

const getModel = (entity) => {
  const lower = entity.toLowerCase();
  if (lower === 'aiexecution') return prisma.aIExecution;
  if (lower === 'auditevent') return prisma.auditEvent;
  if (lower === 'apikey') return prisma.apiKey;
  if (lower === 'knowledgebase') return prisma.knowledgeBase;
  if (lower === 'ragcollection') return prisma.ragCollection;
  if (lower === 'aiprovider') return prisma.aiProvider;
  if (lower === 'aimodel') return prisma.aiModel;
  if (lower === 'aipolicy') return prisma.aiPolicy;
  if (lower === 'coreversion') return prisma.coreVersion;
  if (lower === 'coresettings') return prisma.coreSettings;
  if (lower === 'apilog') return prisma.apiLog;
  return prisma[lower];
};

const stringifyJsonFields = (data) => {
  const result = { ...data };
  for (const key in result) {
    if (typeof result[key] === 'object' && result[key] !== null) {
      result[key] = JSON.stringify(result[key]);
    }
  }
  return result;
};

const parseJsonFields = (data) => {
  const result = { ...data };
  for (const key in result) {
    if (typeof result[key] === 'string' && (result[key].startsWith('{') || result[key].startsWith('['))) {
      try {
        result[key] = JSON.parse(result[key]);
      } catch (e) {
        // Leave as string
      }
    }
  }
  return result;
};

router.get('/:entity', async (req, res) => {
  try {
    const model = getModel(req.params.entity);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    
    const { sort, limit, ...filters } = req.query;
    const where = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) where[key] = value;
    }
    
    const items = await model.findMany({
      where,
      orderBy: { created_date: 'desc' },
      take: limit ? parseInt(limit) : undefined
    });
    res.json(items.map(parseJsonFields));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:entity/:id', async (req, res) => {
  try {
    const model = getModel(req.params.entity);
    if (!model) {
      const entity = req.params.entity.toLowerCase();
      const item = (mockDb[entity] || []).find(e => e.id === req.params.id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      return res.json(item);
    }
    const item = await model.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(parseJsonFields(item));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:entity', async (req, res) => {
  try {
    const model = getModel(req.params.entity);
    if (!model) {
      const entity = req.params.entity.toLowerCase();
      if (!mockDb[entity]) mockDb[entity] = [];
      const newItem = { id: entity + '_' + Date.now(), created_date: new Date().toISOString(), ...req.body };
      mockDb[entity].push(newItem);
      saveMockDb();
      return res.status(201).json(newItem);
    }
    
    const dataToSave = stringifyJsonFields(req.body);
    const newItem = await model.create({ data: dataToSave });
    
    res.status(201).json(parseJsonFields(newItem));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:entity/:id', async (req, res) => {
  try {
    const model = getModel(req.params.entity);
    if (!model) {
      const entity = req.params.entity.toLowerCase();
      if (!mockDb[entity]) mockDb[entity] = [];
      const index = mockDb[entity].findIndex(e => e.id === req.params.id);
      if (index === -1) return res.status(404).json({ error: 'Not found' });
      mockDb[entity][index] = { ...mockDb[entity][index], ...req.body, updated_date: new Date().toISOString() };
      saveMockDb();
      return res.json(mockDb[entity][index]);
    }
    
    const dataToSave = stringifyJsonFields(req.body);
    const updated = await model.update({
      where: { id: req.params.id },
      data: dataToSave
    });
    
    res.json(parseJsonFields(updated));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:entity/:id', async (req, res) => {
  try {
    const model = getModel(req.params.entity);
    if (!model) {
      const entity = req.params.entity.toLowerCase();
      if (!mockDb[entity]) return res.json({ success: true });
      mockDb[entity] = mockDb[entity].filter(e => e.id !== req.params.id);
      saveMockDb();
      return res.json({ success: true });
    }
    await model.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
