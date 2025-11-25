import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';

const router = Router();

// Helper to normalize CIP codes for matching
function normalizeCipCode(code: string): string {
  if (!code.includes('.')) {
    return code.padStart(2, '0');
  }
  const [family, sub] = code.split('.');
  return `${family.padStart(2, '0')}.${sub.padEnd(4, '0')}`;
}

// GET /api/cip - List all CIP families (top-level)
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sql = `
      SELECT
        r.code, r.title,
        COUNT(DISTINCT c.unitid)::int as institution_count,
        SUM(c.count)::int as total_completions
      FROM ref_cip r
      LEFT JOIN completions c ON
        LPAD(SPLIT_PART(c.cip_code, '.', 1), 2, '0') = r.code
        AND c.year = (SELECT MAX(year) FROM completions)
      WHERE r.level = 2
      GROUP BY r.code, r.title
      ORDER BY r.code
    `;

    const rows = await query(sql);
    res.json({
      data: rows.map(r => ({
        ...r,
        title: r.title.replace(/\.$/, ''), // Remove trailing period
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/cip/search - Search CIP codes by title
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      q: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    });

    const { q, limit } = schema.parse(req.query);

    const sql = `
      SELECT
        code, title, level, family,
        similarity(title, $1)::float as match_score
      FROM ref_cip
      WHERE title % $1 OR title ILIKE '%' || $1 || '%'
      ORDER BY
        CASE WHEN level = 6 THEN 0 ELSE 1 END,
        similarity(title, $1) DESC
      LIMIT $2
    `;

    const rows = await query(sql, [q, limit]);
    res.json({
      data: rows.map(r => ({
        ...r,
        title: r.title.replace(/\.$/, ''),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/cip/:code - Get CIP code details and children
router.get('/:code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = req.params.code;
    const year = parseInt(req.query.year as string, 10) || 2023;

    // Get the CIP code details
    const cipSql = `
      SELECT code, code_display, title, definition, level, family, cross_references, examples
      FROM ref_cip
      WHERE code = $1 OR code_display = $1
    `;
    const cipRows = await query(cipSql, [code]);

    if (cipRows.length === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'CIP code not found' } });
      return;
    }

    const cip = cipRows[0];

    // Get children (next level down)
    let childrenSql: string;
    if (cip.level === 2) {
      // Family -> Series (4-digit)
      childrenSql = `
        SELECT
          r.code, r.title, r.level,
          COUNT(DISTINCT c.unitid)::int as institution_count,
          SUM(c.count)::int as total_completions
        FROM ref_cip r
        LEFT JOIN completions c ON
          LPAD(SPLIT_PART(c.cip_code, '.', 1), 2, '0') || '.' ||
          SUBSTRING(RPAD(SPLIT_PART(c.cip_code, '.', 2), 4, '0'), 1, 2) = SUBSTRING(r.code, 1, 5)
          AND c.year = $2
        WHERE r.family = $1 AND r.level = 4
        GROUP BY r.code, r.title, r.level
        ORDER BY r.code
      `;
    } else if (cip.level === 4) {
      // Series -> Detailed (6-digit)
      const prefix = cip.code.substring(0, 5); // e.g., "01.01"
      childrenSql = `
        SELECT
          r.code, r.title, r.level,
          COUNT(DISTINCT c.unitid)::int as institution_count,
          SUM(c.count)::int as total_completions
        FROM ref_cip r
        LEFT JOIN completions c ON
          LPAD(SPLIT_PART(c.cip_code, '.', 1), 2, '0') || '.' ||
          RPAD(SPLIT_PART(c.cip_code, '.', 2), 4, '0') = r.code
          AND c.year = $2
        WHERE r.code LIKE $1 || '%' AND r.level = 6
        GROUP BY r.code, r.title, r.level
        ORDER BY r.code
      `;
    } else {
      // Detailed level - no children
      childrenSql = '';
    }

    const children = childrenSql
      ? await query(childrenSql, [cip.level === 2 ? cip.family : cip.code.substring(0, 5), year])
      : [];

    // Get top institutions for this CIP code
    let institutionsSql: string;
    if (cip.level === 2) {
      institutionsSql = `
        SELECT
          i.unitid, i.name, i.state,
          SUM(c.count)::int as completions
        FROM completions c
        JOIN institution i ON c.unitid = i.unitid
        WHERE LPAD(SPLIT_PART(c.cip_code, '.', 1), 2, '0') = $1
          AND c.year = $2
        GROUP BY i.unitid, i.name, i.state
        ORDER BY completions DESC
        LIMIT 20
      `;
    } else if (cip.level === 4) {
      institutionsSql = `
        SELECT
          i.unitid, i.name, i.state,
          SUM(c.count)::int as completions
        FROM completions c
        JOIN institution i ON c.unitid = i.unitid
        WHERE LPAD(SPLIT_PART(c.cip_code, '.', 1), 2, '0') || '.' ||
              SUBSTRING(RPAD(SPLIT_PART(c.cip_code, '.', 2), 4, '0'), 1, 2) = $1
          AND c.year = $2
        GROUP BY i.unitid, i.name, i.state
        ORDER BY completions DESC
        LIMIT 20
      `;
    } else {
      institutionsSql = `
        SELECT
          i.unitid, i.name, i.state,
          SUM(c.count)::int as completions
        FROM completions c
        JOIN institution i ON c.unitid = i.unitid
        WHERE LPAD(SPLIT_PART(c.cip_code, '.', 1), 2, '0') || '.' ||
              RPAD(SPLIT_PART(c.cip_code, '.', 2), 4, '0') = $1
          AND c.year = $2
        GROUP BY i.unitid, i.name, i.state
        ORDER BY completions DESC
        LIMIT 20
      `;
    }

    const institutions = await query(institutionsSql, [cip.code, year]);

    // Get trend data
    let trendSql: string;
    if (cip.level === 2) {
      trendSql = `
        SELECT year, SUM(count)::int as completions
        FROM completions
        WHERE LPAD(SPLIT_PART(cip_code, '.', 1), 2, '0') = $1
        GROUP BY year
        ORDER BY year
      `;
    } else if (cip.level === 4) {
      trendSql = `
        SELECT year, SUM(count)::int as completions
        FROM completions
        WHERE LPAD(SPLIT_PART(cip_code, '.', 1), 2, '0') || '.' ||
              SUBSTRING(RPAD(SPLIT_PART(cip_code, '.', 2), 4, '0'), 1, 2) = $1
        GROUP BY year
        ORDER BY year
      `;
    } else {
      trendSql = `
        SELECT year, SUM(count)::int as completions
        FROM completions
        WHERE LPAD(SPLIT_PART(cip_code, '.', 1), 2, '0') || '.' ||
              RPAD(SPLIT_PART(cip_code, '.', 2), 4, '0') = $1
        GROUP BY year
        ORDER BY year
      `;
    }

    const trends = await query(trendSql, [cip.code]);

    res.json({
      data: {
        ...cip,
        title: cip.title.replace(/\.$/, ''),
        children: children.map((c: Record<string, unknown>) => ({
          ...c,
          title: (c.title as string).replace(/\.$/, ''),
        })),
        top_institutions: institutions,
        trends,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/cip/:code/institutions - Get all institutions offering a CIP
router.get('/:code/institutions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      year: z.coerce.number().int().default(2023),
      state: z.string().length(2).toUpperCase().optional(),
      award_level: z.coerce.number().int().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    });

    const params = schema.parse(req.query);
    const code = req.params.code;
    const normalizedCode = normalizeCipCode(code);

    const conditions: string[] = ['c.year = $1'];
    const values: unknown[] = [params.year];
    let paramIndex = 2;

    // Determine CIP matching based on code format
    if (!code.includes('.')) {
      // Family level (2-digit)
      conditions.push(`LPAD(SPLIT_PART(c.cip_code, '.', 1), 2, '0') = $${paramIndex++}`);
      values.push(normalizedCode);
    } else if (code.split('.')[1].length === 2) {
      // Series level (4-digit)
      conditions.push(`LPAD(SPLIT_PART(c.cip_code, '.', 1), 2, '0') || '.' ||
        SUBSTRING(RPAD(SPLIT_PART(c.cip_code, '.', 2), 4, '0'), 1, 2) = $${paramIndex++}`);
      values.push(normalizedCode.substring(0, 5));
    } else {
      // Detailed level (6-digit)
      conditions.push(`LPAD(SPLIT_PART(c.cip_code, '.', 1), 2, '0') || '.' ||
        RPAD(SPLIT_PART(c.cip_code, '.', 2), 4, '0') = $${paramIndex++}`);
      values.push(normalizedCode);
    }

    if (params.state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(params.state);
    }
    if (params.award_level !== undefined) {
      conditions.push(`c.award_level = $${paramIndex++}`);
      values.push(params.award_level);
    }

    const where = conditions.join(' AND ');

    // Get count
    const countSql = `
      SELECT COUNT(DISTINCT i.unitid)::int as total
      FROM completions c
      JOIN institution i ON c.unitid = i.unitid
      WHERE ${where}
    `;
    const countResult = await query(countSql, values);
    const total = countResult[0]?.total ?? 0;

    // Get institutions
    const sql = `
      SELECT
        i.unitid, i.name, i.city, i.state, i.sector,
        SUM(c.count)::int as completions,
        array_agg(DISTINCT c.award_level ORDER BY c.award_level) as award_levels
      FROM completions c
      JOIN institution i ON c.unitid = i.unitid
      WHERE ${where}
      GROUP BY i.unitid, i.name, i.city, i.state, i.sector
      ORDER BY completions DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    values.push(params.limit, params.offset);

    const rows = await query(sql, values);

    res.json({
      data: rows,
      meta: { total, limit: params.limit, offset: params.offset },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
