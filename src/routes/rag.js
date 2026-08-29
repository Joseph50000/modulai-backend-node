import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();
const AI_CORE_URL = (process.env.AI_CORE_URL || 'http://localhost:8001').replace(/\/$/, '');
const CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 800);
const CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 120);

const collectionFor = (knowledgeBaseId, collection) => {
  const raw = collection || `kb_${knowledgeBaseId || 'global'}`;
  return raw.toString().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 63) || 'kb_global';
};

const splitIntoChunks = (text) => {
  const value = String(text || '').trim();
  if (!value) return [];
  const chunks = [];
  let start = 0;
  while (start < value.length) {
    const end = Math.min(start + CHUNK_SIZE, value.length);
    chunks.push(value.slice(start, end).trim());
    if (end >= value.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks.filter(Boolean);
};

const callCore = async (path, payload) => {
  const response = await fetch(`${AI_CORE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }
  if (!response.ok) {
    const message = data.detail || data.message || `AI Core HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
};

const syncKnowledgeBaseCounters = async (knowledgeBaseId) => {
  if (!knowledgeBaseId) return;
  const documents = await prisma.document.findMany({ where: { knowledge_base_id: knowledgeBaseId }, select: { chunk_count: true } });
  await prisma.knowledgeBase.update({
    where: { id: knowledgeBaseId },
    data: {
      documents_count: documents.length,
      embeddings_count: documents.reduce((total, doc) => total + (doc.chunk_count || 0), 0),
    },
  });
};

const indexDocumentRecord = async (document) => {
  const knowledgeBaseId = document.knowledge_base_id || document.kb_id || null;
  const chunks = splitIntoChunks(document.content);
  if (!chunks.length) throw new Error('Le document est vide et ne peut pas être indexé.');
  const collection = collectionFor(knowledgeBaseId);
  const result = await callCore('/api/rag/index', {
    collection,
    documents: chunks,
    ids: chunks.map((_, index) => `${document.id}_chunk_${index}`),
    metadatas: chunks.map((_, index) => ({
      document_id: document.id,
      knowledge_base_id: knowledgeBaseId || '',
      document_name: document.name || 'Document sans nom',
      source: document.source || 'upload',
      chunk_index: index,
    })),
  });
  await prisma.document.update({
    where: { id: document.id },
    data: { status: 'indexed', chunks: JSON.stringify(chunks), chunk_count: chunks.length },
  });
  await syncKnowledgeBaseCounters(knowledgeBaseId);
  return { ...result, document_id: document.id, chunks: chunks.length, collection };
};

router.post('/index', async (req, res) => {
  try {
    const { document_id, document } = req.body || {};
    const record = document_id
      ? await prisma.document.findUnique({ where: { id: document_id } })
      : document;
    if (!record) return res.status(404).json({ error: 'Document not found' });
    const result = await indexDocumentRecord(record);
    return res.json(result);
  } catch (error) {
    console.error('RAG index error:', error);
    return res.status(error.status || 500).json({ error: 'RAG indexing failed', message: error.message });
  }
});

router.post('/reindex/:knowledgeBaseId', async (req, res) => {
  try {
    const knowledgeBaseId = req.params.knowledgeBaseId;
    const documents = await prisma.document.findMany({ where: { knowledge_base_id: knowledgeBaseId }, orderBy: { created_date: 'asc' } });
    let indexed = 0;
    let chunks = 0;
    for (const document of documents) {
      const result = await indexDocumentRecord(document);
      indexed += 1;
      chunks += result.chunks || 0;
    }
    return res.json({ knowledge_base_id: knowledgeBaseId, documents: indexed, chunks, collection: collectionFor(knowledgeBaseId) });
  } catch (error) {
    console.error('RAG reindex error:', error);
    return res.status(error.status || 500).json({ error: 'RAG reindex failed', message: error.message });
  }
});

router.post('/search', async (req, res) => {
  try {
    const { knowledgeBaseId, knowledge_base_id, collection, query, topK, top_k, filter } = req.body || {};
    if (!query || !String(query).trim()) return res.status(400).json({ error: 'query is required' });
    const kbId = knowledgeBaseId || knowledge_base_id;
    const result = await callCore('/api/rag/search', {
      collection: collectionFor(kbId, collection),
      query: String(query),
      top_k: Number(topK || top_k || 5),
      filter_metadata: filter || (kbId ? { knowledge_base_id: kbId } : undefined),
    });
    return res.json(result.results || []);
  } catch (error) {
    console.error('RAG search error:', error);
    return res.status(error.status || 500).json({ error: 'RAG search failed', message: error.message });
  }
});

export default router;
