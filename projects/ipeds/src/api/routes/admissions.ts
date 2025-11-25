import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { PaginationSchema, YearRangeSchema } from '../schemas/common.js';

const router = Router();

const AdmissionsQuerySchema = PaginationSchema.merge(YearRangeSchema).extend({
  state: z.string().length(2).toUpperCase().optional(),
  unitid: z.coerce.number().int().optional(),
  min_admit_rate: z.coerce.number().min(0).max(1).optional(),
  max_admit_rate: z.coerce.number().min(0).max(1).optional(),
});

// GET /api/admissions
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = AdmissionsQuerySchema.parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.unitid) {
      conditions.push(`a.unitid = $${paramIndex++}`);
      values.push(params.unitid);
    }
    if (params.state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(params.state);
    }
    if (params.year_start) {
      conditions.push(`a.year >= $${paramIndex++}`);
      values.push(params.year_start);
    }
    if (params.year_end) {
      conditions.push(`a.year <= $${paramIndex++}`);
      values.push(params.year_end);
    }
    if (params.min_admit_rate !== undefined) {
      conditions.push(`a.admit_rate >= $${paramIndex++}`);
      values.push(params.min_admit_rate);
    }
    if (params.max_admit_rate !== undefined) {
      conditions.push(`a.admit_rate <= $${paramIndex++}`);
      values.push(params.max_admit_rate);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        a.unitid, i.name, i.state, a.year,
        a.applicants_total, a.admitted_total, a.enrolled_total,
        a.admit_rate::float, a.yield_rate::float,
        a.sat_verbal_25, a.sat_verbal_75, a.sat_math_25, a.sat_math_75,
        a.act_composite_25, a.act_composite_75
      FROM admissions a
      JOIN institution i ON a.unitid = i.unitid
      ${where}
      ORDER BY a.year DESC, i.name
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    values.push(params.limit, params.offset);

    const rows = await query(sql, values);
    res.json({ data: rows, meta: { limit: params.limit, offset: params.offset } });
  } catch (error) {
    next(error);
  }
});

// GET /api/admissions/trends/:unitid
router.get('/trends/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);

    const sql = `
      SELECT
        year,
        applicants_total,
        admitted_total,
        enrolled_total,
        admit_rate::float, yield_rate::float,
        sat_verbal_25, sat_verbal_75, sat_math_25, sat_math_75,
        act_composite_25, act_composite_75
      FROM admissions
      WHERE unitid = $1
      ORDER BY year
    `;

    const rows = await query(sql, [unitid]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/admissions/most-selective
router.get('/most-selective', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year = 2023, limit = 20 } = req.query;

    const sql = `
      SELECT
        a.unitid, i.name, i.state, a.year,
        a.applicants_total, a.admitted_total,
        a.admit_rate::float
      FROM admissions a
      JOIN institution i ON a.unitid = i.unitid
      WHERE a.year = $1
        AND a.applicants_total >= 1000
        AND a.admitted_total > 0
      ORDER BY a.admit_rate
      LIMIT $2
    `;

    const rows = await query(sql, [year, limit]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

export default router;
