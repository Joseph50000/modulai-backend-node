import express from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import pg from 'pg';
import mysql from 'mysql2/promise';

const router = express.Router();
const prisma = new PrismaClient();
const AI_CORE_URL = (process.env.AI_CORE_URL || 'http://localhost:8001').replace(/\/$/, '');
const CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 800);
const CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 120);
const JINA_API_KEY = process.env.JINA_API_KEY || '';
const RAG_URL_TIMEOUT_MS = Number(process.env.RAG_URL_TIMEOUT_MS || 30000);
const { Pool } = pg;

const createSqlPool = (preset) => {
  const driver = String(preset.driver || process.env.RAG_SQL_DRIVER || 'postgres').toLowerCase();
  const connectionString = process.env.RAG_SQL_DATABASE_URL;
  if (!connectionString) throw Object.assign(new Error('RAG_SQL_DATABASE_URL is not configured'), { status: 503 });
  if (driver === 'mysql' || driver === 'mariadb') {
    return mysql.createPool({
      uri: connectionString,
      waitForConnections: true,
      connectionLimit: Number(process.env.RAG_SQL_POOL_SIZE || 2),
      enableKeepAlive: true,
      ssl: process.env.RAG_SQL_SSL === 'true' ? { rejectUnauthorized: process.env.RAG_SQL_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
    });
  }
  return new Pool({ connectionString, max: Number(process.env.RAG_SQL_POOL_SIZE || 2), ssl: process.env.RAG_SQL_SSL === 'true' ? { rejectUnauthorized: process.env.RAG_SQL_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined });
};

const assertReadOnlyQuery = (query) => {
  const normalized = String(query || '')
    .replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)+/g, '')
    .trim()
    .replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(normalized) || /;|\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|replace|call|set|use|load)\b/i.test(normalized)) {
    throw Object.assign(new Error('Only SELECT/CTE read-only queries are allowed for RAG SQL presets'), { status: 400 });
  }
  return normalized;
};

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

const createAndIndexDocument = async ({ knowledgeBaseId, name, content, type, source, size, metadata = {} }) => {
  const document = await prisma.document.create({
    data: {
      id: crypto.randomUUID(),
      name,
      knowledge_base_id: knowledgeBaseId,
      kb_id: knowledgeBaseId,
      type,
      source,
      size: size || Buffer.byteLength(content || '', 'utf8'),
      status: 'pending',
      content,
      metadata: JSON.stringify(metadata),
      chunks: JSON.stringify([]),
      chunk_count: 0,
    },
  });
  try {
    return await indexDocumentRecord(document);
  } catch (error) {
    await prisma.document.update({
      where: { id: document.id },
      data: { status: 'failed', metadata: JSON.stringify({ ...metadata, indexing_error: error.message }) },
    }).catch(() => {});
    throw error;
  }
};

router.post('/ingest/file', async (req, res) => {
  try {
    const { knowledge_base_id, knowledgeBaseId: requestedKnowledgeBaseId, filename, content_base64, metadata } = req.body || {};
    if (!knowledge_base_id && !requestedKnowledgeBaseId) return res.status(400).json({ error: 'knowledge_base_id is required' });
    if (!filename || !content_base64) return res.status(400).json({ error: 'filename and content_base64 are required' });
    const knowledgeBaseId = knowledge_base_id || requestedKnowledgeBaseId;
    const buffer = Buffer.from(content_base64, 'base64');
    const extraction = await callCore('/api/rag/extract', {
      filename,
      content_base64,
    });
    const result = await createAndIndexDocument({
      knowledgeBaseId,
      name: filename,
      content: extraction.text,
      type: extraction.type,
      source: 'file-upload',
      size: buffer.length,
      metadata: { ...metadata, original_filename: filename, extractor: extraction.extractor },
    });
    return res.status(201).json(result);
  } catch (error) {
    console.error('RAG file ingestion error:', error);
    return res.status(error.status || 500).json({ error: 'File ingestion failed', message: error.message });
  }
});

router.post('/ingest/url', async (req, res) => {
  try {
    const { knowledge_base_id, knowledgeBaseId, url, metadata = {} } = req.body || {};
    const kbId = knowledge_base_id || knowledgeBaseId;
    if (!kbId || !url) return res.status(400).json({ error: 'knowledge_base_id and url are required' });
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const isPrivateHost = /^(localhost|.*\.localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|0\.|::1|fc00:|fe80:)/i.test(hostname);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || isPrivateHost || url.length > 2048) {
      return res.status(400).json({ error: 'Only public http(s) URLs without credentials are allowed' });
    }
    const headers = { Accept: 'text/markdown', 'X-Return-Format': 'markdown' };
    if (JINA_API_KEY) headers.Authorization = `Bearer ${JINA_API_KEY}`;
    const response = await fetch(`https://r.jina.ai/${url}`, { headers, signal: AbortSignal.timeout(RAG_URL_TIMEOUT_MS) });
    const text = await response.text();
    if (!response.ok) return res.status(response.status).json({ error: 'Jina Reader failed', message: text.slice(0, 500) });
    const title = text.match(/^#\\s+(.+)$/m)?.[1]?.trim() || parsed.hostname;
    const result = await createAndIndexDocument({
      knowledgeBaseId: kbId,
      name: title,
      content: text,
      type: 'url',
      source: url,
      metadata: { ...metadata, url, extractor: 'jina-reader' },
    });
    return res.status(201).json(result);
  } catch (error) {
    console.error('RAG URL ingestion error:', error);
    return res.status(error.status || 500).json({ error: 'URL ingestion failed', message: error.message });
  }
});

router.post('/ingest/sql/:preset', async (req, res) => {
  let pool;
  try {
    const presets = JSON.parse(process.env.RAG_SQL_PRESETS || '{}');
    const preset = presets[req.params.preset];
    if (!preset?.query || !preset?.knowledge_base_id) return res.status(404).json({ error: 'SQL preset not found or incomplete' });
    const query = assertReadOnlyQuery(preset.query);
    const driver = String(preset.driver || process.env.RAG_SQL_DRIVER || 'postgres').toLowerCase();
    pool = createSqlPool(preset);
    const result = driver === 'mysql' || driver === 'mariadb'
      ? await pool.query(query)
      : await pool.query(query, []);
    const rows = (result.rows || result[0] || []).slice(0, Number(preset.max_rows || process.env.RAG_SQL_MAX_ROWS || 1000));
    let indexed = 0;
    for (const row of rows) {
      const content = Object.entries(row).map(([key, value]) => `${key}: ${value ?? ''}`).join('\n');
      await createAndIndexDocument({
        knowledgeBaseId: preset.knowledge_base_id,
        name: `${preset.name || req.params.preset} — ${row[preset.primary_key] || indexed + 1}`,
        content,
        type: 'sql',
        source: `sql:${req.params.preset}`,
        metadata: { preset: req.params.preset, source_table: preset.source_table || '', primary_key: row[preset.primary_key] || null },
      });
      indexed += 1;
    }
    return res.status(201).json({ preset: req.params.preset, driver, rows: rows.length, indexed });
  } catch (error) {
    console.error('RAG SQL ingestion error:', error);
    return res.status(error.status || 500).json({ error: 'SQL ingestion failed', message: error.message });
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
});

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
