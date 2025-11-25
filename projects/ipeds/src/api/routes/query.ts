import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, pool } from '../db/pool.js';

const router = Router();

// In-memory storage for saved queries (in production, use a database table)
interface SavedQuery {
  id: number;
  name: string;
  description: string;
  sql: string;
  tags: string[];
  created_at: string;
  last_run_at?: string;
  run_count: number;
}

let savedQueries: SavedQuery[] = [];
let nextId = 1;

const ExecuteQuerySchema = z.object({
  sql: z.string().min(1).max(10000),
});

const SaveQuerySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  sql: z.string().min(1).max(10000),
  tags: z.array(z.string()).default([]),
});

// Validate SQL query for safety
function validateQuery(sql: string): { valid: boolean; error?: string } {
  const normalized = sql.trim().toLowerCase();

  // Only allow SELECT statements
  if (!normalized.startsWith('select')) {
    return { valid: false, error: 'Only SELECT queries are allowed' };
  }

  // Block dangerous keywords
  const blockedKeywords = [
    'insert', 'update', 'delete', 'drop', 'truncate', 'alter', 'create',
    'grant', 'revoke', 'execute', 'exec', 'copy', 'pg_', 'information_schema',
  ];

  for (const keyword of blockedKeywords) {
    // Match as whole word
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(sql)) {
      return { valid: false, error: `Query contains blocked keyword: ${keyword}` };
    }
  }

  // Block multiple statements
  if (sql.includes(';') && sql.indexOf(';') < sql.length - 1) {
    return { valid: false, error: 'Multiple statements are not allowed' };
  }

  return { valid: true };
}

// POST /api/query/execute
router.post('/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sql } = ExecuteQuerySchema.parse(req.body);

    // Validate the query
    const validation = validateQuery(sql);
    if (!validation.valid) {
      return res.status(400).json({ error: { message: validation.error } });
    }

    // Add LIMIT if not present
    let safeSql = sql.trim();
    if (!safeSql.toLowerCase().includes('limit')) {
      safeSql = `${safeSql.replace(/;$/, '')} LIMIT 1000`;
    }

    // Execute with timeout
    const startTime = Date.now();
    const client = await pool.connect();

    try {
      // Set statement timeout (10 seconds)
      await client.query('SET statement_timeout = 10000');

      const result = await client.query(safeSql);
      const executionTime = Date.now() - startTime;

      res.json({
        columns: result.fields.map(f => f.name),
        rows: result.rows,
        rowCount: result.rowCount || 0,
        executionTime,
      });
    } finally {
      // Reset timeout and release
      await client.query('RESET statement_timeout');
      client.release();
    }
  } catch (error: any) {
    // Handle PostgreSQL errors gracefully
    if (error.code) {
      return res.status(400).json({
        error: {
          message: error.message,
          code: error.code,
          position: error.position,
        },
      });
    }
    next(error);
  }
});

// GET /api/query/saved
router.get('/saved', async (req: Request, res: Response) => {
  res.json({ data: savedQueries });
});

// POST /api/query/saved
router.post('/saved', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = SaveQuerySchema.parse(req.body);

    const newQuery: SavedQuery = {
      id: nextId++,
      name: data.name,
      description: data.description,
      sql: data.sql,
      tags: data.tags,
      created_at: new Date().toISOString(),
      run_count: 0,
    };

    savedQueries.push(newQuery);
    res.status(201).json(newQuery);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/query/saved/:id
router.delete('/saved/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const index = savedQueries.findIndex(q => q.id === id);

  if (index === -1) {
    return res.status(404).json({ error: { message: 'Query not found' } });
  }

  savedQueries.splice(index, 1);
  res.status(204).send();
});

// PUT /api/query/saved/:id
router.put('/saved/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = SaveQuerySchema.parse(req.body);

    const index = savedQueries.findIndex(q => q.id === id);
    if (index === -1) {
      return res.status(404).json({ error: { message: 'Query not found' } });
    }

    savedQueries[index] = {
      ...savedQueries[index],
      name: data.name,
      description: data.description,
      sql: data.sql,
      tags: data.tags,
    };

    res.json(savedQueries[index]);
  } catch (error) {
    next(error);
  }
});

export default router;
