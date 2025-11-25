import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, pool } from '../db/pool.js';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// All query routes require authentication
router.use(requireAuth);

// In-memory storage for saved queries (in production, use a database table)
interface SavedQuery {
  id: number;
  name: string;
  description: string;
  sql: string;
  tags: string[];
  created_at: string;
  last_run_at?: string;
  run_count: number;
}

let savedQueries: SavedQuery[] = [];
let nextId = 1;

const ExecuteQuerySchema = z.object({
  sql: z.string().min(1).max(10000),
});

const SaveQuerySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  sql: z.string().min(1).max(10000),
  tags: z.array(z.string()).default([]),
});

// Validate SQL query for safety
function validateQuery(sql: string): { valid: boolean; error?: string } {
  const normalized = sql.trim().toLowerCase();

  // Only allow SELECT or WITH (CTE) statements
  if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
    return { valid: false, error: 'Only SELECT queries are allowed' };
  }

  // Block dangerous keywords
  const blockedKeywords = [
    'insert', 'update', 'delete', 'drop', 'truncate', 'alter', 'create',
    'grant', 'revoke', 'execute', 'exec', 'copy', 'pg_', 'information_schema',
  ];

  for (const keyword of blockedKeywords) {
    // Match as whole word
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(sql)) {
      return { valid: false, error: `Query contains blocked keyword: ${keyword}` };
    }
  }

  // Block multiple statements
  if (sql.includes(';') && sql.indexOf(';') < sql.length - 1) {
    return { valid: false, error: 'Multiple statements are not allowed' };
  }

  return { valid: true };
}

// POST /api/query/execute
router.post('/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sql } = ExecuteQuerySchema.parse(req.body);

    // Validate the query
    const validation = validateQuery(sql);
    if (!validation.valid) {
      return res.status(400).json({ error: { message: validation.error } });
    }

    // Add LIMIT if not present
    let safeSql = sql.trim();
    if (!safeSql.toLowerCase().includes('limit')) {
      safeSql = `${safeSql.replace(/;$/, '')} LIMIT 1000`;
    }

    // Execute with timeout
    const startTime = Date.now();
    const client = await pool.connect();

    try {
      // Set statement timeout (60 seconds for complex analytical queries)
      await client.query('SET statement_timeout = 60000');

      const result = await client.query(safeSql);
      const executionTime = Date.now() - startTime;

      res.json({
        columns: result.fields.map(f => f.name),
        rows: result.rows,
        rowCount: result.rowCount || 0,
        executionTime,
      });
    } finally {
      // Reset timeout and release
      await client.query('RESET statement_timeout');
      client.release();
    }
  } catch (error: any) {
    // Handle PostgreSQL errors gracefully
    if (error.code) {
      return res.status(400).json({
        error: {
          message: error.message,
          code: error.code,
          position: error.position,
        },
      });
    }
    next(error);
  }
});

// GET /api/query/saved
router.get('/saved', async (req: Request, res: Response) => {
  res.json({ data: savedQueries });
});

// POST /api/query/saved
router.post('/saved', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = SaveQuerySchema.parse(req.body);

    const newQuery: SavedQuery = {
      id: nextId++,
      name: data.name,
      description: data.description,
      sql: data.sql,
      tags: data.tags,
      created_at: new Date().toISOString(),
      run_count: 0,
    };

    savedQueries.push(newQuery);
    res.status(201).json(newQuery);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/query/saved/:id
router.delete('/saved/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const index = savedQueries.findIndex(q => q.id === id);

  if (index === -1) {
    return res.status(404).json({ error: { message: 'Query not found' } });
  }

  savedQueries.splice(index, 1);
  res.status(204).send();
});

// PUT /api/query/saved/:id
router.put('/saved/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = SaveQuerySchema.parse(req.body);

    const index = savedQueries.findIndex(q => q.id === id);
    if (index === -1) {
      return res.status(404).json({ error: { message: 'Query not found' } });
    }

    savedQueries[index] = {
      ...savedQueries[index],
      name: data.name,
      description: data.description,
      sql: data.sql,
      tags: data.tags,
    };

    res.json(savedQueries[index]);
  } catch (error) {
    next(error);
  }
});

