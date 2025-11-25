import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { PaginationSchema, YearRangeSchema } from '../schemas/common.js';

const router = Router();

// CIP code family mappings (2-digit)
const CIP_FAMILIES: Record<string, string> = {
  '01': 'Agriculture',
  '03': 'Natural Resources',
  '04': 'Architecture',
  '05': 'Area Studies',
  '09': 'Communication',
  '10': 'Communications Tech',
  '11': 'Computer Science',
  '12': 'Culinary Services',
  '13': 'Education',
  '14': 'Engineering',
  '15': 'Engineering Tech',
  '16': 'Foreign Languages',
  '19': 'Family Sciences',
  '22': 'Legal Professions',
  '23': 'English',
  '24': 'Liberal Arts',
  '25': 'Library Science',
  '26': 'Biological Sciences',
  '27': 'Mathematics',
  '29': 'Military Tech',
  '30': 'Interdisciplinary',
  '31': 'Parks & Recreation',
  '38': 'Philosophy',
  '39': 'Theology',
  '40': 'Physical Sciences',
  '41': 'Science Tech',
  '42': 'Psychology',
  '43': 'Security Services',
  '44': 'Public Administration',
  '45': 'Social Sciences',
  '46': 'Construction',
  '47': 'Mechanic/Repair',
  '48': 'Precision Production',
  '49': 'Transportation',
  '50': 'Visual & Performing Arts',
  '51': 'Health Professions',
  '52': 'Business',
  '54': 'History',
};

// Award level mappings
const AWARD_LEVELS: Record<number, string> = {
  1: "Award < 1 year",
  2: "Award 1-2 years",
  3: "Associate's",
  4: "Award 2-4 years",
  5: "Bachelor's",
  6: "Postbaccalaureate",
  7: "Master's",
  8: "Post-Master's",
  9: "Doctor's Research",
  10: "Doctor's Professional",
  11: "Doctor's Other",
};

const CompletionsQuerySchema = PaginationSchema.merge(YearRangeSchema).extend({
  unitid: z.coerce.number().int().optional(),
  state: z.string().length(2).toUpperCase().optional(),
  cip_code: z.string().optional(),
  award_level: z.coerce.number().int().optional(),
});

// GET /api/completions
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = CompletionsQuerySchema.parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.unitid) {
      conditions.push(`c.unitid = $${paramIndex++}`);
      values.push(params.unitid);
    }
    if (params.state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(params.state);
    }
    if (params.year_start) {
      conditions.push(`c.year >= $${paramIndex++}`);
      values.push(params.year_start);
    }
    if (params.year_end) {
      conditions.push(`c.year <= $${paramIndex++}`);
      values.push(params.year_end);
    }
    if (params.cip_code) {
      conditions.push(`c.cip_code LIKE $${paramIndex++}`);
      values.push(`${params.cip_code}%`);
    }
    if (params.award_level !== undefined) {
      conditions.push(`c.award_level = $${paramIndex++}`);
      values.push(params.award_level);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        c.unitid, i.name, c.year, c.cip_code, c.award_level,
        SUM(c.count)::int as completions
      FROM completions c
      JOIN institution i ON c.unitid = i.unitid
      ${where}
      GROUP BY c.unitid, i.name, c.year, c.cip_code, c.award_level
      ORDER BY completions DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    values.push(params.limit, params.offset);

    const rows = await query(sql, values);
    res.json({ data: rows, meta: { limit: params.limit, offset: params.offset } });
  } catch (error) {
    next(error);
  }
});

// GET /api/completions/by-field/:unitid
router.get('/by-field/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);
    const year = req.query.year || 2023;

    const sql = `
      SELECT
        LEFT(cip_code, 2) as cip_family,
        SUM(count)::int as completions
      FROM completions
      WHERE unitid = $1 AND year = $2
      GROUP BY LEFT(cip_code, 2)
      ORDER BY completions DESC
      LIMIT 20
    `;

    const rows = await query<{ cip_family: string; completions: string }>(sql, [unitid, year]);
    const data = rows.map(r => ({
      ...r,
      field_name: CIP_FAMILIES[r.cip_family] || `CIP ${r.cip_family}`,
    }));
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

// GET /api/completions/by-award-level/:unitid
router.get('/by-award-level/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);
    const year = req.query.year || 2023;

    const sql = `
      SELECT
        award_level,
        SUM(count)::int as completions
      FROM completions
      WHERE unitid = $1 AND year = $2
      GROUP BY award_level
      ORDER BY award_level
    `;

    const rows = await query<{ award_level: number; completions: string }>(sql, [unitid, year]);
    const data = rows.map(r => ({
      ...r,
      award_name: AWARD_LEVELS[r.award_level] || `Level ${r.award_level}`,
    }));
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

// GET /api/completions/trends/:unitid
router.get('/trends/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);

    const sql = `
      SELECT
        year,
        SUM(count)::int as total_completions
      FROM completions
      WHERE unitid = $1
      GROUP BY year
      ORDER BY year
    `;

    const rows = await query(sql, [unitid]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/completions/top-programs
router.get('/top-programs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year = 2023, state, award_level = 5, limit = 20 } = req.query;

    const conditions = ['c.year = $1', 'c.award_level = $2'];
    const values: unknown[] = [year, award_level];
    let paramIndex = 3;

    if (state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(state);
    }

    const sql = `
      SELECT
        LEFT(c.cip_code, 2) as cip_family,
        SUM(c.count)::int as total_completions
      FROM completions c
      JOIN institution i ON c.unitid = i.unitid
      WHERE ${conditions.join(' AND ')}
      GROUP BY LEFT(c.cip_code, 2)
      ORDER BY total_completions DESC
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
