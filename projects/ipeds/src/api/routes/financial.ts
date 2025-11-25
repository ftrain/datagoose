import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { PaginationSchema, YearRangeSchema } from '../schemas/common.js';

const router = Router();

const FinancialQuerySchema = PaginationSchema.merge(YearRangeSchema).extend({
  unitid: z.coerce.number().int().optional(),
  state: z.string().length(2).toUpperCase().optional(),
  max_net_price: z.coerce.number().optional(),
  min_pell_pct: z.coerce.number().min(0).max(100).optional(),
});

// GET /api/financial
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = FinancialQuerySchema.parse(req.query);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.unitid) {
      conditions.push(`f.unitid = $${paramIndex++}`);
      values.push(params.unitid);
    }
    if (params.state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(params.state);
    }
    if (params.year_start) {
      conditions.push(`f.year >= $${paramIndex++}`);
      values.push(params.year_start);
    }
    if (params.year_end) {
      conditions.push(`f.year <= $${paramIndex++}`);
      values.push(params.year_end);
    }
    if (params.max_net_price) {
      conditions.push(`f.avg_net_price <= $${paramIndex++}`);
      values.push(params.max_net_price);
    }
    if (params.min_pell_pct !== undefined) {
      conditions.push(`f.pell_pct >= $${paramIndex++}`);
      values.push(params.min_pell_pct);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        f.unitid, i.name, i.state, f.year,
        f.avg_net_price::int, f.avg_net_price_0_30k::int, f.avg_net_price_30_48k::int,
        f.avg_net_price_48_75k::int, f.avg_net_price_75_110k::int, f.avg_net_price_110k_plus::int,
        f.pell_recipients::int, f.pell_pct::float
      FROM financial_aid f
      JOIN institution i ON f.unitid = i.unitid
      ${where}
      ORDER BY f.year DESC, i.name
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    values.push(params.limit, params.offset);

    const rows = await query(sql, values);
    res.json({ data: rows, meta: { limit: params.limit, offset: params.offset } });
  } catch (error) {
    next(error);
  }
});

// GET /api/financial/trends/:unitid
router.get('/trends/:unitid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unitid = parseInt(req.params.unitid, 10);

    const sql = `
      SELECT
        year, avg_net_price::int, avg_net_price_0_30k::int, avg_net_price_30_48k::int,
        avg_net_price_48_75k::int, avg_net_price_75_110k::int, avg_net_price_110k_plus::int,
        pell_recipients::int, pell_pct::float
      FROM financial_aid
      WHERE unitid = $1
      ORDER BY year
    `;

    const rows = await query(sql, [unitid]);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/financial/most-affordable
router.get('/most-affordable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year = 2023, state, income_bracket, limit = 20 } = req.query;

    const conditions = ['f.year = $1', 'f.avg_net_price > 0'];
    const values: unknown[] = [year];
    let paramIndex = 2;

    if (state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(state);
    }

    let priceColumn = 'avg_net_price';
    if (income_bracket === '0-30k') priceColumn = 'avg_net_price_0_30k';
    else if (income_bracket === '30-48k') priceColumn = 'avg_net_price_30_48k';
    else if (income_bracket === '48-75k') priceColumn = 'avg_net_price_48_75k';
    else if (income_bracket === '75-110k') priceColumn = 'avg_net_price_75_110k';
    else if (income_bracket === '110k+') priceColumn = 'avg_net_price_110k_plus';

    conditions.push(`f.${priceColumn} > 0`);

    const sql = `
      SELECT
        f.unitid, i.name, i.state,
        f.${priceColumn}::int as net_price,
        f.pell_pct::float
      FROM financial_aid f
      JOIN institution i ON f.unitid = i.unitid
      WHERE ${conditions.join(' AND ')}
      ORDER BY f.${priceColumn}
      LIMIT $${paramIndex}
    `;
    values.push(limit);

    const rows = await query(sql, values);
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/financial/high-pell
router.get('/high-pell', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year = 2023, state, min_pct = 50, limit = 20 } = req.query;

    // Convert min_pct from percentage (0-100) to decimal (0-1)
    const minPctDecimal = Number(min_pct) / 100;

    // Filter out bad data by requiring minimum enrollment
    const conditions = ['f.year = $1', 'f.pell_pct >= $2', 'f.undergrad_enrolled >= 100'];
    const values: unknown[] = [year, minPctDecimal];
    let paramIndex = 3;

    if (state) {
      conditions.push(`i.state = $${paramIndex++}`);
      values.push(state);
    }

    const sql = `
      SELECT
        f.unitid, i.name, i.state,
        f.pell_pct::float, f.pell_recipients::int, f.avg_net_price::int
      FROM financial_aid f
      JOIN institution i ON f.unitid = i.unitid
      WHERE ${conditions.join(' AND ')}
      ORDER BY f.pell_pct DESC
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
