#!/usr/bin/env npx tsx
/**
 * CLI script to test NL-to-SQL queries
 *
 * Usage:
 *   npx tsx scripts/test-nl-queries.ts [category] [--sql-only] [--limit N]
 *
 * Categories: institution, enrollment, admissions, graduation, completions,
 *             financial, geographic, similarity, trends, complex, all
 *
 * Examples:
 *   npx tsx scripts/test-nl-queries.ts institution
 *   npx tsx scripts/test-nl-queries.ts all --limit 5
 *   npx tsx scripts/test-nl-queries.ts enrollment --sql-only
 */

import { pool } from '../src/api/db/pool.js';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3001';

// Get auth token
async function getAuthToken(): Promise<string> {
  // Try to login with test user
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
  });

  if (!res.ok) {
    throw new Error('Failed to get auth token. Create test user first.');
  }

  const data = await res.json();
  return data.accessToken;
}

// Call NL-to-SQL endpoint
async function nlToSql(question: string, token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/query/nl`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || 'NL query failed');
  }

  const data = await res.json();
  return data.sql;
}

// Execute SQL
async function executeSql(sql: string, token: string): Promise<{ rowCount: number; error?: string }> {
  const res = await fetch(`${API_BASE}/api/query/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ sql }),
  });

  if (!res.ok) {
    const error = await res.json();
    return { rowCount: 0, error: error.error?.message || 'SQL execution failed' };
  }

  const data = await res.json();
  return { rowCount: data.rowCount };
}

// All test queries by category
const queries: Record<string, string[]> = {
  institution: [
    "What are the largest colleges in America?",
    "List all HBCUs",
    "Show me all public universities in California",
    "How many colleges are there in each state?",
    "What are the tribal colleges?",
    "List private nonprofit 4-year colleges in New York",
    "What colleges are in Boston?",
    "Show me for-profit colleges",
    "What are the community colleges in Texas?",
    "List all colleges with their city, state, and sector",
  ],
  enrollment: [
    "What is the total enrollment at Harvard?",
    "Which schools have the most graduate students?",
    "What is the gender breakdown of enrollment at Stanford?",
    "Show me enrollment by race at UCLA",
    "What are the top 20 schools by undergraduate enrollment?",
    "How has enrollment changed at MIT over time?",
    "What percentage of students are part-time at community colleges?",
    "Which states have the highest total college enrollment?",
    "Show enrollment trends for the University of Michigan",
    "What is the male to female ratio at engineering schools?",
    "List the 10 schools with the highest Hispanic enrollment",
    "What is total US college enrollment in 2023?",
    "Show me schools where more than 50% are part-time students",
    "What are the largest online universities by enrollment?",
    "Compare enrollment at UC Berkeley vs UCLA",
  ],
  admissions: [
    "What are the most selective colleges in America?",
    "What is the acceptance rate at Yale?",
    "Show me SAT scores at Ivy League schools",
    "Which schools received the most applications in 2023?",
    "What is the yield rate at Stanford?",
    "List colleges with acceptance rates under 10%",
    "What are the average ACT scores at top public universities?",
    "How many students applied to NYU last year?",
    "Show admissions trends at Duke over the past 5 years",
    "Which schools admit the most students overall?",
  ],
  graduation: [
    "What schools have the highest graduation rates?",
    "What is the 6-year graduation rate at Princeton?",
    "Compare graduation rates by race at University of Texas",
    "Which HBCUs have the best graduation rates?",
    "What is the average graduation rate at community colleges?",
    "Show graduation rate trends at Ohio State",
    "What schools have the lowest graduation rates?",
    "Compare male vs female graduation rates at top colleges",
    "Which public universities have graduation rates above 90%?",
    "What is the transfer-out rate at 2-year colleges?",
  ],
  completions: [
    "Which schools award the most computer science degrees?",
    "How many nursing degrees were awarded in 2023?",
    "What are the most popular majors in America?",
    "Show engineering degrees by school",
    "Which schools award the most doctoral degrees?",
    "How many MBAs were awarded last year?",
    "What schools produce the most STEM graduates?",
    "Show business degree trends over time",
    "Which schools award the most associate degrees?",
    "What are the top schools for psychology degrees?",
    "How many education degrees are awarded annually?",
    "Which schools have the most diverse degree offerings?",
    "Show health science completions at UCLA",
    "What is the gender breakdown for engineering graduates?",
    "How have computer science degrees grown over time?",
  ],
  financial: [
    "What are the most affordable private colleges?",
    "Which schools have the highest Pell grant percentage?",
    "What is the average net price at Harvard?",
    "Show me colleges with the lowest net price for low-income students",
    "Which public universities are most affordable?",
    "What schools have more than 50% Pell recipients?",
    "Compare net prices at Ivy League schools",
    "What is the net price for middle-income families at Stanford?",
    "Show financial aid trends at MIT",
    "Which schools offer the best value for low-income students?",
  ],
  geographic: [
    "What colleges are within 25 miles of New York City?",
    "Find colleges near Los Angeles",
    "What is the nearest college to Chicago?",
    "List colleges within 50 miles of San Francisco",
    "What colleges are near Miami?",
    "Find universities within 10 miles of downtown Boston",
    "What colleges are closest to Seattle?",
    "List schools near Denver",
    "What colleges are in the Washington DC area?",
    "Find schools near Atlanta",
  ],
  similarity: [
    "Find colleges similar to Harvard",
    "What schools are most like Stanford?",
    "Find schools similar to MIT",
    "What colleges are comparable to Duke?",
    "Find universities like UC Berkeley",
  ],
  trends: [
    "How has total US college enrollment changed over time?",
    "What is the trend in computer science degrees over the past decade?",
    "Show the growth of online education enrollment",
    "How have admission rates changed at selective colleges?",
    "What is the trend in international student enrollment?",
    "Show graduation rate trends nationally",
    "How has the gender gap in STEM changed over time?",
    "What is the trend in college net prices?",
    "Show enrollment trends by sector",
    "How has doctoral degree production changed?",
  ],
  complex: [
    "What selective schools also have high graduation rates and are affordable?",
    "Which large public universities have the best outcomes?",
    "Compare Ivy League schools on enrollment, graduation rate, and net price",
    "What HBCUs have the best combination of affordability and graduation rate?",
    "Which schools produce the most STEM graduates relative to their size?",
  ],
};

