import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
// import { Skeleton } from '@/components/ui/skeleton';
import { TrendChart } from '@/components/charts/TrendChart';
import { BarChart } from '@/components/charts/BarChart';
import { PieChart } from '@/components/charts/PieChart';
import { authFetch } from '@/lib/auth';

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

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

const API_BASE = '/api';

// Predefined queries for exploring IPEDS data
const PRESET_QUERIES: Omit<SavedQuery, 'id' | 'created_at' | 'last_run_at' | 'run_count'>[] = [
  {
    name: 'Top 20 Most Selective',
    description: 'Institutions with the lowest admission rates',
    sql: `SELECT i.unitid, i.name, i.state, a.year,
  a.applicants_total, a.admitted_total,
  ROUND(a.admitted_total::numeric / NULLIF(a.applicants_total, 0) * 100, 2) as admit_rate_pct
FROM institution i
JOIN admissions a ON i.unitid = a.unitid
WHERE a.year = (SELECT MAX(year) FROM admissions)
  AND a.applicants_total > 1000
ORDER BY admit_rate_pct ASC
LIMIT 20;`,
    tags: ['admissions', 'selectivity'],
  },
  {
    name: 'Largest HBCUs',
    description: 'Historically Black Colleges ranked by enrollment',
    sql: `SELECT i.unitid, i.name, i.city, i.state,
  e.year, SUM(e.total) as total_enrollment
FROM institution i
JOIN enrollment e ON i.unitid = e.unitid
WHERE i.hbcu = true
  AND e.year = (SELECT MAX(year) FROM enrollment)
GROUP BY i.unitid, i.name, i.city, i.state, e.year
ORDER BY total_enrollment DESC
LIMIT 20;`,
    tags: ['hbcu', 'enrollment'],
  },
  {
    name: 'Highest Graduation Rates',
    description: 'Best 6-year graduation rates',
    sql: `SELECT i.unitid, i.name, i.state, g.year,
  g.cohort_size, g.completers_150pct,
  ROUND(g.completers_150pct::numeric / NULLIF(g.cohort_size, 0) * 100, 2) as grad_rate_pct
FROM institution i
JOIN graduation_rates g ON i.unitid = g.unitid
WHERE g.year = (SELECT MAX(year) FROM graduation_rates)
  AND g.cohort_type = 'bachelor'
  AND g.race = 'Total'
  AND g.cohort_size >= 100
ORDER BY grad_rate_pct DESC
LIMIT 20;`,
    tags: ['graduation', 'outcomes'],
  },
  {
    name: 'Most Affordable Private',
    description: 'Lowest net price for low-income students',
    sql: `SELECT i.unitid, i.name, i.state,
  f.year, f.avg_net_price_0_30k, f.avg_net_price,
  f.pell_recipients, f.pell_pct
FROM institution i
JOIN financial_aid f ON i.unitid = f.unitid
WHERE i.control = 2  -- Private nonprofit
  AND i.level = 1    -- 4-year
  AND f.year = (SELECT MAX(year) FROM financial_aid)
  AND f.avg_net_price_0_30k > 0
ORDER BY f.avg_net_price_0_30k ASC
LIMIT 20;`,
    tags: ['financial', 'affordability'],
  },
  {
    name: 'High Pell Grant %',
    description: 'Most Pell grant recipients',
    sql: `SELECT i.unitid, i.name, i.state, i.sector,
  f.year, f.pell_recipients,
  ROUND(f.pell_pct * 100, 1) as pell_pct,
  f.avg_net_price
FROM institution i
JOIN financial_aid f ON i.unitid = f.unitid
WHERE f.year = (SELECT MAX(year) FROM financial_aid)
  AND f.pell_recipients >= 500
ORDER BY f.pell_pct DESC
LIMIT 20;`,
    tags: ['financial', 'pell'],
  },
  {
    name: 'CS Degrees by State',
    description: 'Computer Science completions by state',
    sql: `SELECT i.state,
  COUNT(DISTINCT i.unitid) as num_institutions,
  SUM(c.count) as total_completions
FROM institution i
JOIN completions c ON i.unitid = c.unitid
WHERE c.cip_code LIKE '11.%'
  AND c.year = (SELECT MAX(year) FROM completions)
GROUP BY i.state
ORDER BY total_completions DESC
LIMIT 20;`,
    tags: ['completions', 'stem'],
  },
  {
    name: 'National Enrollment Trend',
    description: 'Total enrollment by year',
    sql: `SELECT year, SUM(total) as total_enrollment,
  COUNT(DISTINCT unitid) as num_institutions
FROM enrollment
WHERE level = 'all' AND gender = 'total' AND race = 'APTS'
GROUP BY year
ORDER BY year;`,
    tags: ['enrollment', 'trends'],
  },
  {
    name: 'Institutions Near NYC',
    description: 'Colleges within 25 miles of NYC',
    sql: `SELECT i.unitid, i.name, i.city, i.state,
  ROUND(ST_Distance(
    i.geom,
    ST_SetSRID(ST_MakePoint(-73.9857, 40.7484), 4326)::geography
  ) / 1609.34) as miles_away
FROM institution i
WHERE i.geom IS NOT NULL
  AND ST_DWithin(
    i.geom,
    ST_SetSRID(ST_MakePoint(-73.9857, 40.7484), 4326)::geography,
    40234
  )
ORDER BY miles_away
LIMIT 20;`,
    tags: ['geographic', 'postgis'],
  },
  {
    name: 'Similar to Harvard',
    description: 'Vector similarity search',
    sql: `SELECT target.name as base_institution,
  i.unitid, i.name, i.city, i.state,
  ROUND((1 - (i.feature_vector <=> target.feature_vector))::numeric * 100, 2) as similarity_pct
FROM institution i,
  (SELECT name, feature_vector FROM institution WHERE unitid = 166027) target
WHERE i.feature_vector IS NOT NULL
  AND i.unitid != 166027
ORDER BY i.feature_vector <=> target.feature_vector
LIMIT 10;`,
    tags: ['vector', 'similarity'],
  },
  {
    name: 'Fuzzy Name Search',
    description: 'Search by name with trigrams',
    sql: `SELECT unitid, name, city, state,
  ROUND(similarity(name, 'Stanford')::numeric, 3) as sim_score
FROM institution
WHERE name % 'Stanford'
ORDER BY sim_score DESC
LIMIT 10;`,
    tags: ['search', 'trigram'],
  },
];

