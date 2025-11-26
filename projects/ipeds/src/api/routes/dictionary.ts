import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../db/pool.js';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

// Comprehensive data dictionary with metadata
const DATA_DICTIONARY = {
  tables: {
    institution: {
      description: 'Core institution characteristics and identifiers for ~10,000 U.S. colleges and universities',
      rowCount: '~10,000',
      updateFrequency: 'Annual (fall)',
      primaryKey: 'unitid',
      columns: {
        unitid: { type: 'INTEGER', description: 'Unique IPEDS institution identifier (6 digits)', example: '166027' },
        name: { type: 'TEXT', description: 'Official institution name', example: 'Harvard University' },
        city: { type: 'TEXT', description: 'City location', example: 'Cambridge' },
        state: { type: 'TEXT', description: 'Two-letter state abbreviation', example: 'MA' },
        zip: { type: 'TEXT', description: 'ZIP code', example: '02138' },
        latitude: { type: 'DOUBLE PRECISION', description: 'Geographic latitude', example: '42.374471' },
        longitude: { type: 'DOUBLE PRECISION', description: 'Geographic longitude', example: '-71.118313' },
        sector: { type: 'INTEGER', description: 'Institution sector (1-9)', values: {
          1: 'Public, 4-year or above',
          2: 'Private nonprofit, 4-year or above',
          3: 'Private for-profit, 4-year or above',
          4: 'Public, 2-year',
          5: 'Private nonprofit, 2-year',
          6: 'Private for-profit, 2-year',
          7: 'Public, less-than 2-year',
          8: 'Private nonprofit, less-than 2-year',
          9: 'Private for-profit, less-than 2-year'
        }},
        control: { type: 'INTEGER', description: 'Control type', values: { 1: 'Public', 2: 'Private nonprofit', 3: 'Private for-profit' }},
        level: { type: 'INTEGER', description: 'Institution level', values: { 1: '4-year or above', 2: '2-year', 3: 'Less than 2-year' }},
        hbcu: { type: 'BOOLEAN', description: 'Historically Black College or University', example: 'true/false' },
        tribal: { type: 'BOOLEAN', description: 'Tribal College or University', example: 'true/false' },
        geom: { type: 'GEOMETRY(Point)', description: 'PostGIS point geometry for spatial queries', example: 'ST_SetSRID(ST_MakePoint(-71.118, 42.374), 4326)' },
        feature_vector: { type: 'VECTOR(10)', description: '10-dimensional embedding for similarity search', example: '[0.05, 0.95, 0.8, ...]' }
      },
      suggestedQueries: [
        { description: 'List all HBCUs', sql: "SELECT name, city, state FROM institution WHERE hbcu = true ORDER BY state, name;" },
        { description: 'Count institutions by state', sql: "SELECT state, COUNT(*) as count FROM institution GROUP BY state ORDER BY count DESC;" },
        { description: 'Find public 4-year universities in California', sql: "SELECT name, city FROM institution WHERE state = 'CA' AND sector = 1 ORDER BY name;" }
      ],
      applications: [
        'Institution profiles and comparisons',
        'Geographic analysis of higher ed landscape',
        'Sector-specific research (HBCUs, community colleges, etc.)',
        'Similarity searches to find comparable institutions'
      ]
    },
    admissions: {
      description: 'Undergraduate admissions statistics including applications, acceptances, enrollment, and test scores',
      rowCount: '~20,000',
      years: '2014-2023',
      updateFrequency: 'Annual',
      primaryKey: '(unitid, year)',
      columns: {
        unitid: { type: 'INTEGER', description: 'Institution identifier', joinTo: 'institution.unitid' },
        year: { type: 'INTEGER', description: 'Academic year (fall)', example: '2023' },
        applicants_total: { type: 'INTEGER', description: 'Total first-time degree-seeking applicants', example: '57435' },
        applicants_men: { type: 'INTEGER', description: 'Male applicants', example: '26500' },
        applicants_women: { type: 'INTEGER', description: 'Female applicants', example: '30935' },
        admitted_total: { type: 'INTEGER', description: 'Total applicants admitted', example: '1968' },
        admitted_men: { type: 'INTEGER', description: 'Male applicants admitted', example: '895' },
        admitted_women: { type: 'INTEGER', description: 'Female applicants admitted', example: '1073' },
        enrolled_total: { type: 'INTEGER', description: 'Total admitted who enrolled', example: '1650' },
        enrolled_men: { type: 'INTEGER', description: 'Male admitted who enrolled', example: '780' },
        enrolled_women: { type: 'INTEGER', description: 'Female admitted who enrolled', example: '870' },
        admit_rate: { type: 'NUMERIC', description: 'Admission rate (0-1 scale, multiply by 100 for %)', example: '0.034' },
        yield_rate: { type: 'NUMERIC', description: 'Yield rate - enrolled/admitted (0-1 scale)', example: '0.838' },
        sat_verbal_25: { type: 'INTEGER', description: 'SAT Evidence-Based Reading 25th percentile', example: '720' },
        sat_verbal_75: { type: 'INTEGER', description: 'SAT Evidence-Based Reading 75th percentile', example: '780' },
        sat_math_25: { type: 'INTEGER', description: 'SAT Math 25th percentile', example: '740' },
        sat_math_75: { type: 'INTEGER', description: 'SAT Math 75th percentile', example: '800' },
        act_composite_25: { type: 'INTEGER', description: 'ACT Composite 25th percentile', example: '33' },
        act_composite_75: { type: 'INTEGER', description: 'ACT Composite 75th percentile', example: '35' }
      },
      suggestedQueries: [
        { description: 'Most selective colleges', sql: "SELECT i.name, ROUND(a.admit_rate * 100, 1) as admit_pct FROM admissions a JOIN institution i ON a.unitid = i.unitid WHERE a.year = 2023 AND a.applicants_total > 5000 ORDER BY a.admit_rate LIMIT 20;" },
        { description: 'SAT score trends at a school', sql: "SELECT year, sat_math_25, sat_math_75, sat_verbal_25, sat_verbal_75 FROM admissions WHERE unitid = 166027 ORDER BY year;" },
        { description: 'Schools with highest yield rates', sql: "SELECT i.name, ROUND(a.yield_rate * 100, 1) as yield_pct FROM admissions a JOIN institution i ON a.unitid = i.unitid WHERE a.year = 2023 ORDER BY a.yield_rate DESC LIMIT 20;" }
      ],
      applications: [
        'College selectivity rankings',
        'Application volume trends',
        'Test score analysis',
        'Yield rate optimization research',
        'Gender equity in admissions'
      ],
      notes: [
        'Data available from 2014 onwards (ADM files started then)',
        'admit_rate and yield_rate are pre-calculated decimals (0-1)',
        'Test scores may be NULL if school is test-optional'
      ]
    },
    enrollment: {
      description: 'Fall enrollment counts broken down by level, race/ethnicity, gender, and attendance status',
      rowCount: '~8.7 million',
      years: '2009-2023',
      updateFrequency: 'Annual (fall snapshot)',
      primaryKey: '(unitid, year, level, race, gender)',
      columns: {
        unitid: { type: 'INTEGER', description: 'Institution identifier', joinTo: 'institution.unitid' },
        year: { type: 'INTEGER', description: 'Academic year (fall)', example: '2023' },
        level: { type: 'TEXT', description: 'Student level', values: {
          'undergraduate': 'Undergraduate students',
          'graduate': 'Graduate students',
          'first_professional': 'First professional (law, medicine, etc.)',
          'all': 'All levels combined'
        }},
        race: { type: 'TEXT', description: 'Race/ethnicity code', values: {
          'APTS': 'All students total (use for unduplicated counts)',
          'AIAN': 'American Indian or Alaska Native',
          'ASIA': 'Asian',
          'BKAA': 'Black or African American',
          'HISP': 'Hispanic/Latino',
          'NHPI': 'Native Hawaiian or Pacific Islander',
          'WHIT': 'White',
          '2MOR': 'Two or more races',
          'UNKN': 'Unknown',
          'NRA': 'Nonresident alien'
        }},
        gender: { type: 'TEXT', description: 'Gender', values: { 'men': 'Male', 'women': 'Female', 'total': 'All genders' }},
        full_time: { type: 'INTEGER', description: 'Full-time enrollment count', example: '15000' },
        part_time: { type: 'INTEGER', description: 'Part-time enrollment count', example: '3000' },
        total: { type: 'INTEGER', description: 'Total enrollment (full_time + part_time)', example: '18000' }
      },
      suggestedQueries: [
        { description: 'Largest schools by total enrollment', sql: "SELECT i.name, e.total FROM enrollment e JOIN institution i ON e.unitid = i.unitid WHERE e.year = 2023 AND e.level = 'all' AND e.gender = 'total' AND e.race = 'APTS' ORDER BY e.total DESC LIMIT 20;" },
        { description: 'Enrollment by race at a school', sql: "SELECT rr.label, e.total FROM enrollment e JOIN ref_race rr ON e.race = rr.code WHERE e.unitid = 110635 AND e.year = 2023 AND e.level = 'all' AND e.gender = 'total' AND e.race != 'APTS' ORDER BY e.total DESC;" },
        { description: 'National enrollment trends', sql: "SELECT year, SUM(total) as total_enrollment FROM enrollment WHERE level = 'all' AND gender = 'total' AND race = 'APTS' GROUP BY year ORDER BY year;" }
      ],
      applications: [
        'Demographic analysis of student bodies',
        'Enrollment trend forecasting',
        'Diversity and equity research',
        'Part-time vs full-time student analysis',
        'State and regional enrollment patterns'
      ],
      notes: [
        "CRITICAL: For unduplicated totals, filter: level='all' AND gender='total' AND race='APTS'",
        'Each row is a demographic breakdown - sum carefully to avoid double-counting',
        'Race categories changed in 2011 - historical comparisons need adjustment'
      ]
    },
    graduation_rates: {
      description: 'Cohort-based graduation and retention rates by race, gender, and degree type',
      rowCount: '~950,000',
      years: '2009-2023',
      updateFrequency: 'Annual',
      primaryKey: '(unitid, year, cohort_type, race, gender)',
      columns: {
        unitid: { type: 'INTEGER', description: 'Institution identifier', joinTo: 'institution.unitid' },
        year: { type: 'INTEGER', description: 'Reporting year', example: '2023' },
        cohort_type: { type: 'TEXT', description: 'Degree cohort type', values: {
          'bachelor': "Bachelor's degree seeking",
          'associate': "Associate's degree seeking",
          'certificate': 'Certificate seeking'
        }},
        race: { type: 'TEXT', description: 'Race/ethnicity', values: {
          'Total': 'All students',
          'White': 'White',
          'Black or African American': 'Black or African American',
          'Hispanic': 'Hispanic/Latino',
          'Asian': 'Asian',
          'American Indian or Alaska Native': 'AIAN',
          'Native Hawaiian or Other Pacific Islander': 'NHPI',
          'Two or more races': 'Multiracial',
          'Nonresident alien': 'International'
        }},
        gender: { type: 'TEXT', description: 'Gender', values: { 'Total': 'All', 'Men': 'Male', 'Women': 'Female' }},
        cohort_size: { type: 'INTEGER', description: 'Size of entering cohort', example: '1650' },
        completers_150pct: { type: 'INTEGER', description: 'Completed within 150% of normal time (6 years for bachelor)', example: '1584' },
        completers_100pct: { type: 'INTEGER', description: 'Completed within 100% of normal time (4 years)', example: '1400' },
        transfer_out: { type: 'INTEGER', description: 'Transferred to another institution', example: '30' },
        still_enrolled: { type: 'INTEGER', description: 'Still enrolled at reporting time', example: '20' },
        grad_rate_150pct: { type: 'NUMERIC', description: 'Graduation rate at 150% time (pre-calculated)', example: '0.96' },
        transfer_rate: { type: 'NUMERIC', description: 'Transfer-out rate (pre-calculated)', example: '0.018' }
      },
      suggestedQueries: [
        { description: 'Highest graduation rates', sql: "SELECT i.name, ROUND(g.grad_rate_150pct * 100, 1) as grad_rate FROM graduation_rates g JOIN institution i ON g.unitid = i.unitid WHERE g.year = 2023 AND g.cohort_type = 'bachelor' AND g.race = 'Total' AND g.gender = 'Total' AND g.cohort_size >= 100 ORDER BY g.grad_rate_150pct DESC LIMIT 20;" },
        { description: 'Graduation rate equity gaps', sql: "SELECT race, ROUND(AVG(grad_rate_150pct) * 100, 1) as avg_grad_rate FROM graduation_rates WHERE year = 2023 AND cohort_type = 'bachelor' AND gender = 'Total' GROUP BY race ORDER BY avg_grad_rate DESC;" },
        { description: 'Graduation trends at a school', sql: "SELECT year, ROUND(grad_rate_150pct * 100, 1) as grad_rate FROM graduation_rates WHERE unitid = 166027 AND cohort_type = 'bachelor' AND race = 'Total' AND gender = 'Total' ORDER BY year;" }
      ],
      applications: [
        'Institutional effectiveness measurement',
        'Equity gap analysis by race/gender',
        'Accreditation and accountability reporting',
        'Student success research',
        'Transfer pattern analysis'
      ],
      notes: [
        "150% time = 6 years for bachelor's, 3 years for associate's",
        'Cohort-based tracking starts with first-time, full-time students',
        'Use race=Total and gender=Total for overall rates'
      ]
    },
    completions: {
      description: 'Degrees and certificates awarded by CIP code, award level, race, and gender',
      rowCount: '~124 million',
      years: '2009-2024',
      updateFrequency: 'Annual',
      primaryKey: '(unitid, year, cip_code, award_level, race, gender)',
      columns: {
        unitid: { type: 'INTEGER', description: 'Institution identifier', joinTo: 'institution.unitid' },
        year: { type: 'INTEGER', description: 'Academic year', example: '2023' },
        cip_code: { type: 'TEXT', description: 'Classification of Instructional Programs code (6-digit)', example: '11.0101', joinTo: 'ref_cip.code' },
        award_level: { type: 'INTEGER', description: 'Degree/certificate level', values: {
          1: 'Certificate < 1 year',
          2: 'Certificate 1-2 years',
          3: "Associate's degree",
          5: "Bachelor's degree",
          7: "Master's degree",
          17: "Doctor's degree - research",
          18: "Doctor's degree - professional (MD, JD, etc.)",
          19: "Doctor's degree - other"
        }},
        race: { type: 'TEXT', description: 'Race/ethnicity code (same as enrollment)', example: 'APTS' },
        gender: { type: 'TEXT', description: 'Gender', values: { 'men': 'Male', 'women': 'Female', 'total': 'All' }},
        count: { type: 'INTEGER', description: 'Number of completions', example: '150' }
      },
      suggestedQueries: [
        { description: 'Top CS degree producers', sql: "SELECT i.name, SUM(c.count) as degrees FROM completions c JOIN institution i ON c.unitid = i.unitid WHERE c.year = 2023 AND c.cip_code LIKE '11.%' AND c.award_level = 5 GROUP BY i.unitid, i.name ORDER BY degrees DESC LIMIT 20;" },
        { description: 'Most popular majors nationally', sql: "SELECT rc.title, SUM(c.count) as total FROM completions c JOIN ref_cip rc ON c.cip_code = rc.code WHERE c.year = 2023 AND c.award_level = 5 AND rc.level = 4 GROUP BY rc.code, rc.title ORDER BY total DESC LIMIT 20;" },
        { description: 'Engineering degrees by gender', sql: "SELECT gender, SUM(count) as total FROM completions WHERE year = 2023 AND cip_code LIKE '14.%' AND award_level = 5 AND gender != 'total' GROUP BY gender;" }
      ],
      applications: [
        'Workforce pipeline analysis',
        'STEM education trends',
        'Degree production rankings',
        'Gender equity in fields of study',
        'Regional workforce development planning'
      ],
      notes: [
        'VERY LARGE TABLE (~124M rows) - always filter by year',
        'For totals, SUM(count) - each row is already a breakdown',
        'CIP codes: 2-digit = family, 4-digit = series, 6-digit = detailed',
        'Use cip_code LIKE patterns for program families (e.g., "11.%" for CS)'
      ],
      cipFamilies: {
        '01': 'Agriculture',
        '03': 'Natural Resources and Conservation',
        '04': 'Architecture',
        '05': 'Area, Ethnic, Cultural, Gender Studies',
        '09': 'Communication and Journalism',
        '10': 'Communications Technologies',
        '11': 'Computer and Information Sciences',
        '12': 'Culinary Services',
        '13': 'Education',
        '14': 'Engineering',
        '15': 'Engineering Technologies',
        '16': 'Foreign Languages',
        '19': 'Family and Consumer Sciences',
        '22': 'Legal Professions',
        '23': 'English Language and Literature',
        '24': 'Liberal Arts and Sciences',
        '25': 'Library Science',
        '26': 'Biological Sciences',
        '27': 'Mathematics and Statistics',
        '30': 'Multi/Interdisciplinary Studies',
        '31': 'Parks, Recreation, Leisure',
        '38': 'Philosophy and Religious Studies',
        '40': 'Physical Sciences',
        '42': 'Psychology',
        '43': 'Homeland Security and Law Enforcement',
        '44': 'Public Administration',
        '45': 'Social Sciences',
        '50': 'Visual and Performing Arts',
        '51': 'Health Professions',
        '52': 'Business, Management, Marketing',
        '54': 'History'
      }
    },
    financial_aid: {
      description: 'Student financial aid data including net prices by income bracket and Pell grant statistics',
      rowCount: '~100,000',
      years: '2009-2023',
      updateFrequency: 'Annual',
      primaryKey: '(unitid, year)',
      columns: {
        unitid: { type: 'INTEGER', description: 'Institution identifier', joinTo: 'institution.unitid' },
        year: { type: 'INTEGER', description: 'Academic year', example: '2023' },
        pell_recipients: { type: 'INTEGER', description: 'Number of Pell grant recipients', example: '2500' },
        pell_pct: { type: 'NUMERIC', description: 'Percentage of undergrads receiving Pell (0-1)', example: '0.15' },
        avg_net_price: { type: 'INTEGER', description: 'Average net price for all students', example: '21500' },
        avg_net_price_0_30k: { type: 'INTEGER', description: 'Avg net price for family income $0-$30,000', example: '8500' },
        avg_net_price_30_48k: { type: 'INTEGER', description: 'Avg net price for family income $30,001-$48,000', example: '12000' },
        avg_net_price_48_75k: { type: 'INTEGER', description: 'Avg net price for family income $48,001-$75,000', example: '18000' },
        avg_net_price_75_110k: { type: 'INTEGER', description: 'Avg net price for family income $75,001-$110,000', example: '28000' },
        avg_net_price_110k_plus: { type: 'INTEGER', description: 'Avg net price for family income over $110,000', example: '45000' }
      },
      suggestedQueries: [
        { description: 'Most affordable for low-income', sql: "SELECT i.name, f.avg_net_price_0_30k FROM financial_aid f JOIN institution i ON f.unitid = i.unitid WHERE f.year = 2023 AND i.sector IN (1,2) AND f.avg_net_price_0_30k > 0 ORDER BY f.avg_net_price_0_30k LIMIT 20;" },
        { description: 'Highest Pell percentage', sql: "SELECT i.name, ROUND(f.pell_pct * 100, 1) as pell_pct FROM financial_aid f JOIN institution i ON f.unitid = i.unitid WHERE f.year = 2023 AND f.pell_recipients > 500 ORDER BY f.pell_pct DESC LIMIT 20;" },
        { description: 'Net price trends at a school', sql: "SELECT year, avg_net_price, avg_net_price_0_30k, avg_net_price_110k_plus FROM financial_aid WHERE unitid = 166027 ORDER BY year;" }
      ],
      applications: [
        'College affordability analysis',
        'Economic diversity assessment',
        'Value rankings (outcomes vs cost)',
        'Financial aid policy research',
        'Access and equity studies'
      ],
      notes: [
        'Net price = tuition + fees + room/board - grants/scholarships',
        'Negative net prices are possible (e.g., Berea College)',
        'pell_pct is a proxy for economic diversity',
        'Income brackets based on family AGI'
      ]
    },
    ref_cip: {
      description: 'Classification of Instructional Programs (CIP) code reference table with program names and definitions',
      rowCount: '~2,000',
      columns: {
        code: { type: 'TEXT', description: 'CIP code at various levels', example: '11.0101' },
        level: { type: 'INTEGER', description: 'Code hierarchy level', values: { 2: 'Family (2-digit)', 4: 'Series (4-digit)', 6: 'Detailed (6-digit)' }},
        family: { type: 'TEXT', description: '2-digit family code', example: '11' },
        title: { type: 'TEXT', description: 'Program title', example: 'Computer and Information Sciences, General' },
        definition: { type: 'TEXT', description: 'Detailed program definition', example: 'A general program that focuses on...' }
      },
      suggestedQueries: [
        { description: 'Search CIP codes by name', sql: "SELECT code, title FROM ref_cip WHERE title ILIKE '%computer%' AND level = 6 ORDER BY code;" },
        { description: 'List all CIP families', sql: "SELECT code, title FROM ref_cip WHERE level = 2 ORDER BY code;" }
      ]
    },
    ref_sector: {
      description: 'Institution sector lookup table',
      columns: {
        code: { type: 'INTEGER', description: 'Sector code (1-9)', example: '1' },
        label: { type: 'TEXT', description: 'Sector name', example: 'Public, 4-year or above' }
      }
    },
    ref_race: {
      description: 'Race/ethnicity code lookup table',
      columns: {
        code: { type: 'TEXT', description: 'Race code', example: 'BKAA' },
        label: { type: 'TEXT', description: 'Race/ethnicity name', example: 'Black or African American' }
      }
    }
  },
  specialFeatures: {
    postgis: {
      name: 'PostGIS Spatial Queries',
      description: 'Find institutions by geographic proximity using PostGIS',
      examples: [
        {
          description: 'Find colleges within 25 miles of NYC',
          sql: `SELECT name, city, state,
  ROUND(ST_Distance(geom, ST_SetSRID(ST_MakePoint(-73.9857, 40.7484), 4326)::geography) / 1609.34) as miles
FROM institution
WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint(-73.9857, 40.7484), 4326)::geography, 40234)
ORDER BY miles LIMIT 20;`
        }
      ],
      coordinates: {
        'New York City': { lat: 40.7484, lng: -73.9857 },
        'Los Angeles': { lat: 34.0522, lng: -118.2437 },
        'Chicago': { lat: 41.8781, lng: -87.6298 },
        'Boston': { lat: 42.3601, lng: -71.0589 },
        'San Francisco': { lat: 37.7749, lng: -122.4194 }
      }
    },
    pgvector: {
      name: 'Vector Similarity Search',
      description: 'Find similar institutions using 10-dimensional feature vectors',
      vectorDimensions: [
        'admit_rate (0-1)',
        'grad_rate (0-1)',
        'size (normalized 0-1)',
        'pell_pct (0-1)',
        'affordability (inverted net price, 0-1)',
        'sat (normalized 0-1)',
        'public (1/0)',
        '4year (1/0)',
        'hbcu (1/0)',
        'research_proxy (0-1)'
      ],
      examples: [
        {
          description: 'Find schools similar to Harvard',
          sql: `SELECT i.name, i.city, i.state,
  ROUND((1 - (i.feature_vector <=> target.feature_vector))::numeric * 100, 2) as similarity_pct
FROM institution i,
  (SELECT feature_vector FROM institution WHERE unitid = 166027) target
WHERE i.feature_vector IS NOT NULL AND i.unitid != 166027
ORDER BY i.feature_vector <=> target.feature_vector
LIMIT 10;`
        }
      ]
    },
    trigram: {
      name: 'Fuzzy Text Search',
      description: 'Search institution names with typo tolerance using pg_trgm',
      examples: [
        {
          description: 'Fuzzy search for "Standford"',
          sql: `SELECT name, city, state, similarity(name, 'Standford') as sim
FROM institution WHERE name % 'Standford' ORDER BY sim DESC LIMIT 10;`
        }
      ]
    }
  },
  historicData: {
    description: 'Simplified historic data tables (1980-2008) for long-term trend analysis',
    tables: {
      enrollment_historic: { years: '1980, 1986-89, 1991-93, 2000-08', columns: 'unitid, year, total_enrollment' },
      completions_historic: { years: '1980, 1984-89, 1991-94, 2000-08', columns: 'unitid, year, cip_2digit, total_completions' },
      graduation_rates_historic: { years: '1997-2008', columns: 'unitid, year, cohort_size, completers, grad_rate_150pct' },
      institution_historic: { years: '1980, 1984-85, 2000-08', columns: 'unitid, year, name, city, state' }
    },
    notes: [
      'Historic tables use simplified schemas for cross-era compatibility',
      'Gaps in years due to missing IPEDS source files',
      'Race categories changed over time - direct comparisons need care'
    ]
  }
};

