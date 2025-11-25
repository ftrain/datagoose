import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../db/pool.js';

const router = Router();

// GET /api/historic/coverage - Show what years have data in each historic table
router.get('/coverage', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sql = `
      SELECT 'enrollment' as table_name, array_agg(DISTINCT year ORDER BY year) as years, COUNT(*)::int as records
      FROM enrollment_historic
      UNION ALL
      SELECT 'completions', array_agg(DISTINCT year ORDER BY year), COUNT(*)::int
      FROM completions_historic
      UNION ALL
      SELECT 'institutions', array_agg(DISTINCT year ORDER BY year), COUNT(*)::int
      FROM institution_historic
      UNION ALL
      SELECT 'graduation_rates', array_agg(DISTINCT year ORDER BY year), COUNT(*)::int
      FROM graduation_rates_historic
    `;
    const rows = await query(sql);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/historic/enrollment - Enrollment trends 1980-2008
router.get('/enrollment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { state } = req.query;

    let sql: string;
    const values: unknown[] = [];

    if (state) {
      sql = `
        SELECT e.year, SUM(e.total_enrollment)::bigint as total_enrollment, COUNT(*)::int as institutions
        FROM enrollment_historic e
        JOIN institution_historic i ON e.unitid = i.unitid AND e.year = i.year
        WHERE i.state = $1
        GROUP BY e.year
        ORDER BY e.year
      `;
      values.push(state);
    } else {
      sql = `
        SELECT year, SUM(total_enrollment)::bigint as total_enrollment, COUNT(*)::int as institutions
        FROM enrollment_historic
        GROUP BY year
        ORDER BY year
      `;
    }

    const rows = await query(sql, values);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/historic/enrollment/:unitid - Enrollment history for a specific institution
router.get('/enrollment/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);

    const sql = `
      SELECT e.year, e.total_enrollment, i.name
      FROM enrollment_historic e
      LEFT JOIN institution_historic i ON e.unitid = i.unitid AND e.year = i.year
      WHERE e.unitid = $1
      ORDER BY e.year
    `;

    const rows = await query(sql, [unitid]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/historic/completions - Completions trends 1980-2008
router.get('/completions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cip_2digit } = req.query;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (cip_2digit) {
      conditions.push(`cip_2digit = $${paramIndex++}`);
      values.push(cip_2digit);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT year, SUM(total_completions)::bigint as total_completions, COUNT(DISTINCT unitid)::int as institutions
      FROM completions_historic
      ${where}
      GROUP BY year
      ORDER BY year
    `;

    const rows = await query(sql, values);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/historic/completions/by-field - Completions by 2-digit CIP
router.get('/completions/by-field', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = req.query.year || 2008;

    const sql = `
      SELECT
        c.cip_2digit,
        COALESCE(r.title, 'Unknown') as field_name,
        SUM(c.total_completions)::bigint as total_completions,
        COUNT(DISTINCT c.unitid)::int as institutions
      FROM completions_historic c
      LEFT JOIN ref_cip r ON c.cip_2digit = LEFT(r.cip_code, 2) AND LENGTH(r.cip_code) = 2
      WHERE c.year = $1
      GROUP BY c.cip_2digit, r.title
      ORDER BY total_completions DESC
    `;

    const rows = await query(sql, [year]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/historic/graduation - Graduation rates 1997-2008
router.get('/graduation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sql = `
      SELECT
        year,
        COUNT(*)::int as institutions,
        ROUND(AVG(grad_rate_150pct)::numeric, 2)::float as avg_grad_rate,
        ROUND(MIN(grad_rate_150pct)::numeric, 2)::float as min_grad_rate,
        ROUND(MAX(grad_rate_150pct)::numeric, 2)::float as max_grad_rate,
        SUM(cohort_size)::bigint as total_cohort,
        SUM(completers)::bigint as total_completers
      FROM graduation_rates_historic
      WHERE grad_rate_150pct IS NOT NULL
      GROUP BY year
      ORDER BY year
    `;

    const rows = await query(sql);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/historic/graduation/:unitid - Graduation rate history for a specific institution
router.get('/graduation/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);

    const sql = `
      SELECT g.year, g.cohort_size, g.completers, g.grad_rate_150pct, i.name
      FROM graduation_rates_historic g
      LEFT JOIN institution_historic i ON g.unitid = i.unitid AND g.year = i.year
      WHERE g.unitid = $1
      ORDER BY g.year
    `;

    const rows = await query(sql, [unitid]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/historic/institutions - Institution directory 1980-2008
router.get('/institutions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year, state, search } = req.query;
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10), 500);
    const offset = parseInt(String(req.query.offset || '0'), 10);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (year) {
      conditions.push(`year = $${paramIndex++}`);
      values.push(year);
    }
    if (state) {
      conditions.push(`state = $${paramIndex++}`);
      values.push(state);
    }
    if (search) {
      conditions.push(`name ILIKE $${paramIndex++}`);
      values.push(`%${search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT unitid, year, name, city, state
      FROM institution_historic
      ${where}
      ORDER BY year DESC, name
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    values.push(limit, offset);

    const rows = await query(sql, values);
    res.json({ data: rows, meta: { limit, offset } });
  } catch (error) {
    next(error);
  }
});

// GET /api/historic/institutions/:unitid - Institution history across years
router.get('/institutions/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);

    const sql = `
      SELECT year, name, city, state
      FROM institution_historic
      WHERE unitid = $1
      ORDER BY year
    `;

    const rows = await query(sql, [unitid]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/historic/trends/combined - Combined enrollment + graduation trends over time
router.get('/trends/combined', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sql = `
      WITH enrollment AS (
        SELECT year, SUM(total_enrollment)::bigint as total_enrollment
        FROM enrollment_historic
        GROUP BY year
      ),
      graduation AS (
        SELECT year, ROUND(AVG(grad_rate_150pct)::numeric, 2)::float as avg_grad_rate
        FROM graduation_rates_historic
        WHERE grad_rate_150pct IS NOT NULL
        GROUP BY year
      )
      SELECT
        COALESCE(e.year, g.year) as year,
        e.total_enrollment,
        g.avg_grad_rate
      FROM enrollment e
      FULL OUTER JOIN graduation g ON e.year = g.year
      ORDER BY year
    `;

    const rows = await query(sql);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

export default router;