async function executeQuery(sql: string): Promise<QueryResult> {
  const res = await authFetch(`${API_BASE}/query/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || 'Query execution failed');
  }
  return res.json();
}

async function nlToSql(question: string): Promise<{ sql: string; question: string }> {
  const res = await authFetch(`${API_BASE}/query/nl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || 'NL query failed');
  }
  return res.json();
}

async function getSavedQueries(): Promise<SavedQuery[]> {
  const res = await authFetch(`${API_BASE}/query/saved`);
  if (!res.ok) throw new Error('Failed to load saved queries');
  const data = await res.json();
  return data.data || [];
}

async function saveQuery(query: { name: string; description: string; sql: string; tags: string[] }): Promise<SavedQuery> {
  const res = await authFetch(`${API_BASE}/query/saved`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!res.ok) throw new Error('Failed to save query');
  return res.json();
}

async function deleteQuery(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/query/saved/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete query');
}

// Detect if results can be charted
function detectChartType(columns: string[], rows: Record<string, unknown>[]): 'trend' | 'bar' | 'pie' | 'table' | null {
  if (rows.length === 0) return null;

  const hasYear = columns.some(c => c.toLowerCase() === 'year');
  const numericCols = columns.filter(c => {
    const val = rows[0][c];
    return typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)));
  });

  // Trend chart: has year column and a numeric value
  if (hasYear && numericCols.length >= 1) {
    return 'trend';
  }

  // Bar chart: has a name/label column and a numeric value
  const labelCols = columns.filter(c =>
    ['name', 'state', 'sector', 'field', 'title', 'label'].some(l => c.toLowerCase().includes(l))
  );
  if (labelCols.length >= 1 && numericCols.length >= 1 && rows.length <= 30) {
    return 'bar';
  }

  // Pie chart: small number of rows with percentages or counts
  if (rows.length <= 10 && numericCols.length >= 1) {
    return 'pie';
  }

  return 'table';
}