// GET /api/dictionary - Full data dictionary
router.get('/', async (_req: Request, res: Response) => {
  res.json(DATA_DICTIONARY);
});

// GET /api/dictionary/tables - List all tables
router.get('/tables', async (_req: Request, res: Response) => {
  const tables = Object.entries(DATA_DICTIONARY.tables).map(([name, info]) => ({
    name,
    description: info.description,
    rowCount: info.rowCount,
    years: (info as any).years,
  }));
  res.json({ tables });
});

// GET /api/dictionary/tables/:table - Get specific table info
router.get('/tables/:table', async (req: Request, res: Response) => {
  const tableName = req.params.table;
  const tableInfo = (DATA_DICTIONARY.tables as any)[tableName];

  if (!tableInfo) {
    return res.status(404).json({ error: { message: `Table '${tableName}' not found` } });
  }

  res.json({ name: tableName, ...tableInfo });
});

// GET /api/dictionary/search - Search across all tables and columns
router.get('/search', async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').toLowerCase();

  if (!q || q.length < 2) {
    return res.status(400).json({ error: { message: 'Query must be at least 2 characters' } });
  }

  const results: any[] = [];

  for (const [tableName, tableInfo] of Object.entries(DATA_DICTIONARY.tables)) {
    // Search table name and description
    if (tableName.includes(q) || tableInfo.description.toLowerCase().includes(q)) {
      results.push({ type: 'table', name: tableName, description: tableInfo.description });
    }

    // Search columns
    if (tableInfo.columns) {
      for (const [colName, colInfo] of Object.entries(tableInfo.columns)) {
        if (colName.includes(q) || (colInfo as any).description.toLowerCase().includes(q)) {
          results.push({
            type: 'column',
            table: tableName,
            column: colName,
            description: (colInfo as any).description,
            dataType: (colInfo as any).type
          });
        }
      }
    }
  }

  res.json({ query: q, results });
});