interface TestResult {
  question: string;
  success: boolean;
  sql?: string;
  rowCount?: number;
  error?: string;
  timeMs?: number;
}

async function runTests(
  category: string,
  options: { sqlOnly?: boolean; limit?: number }
): Promise<TestResult[]> {
  const token = await getAuthToken();
  const results: TestResult[] = [];

  const categoriesToTest = category === 'all' ? Object.keys(queries) : [category];

  for (const cat of categoriesToTest) {
    const catQueries = queries[cat];
    if (!catQueries) {
      console.error(`Unknown category: ${cat}`);
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`CATEGORY: ${cat.toUpperCase()}`);
    console.log('='.repeat(60));

    const queriesToRun = options.limit ? catQueries.slice(0, options.limit) : catQueries;

    for (let i = 0; i < queriesToRun.length; i++) {
      const question = queriesToRun[i];
      console.log(`\n[${i + 1}/${queriesToRun.length}] ${question}`);

      const start = Date.now();
      try {
        // Generate SQL
        const sql = await nlToSql(question, token);
        console.log(`  SQL: ${sql.substring(0, 100)}...`);

        if (options.sqlOnly) {
          results.push({ question, success: true, sql, timeMs: Date.now() - start });
          continue;
        }

        // Execute SQL
        const { rowCount, error } = await executeSql(sql, token);

        if (error) {
          console.log(`  ❌ ERROR: ${error}`);
          results.push({ question, success: false, sql, error, timeMs: Date.now() - start });
        } else {
          console.log(`  ✅ Success: ${rowCount} rows (${Date.now() - start}ms)`);
          results.push({ question, success: true, sql, rowCount, timeMs: Date.now() - start });
        }
      } catch (error: any) {
        console.log(`  ❌ FAILED: ${error.message}`);
        results.push({ question, success: false, error: error.message, timeMs: Date.now() - start });
      }
    }
  }

  return results;
}

function printSummary(results: TestResult[]) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalTime = results.reduce((sum, r) => sum + (r.timeMs || 0), 0);

  console.log(`Total: ${results.length}`);
  console.log(`Successful: ${successful} (${((successful / results.length) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failed}`);
  console.log(`Total time: ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`Avg time: ${(totalTime / results.length).toFixed(0)}ms`);

  if (failed > 0) {
    console.log('\nFailed queries:');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  - ${r.question}`);
        console.log(`    Error: ${r.error}`);
        if (r.sql) {
          console.log(`    SQL: ${r.sql.substring(0, 80)}...`);
        }
      });
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const category = args.find(a => !a.startsWith('--')) || 'all';
  const sqlOnly = args.includes('--sql-only');
  const limitArg = args.find(a => a.startsWith('--limit'));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf('--limit') + 1]) : undefined;

  console.log('NL-to-SQL Query Tester');
  console.log(`Category: ${category}`);
  console.log(`SQL only: ${sqlOnly}`);
  console.log(`Limit: ${limit || 'none'}`);

  try {
    const results = await runTests(category, { sqlOnly, limit });
    printSummary(results);

    // Exit with error code if any tests failed
    const failed = results.filter(r => !r.success).length;
    process.exit(failed > 0 ? 1 : 0);
  } catch (error: any) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

main();
