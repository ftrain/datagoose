import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool.js';
import { PaginationSchema } from '../schemas/common.js';
import type { Institution } from '../db/types.js';

const router = Router();

const InstitutionQuerySchema = PaginationSchema.extend({
  state: z.string().length(2).toUpperCase().optional(),
  sector: z.coerce.number().int().min(0).max(99).optional(),
  hbcu: z.coerce.boolean().optional(),
  search: z.string().min(1).optional(),
});

// GET /api/institutions
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = InstitutionQuerySchema.parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.state) {
      conditions.push(`state = $${paramIndex++}`);
      values.push(params.state);
    }
    if (params.sector !== undefined) {
      conditions.push(`sector = $${paramIndex++}`);
      values.push(params.sector);
    }
    if (params.hbcu !== undefined) {
      conditions.push(`hbcu = $${paramIndex++}`);
      values.push(params.hbcu);
    }
    if (params.search) {
      conditions.push(`name ILIKE $${paramIndex++}`);
      values.push(`%${params.search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) FROM institution ${where}`;
    const countResult = await queryOne<{ count: string }>(countSql, values);
    const total = parseInt(countResult?.count ?? '0', 10);

    const sql = `
      SELECT unitid, name, city, state, sector, level, control, hbcu, latitude, longitude
      FROM institution
      ${where}
      ORDER BY name
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    values.push(params.limit, params.offset);

    const rows = await query<Institution>(sql, values);
    res.json({
      data: rows,
      meta: { total, limit: params.limit, offset: params.offset }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/institutions/:unitid
router.get('/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);
    if (isNaN(unitid)) {
      res.status(400).json({ error: { code: 'INVALID_ID', message: 'unitid must be a number' } });
      return;
    }

    const sql = `
      SELECT i.*, rs.label as sector_name
      FROM institution i
      LEFT JOIN ref_sector rs ON i.sector = rs.code
      WHERE unitid = $1
    `;
    const row = await queryOne<Institution>(sql, [unitid]);

    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Institution not found' } });
      return;
    }

    res.json({ data: row });
  } catch (error) {
    next(error);
  }
});

// GET /api/institutions/:unitid/similar
router.get('/:unitid/similar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50);

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

// GET /api/institutions/nearby
router.get('/geo/nearby', async (req: Request, res: Response, next: NextFunction) => {
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

export default router;