// GET /api/dictionary/stats - Live database statistics
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await query(`
      SELECT
        'institution' as table_name, COUNT(*)::int as row_count FROM institution
      UNION ALL SELECT 'admissions', COUNT(*)::int FROM admissions
      UNION ALL SELECT 'enrollment', COUNT(*)::int FROM enrollment
      UNION ALL SELECT 'graduation_rates', COUNT(*)::int FROM graduation_rates
      UNION ALL SELECT 'completions', COUNT(*)::int FROM completions
      UNION ALL SELECT 'financial_aid', COUNT(*)::int FROM financial_aid
      UNION ALL SELECT 'ref_cip', COUNT(*)::int FROM ref_cip
      ORDER BY table_name
    `);

    const yearRanges = await query(`
      SELECT 'admissions' as tbl, MIN(year) as min_year, MAX(year) as max_year FROM admissions
      UNION ALL SELECT 'enrollment', MIN(year), MAX(year) FROM enrollment
      UNION ALL SELECT 'graduation_rates', MIN(year), MAX(year) FROM graduation_rates
      UNION ALL SELECT 'completions', MIN(year), MAX(year) FROM completions
      UNION ALL SELECT 'financial_aid', MIN(year), MAX(year) FROM financial_aid
    `);

    res.json({
      tableCounts: stats,
      yearRanges: yearRanges,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// Initialize Anthropic client
const anthropic = new Anthropic();

// POST /api/dictionary/ask - Ask questions about the data
router.post('/ask', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: { message: 'Question is required' } });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY not configured' } });
    }

    const systemPrompt = `You are a helpful assistant that answers questions about the IPEDS (Integrated Postsecondary Education Data System) database. You have access to the following data dictionary:

${JSON.stringify(DATA_DICTIONARY, null, 2)}

When answering questions:
1. Be specific about which tables and columns are relevant
2. Provide example SQL queries when helpful
3. Note any data limitations or caveats
4. Suggest related analyses the user might find interesting
5. Keep responses concise but informative

If asked about something not in IPEDS data, explain what IS available that might be related.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    res.json({ question, answer: responseText });
  } catch (error: any) {
    if (error.status === 401) {
      return res.status(500).json({ error: { message: 'Invalid Anthropic API key' } });
    }
    next(error);
  }
});

export default router;
