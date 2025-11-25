import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { PaginationSchema, YearRangeSchema } from '../schemas/common.js';

const router = Router();

const EnrollmentQuerySchema = PaginationSchema.merge(YearRangeSchema).extend({
  unitid: z.coerce.number().int().optional(),
  state: z.string().length(2).toUpperCase().optional(),
  level: z.string().optional(),
});

// GET /api/enrollment
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = EnrollmentQuerySchema.parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.unitid) {
      conditions.push(`e.unitid = $${paramIndex++}`);
      values.push(params.unitid);
    }
    if (params.state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(params.state);
    }
    if (params.year_start) {
      conditions.push(`e.year >= $${paramIndex++}`);
      values.push(params.year_start);
    }
    if (params.year_end) {
      conditions.push(`e.year <= $${paramIndex++}`);
      values.push(params.year_end);
    }
    if (params.level) {
      conditions.push(`e.level = $${paramIndex++}`);
      values.push(params.level);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        e.unitid, i.name, e.year, e.level, e.race, e.gender,
        SUM(e.total) as enrollment
      FROM enrollment e
      JOIN institution i ON e.unitid = i.unitid
      ${where}
      GROUP BY e.unitid, i.name, e.year, e.level, e.race, e.gender
      ORDER BY e.year DESC, i.name, e.level
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    values.push(params.limit, params.offset);

    const rows = await query(sql, values);
    res.json({ data: rows, meta: { limit: params.limit, offset: params.offset } });
  } catch (error) {
    next(error);
  }
});

// GET /api/enrollment/totals
router.get('/totals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year, state } = req.query;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (year) {
      conditions.push(`e.year = $${paramIndex++}`);
      values.push(year);
    }
    if (state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(state);
    }

    // Always filter for unduplicated totals
    conditions.push(`e.level = 'all'`, `e.gender = 'total'`, `e.race = 'APTS'`);
    const where = `WHERE ${conditions.join(' AND ')}`;

    const sql = `
      SELECT
        e.year,
        SUM(e.total)::bigint as total_enrollment
      FROM enrollment e
      JOIN institution i ON e.unitid = i.unitid
      ${where}
      GROUP BY e.year
      ORDER BY e.year
    `;

    const rows = await query(sql, values);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/enrollment/by-race/:unitid
router.get('/by-race/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);
    const year = req.query.year || 2023;

    const sql = `
      SELECT
        e.race,
        r.label as race_label,
        SUM(e.total)::int as enrollment,
        ROUND(SUM(e.total)::numeric / SUM(SUM(e.total)) OVER () * 100, 2)::float as pct
      FROM enrollment e
      LEFT JOIN ref_race r ON e.race = r.code
      WHERE e.unitid = $1 AND e.year = $2
      GROUP BY e.race, r.label
      ORDER BY enrollment DESC
    `;

    const rows = await query(sql, [unitid, year]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/enrollment/trends/:unitid
router.get('/trends/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);

    const sql = `
      SELECT
        year,
        SUM(total)::int as total_enrollment
      FROM enrollment
      WHERE unitid = $1 AND level = 'all' AND gender = 'total' AND race = 'APTS'
      GROUP BY year
      ORDER BY year
    `;

    const rows = await query(sql, [unitid]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/enrollment/by-level/:unitid
router.get('/by-level/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);
    const year = req.query.year || 2023;

    const sql = `
      SELECT
        level,
        SUM(full_time)::int as full_time,
        SUM(part_time)::int as part_time,
        SUM(total)::int as total
      FROM enrollment
      WHERE unitid = $1 AND year = $2
      GROUP BY level
      ORDER BY level
    `;

    const rows = await query(sql, [unitid, year]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/enrollment/by-gender/:unitid
router.get('/by-gender/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);
    const year = req.query.year || 2023;

    const sql = `
      SELECT
        gender,
        SUM(total)::int as enrollment,
        ROUND(SUM(total)::numeric / SUM(SUM(total)) OVER () * 100, 2)::float as pct
      FROM enrollment
      WHERE unitid = $1 AND year = $2
      GROUP BY gender
      ORDER BY enrollment DESC
    `;

    const rows = await query(sql, [unitid, year]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

export default router;
