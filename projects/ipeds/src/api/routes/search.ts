import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';

const router = Router();

// GET /api/search/text - Fuzzy text search using trigrams
router.get('/text', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      q: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    });

    const { q, limit } = schema.parse(req.query);

    const sql = `
      SELECT
        unitid, name, city, state, sector, hbcu,
        similarity(name, $1)::float as match_score
      FROM institution
      WHERE name % $1
      ORDER BY similarity(name, $1) DESC
      LIMIT $2
    `;

    const rows = await query(sql, [q, limit]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/search/similar - Vector similarity search
router.get('/similar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      unitid: z.coerce.number().int(),
      limit: z.coerce.number().int().min(1).max(50).default(10),
    });

    const { unitid, limit } = schema.parse(req.query);

    const sql = `
      WITH target AS (
        SELECT feature_vector FROM institution WHERE unitid = $1
      )
      SELECT
        i.unitid, i.name, i.city, i.state, i.sector, i.hbcu,
        ROUND((1 - (i.feature_vector <=> target.feature_vector))::numeric, 4)::float as similarity
      FROM institution i, target
      WHERE i.feature_vector IS NOT NULL AND i.unitid != $1
      ORDER BY i.feature_vector <=> target.feature_vector
      LIMIT $2
    `;

    const rows = await query(sql, [unitid, limit]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/search/nearby - Geo search
router.get('/nearby', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      radius_miles: z.coerce.number().min(1).max(500).default(25),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    });

    const { lat, lng, radius_miles, limit } = schema.parse(req.query);
    const radius_meters = radius_miles * 1609.34;

    const sql = `
      SELECT
        unitid, name, city, state, sector, hbcu,
        latitude, longitude,
        ROUND((ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
        ) / 1609.34)::numeric, 1)::float as miles_away
      FROM institution
      WHERE geom IS NOT NULL
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
          $3
        )
      ORDER BY ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography)
      LIMIT $4
    `;

    const rows = await query(sql, [lat, lng, radius_meters, limit]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/search/advanced - Combined search with multiple criteria
router.get('/advanced', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().optional(),
      state: z.string().length(2).toUpperCase().optional(),
      sector: z.coerce.number().int().optional(),
      hbcu: z.coerce.boolean().optional(),
      min_enrollment: z.coerce.number().int().optional(),
      max_enrollment: z.coerce.number().int().optional(),
      min_grad_rate: z.coerce.number().min(0).max(100).optional(),
      max_admit_rate: z.coerce.number().min(0).max(100).optional(),
      max_net_price: z.coerce.number().optional(),
      year: z.coerce.number().int().default(2023),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    });

    const params = schema.parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.name) {
      conditions.push(`i.name ILIKE $${paramIndex++}`);
      values.push(`%${params.name}%`);
    }
    if (params.state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(params.state);
    }
    if (params.sector !== undefined) {
      conditions.push(`i.sector = $${paramIndex++}`);
      values.push(params.sector);
    }
    if (params.hbcu !== undefined) {
      conditions.push(`i.hbcu = $${paramIndex++}`);
      values.push(params.hbcu);
    }
    if (params.min_enrollment !== undefined) {
      conditions.push(`e.total_enrollment >= $${paramIndex++}`);
      values.push(params.min_enrollment);
    }
    if (params.max_enrollment !== undefined) {
      conditions.push(`e.total_enrollment <= $${paramIndex++}`);
      values.push(params.max_enrollment);
    }
    if (params.min_grad_rate !== undefined) {
      conditions.push(`g.grad_rate >= $${paramIndex++}`);
      values.push(params.min_grad_rate);
    }
    if (params.max_admit_rate !== undefined) {
      conditions.push(`a.admit_rate <= $${paramIndex++}`);
      values.push(params.max_admit_rate / 100);
    }
    if (params.max_net_price !== undefined) {
      conditions.push(`f.avg_net_price <= $${paramIndex++}`);
      values.push(params.max_net_price);
    }

    const where = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

    const sql = `
      WITH enrollment_totals AS (
        SELECT unitid, total::int as total_enrollment
        FROM enrollment
        WHERE year = $${paramIndex} AND level = 'all' AND gender = 'total' AND race = 'APTS'
      ),
      grad_rates AS (
        SELECT unitid,
          ROUND(SUM(completers_150pct)::numeric / NULLIF(SUM(cohort_size), 0) * 100, 2)::float as grad_rate
        FROM graduation_rates
        WHERE year = $${paramIndex} AND cohort_type = 'bachelor'
        GROUP BY unitid
      ),
      admit_rates AS (
        SELECT unitid, admit_rate::float
        FROM admissions WHERE year = $${paramIndex}
      )
      SELECT
        i.unitid, i.name, i.city, i.state, i.sector, i.hbcu,
        e.total_enrollment,
        g.grad_rate,
        ROUND(a.admit_rate::numeric * 100, 1)::float as admit_rate,
        f.avg_net_price::int
      FROM institution i
      LEFT JOIN enrollment_totals e ON i.unitid = e.unitid
      LEFT JOIN grad_rates g ON i.unitid = g.unitid
      LEFT JOIN admit_rates a ON i.unitid = a.unitid
      LEFT JOIN financial_aid f ON i.unitid = f.unitid AND f.year = $${paramIndex}
      WHERE 1=1 ${where}
      ORDER BY i.name
      LIMIT $${paramIndex + 1}
    `;
    values.push(params.year, params.limit);

    const rows = await query(sql, values);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

export default router;