// Database schema for NL-to-SQL
const DATABASE_SCHEMA = `
You are a SQL query generator for a PostgreSQL database containing U.S. higher education data from IPEDS (Integrated Postsecondary Education Data System).

## Database Tables and Columns

### institution (core institution data, ~10k rows)
- unitid: INTEGER PRIMARY KEY (unique IPEDS ID)
- name: TEXT (institution name)
- city, state, zip: TEXT
- latitude, longitude: DOUBLE PRECISION
- sector: INTEGER (1=public 4yr, 2=private nonprofit 4yr, 3=for-profit 4yr, 4=public 2yr, 5=private nonprofit 2yr, 6=for-profit 2yr)
- control: INTEGER (1=public, 2=private nonprofit, 3=for-profit)
- level: INTEGER (1=4-year, 2=2-year, 3=less than 2-year)
- hbcu: BOOLEAN (historically black college)
- tribal: BOOLEAN (tribal college)
- geom: GEOMETRY(Point) (PostGIS - for spatial queries)
- feature_vector: VECTOR(10) (pgvector - for similarity search)

### admissions (2014-2023, ~20k rows)
- unitid, year: PRIMARY KEY
- applicants_total, applicants_men, applicants_women: INTEGER
- admitted_total, admitted_men, admitted_women: INTEGER
- enrolled_total, enrolled_men, enrolled_women: INTEGER
- admit_rate, yield_rate: NUMERIC (0-1 scale)
- sat_verbal_25, sat_verbal_75, sat_math_25, sat_math_75: INTEGER
- act_composite_25, act_composite_75: INTEGER

### enrollment (2009-2023, ~8M rows)
- unitid, year, level, race, gender: PRIMARY KEY
- level: TEXT ('undergraduate', 'graduate', 'first_professional', 'all')
- race: TEXT (codes like 'APTS' for total, 'AIAN', 'ASIA', 'BKAA', 'HISP', 'NHPI', 'WHIT', '2MOR')
- gender: TEXT ('men', 'women', 'total')
- full_time, part_time, total: INTEGER

### graduation_rates (2009-2023, ~950k rows)
- unitid, year, cohort_type, race, gender: PRIMARY KEY
- cohort_type: TEXT ('bachelor', 'associate', etc)
- race: TEXT ('Total', 'White', 'Black or African American', etc)
- gender: TEXT ('Total', 'Men', 'Women')
- cohort_size, completers_150pct, completers_100pct, transfer_out, still_enrolled: INTEGER
- grad_rate_150pct, transfer_rate: NUMERIC

### completions (2009-2024, ~124M rows - very large!)
- unitid, year, cip_code, award_level, race, gender: PRIMARY KEY
- cip_code: TEXT (e.g., '11.0101' for Computer Science)
- award_level: INTEGER (1=certificate <1yr, 2=certificate 1-2yr, 3=associate, 5=bachelor, 7=master, 17=doctor research, 18=doctor professional, 19=doctor other)
- race: TEXT (codes: 'APTS'=all/total, 'AIAN', 'ASIA', 'BKAA', 'HISP', 'NHPI', 'WHIT', '2MOR')
- gender: TEXT ('men', 'women', 'total')
- count: INTEGER
NOTE: For total completions (unduplicated), do NOT filter by race/gender - just SUM(count) as each row is already a breakdown

### financial_aid (2009-2023, ~100k rows)
- unitid, year: PRIMARY KEY
- pell_recipients, pell_pct: INTEGER, NUMERIC
- avg_net_price: INTEGER (overall)
- avg_net_price_0_30k, avg_net_price_30_48k, avg_net_price_48_75k, avg_net_price_75_110k, avg_net_price_110k_plus: INTEGER (by income bracket)

### ref_cip (CIP code reference, ~2k rows)
- code: TEXT PRIMARY KEY (e.g., '11', '11.01', '11.0101')
- level: INTEGER (2=family, 4=series, 6=detailed)
- family: TEXT (2-digit code)
- title: TEXT (e.g., 'Computer and Information Sciences')
- definition: TEXT

### ref_sector (sector lookup, joins to institution.sector)
- code: INTEGER PRIMARY KEY (1-9)
- label: TEXT (e.g., 'Public, 4-year or above', 'Private nonprofit, 4-year or above')

### ref_race (race/ethnicity lookup)
- code: TEXT PRIMARY KEY (e.g., 'APTS', 'WHIT', 'BKAA', 'HISP', 'ASIA')
- label: TEXT (e.g., 'All students total', 'White', 'Black or African American')

### Historic tables (1980-2008, simplified schemas):
- enrollment_historic: unitid, year, total_enrollment
- completions_historic: unitid, year, cip_2digit, total_completions
- graduation_rates_historic: unitid, year, cohort_size, completers, grad_rate_150pct
- institution_historic: unitid, year, name, city, state

## Key Relationships
- All tables join to institution ON unitid
- enrollment.race and completions.race join to ref_race ON code
- institution.sector joins to ref_sector ON code
- completions.cip_code joins to ref_cip ON code (for 6-digit codes)

## Important Notes
1. For unduplicated enrollment totals, filter: level='all' AND gender='total' AND race='APTS'
2. CIP codes: 2-digit is family (e.g., '11'), 4-digit is series (e.g., '11.01'), 6-digit is detailed (e.g., '11.0101')
3. The completions table is HUGE (124M rows) - always use year filter and indexes
4. Admit rates and yield rates are already calculated as decimals (0-1), multiply by 100 for percentage
5. For geographic queries, use ST_Distance(geom, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography)
6. For similarity search, use: feature_vector <=> target_vector ORDER BY to find similar institutions

## Rules
1. ONLY generate SELECT statements - no INSERT, UPDATE, DELETE, DROP, etc.
2. Always include a LIMIT clause (max 1000)
3. For the completions table, always filter by year
4. Use explicit JOINs rather than implicit
5. When showing percentages, format them nicely
6. Include institution name when showing institution data

## CRITICAL PERFORMANCE RULES (MUST FOLLOW)
The completions table has 124M rows. To avoid timeouts:

1. **NEVER use LIKE on text columns when joining completions with ref_cip**.
   BAD: WHERE LOWER(rc.title) LIKE '%environmental%' - forces full table scan

2. **For queries about specific programs/fields:**
   Use CIP code prefixes with LIKE on cip_code column (which is indexed):
   - Computer Science: WHERE cip_code LIKE '11.%'
   - Business: WHERE cip_code LIKE '52.%'
   - Engineering: WHERE cip_code LIKE '14.%'
   - Health/Nursing: WHERE cip_code LIKE '51.%'
   - Education: WHERE cip_code LIKE '13.%'
   - Environmental/Sustainability: WHERE cip_code LIKE '03.%'
   - Biological Sciences: WHERE cip_code LIKE '26.%'
   - Social Sciences: WHERE cip_code LIKE '45.%'
   - Psychology: WHERE cip_code LIKE '42.%'
   - Physical Sciences: WHERE cip_code LIKE '40.%'
   - Mathematics: WHERE cip_code LIKE '27.%'
   - Communications: WHERE cip_code LIKE '09.%'
   - Visual/Performing Arts: WHERE cip_code LIKE '50.%'
   - English/Literature: WHERE cip_code LIKE '23.%'
   - History: WHERE cip_code LIKE '54.%'
   - Multidisciplinary Studies: WHERE cip_code LIKE '30.%'

3. **If you need the program name, JOIN ref_cip AFTER filtering:**
   Good pattern:
   \`\`\`sql
   SELECT i.name, rc.title, SUM(c.count) as completions
   FROM completions c
   JOIN institution i ON c.unitid = i.unitid
   JOIN ref_cip rc ON c.cip_code = rc.code
   WHERE c.year >= 2020 AND c.cip_code LIKE '11.%'  -- Filter FIRST
   GROUP BY i.unitid, i.name, rc.title
   ORDER BY completions DESC
   LIMIT 50
   \`\`\`

4. **For broad program searches by name (climate, nursing, etc.):**
   ALWAYS use CIP family prefixes instead of text search. Map the topic to CIP families:
   - Climate/Environmental/Sustainability → '03.%' (Natural Resources and Conservation)
   - Also include '30.33%' (Sustainability Studies) and '40.04%' (Atmospheric Sciences)
   \`\`\`sql
   SELECT i.name, SUM(c.count) as completions
   FROM completions c
   JOIN institution i ON c.unitid = i.unitid
   WHERE c.year >= 2020
     AND (c.cip_code LIKE '03.%' OR c.cip_code LIKE '30.33%' OR c.cip_code LIKE '40.04%')
   GROUP BY i.unitid, i.name
   ORDER BY completions DESC LIMIT 50
   \`\`\`

5. **NEVER join ref_cip with text LIKE patterns when querying completions** - it's too slow
   Instead, use CIP code prefixes directly on the completions table

6. **Always filter completions by year range** - never scan all 124M rows
`;

