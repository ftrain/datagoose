import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';

const router = Router();

// Schema for explore query parameters
const ExploreQuerySchema = z.object({
  // Filter options
  sector: z.coerce.number().int().optional(),
  control: z.coerce.number().int().optional(),
  level: z.coerce.number().int().optional(),
  hbcu: z.coerce.boolean().optional(),
  state: z.string().length(2).toUpperCase().optional(),
  region: z.string().optional(), // e.g., 'northeast', 'south', etc.
  year: z.coerce.number().int().optional(),
  // Race/gender filters (for enrollment and completions)
  race: z.string().optional(), // e.g., 'BKAA', 'HISP', 'WHIT', etc.
  gender: z.enum(['men', 'women', 'total']).optional(),
  // Data type to include
  dataType: z.enum(['basic', 'enrollment', 'admissions', 'financial', 'graduation', 'completions']).default('basic'),
  // Pagination
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  // Sorting
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

// Region mappings
const REGIONS: Record<string, string[]> = {
  'northeast': ['CT', 'ME', 'MA', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT'],
  'south': ['AL', 'AR', 'DE', 'FL', 'GA', 'KY', 'LA', 'MD', 'MS', 'NC', 'OK', 'SC', 'TN', 'TX', 'VA', 'WV', 'DC'],
  'midwest': ['IL', 'IN', 'IA', 'KS', 'MI', 'MN', 'MO', 'NE', 'ND', 'OH', 'SD', 'WI'],
  'west': ['AK', 'AZ', 'CA', 'CO', 'HI', 'ID', 'MT', 'NV', 'NM', 'OR', 'UT', 'WA', 'WY'],
  'territories': ['AS', 'FM', 'GU', 'MH', 'MP', 'PR', 'PW', 'VI'],
};

// GET /api/explore - Main explore endpoint with filters
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = ExploreQuerySchema.parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Build filter conditions
    if (params.sector !== undefined) {
      conditions.push(`i.sector = $${paramIndex++}`);
      values.push(params.sector);
    }
    if (params.control !== undefined) {
      conditions.push(`i.control = $${paramIndex++}`);
      values.push(params.control);
    }
    if (params.level !== undefined) {
      conditions.push(`i.level = $${paramIndex++}`);
      values.push(params.level);
    }
    if (params.hbcu !== undefined) {
      conditions.push(`i.hbcu = $${paramIndex++}`);
      values.push(params.hbcu);
    }
    if (params.state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(params.state);
    }
    if (params.region && REGIONS[params.region]) {
      conditions.push(`i.state = ANY($${paramIndex++})`);
      values.push(REGIONS[params.region]);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build different queries based on dataType
    let selectFields: string;
    let joins = '';
    let yearCondition = '';
    let orderBy = 'i.name';

    // Determine year for data joins
    const dataYear = params.year;

    // Determine race/gender for enrollment and completions
    const raceFilter = params.race || 'APTS'; // Default to all students
    const genderFilter = params.gender || 'total'; // Default to total

    switch (params.dataType) {
      case 'enrollment':
        selectFields = `
          i.unitid, i.name, i.city, i.state, i.sector, i.control, i.level, i.hbcu,
          i.latitude, i.longitude,
          rs.label as sector_name,
          e.year as data_year,
          e.race as enrollment_race,
          e.gender as enrollment_gender,
          e.total::int as total_enrollment
        `;
        joins = `
          LEFT JOIN ref_sector rs ON i.sector = rs.code
          LEFT JOIN enrollment e ON i.unitid = e.unitid AND e.level = 'all'
            AND e.gender = $${paramIndex++} AND e.race = $${paramIndex++}
        `;
        values.push(genderFilter, raceFilter);
        if (dataYear) {
          yearCondition = ` AND e.year = $${paramIndex++}`;
          values.push(dataYear);
        } else {
          yearCondition = ` AND e.year = (SELECT MAX(year) FROM enrollment)`;
        }
        orderBy = 'total_enrollment DESC NULLS LAST';
        break;

      case 'admissions':
        selectFields = `
          i.unitid, i.name, i.city, i.state, i.sector, i.control, i.level, i.hbcu,
          i.latitude, i.longitude,
          rs.label as sector_name,
          a.year as data_year,
          a.applicants_total, a.admitted_total, a.enrolled_total,
          ROUND(a.admitted_total::numeric / NULLIF(a.applicants_total, 0) * 100, 2)::float as admit_rate,
          ROUND(a.enrolled_total::numeric / NULLIF(a.admitted_total, 0) * 100, 2)::float as yield_rate,
          a.sat_math_25, a.sat_math_75, a.sat_verbal_25, a.sat_verbal_75
        `;
        joins = `
          LEFT JOIN ref_sector rs ON i.sector = rs.code
          LEFT JOIN admissions a ON i.unitid = a.unitid
        `;
        if (dataYear) {
          yearCondition = ` AND a.year = $${paramIndex++}`;
          values.push(dataYear);
        } else {
          yearCondition = ` AND a.year = (SELECT MAX(year) FROM admissions)`;
        }
        orderBy = 'admit_rate ASC NULLS LAST';
        break;

      case 'financial':
        selectFields = `
          i.unitid, i.name, i.city, i.state, i.sector, i.control, i.level, i.hbcu,
          i.latitude, i.longitude,
          rs.label as sector_name,
          f.year as data_year,
          f.avg_net_price::int, f.avg_net_price_0_30k::int, f.avg_net_price_30_48k::int,
          f.avg_net_price_48_75k::int, f.avg_net_price_75_110k::int, f.avg_net_price_110k_plus::int,
          f.pell_recipients::int, f.pell_pct::float
        `;
        joins = `
          LEFT JOIN ref_sector rs ON i.sector = rs.code
          LEFT JOIN financial_aid f ON i.unitid = f.unitid
        `;
        if (dataYear) {
          yearCondition = ` AND f.year = $${paramIndex++}`;
          values.push(dataYear);
        } else {
          yearCondition = ` AND f.year = (SELECT MAX(year) FROM financial_aid)`;
        }
        orderBy = 'f.avg_net_price ASC NULLS LAST';
        break;

      case 'graduation':
        selectFields = `
          i.unitid, i.name, i.city, i.state, i.sector, i.control, i.level, i.hbcu,
          i.latitude, i.longitude,
          rs.label as sector_name,
          g.year as data_year,
          SUM(g.cohort_size)::int as cohort_size,
          SUM(g.completers_150pct)::int as completers_150pct,
          ROUND(SUM(g.completers_150pct)::numeric / NULLIF(SUM(g.cohort_size), 0) * 100, 2)::float as grad_rate
        `;
        joins = `
          LEFT JOIN ref_sector rs ON i.sector = rs.code
          LEFT JOIN graduation_rates g ON i.unitid = g.unitid AND g.cohort_type = 'bachelor'
        `;
        if (dataYear) {
          yearCondition = ` AND g.year = $${paramIndex++}`;
          values.push(dataYear);
        } else {
          yearCondition = ` AND g.year = (SELECT MAX(year) FROM graduation_rates)`;
        }
        orderBy = 'grad_rate DESC NULLS LAST';
        break;

      case 'completions':
        selectFields = `
          i.unitid, i.name, i.city, i.state, i.sector, i.control, i.level, i.hbcu,
          i.latitude, i.longitude,
          rs.label as sector_name,
          c.year as data_year,
          c.race as completions_race,
          c.gender as completions_gender,
          SUM(c.count)::int as total_completions
        `;
        joins = `
          LEFT JOIN ref_sector rs ON i.sector = rs.code
          LEFT JOIN completions c ON i.unitid = c.unitid
            AND c.gender = $${paramIndex++} AND c.race = $${paramIndex++}
        `;
        values.push(genderFilter, raceFilter);
        if (dataYear) {
          yearCondition = ` AND c.year = $${paramIndex++}`;
          values.push(dataYear);
        } else {
          yearCondition = ` AND c.year = (SELECT MAX(year) FROM completions)`;
        }
        orderBy = 'total_completions DESC NULLS LAST';
        break;

      default: // 'basic' - comprehensive view with key metrics from all tables
        selectFields = `
          i.unitid, i.name, i.city, i.state, i.sector, i.control, i.level, i.hbcu,
          i.latitude, i.longitude,
          rs.label as sector_name,
          -- Latest enrollment
          e_latest.total_enrollment,
          -- Latest admissions
          a_latest.applicants_total,
          a_latest.admit_rate,
          a_latest.sat_total_avg,
          -- Latest financial
          f_latest.avg_net_price,
          f_latest.avg_net_price_0_30k,
          f_latest.pell_pct,
          -- Latest graduation rate
          g_latest.grad_rate
        `;
        joins = `
          LEFT JOIN ref_sector rs ON i.sector = rs.code
          LEFT JOIN LATERAL (
            SELECT total::int as total_enrollment
            FROM enrollment e
            WHERE e.unitid = i.unitid AND e.year = (SELECT MAX(year) FROM enrollment)
              AND e.level = 'all' AND e.gender = 'total' AND e.race = 'APTS'
          ) e_latest ON true
          LEFT JOIN LATERAL (
            SELECT
              a.applicants_total,
              ROUND(a.admitted_total::numeric / NULLIF(a.applicants_total, 0) * 100, 1)::float as admit_rate,
              ROUND((COALESCE(a.sat_math_25, 0) + COALESCE(a.sat_math_75, 0) + COALESCE(a.sat_verbal_25, 0) + COALESCE(a.sat_verbal_75, 0))::numeric /
                    NULLIF((CASE WHEN a.sat_math_25 IS NOT NULL THEN 2 ELSE 0 END + CASE WHEN a.sat_verbal_25 IS NOT NULL THEN 2 ELSE 0 END), 0), 0)::int as sat_total_avg
            FROM admissions a
            WHERE a.unitid = i.unitid AND a.year = (SELECT MAX(year) FROM admissions)
          ) a_latest ON true
          LEFT JOIN LATERAL (
            SELECT
              f.avg_net_price::int,
              f.avg_net_price_0_30k::int,
              f.pell_pct::float as pell_pct
            FROM financial_aid f
            WHERE f.unitid = i.unitid AND f.year = (SELECT MAX(year) FROM financial_aid)
          ) f_latest ON true
          LEFT JOIN LATERAL (
            SELECT
              ROUND(SUM(g.completers_150pct)::numeric / NULLIF(SUM(g.cohort_size), 0) * 100, 1)::float as grad_rate
            FROM graduation_rates g
            WHERE g.unitid = i.unitid AND g.year = (SELECT MAX(year) FROM graduation_rates)
              AND g.cohort_type = 'bachelor'
          ) g_latest ON true
        `;
        orderBy = 'i.name';
    }

    // Handle sortBy if provided
    if (params.sortBy) {
      const allowedSorts = [
        'name', 'state', 'city', 'sector_name',
        'total_enrollment', 'applicants_total', 'admit_rate', 'sat_total_avg',
        'avg_net_price', 'avg_net_price_0_30k', 'pell_pct',
        'grad_rate', 'yield_rate', 'total_completions',
        'undergrad_enrollment', 'grad_enrollment', 'cohort_size', 'pell_recipients'
      ];
      if (allowedSorts.includes(params.sortBy)) {
        orderBy = `${params.sortBy} ${params.sortDir.toUpperCase()} NULLS LAST`;
      }
    }

    // Build final query - needs GROUP BY for aggregate queries
    const needsGroupBy = ['completions', 'graduation'].includes(params.dataType);
    let groupByClause = '';
    if (needsGroupBy) {
      let extraCols = '';
      if (params.dataType === 'completions') extraCols = 'c.year, c.race, c.gender';
      else if (params.dataType === 'graduation') extraCols = 'g.year';
      groupByClause = `GROUP BY i.unitid, i.name, i.city, i.state, i.sector, i.control, i.level, i.hbcu, i.latitude, i.longitude, rs.label, ${extraCols}`;
    }

    // Get total count first
    const countSql = `SELECT COUNT(DISTINCT i.unitid) FROM institution i ${joins} ${where} ${yearCondition ? yearCondition : ''}`;
    const countResult = await query<{ count: string }>(countSql, values);
    const total = parseInt(countResult[0]?.count ?? '0', 10);

    // Get data with pagination
    const sql = `
      SELECT ${selectFields}
      FROM institution i
      ${joins}
      ${where} ${yearCondition}
      ${groupByClause}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    values.push(params.limit, params.offset);

    const rows = await query(sql, values);

    res.json({
      data: rows,
      meta: {
        total,
        limit: params.limit,
        offset: params.offset,
        filters: {
          sector: params.sector,
          control: params.control,
          level: params.level,
          hbcu: params.hbcu,
          state: params.state,
          region: params.region,
          year: params.year,
          race: params.race,
          gender: params.gender,
          dataType: params.dataType,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/explore/filters - Get available filter options
router.get('/filters', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Get sectors
    const sectors = await query<{ code: number; label: string }>(`
      SELECT code, label FROM ref_sector WHERE code < 99 ORDER BY code
    `);

    // Get races
    const races = await query<{ code: string; label: string; sort_order: number }>(`
      SELECT code, label, sort_order FROM ref_race ORDER BY sort_order
    `);

    // Get states with counts
    const states = await query<{ state: string; count: string }>(`
      SELECT state, COUNT(*) as count
      FROM institution
      WHERE state IS NOT NULL
      GROUP BY state
      ORDER BY state
    `);

    // Get available years for each data type
    const years = await query<{ table_name: string; years: number[] }>(`
      SELECT 'admissions' as table_name, array_agg(DISTINCT year ORDER BY year) as years FROM admissions
      UNION ALL
      SELECT 'enrollment', array_agg(DISTINCT year ORDER BY year) FROM enrollment
      UNION ALL
      SELECT 'graduation', array_agg(DISTINCT year ORDER BY year) FROM graduation_rates
      UNION ALL
      SELECT 'financial', array_agg(DISTINCT year ORDER BY year) FROM financial_aid
      UNION ALL
      SELECT 'completions', array_agg(DISTINCT year ORDER BY year) FROM completions
    `);

    const yearsByType = years.reduce((acc, row) => {
      acc[row.table_name] = row.years;
      return acc;
    }, {} as Record<string, number[]>);

    // Get counts by category
    const counts = await query<{ hbcu_count: string; total: string }>(`
      SELECT
        COUNT(*) FILTER (WHERE hbcu = true) as hbcu_count,
        COUNT(*) as total
      FROM institution
    `);

    res.json({
      sectors: sectors.map(s => ({ value: s.code, label: s.label })),
      states: states.map(s => ({ value: s.state, label: s.state, count: parseInt(s.count, 10) })),
      regions: Object.entries(REGIONS).map(([key, states]) => ({
        value: key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        states,
      })),
      control: [
        { value: 1, label: 'Public' },
        { value: 2, label: 'Private nonprofit' },
        { value: 3, label: 'Private for-profit' },
      ],
      level: [
        { value: 1, label: '4-year' },
        { value: 2, label: '2-year' },
        { value: 3, label: 'Less than 2-year' },
      ],
      races: races.map(r => ({ value: r.code, label: r.label })),
      genders: [
        { value: 'total', label: 'All Genders' },
        { value: 'men', label: 'Men' },
        { value: 'women', label: 'Women' },
      ],
      years: yearsByType,
      counts: {
        total: parseInt(counts[0]?.total ?? '0', 10),
        hbcu: parseInt(counts[0]?.hbcu_count ?? '0', 10),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/explore/aggregate - Get aggregate statistics for current filters
router.get('/aggregate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = ExploreQuerySchema.parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Build filter conditions (same as main explore)
    if (params.sector !== undefined) {
      conditions.push(`i.sector = $${paramIndex++}`);
      values.push(params.sector);
    }
    if (params.control !== undefined) {
      conditions.push(`i.control = $${paramIndex++}`);
      values.push(params.control);
    }
    if (params.level !== undefined) {
      conditions.push(`i.level = $${paramIndex++}`);
      values.push(params.level);
    }
    if (params.hbcu !== undefined) {
      conditions.push(`i.hbcu = $${paramIndex++}`);
      values.push(params.hbcu);
    }
    if (params.state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(params.state);
    }
    if (params.region && REGIONS[params.region]) {
      conditions.push(`i.state = ANY($${paramIndex++})`);
      values.push(REGIONS[params.region]);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get aggregate stats
    const sql = `
      SELECT
        COUNT(*)::int as institution_count,
        COUNT(*) FILTER (WHERE i.hbcu = true)::int as hbcu_count,
        COUNT(DISTINCT i.state)::int as state_count
      FROM institution i
      ${where}
    `;

    const result = await query(sql, values);

    res.json({
      data: result[0],
      filters: {
        sector: params.sector,
        control: params.control,
        level: params.level,
        hbcu: params.hbcu,
        state: params.state,
        region: params.region,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Helper to convert rows to CSV
function toCSV(columns: string[], rows: Record<string, unknown>[]): string {
  const escapeCSV = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map(escapeCSV).join(',');
  const dataRows = rows.map(row =>
    columns.map(col => escapeCSV(row[col])).join(',')
  );
  return [header, ...dataRows].join('\n');
}

// GET /api/explore/csv - Download explore data as CSV
router.get('/csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Use higher limit for CSV export
    const params = ExploreQuerySchema.parse({
      ...req.query,
      limit: Math.min(Number(req.query.limit) || 10000, 10000),
      offset: 0,
    });

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Build filter conditions (same as main explore)
    if (params.sector !== undefined) {
      conditions.push(`i.sector = $${paramIndex++}`);
      values.push(params.sector);
    }
    if (params.control !== undefined) {
      conditions.push(`i.control = $${paramIndex++}`);
      values.push(params.control);
    }
    if (params.level !== undefined) {
      conditions.push(`i.level = $${paramIndex++}`);
      values.push(params.level);
    }
    if (params.hbcu !== undefined) {
      conditions.push(`i.hbcu = $${paramIndex++}`);
      values.push(params.hbcu);
    }
    if (params.state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(params.state);
    }
    if (params.region && REGIONS[params.region]) {
      conditions.push(`i.state = ANY($${paramIndex++})`);
      values.push(REGIONS[params.region]);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build a comprehensive query for CSV export
    const dataYear = params.year;
    let yearCondition = '';

    if (dataYear) {
      yearCondition = ` AND COALESCE(e.year, a.year, f.year, g.year) = $${paramIndex++}`;
      values.push(dataYear);
    }

    const sql = `
      SELECT
        i.unitid, i.name, i.city, i.state, i.zip,
        i.latitude, i.longitude,
        rs.label as sector,
        CASE i.control WHEN 1 THEN 'Public' WHEN 2 THEN 'Private nonprofit' WHEN 3 THEN 'Private for-profit' END as control,
        CASE i.level WHEN 1 THEN '4-year' WHEN 2 THEN '2-year' WHEN 3 THEN 'Less than 2-year' END as level,
        i.hbcu,
        e.total::int as total_enrollment,
        a.applicants_total,
        a.admitted_total,
        ROUND(a.admit_rate * 100, 1) as admit_rate_pct,
        ROUND(a.yield_rate * 100, 1) as yield_rate_pct,
        a.sat_math_25, a.sat_math_75,
        a.sat_verbal_25, a.sat_verbal_75,
        f.avg_net_price,
        f.avg_net_price_0_30k,
        f.pell_recipients,
        ROUND(f.pell_pct * 100, 1) as pell_pct,
        g.cohort_size,
        g.completers_150pct,
        ROUND((g.completers_150pct::numeric / NULLIF(g.cohort_size, 0)) * 100, 1) as grad_rate_pct
      FROM institution i
      LEFT JOIN ref_sector rs ON i.sector = rs.code
      LEFT JOIN enrollment e ON i.unitid = e.unitid
        AND e.level = 'all' AND e.gender = 'total' AND e.race = 'APTS'
        AND e.year = (SELECT MAX(year) FROM enrollment)
      LEFT JOIN admissions a ON i.unitid = a.unitid
        AND a.year = (SELECT MAX(year) FROM admissions)
      LEFT JOIN financial_aid f ON i.unitid = f.unitid
        AND f.year = (SELECT MAX(year) FROM financial_aid)
      LEFT JOIN graduation_rates g ON i.unitid = g.unitid
        AND g.cohort_type = 'bachelor' AND g.race = 'Total' AND g.gender = 'Total'
        AND g.year = (SELECT MAX(year) FROM graduation_rates)
      ${where}
      ORDER BY i.name
      LIMIT $${paramIndex}
    `;
    values.push(params.limit);

    const rows = await query(sql, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: 'No data found for the specified filters' } });
    }

    const columns = Object.keys(rows[0]);
    const csv = toCSV(columns, rows);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ipeds_explore.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
