/**
 * Natural Language to SQL Query Test Suite
 *
 * This test suite validates that natural language questions are correctly
 * converted to SQL and return valid results. These tests call the Anthropic API
 * so they are NOT run automatically.
 *
 * To run manually:
 *   npx vitest run src/api/__tests__/nl-queries.test.ts
 *
 * Or run a specific category:
 *   npx vitest run src/api/__tests__/nl-queries.test.ts -t "Institution"
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { pool, query } from '../db/pool.js';

// Test configuration
const API_BASE = process.env.TEST_API_URL || 'http://localhost:3001';
const TEST_TOKEN = process.env.TEST_AUTH_TOKEN; // Set this to a valid JWT token

interface TestCase {
  question: string;
  expectedPatterns?: string[]; // SQL patterns that should appear
  minRows?: number; // Minimum expected rows
  maxRows?: number; // Maximum expected rows
  expectedColumns?: string[]; // Columns that should be in result
  shouldFail?: boolean; // If the query should fail (for negative tests)
}

// Helper to call NL-to-SQL endpoint
async function nlToSql(question: string): Promise<{ sql: string; question: string }> {
  const res = await fetch(`${API_BASE}/api/query/nl`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_TOKEN}`,
    },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || 'NL query failed');
  }
  return res.json();
}

// Helper to execute SQL directly
async function executeSql(sql: string): Promise<{ columns: string[]; rows: any[]; rowCount: number }> {
  const res = await fetch(`${API_BASE}/api/query/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_TOKEN}`,
    },
    body: JSON.stringify({ sql }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || `SQL execution failed: ${sql.substring(0, 100)}`);
  }
  return res.json();
}

// Helper to test a single query
async function testQuery(tc: TestCase): Promise<{ success: boolean; error?: string; sql?: string; rowCount?: number }> {
  try {
    // Generate SQL from natural language
    const { sql } = await nlToSql(tc.question);

    // Check for expected patterns
    if (tc.expectedPatterns) {
      for (const pattern of tc.expectedPatterns) {
        if (!sql.toLowerCase().includes(pattern.toLowerCase())) {
          return { success: false, error: `Missing pattern: ${pattern}`, sql };
        }
      }
    }

    // Execute the SQL
    const result = await executeSql(sql);

    // Check row count bounds
    if (tc.minRows !== undefined && result.rowCount < tc.minRows) {
      return { success: false, error: `Expected at least ${tc.minRows} rows, got ${result.rowCount}`, sql, rowCount: result.rowCount };
    }
    if (tc.maxRows !== undefined && result.rowCount > tc.maxRows) {
      return { success: false, error: `Expected at most ${tc.maxRows} rows, got ${result.rowCount}`, sql, rowCount: result.rowCount };
    }

    // Check expected columns
    if (tc.expectedColumns) {
      const resultCols = result.columns.map(c => c.toLowerCase());
      for (const col of tc.expectedColumns) {
        if (!resultCols.some(c => c.includes(col.toLowerCase()))) {
          return { success: false, error: `Missing column: ${col}`, sql, rowCount: result.rowCount };
        }
      }
    }

    return { success: true, sql, rowCount: result.rowCount };
  } catch (error: any) {
    if (tc.shouldFail) {
      return { success: true };
    }
    return { success: false, error: error.message };
  }
}

// =============================================================================
// CATEGORY 1: INSTITUTION QUERIES (10)
// =============================================================================
const institutionQueries: TestCase[] = [
  {
    question: "What are the largest colleges in America?",
    expectedColumns: ['name', 'enrollment'],
    minRows: 10,
  },
  {
    question: "List all HBCUs",
    expectedPatterns: ['hbcu'],
    minRows: 50,
  },
  {
    question: "Show me all public universities in California",
    expectedPatterns: ['state', 'control'],
    minRows: 10,
  },
  {
    question: "How many colleges are there in each state?",
    expectedColumns: ['state'],
    minRows: 50,
  },
  {
    question: "What are the tribal colleges?",
    expectedPatterns: ['tribal'],
    minRows: 1,
  },
  {
    question: "List private nonprofit 4-year colleges in New York",
    expectedPatterns: ['sector', 'state'],
    minRows: 10,
  },
  {
    question: "What colleges are in Boston?",
    expectedPatterns: ['city'],
    minRows: 5,
  },
  {
    question: "Show me for-profit colleges",
    expectedPatterns: ['control'],
    minRows: 10,
  },
  {
    question: "What are the community colleges in Texas?",
    expectedPatterns: ['level', 'state'],
    minRows: 20,
  },
  {
    question: "List all colleges with their city, state, and sector",
    expectedColumns: ['name', 'city', 'state'],
    minRows: 100,
  },
];

// =============================================================================
// CATEGORY 2: ENROLLMENT QUERIES (15)
// =============================================================================
const enrollmentQueries: TestCase[] = [
  {
    question: "What is the total enrollment at Harvard?",
    expectedPatterns: ['enrollment', 'unitid'],
    minRows: 1,
  },
  {
    question: "Which schools have the most graduate students?",
    expectedPatterns: ['graduate'],
    minRows: 10,
  },
  {
    question: "What is the gender breakdown of enrollment at Stanford?",
    expectedPatterns: ['gender'],
    minRows: 1,
  },
  {
    question: "Show me enrollment by race at UCLA",
    expectedPatterns: ['race'],
    minRows: 1,
  },
  {
    question: "What are the top 20 schools by undergraduate enrollment?",
    expectedPatterns: ['undergraduate'],
    minRows: 10,
    maxRows: 20,
  },
  {
    question: "How has enrollment changed at MIT over time?",
    expectedPatterns: ['year'],
    minRows: 5,
  },
  {
    question: "What percentage of students are part-time at community colleges?",
    expectedPatterns: ['part_time'],
    minRows: 1,
  },
  {
    question: "Which states have the highest total college enrollment?",
    expectedColumns: ['state'],
    minRows: 10,
  },
  {
    question: "Show enrollment trends for the University of Michigan",
    expectedPatterns: ['year', 'enrollment'],
    minRows: 5,
  },
  {
    question: "What is the male to female ratio at engineering schools?",
    expectedPatterns: ['gender'],
    minRows: 1,
  },
  {
    question: "List the 10 schools with the highest Hispanic enrollment",
    expectedPatterns: ['hisp'],
    minRows: 5,
    maxRows: 10,
  },
  {
    question: "What is total US college enrollment in 2023?",
    expectedPatterns: ['2023'],
    minRows: 1,
  },
  {
    question: "Show me schools where more than 50% are part-time students",
    expectedPatterns: ['part_time'],
    minRows: 1,
  },
  {
    question: "What are the largest online universities by enrollment?",
    expectedPatterns: ['enrollment'],
    minRows: 5,
  },
  {
    question: "Compare enrollment at UC Berkeley vs UCLA",
    expectedPatterns: ['enrollment'],
    minRows: 1,
  },
];

// =============================================================================
// CATEGORY 3: ADMISSIONS QUERIES (10)
// =============================================================================
const admissionsQueries: TestCase[] = [
  {
    question: "What are the most selective colleges in America?",
    expectedPatterns: ['admit'],
    minRows: 10,
  },
  {
    question: "What is the acceptance rate at Yale?",
    expectedPatterns: ['admit'],
    minRows: 1,
  },
  {
    question: "Show me SAT scores at Ivy League schools",
    expectedPatterns: ['sat'],
    minRows: 1,
  },
  {
    question: "Which schools received the most applications in 2023?",
    expectedPatterns: ['applicants', '2023'],
    minRows: 10,
  },
  {
    question: "What is the yield rate at Stanford?",
    expectedPatterns: ['yield'],
    minRows: 1,
  },
  {
    question: "List colleges with acceptance rates under 10%",
    expectedPatterns: ['admit'],
    minRows: 5,
  },
  {
    question: "What are the average ACT scores at top public universities?",
    expectedPatterns: ['act'],
    minRows: 5,
  },
  {
    question: "How many students applied to NYU last year?",
    expectedPatterns: ['applicants'],
    minRows: 1,
  },
  {
    question: "Show admissions trends at Duke over the past 5 years",
    expectedPatterns: ['year'],
    minRows: 3,
  },
  {
    question: "Which schools admit the most students overall?",
    expectedPatterns: ['admitted'],
    minRows: 10,
  },
];

// =============================================================================
// CATEGORY 4: GRADUATION RATE QUERIES (10)
// =============================================================================
const graduationQueries: TestCase[] = [
  {
    question: "What schools have the highest graduation rates?",
    expectedPatterns: ['graduation', 'rate'],
    minRows: 10,
  },
  {
    question: "What is the 6-year graduation rate at Princeton?",
    expectedPatterns: ['150'],
    minRows: 1,
  },
  {
    question: "Compare graduation rates by race at University of Texas",
    expectedPatterns: ['race', 'graduation'],
    minRows: 1,
  },
  {
    question: "Which HBCUs have the best graduation rates?",
    expectedPatterns: ['hbcu', 'graduation'],
    minRows: 5,
  },
  {
    question: "What is the average graduation rate at community colleges?",
    expectedPatterns: ['graduation'],
    minRows: 1,
  },
  {
    question: "Show graduation rate trends at Ohio State",
    expectedPatterns: ['year', 'graduation'],
    minRows: 3,
  },
  {
    question: "What schools have the lowest graduation rates?",
    expectedPatterns: ['graduation'],
    minRows: 10,
  },
  {
    question: "Compare male vs female graduation rates at top colleges",
    expectedPatterns: ['gender', 'graduation'],
    minRows: 5,
  },
  {
    question: "Which public universities have graduation rates above 90%?",
    expectedPatterns: ['graduation', 'public'],
    minRows: 5,
  },
  {
    question: "What is the transfer-out rate at 2-year colleges?",
    expectedPatterns: ['transfer'],
    minRows: 1,
  },
];

// =============================================================================
// CATEGORY 5: COMPLETIONS/DEGREES QUERIES (15)
// =============================================================================
const completionsQueries: TestCase[] = [
  {
    question: "Which schools award the most computer science degrees?",
    expectedPatterns: ['11.'],
    minRows: 10,
  },
  {
    question: "How many nursing degrees were awarded in 2023?",
    expectedPatterns: ['51.', '2023'],
    minRows: 1,
  },
  {
    question: "What are the most popular majors in America?",
    expectedPatterns: ['cip', 'count'],
    minRows: 10,
  },
  {
    question: "Show engineering degrees by school",
    expectedPatterns: ['14.'],
    minRows: 10,
  },
  {
    question: "Which schools award the most doctoral degrees?",
    expectedPatterns: ['award_level'],
    minRows: 10,
  },
  {
    question: "How many MBAs were awarded last year?",
    expectedPatterns: ['52.'],
    minRows: 1,
  },
  {
    question: "What schools produce the most STEM graduates?",
    expectedPatterns: ['cip'],
    minRows: 10,
  },
  {
    question: "Show business degree trends over time",
    expectedPatterns: ['52.', 'year'],
    minRows: 5,
  },
  {
    question: "Which schools award the most associate degrees?",
    expectedPatterns: ['award_level'],
    minRows: 10,
  },
  {
    question: "What are the top schools for psychology degrees?",
    expectedPatterns: ['42.'],
    minRows: 10,
  },
  {
    question: "How many education degrees are awarded annually?",
    expectedPatterns: ['13.'],
    minRows: 1,
  },
  {
    question: "Which schools have the most diverse degree offerings?",
    expectedPatterns: ['cip'],
    minRows: 10,
  },
  {
    question: "Show health science completions at UCLA",
    expectedPatterns: ['51.'],
    minRows: 1,
  },
  {
    question: "What is the gender breakdown for engineering graduates?",
    expectedPatterns: ['14.', 'gender'],
    minRows: 1,
  },
  {
    question: "How have computer science degrees grown over time?",
    expectedPatterns: ['11.', 'year'],
    minRows: 5,
  },
];

// =============================================================================
// CATEGORY 6: FINANCIAL AID QUERIES (10)
// =============================================================================
const financialQueries: TestCase[] = [
  {
    question: "What are the most affordable private colleges?",
    expectedPatterns: ['net_price'],
    minRows: 10,
  },
  {
    question: "Which schools have the highest Pell grant percentage?",
    expectedPatterns: ['pell'],
    minRows: 10,
  },
  {
    question: "What is the average net price at Harvard?",
    expectedPatterns: ['net_price'],
    minRows: 1,
  },
  {
    question: "Show me colleges with the lowest net price for low-income students",
    expectedPatterns: ['net_price', '0_30k'],
    minRows: 10,
  },
  {
    question: "Which public universities are most affordable?",
    expectedPatterns: ['net_price', 'public'],
    minRows: 10,
  },
  {
    question: "What schools have more than 50% Pell recipients?",
    expectedPatterns: ['pell'],
    minRows: 10,
  },
  {
    question: "Compare net prices at Ivy League schools",
    expectedPatterns: ['net_price'],
    minRows: 1,
  },
  {
    question: "What is the net price for middle-income families at Stanford?",
    expectedPatterns: ['net_price'],
    minRows: 1,
  },
  {
    question: "Show financial aid trends at MIT",
    expectedPatterns: ['year'],
    minRows: 3,
  },
  {
    question: "Which schools offer the best value for low-income students?",
    expectedPatterns: ['net_price'],
    minRows: 10,
  },
];

// =============================================================================
// CATEGORY 7: GEOGRAPHIC QUERIES (10)
// =============================================================================
const geographicQueries: TestCase[] = [
  {
    question: "What colleges are within 25 miles of New York City?",
    expectedPatterns: ['st_'],
    minRows: 10,
  },
  {
    question: "Find colleges near Los Angeles",
    expectedPatterns: ['st_'],
    minRows: 10,
  },
  {
    question: "What is the nearest college to Chicago?",
    expectedPatterns: ['st_'],
    minRows: 1,
  },
  {
    question: "List colleges within 50 miles of San Francisco",
    expectedPatterns: ['st_'],
    minRows: 5,
  },
  {
    question: "What colleges are near Miami?",
    expectedPatterns: ['st_'],
    minRows: 5,
  },
  {
    question: "Find universities within 10 miles of downtown Boston",
    expectedPatterns: ['st_'],
    minRows: 5,
  },
  {
    question: "What colleges are closest to Seattle?",
    expectedPatterns: ['st_'],
    minRows: 5,
  },
  {
    question: "List schools near Denver",
    expectedPatterns: ['st_'],
    minRows: 5,
  },
  {
    question: "What colleges are in the Washington DC area?",
    expectedPatterns: ['st_'],
    minRows: 5,
  },
  {
    question: "Find schools near Atlanta",
    expectedPatterns: ['st_'],
    minRows: 5,
  },
];

// =============================================================================
// CATEGORY 8: VECTOR SIMILARITY QUERIES (5)
// =============================================================================
const similarityQueries: TestCase[] = [
  {
    question: "Find colleges similar to Harvard",
    expectedPatterns: ['feature_vector', '<=>'],
    minRows: 5,
  },
  {
    question: "What schools are most like Stanford?",
    expectedPatterns: ['feature_vector'],
    minRows: 5,
  },
  {
    question: "Find schools similar to MIT",
    expectedPatterns: ['feature_vector'],
    minRows: 5,
  },
  {
    question: "What colleges are comparable to Duke?",
    expectedPatterns: ['feature_vector'],
    minRows: 5,
  },
  {
    question: "Find universities like UC Berkeley",
    expectedPatterns: ['feature_vector'],
    minRows: 5,
  },
];

// =============================================================================
// CATEGORY 9: TRENDS AND AGGREGATIONS (10)
// =============================================================================
const trendQueries: TestCase[] = [
  {
    question: "How has total US college enrollment changed over time?",
    expectedPatterns: ['year', 'sum'],
    minRows: 5,
  },
  {
    question: "What is the trend in computer science degrees over the past decade?",
    expectedPatterns: ['year', '11.'],
    minRows: 5,
  },
  {
    question: "Show the growth of online education enrollment",
    expectedPatterns: ['year'],
    minRows: 3,
  },
  {
    question: "How have admission rates changed at selective colleges?",
    expectedPatterns: ['year', 'admit'],
    minRows: 5,
  },
  {
    question: "What is the trend in international student enrollment?",
    expectedPatterns: ['year'],
    minRows: 3,
  },
  {
    question: "Show graduation rate trends nationally",
    expectedPatterns: ['year', 'graduation'],
    minRows: 5,
  },
  {
    question: "How has the gender gap in STEM changed over time?",
    expectedPatterns: ['year', 'gender'],
    minRows: 3,
  },
  {
    question: "What is the trend in college net prices?",
    expectedPatterns: ['year', 'net_price'],
    minRows: 5,
  },
  {
    question: "Show enrollment trends by sector",
    expectedPatterns: ['year', 'sector'],
    minRows: 5,
  },
  {
    question: "How has doctoral degree production changed?",
    expectedPatterns: ['year', 'award_level'],
    minRows: 5,
  },
];

// =============================================================================
// CATEGORY 10: COMPLEX MULTI-TABLE QUERIES (5)
// =============================================================================
const complexQueries: TestCase[] = [
  {
    question: "What selective schools also have high graduation rates and are affordable?",
    expectedPatterns: ['admission', 'graduation', 'net_price'],
    minRows: 5,
  },
  {
    question: "Which large public universities have the best outcomes?",
    expectedPatterns: ['enrollment', 'graduation'],
    minRows: 5,
  },
  {
    question: "Compare Ivy League schools on enrollment, graduation rate, and net price",
    expectedPatterns: ['enrollment', 'graduation', 'financial'],
    minRows: 1,
  },
  {
    question: "What HBCUs have the best combination of affordability and graduation rate?",
    expectedPatterns: ['hbcu', 'graduation', 'net_price'],
    minRows: 5,
  },
  {
    question: "Which schools produce the most STEM graduates relative to their size?",
    expectedPatterns: ['completions', 'enrollment'],
    minRows: 5,
  },
];

// =============================================================================
// TEST RUNNERS
// =============================================================================

describe.skip('NL-to-SQL Queries', () => {
  beforeAll(() => {
    if (!TEST_TOKEN) {
      console.warn('TEST_AUTH_TOKEN not set. Set it to run these tests.');
    }
  });

  describe('Institution Queries', () => {
    it.each(institutionQueries.map((q, i) => [i + 1, q.question, q]))(
      'Query %i: %s',
      async (_, __, tc) => {
        const result = await testQuery(tc as TestCase);
        if (!result.success) {
          console.log('Generated SQL:', result.sql);
        }
        expect(result.success, result.error).toBe(true);
      },
      30000
    );
  });

  describe('Enrollment Queries', () => {
    it.each(enrollmentQueries.map((q, i) => [i + 1, q.question, q]))(
      'Query %i: %s',
      async (_, __, tc) => {
        const result = await testQuery(tc as TestCase);
        if (!result.success) {
          console.log('Generated SQL:', result.sql);
        }
        expect(result.success, result.error).toBe(true);
      },
      30000
    );
  });

  describe('Admissions Queries', () => {
    it.each(admissionsQueries.map((q, i) => [i + 1, q.question, q]))(
      'Query %i: %s',
      async (_, __, tc) => {
        const result = await testQuery(tc as TestCase);
        if (!result.success) {
          console.log('Generated SQL:', result.sql);
        }
        expect(result.success, result.error).toBe(true);
      },
      30000
    );
  });

  describe('Graduation Rate Queries', () => {
    it.each(graduationQueries.map((q, i) => [i + 1, q.question, q]))(
      'Query %i: %s',
      async (_, __, tc) => {
        const result = await testQuery(tc as TestCase);
        if (!result.success) {
          console.log('Generated SQL:', result.sql);
        }
        expect(result.success, result.error).toBe(true);
      },
      30000
    );
  });

  describe('Completions Queries', () => {
    it.each(completionsQueries.map((q, i) => [i + 1, q.question, q]))(
      'Query %i: %s',
      async (_, __, tc) => {
        const result = await testQuery(tc as TestCase);
        if (!result.success) {
          console.log('Generated SQL:', result.sql);
        }
        expect(result.success, result.error).toBe(true);
      },
      60000 // Longer timeout for completions queries
    );
  });

  describe('Financial Aid Queries', () => {
    it.each(financialQueries.map((q, i) => [i + 1, q.question, q]))(
      'Query %i: %s',
      async (_, __, tc) => {
        const result = await testQuery(tc as TestCase);
        if (!result.success) {
          console.log('Generated SQL:', result.sql);
        }
        expect(result.success, result.error).toBe(true);
      },
      30000
    );
  });

  describe('Geographic Queries', () => {
    it.each(geographicQueries.map((q, i) => [i + 1, q.question, q]))(
      'Query %i: %s',
      async (_, __, tc) => {
        const result = await testQuery(tc as TestCase);
        if (!result.success) {
          console.log('Generated SQL:', result.sql);
        }
        expect(result.success, result.error).toBe(true);
      },
      30000
    );
  });

  describe('Similarity Queries', () => {
    it.each(similarityQueries.map((q, i) => [i + 1, q.question, q]))(
      'Query %i: %s',
      async (_, __, tc) => {
        const result = await testQuery(tc as TestCase);
        if (!result.success) {
          console.log('Generated SQL:', result.sql);
        }
        expect(result.success, result.error).toBe(true);
      },
      30000
    );
  });

  describe('Trend Queries', () => {
    it.each(trendQueries.map((q, i) => [i + 1, q.question, q]))(
      'Query %i: %s',
      async (_, __, tc) => {
        const result = await testQuery(tc as TestCase);
        if (!result.success) {
          console.log('Generated SQL:', result.sql);
        }
        expect(result.success, result.error).toBe(true);
      },
      30000
    );
  });

  describe('Complex Queries', () => {
    it.each(complexQueries.map((q, i) => [i + 1, q.question, q]))(
      'Query %i: %s',
      async (_, __, tc) => {
        const result = await testQuery(tc as TestCase);
        if (!result.success) {
          console.log('Generated SQL:', result.sql);
        }
        expect(result.success, result.error).toBe(true);
      },
      60000
    );
  });
});

// =============================================================================
// DIRECT SQL VALIDATION TESTS (no API calls, run with normal test suite)
// =============================================================================

// Export queries for manual testing
export const allQueries = {
  institution: institutionQueries,
  enrollment: enrollmentQueries,
  admissions: admissionsQueries,
  graduation: graduationQueries,
  completions: completionsQueries,
  financial: financialQueries,
  geographic: geographicQueries,
  similarity: similarityQueries,
  trends: trendQueries,
  complex: complexQueries,
};

// Export test function for CLI usage
export { testQuery, nlToSql, executeSql };
