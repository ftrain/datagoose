import { Router, Request, Response, NextFunction } from 'express';
import { query, queryOne } from '../db/pool.js';

const router = Router();

// GET /api/stats - Overall database statistics (uses cache for speed)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await query<{ key: string; value: unknown }>(`
      SELECT key, value FROM stats_cache
      WHERE key IN ('institution_count', 'admissions_years', 'graduation_years',
                    'enrollment_years', 'completions_years', 'financial_years')
    `);

    const cache: Record<string, unknown> = {};
    for (const row of rows) {
      cache[row.key] = row.value;
    }

    res.json({
      data: {
        total_institutions: parseInt(String(cache.institution_count ?? '0'), 10),
        data_coverage: {
          admissions: JSON.stringify(cache.admissions_years),
          graduation_rates: JSON.stringify(cache.graduation_years),
          enrollment: JSON.stringify(cache.enrollment_years),
          completions: JSON.stringify(cache.completions_years),
          financial_aid: JSON.stringify(cache.financial_years),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stats/by-state
router.get('/by-state', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sql = `
      SELECT
        state,
        COUNT(*)::int as institution_count
      FROM institution
      GROUP BY state
      ORDER BY institution_count DESC
    `;

    const rows = await query(sql);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/stats/by-sector
router.get('/by-sector', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sql = `
      SELECT
        i.sector,
        COALESCE(rs.label, 'Unknown') as sector_name,
        COUNT(*)::int as institution_count
      FROM institution i
      LEFT JOIN ref_sector rs ON i.sector = rs.code
      GROUP BY i.sector, rs.label
      ORDER BY institution_count DESC
    `;

    const rows = await query(sql);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/stats/enrollment-trends
router.get('/enrollment-trends', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { state } = req.query;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(state);
    }

    // Always filter for unduplicated totals (level=all, gender=total, race=APTS for "All students")
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

// GET /api/stats/completions-trends
router.get('/completions-trends', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { state, award_level } = req.query;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(state);
    }
    if (award_level) {
      conditions.push(`c.award_level = $${paramIndex++}`);
      values.push(award_level);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        c.year,
        SUM(c.completions)::bigint as total_completions
      FROM completions c
      JOIN institution i ON c.unitid = i.unitid
      ${where}
      GROUP BY c.year
      ORDER BY c.year
    `;

    const rows = await query(sql, values);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/stats/hbcu
router.get('/hbcu', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sql = `
      SELECT
        i.state,
        COUNT(*)::int as hbcu_count,
        COALESCE(SUM(e.enrollment), 0)::int as total_enrollment
      FROM institution i
      LEFT JOIN (
        SELECT unitid, SUM(total) as enrollment
        FROM enrollment
        WHERE year = 2023 AND level = 'all' AND gender = 'total' AND race = 'APTS'
        GROUP BY unitid
      ) e ON i.unitid = e.unitid
      WHERE i.hbcu = true
      GROUP BY i.state
      ORDER BY hbcu_count DESC
    `;

    const rows = await query(sql);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

export default router;
