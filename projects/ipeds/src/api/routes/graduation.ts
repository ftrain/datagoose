import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { PaginationSchema, YearRangeSchema } from '../schemas/common.js';

const router = Router();

const GraduationQuerySchema = PaginationSchema.merge(YearRangeSchema).extend({
  unitid: z.coerce.number().int().optional(),
  state: z.string().length(2).toUpperCase().optional(),
  cohort: z.string().optional(),
});

// GET /api/graduation
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = GraduationQuerySchema.parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.unitid) {
      conditions.push(`g.unitid = $${paramIndex++}`);
      values.push(params.unitid);
    }
    if (params.state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(params.state);
    }
    if (params.year_start) {
      conditions.push(`g.year >= $${paramIndex++}`);
      values.push(params.year_start);
    }
    if (params.year_end) {
      conditions.push(`g.year <= $${paramIndex++}`);
      values.push(params.year_end);
    }
    if (params.cohort) {
      conditions.push(`g.cohort_type = $${paramIndex++}`);
      values.push(params.cohort);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        g.unitid, i.name, g.year, g.cohort_type, g.race, g.gender,
        g.cohort_size, g.completers_150pct, g.grad_rate_150pct as grad_rate
      FROM graduation_rates g
      JOIN institution i ON g.unitid = i.unitid
      ${where}
      ORDER BY g.year DESC, i.name
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    values.push(params.limit, params.offset);

    const rows = await query(sql, values);
    res.json({ data: rows, meta: { limit: params.limit, offset: params.offset } });
  } catch (error) {
    next(error);
  }
});

// GET /api/graduation/rates/:unitid
router.get('/rates/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);

    const sql = `
      SELECT
        year,
        SUM(cohort_size)::int as total_cohort,
        SUM(completers_150pct)::int as total_completers,
        ROUND(SUM(completers_150pct)::numeric / NULLIF(SUM(cohort_size), 0) * 100, 2)::float as grad_rate
      FROM graduation_rates
      WHERE unitid = $1 AND cohort_type = 'bachelor'
      GROUP BY year
      ORDER BY year
    `;

    const rows = await query(sql, [unitid]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/graduation/by-race/:unitid
router.get('/by-race/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);
    const year = req.query.year || 2023;

    const sql = `
      SELECT
        race,
        SUM(cohort_size)::int as cohort_count,
        SUM(completers_150pct)::int as completers,
        ROUND(SUM(completers_150pct)::numeric / NULLIF(SUM(cohort_size), 0) * 100, 2)::float as grad_rate
      FROM graduation_rates
      WHERE unitid = $1 AND year = $2 AND cohort_type = 'Bachelor''s'
      GROUP BY race
      HAVING SUM(cohort_size) > 0
      ORDER BY grad_rate DESC NULLS LAST
    `;

    const rows = await query(sql, [unitid, year]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/graduation/top
router.get('/top', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year = 2023, state, limit = 20 } = req.query;

    const conditions = ["g.cohort_type = 'bachelor'", 'g.year = $1'];
    const values: unknown[] = [year];
    let paramIndex = 2;

    if (state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(state);
    }

    const sql = `
      SELECT
        g.unitid, i.name, i.state,
        SUM(g.cohort_size)::int as cohort_count,
        SUM(g.completers_150pct)::int as completers,
        ROUND(SUM(g.completers_150pct)::numeric / NULLIF(SUM(g.cohort_size), 0) * 100, 2)::float as grad_rate
      FROM graduation_rates g
      JOIN institution i ON g.unitid = i.unitid
      WHERE ${conditions.join(' AND ')}
      GROUP BY g.unitid, i.name, i.state
      HAVING SUM(g.cohort_size) >= 100
      ORDER BY grad_rate DESC NULLS LAST
      LIMIT $${paramIndex}
    `;
    values.push(limit);

    const rows = await query(sql, values);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

export default router;