const NLQuerySchema = z.object({
  question: z.string().min(1).max(1000),
});

// Initialize Anthropic client (will use ANTHROPIC_API_KEY from env)
const anthropic = new Anthropic();

// POST /api/query/nl
router.post('/nl', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question } = NLQuerySchema.parse(req.body);

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: { message: 'ANTHROPIC_API_KEY not configured' },
      });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `${DATABASE_SCHEMA}

Based on the schema above, generate a PostgreSQL SELECT query to answer this question:

"${question}"

Respond with ONLY the SQL query, no explanation. The query must:
1. Be a valid PostgreSQL SELECT statement
2. Include a LIMIT clause (max 1000 rows)
3. Use proper JOIN syntax
4. Be optimized for the table sizes mentioned

SQL:`,
        },
      ],
    });

    // Extract the SQL from the response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Clean up the SQL - remove markdown code blocks if present
    let sql = responseText.trim();
    if (sql.startsWith('```sql')) {
      sql = sql.slice(6);
    } else if (sql.startsWith('```')) {
      sql = sql.slice(3);
    }
    if (sql.endsWith('```')) {
      sql = sql.slice(0, -3);
    }
    sql = sql.trim();

    // Validate it's a SELECT or WITH (CTE) statement
    const normalizedSql = sql.toLowerCase();
    if (!normalizedSql.startsWith('select') && !normalizedSql.startsWith('with')) {
      return res.status(400).json({
        error: { message: 'Generated query is not a SELECT statement', raw: sql.substring(0, 200) },
      });
    }

    res.json({
      sql,
      question,
    });
  } catch (error: any) {
    if (error.status === 401) {
      return res.status(500).json({
        error: { message: 'Invalid Anthropic API key' },
      });
    }
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

// POST /api/query/execute/csv - Execute query and return CSV
router.post('/execute/csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sql } = ExecuteQuerySchema.parse(req.body);

    // Validate the query
    const validation = validateQuery(sql);
    if (!validation.valid) {
      return res.status(400).json({ error: { message: validation.error } });
    }

    // Add LIMIT if not present (higher limit for CSV export)
    let safeSql = sql.trim();
    if (!safeSql.toLowerCase().includes('limit')) {
      safeSql = `${safeSql.replace(/;$/, '')} LIMIT 10000`;
    }

    const client = await pool.connect();

    try {
      await client.query('SET statement_timeout = 120000'); // 2 min for CSV exports
      const result = await client.query(safeSql);

      const csv = toCSV(result.fields.map(f => f.name), result.rows);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="query_results.csv"');
      res.send(csv);
    } finally {
      await client.query('RESET statement_timeout');
      client.release();
    }
  } catch (error: any) {
    if (error.code) {
      return res.status(400).json({
        error: {
          message: error.message,
          code: error.code,
        },
      });
    }
    next(error);
  }
});

// GET /api/query/schema - Return schema info for display
router.get('/schema', async (_req: Request, res: Response) => {
  res.json({
    tables: [
      { name: 'institution', description: 'Core institution data (~10k rows)', rows: '~10,000' },
      { name: 'admissions', description: 'Admissions statistics (2014-2023)', rows: '~20,000' },
      { name: 'enrollment', description: 'Enrollment by demographics (2009-2023)', rows: '~8M' },
      { name: 'graduation_rates', description: 'Graduation rates by cohort (2009-2023)', rows: '~950k' },
      { name: 'completions', description: 'Degrees awarded by CIP code (2009-2024)', rows: '~124M' },
      { name: 'financial_aid', description: 'Financial aid and net price (2009-2023)', rows: '~100k' },
      { name: 'ref_cip', description: 'CIP code reference table', rows: '~2k' },
    ],
  });
});

export default router;