export default function Queries() {
  usePageTitle('Query Builder');
  const queryClient = useQueryClient();
  const [sqlInput, setSqlInput] = useState('SELECT * FROM institution LIMIT 10;');
  const [nlInput, setNlInput] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState<string | null>(null);
  const [showVisualization, setShowVisualization] = useState(true);
  const [resultSortCol, setResultSortCol] = useState<string | null>(null);
  const [resultSortDir, setResultSortDir] = useState<'asc' | 'desc'>('asc');

  // Save dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveTags, setSaveTags] = useState('');

  // Load saved queries
  const { data: savedQueries = [], isLoading: loadingSaved } = useQuery({
    queryKey: ['saved-queries'],
    queryFn: getSavedQueries,
  });

  const saveMutation = useMutation({
    mutationFn: saveQuery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-queries'] });
      setShowSaveDialog(false);
      setSaveName('');
      setSaveDescription('');
      setSaveTags('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteQuery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-queries'] });
    },
  });

  const handleExecuteQuery = async () => {
    if (!sqlInput.trim()) return;

    setIsExecuting(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const result = await executeQuery(sqlInput);
      setQueryResult(result);
      setResultSortCol(null);
      setResultSortDir('asc');
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleNlQuery = async () => {
    if (!nlInput.trim()) return;

    setIsGenerating(true);
    setQueryError(null);

    try {
      const result = await nlToSql(nlInput);
      setSqlInput(result.sql);
      // Keep NL input for refinement - don't clear it
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Failed to generate SQL');
    } finally {
      setIsGenerating(false);
    }
  };

  const loadQuery = (queryObj: typeof PRESET_QUERIES[0]) => {
    setSqlInput(queryObj.sql);
    setSelectedQuery(queryObj.name);
    setQueryResult(null);
    setQueryError(null);
  };

  const handleSave = () => {
    if (!saveName.trim() || !sqlInput.trim()) return;
    saveMutation.mutate({
      name: saveName,
      description: saveDescription,
      sql: sqlInput,
      tags: saveTags.split(',').map(t => t.trim()).filter(Boolean),
    });
  };

  const onSqlChange = useCallback((val: string) => {
    setSqlInput(val);
    setSelectedQuery(null);
  }, []);

  // All queries for sidebar
  const _allQueries = [...PRESET_QUERIES, ...savedQueries];
  void _allQueries;

  // Detect chart type for results
  const chartType = queryResult ? detectChartType(queryResult.columns, queryResult.rows) : null;

  // Prepare chart data
  const getChartData = () => {
    if (!queryResult || !chartType) return null;

    const { columns, rows } = queryResult;

    if (chartType === 'trend') {
      const yearCol = columns.find(c => c.toLowerCase() === 'year')!;
      const valueCol = columns.find(c => c !== yearCol && typeof rows[0][c] === 'number')
        || columns.find(c => c !== yearCol && !isNaN(Number(rows[0][c])));
      if (!valueCol) return null;

      return rows.map(r => ({
        year: Number(r[yearCol]),
        value: Number(r[valueCol]),
      }));
    }

    if (chartType === 'bar' || chartType === 'pie') {
      const labelCol = columns.find(c =>
        ['name', 'state', 'sector', 'field', 'title', 'label'].some(l => c.toLowerCase().includes(l))
      ) || columns[0];
      const valueCol = columns.find(c => {
        const val = rows[0][c];
        return c !== labelCol && (typeof val === 'number' || !isNaN(Number(val)));
      });
      if (!valueCol) return null;

      return rows.slice(0, 20).map(r => ({
        name: String(r[labelCol]).slice(0, 30),
        value: Number(r[valueCol]),
      }));
    }

    return null;
  };

  const chartData = getChartData();

  // Handle sorting for result table
  const handleResultSort = (col: string) => {
    if (resultSortCol === col) {
      setResultSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setResultSortCol(col);
      setResultSortDir('asc');
    }
  };

  // Sort query result rows
  const sortedRows = queryResult?.rows ? [...queryResult.rows].sort((a, b) => {
    if (!resultSortCol) return 0;
    const aVal = a[resultSortCol];
    const bVal = b[resultSortCol];

    // Handle nulls
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return resultSortDir === 'asc' ? 1 : -1;
    if (bVal === null) return resultSortDir === 'asc' ? -1 : 1;

    // Numeric comparison
    const aNum = Number(aVal);
    const bNum = Number(bVal);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return resultSortDir === 'asc' ? aNum - bNum : bNum - aNum;
    }

    // String comparison
    const aStr = String(aVal).toLowerCase();
    const bStr = String(bVal).toLowerCase();
    if (resultSortDir === 'asc') {
      return aStr.localeCompare(bStr);
    }
    return bStr.localeCompare(aStr);
  }) : [];

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Sidebar - Query List */}
      <div className="w-72 flex-shrink-0 overflow-auto border rounded-lg bg-muted/30">
        <div className="p-3 border-b sticky top-0 bg-muted/50 backdrop-blur">
          <h3 className="font-semibold text-sm">Queries</h3>
        </div>

        {/* Preset Queries */}
        <div className="p-2">
          <h4 className="text-xs font-medium text-muted-foreground px-2 py-1">Presets</h4>
          {PRESET_QUERIES.map((q, idx) => (
            <button
              key={idx}
              onClick={() => loadQuery(q)}
              className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors ${
                selectedQuery === q.name ? 'bg-muted font-medium' : ''
              }`}
            >
              <div className="truncate">{q.name}</div>
              <div className="text-xs text-muted-foreground truncate">{q.description}</div>
            </button>
          ))}
        </div>

        {/* Saved Queries */}
        <div className="p-2 border-t">
          <h4 className="text-xs font-medium text-muted-foreground px-2 py-1">
            Saved ({savedQueries.length})
          </h4>
          {loadingSaved ? (
            <div className="px-2 py-1 text-xs text-muted-foreground">Loading...</div>
          ) : savedQueries.length === 0 ? (
            <div className="px-2 py-1 text-xs text-muted-foreground">No saved queries</div>
          ) : (
            savedQueries.map((q) => (
              <div key={q.id} className="group relative">
                <button
                  onClick={() => loadQuery(q)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors ${
                    selectedQuery === q.name ? 'bg-muted font-medium' : ''
                  }`}
                >
                  <div className="truncate pr-6">{q.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{q.description}</div>
                </button>
                <button
                  onClick={() => deleteMutation.mutate(q.id)}
                  className="absolute right-1 top-1.5 opacity-0 group-hover:opacity-100 text-xs text-destructive hover:text-destructive/80 p-1"
                >
                  x
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 gap-4">
        {/* Natural Language Input */}
        <Card>
          <CardContent className="p-3">
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Ask a question in natural language... (e.g., 'Show me the top 10 schools by enrollment in California')"
                value={nlInput}
                onChange={(e) => setNlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNlQuery()}
              />
              <Button onClick={handleNlQuery} disabled={isGenerating || !nlInput.trim()} size="sm">
                {isGenerating ? 'Generating...' : 'Ask AI'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* SQL Editor */}
        <Card className="flex-shrink-0">
          <CardHeader className="py-2 px-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">SQL Query</CardTitle>
              <div className="flex gap-2">
                <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!sqlInput.trim()}>
                      Save
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Save Query</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <label className="text-sm font-medium">Name</label>
                        <input
                          className="w-full p-2 border rounded-md mt-1"
                          placeholder="Query name"
                          value={saveName}
                          onChange={(e) => setSaveName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Description</label>
                        <input
                          className="w-full p-2 border rounded-md mt-1"
                          placeholder="What does this query do?"
                          value={saveDescription}
                          onChange={(e) => setSaveDescription(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Tags (comma-separated)</label>
                        <input
                          className="w-full p-2 border rounded-md mt-1"
                          placeholder="enrollment, trends"
                          value={saveTags}
                          onChange={(e) => setSaveTags(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button onClick={handleSave} disabled={!saveName.trim()}>
                        Save
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button onClick={handleExecuteQuery} disabled={isExecuting || !sqlInput.trim()} size="sm">
                  {isExecuting ? 'Running...' : 'Run Query'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 border-t">
            <CodeMirror
              value={sqlInput}
              height="180px"
              theme={oneDark}
              extensions={[sql({ dialect: PostgreSQL })]}
              onChange={onSqlChange}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                foldGutter: false,
              }}
            />
          </CardContent>
        </Card>

        {/* Results */}
        <div className="flex-1 overflow-auto min-h-0">
          {queryError && (
            <Card className="border-destructive">
              <CardContent className="p-4">
                <p className="text-destructive font-mono text-sm">{queryError}</p>
              </CardContent>
            </Card>
          )}

          {queryResult && (
            <Card className="h-full flex flex-col">
              <CardHeader className="py-2 px-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardDescription>
                    {queryResult.rowCount} rows in {queryResult.executionTime}ms
                  </CardDescription>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Download CSV via POST request
                        authFetch(`${API_BASE}/query/execute/csv`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ sql: sqlInput }),
                        })
                          .then(res => res.blob())
                          .then(blob => {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'query_results.csv';
                            a.click();
                            URL.revokeObjectURL(url);
                          });
                      }}
                    >
                      Download CSV
                    </Button>
                    {chartType && chartType !== 'table' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowVisualization(!showVisualization)}
                      >
                        {showVisualization ? 'Show Table' : 'Show Chart'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-3 flex-1 overflow-auto">
                {showVisualization && chartData && chartType === 'trend' && (
                  <div className="h-64 mb-4">
                    <TrendChart
                      data={chartData as { year: number; value: number }[]}
                      dataKey="value"
                      height={250}
                      color="#3b82f6"
                    />
                  </div>
                )}
                {showVisualization && chartData && chartType === 'bar' && (
                  <div className="h-64 mb-4">
                    <BarChart
                      data={chartData as { name: string; value: number }[]}
                      height={250}
                      color="#10b981"
                    />
                  </div>
                )}
                {showVisualization && chartData && chartType === 'pie' && (
                  <div className="h-64 mb-4">
                    <PieChart
                      data={chartData as { name: string; value: number }[]}
                      height={250}
                      showLegend={true}
                    />
                  </div>
                )}

                {(!showVisualization || !chartData || chartType === 'table') && (
                  <div className="overflow-auto max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {queryResult.columns.map((col) => (
                            <TableHead
                              key={col}
                              className="text-xs cursor-pointer hover:bg-muted/50 select-none"
                              onClick={() => handleResultSort(col)}
                            >
                              {col}
                              {resultSortCol === col && (
                                <span className="ml-1">{resultSortDir === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedRows.map((row, idx) => (
                          <TableRow key={idx}>
                            {queryResult.columns.map((col) => (
                              <TableCell key={col} className="font-mono text-xs py-1">
                                {row[col] === null ? (
                                  <span className="text-muted-foreground">NULL</span>
                                ) : col.toLowerCase() === 'unitid' ? (
                                  <Link
                                    to={`/institutions/${row[col]}`}
                                    className="text-primary hover:underline"
                                  >
                                    {String(row[col])}
                                  </Link>
                                ) : (
                                  String(row[col])
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!queryResult && !queryError && (
            <Card className="h-full flex items-center justify-center">
              <CardContent>
                <p className="text-muted-foreground text-center">
                  Select a query from the sidebar or write your own SQL to get started
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
