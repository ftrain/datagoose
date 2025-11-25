import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    name: 'Top 20 Most Selective Institutions',
    description: 'Institutions with the lowest admission rates in the most recent year',
    sql: `SELECT i.unitid, i.name, i.state, a.year,
  a.applicants_total, a.admitted_total,
  ROUND(a.admitted_total::numeric / NULLIF(a.applicants_total, 0) * 100, 2) as admit_rate_pct
FROM institution i
JOIN admissions a ON i.unitid = a.unitid
WHERE a.year = (SELECT MAX(year) FROM admissions)
  AND a.applicants_total > 1000
ORDER BY admit_rate_pct ASC
LIMIT 20;`,
    tags: ['admissions', 'selectivity', 'rankings'],
  },
  {
    name: 'Largest HBCUs by Enrollment',
    description: 'Historically Black Colleges and Universities ranked by total enrollment',
    sql: `SELECT i.unitid, i.name, i.city, i.state,
  e.year, SUM(e.total) as total_enrollment
FROM institution i
JOIN enrollment e ON i.unitid = e.unitid
WHERE i.hbcu = true
  AND e.year = (SELECT MAX(year) FROM enrollment)
GROUP BY i.unitid, i.name, i.city, i.state, e.year
ORDER BY total_enrollment DESC
LIMIT 20;`,
    tags: ['hbcu', 'enrollment', 'demographics'],
  },
  {
    name: 'Highest Graduation Rates',
    description: 'Institutions with the best 6-year graduation rates',
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
    tags: ['graduation', 'outcomes', 'rankings'],
  },
  {
    name: 'Most Affordable Private Universities',
    description: 'Private institutions with the lowest average net price for low-income students',
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
    tags: ['financial', 'affordability', 'private'],
  },
  {
    name: 'High Pell Grant Institutions',
    description: 'Institutions serving the highest percentage of Pell Grant recipients',
    sql: `SELECT i.unitid, i.name, i.state, i.sector,
  f.year, f.pell_recipients, f.pell_pct,
  f.avg_net_price
FROM institution i
JOIN financial_aid f ON i.unitid = f.unitid
JOIN ref_sector rs ON i.sector = rs.code
WHERE f.year = (SELECT MAX(year) FROM financial_aid)
  AND f.pell_recipients >= 500
ORDER BY f.pell_pct DESC
LIMIT 20;`,
    tags: ['financial', 'pell', 'access'],
  },
  {
    name: 'Computer Science Degrees by State',
    description: 'Total CS completions by state in the most recent year',
    sql: `SELECT i.state,
  COUNT(DISTINCT i.unitid) as num_institutions,
  SUM(c.count) as total_completions
FROM institution i
JOIN completions c ON i.unitid = c.unitid
WHERE c.cip_code LIKE '11%'  -- Computer Science
  AND c.year = (SELECT MAX(year) FROM completions)
GROUP BY i.state
ORDER BY total_completions DESC
LIMIT 20;`,
    tags: ['completions', 'stem', 'geography'],
  },
  {
    name: 'Enrollment Trends (National)',
    description: 'Total higher education enrollment by year',
    sql: `SELECT year, SUM(total) as total_enrollment,
  COUNT(DISTINCT unitid) as num_institutions
FROM enrollment
GROUP BY year
ORDER BY year;`,
    tags: ['enrollment', 'trends', 'national'],
  },
  {
    name: 'Institutions Near Location',
    description: 'Colleges within 25 miles of a coordinate (example: NYC)',
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
    40234  -- 25 miles in meters
  )
ORDER BY miles_away
LIMIT 20;`,
    tags: ['geographic', 'postgis', 'location'],
  },
  {
    name: 'Similar Institutions (Vector Search)',
    description: 'Find institutions similar to Harvard using feature vectors',
    sql: `SELECT target.name as base_institution,
  i.unitid, i.name, i.city, i.state,
  ROUND((1 - (i.feature_vector <=> target.feature_vector))::numeric * 100, 2) as similarity_pct
FROM institution i,
  (SELECT name, feature_vector FROM institution WHERE unitid = 166027) target
WHERE i.feature_vector IS NOT NULL
  AND i.unitid != 166027
ORDER BY i.feature_vector <=> target.feature_vector
LIMIT 10;`,
    tags: ['vector', 'similarity', 'pgvector'],
  },
  {
    name: 'Fuzzy Name Search',
    description: 'Search for institutions by name using trigram similarity',
    sql: `SELECT unitid, name, city, state,
  similarity(name, 'Stanford') as sim_score
FROM institution
WHERE name % 'Stanford'
ORDER BY sim_score DESC
LIMIT 10;`,
    tags: ['search', 'trigram', 'fuzzy'],
  },
];

async function executeQuery(sql: string): Promise<QueryResult> {
  const res = await fetch(`${API_BASE}/query/execute`, {
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

async function getSavedQueries(): Promise<SavedQuery[]> {
  const res = await fetch(`${API_BASE}/query/saved`);
  if (!res.ok) {
    throw new Error('Failed to load saved queries');
  }
  const data = await res.json();
  return data.data || [];
}

async function saveQuery(query: { name: string; description: string; sql: string; tags: string[] }): Promise<SavedQuery> {
  const res = await fetch(`${API_BASE}/query/saved`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!res.ok) {
    throw new Error('Failed to save query');
  }
  return res.json();
}

async function deleteQuery(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/query/saved/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error('Failed to delete query');
  }
}

export default function Queries() {
  const queryClient = useQueryClient();
  const [sqlInput, setSqlInput] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>('all');

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
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsExecuting(false);
    }
  };

  const loadQuery = (sql: string) => {
    setSqlInput(sql);
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

  // Combine preset and saved queries
  const allQueries: (SavedQuery | typeof PRESET_QUERIES[0] & { id?: number })[] = [
    ...PRESET_QUERIES,
    ...savedQueries,
  ];

  // Get unique tags
  const allTags = [...new Set(allQueries.flatMap(q => q.tags))].sort();

  // Filter queries by tag
  const filteredQueries = selectedTag === 'all'
    ? allQueries
    : allQueries.filter(q => q.tags.includes(selectedTag));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Query Explorer</h1>
        <p className="text-muted-foreground">
          Run SQL queries against the IPEDS database. Use preset queries or write your own.
        </p>
      </div>

      <Tabs defaultValue="editor">
        <TabsList>
          <TabsTrigger value="editor">Query Editor</TabsTrigger>
          <TabsTrigger value="presets">Preset Queries</TabsTrigger>
          <TabsTrigger value="saved">Saved Queries ({savedQueries.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>SQL Query</CardTitle>
              <CardDescription>
                Write and execute SQL queries. Results are limited to 1000 rows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                className="w-full h-64 p-3 font-mono text-sm border rounded-md bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="SELECT * FROM institution LIMIT 10;"
                value={sqlInput}
                onChange={(e) => setSqlInput(e.target.value)}
              />
              <div className="flex gap-2">
                <Button onClick={handleExecuteQuery} disabled={isExecuting || !sqlInput.trim()}>
                  {isExecuting ? 'Executing...' : 'Run Query'}
                </Button>
                <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" disabled={!sqlInput.trim()}>Save Query</Button>
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
                <Button variant="ghost" onClick={() => setSqlInput('')}>Clear</Button>
              </div>
            </CardContent>
          </Card>

          {/* Query Results */}
          {queryError && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-destructive font-mono text-sm">{queryError}</p>
              </CardContent>
            </Card>
          )}

          {queryResult && (
            <Card>
              <CardHeader>
                <CardTitle>Results</CardTitle>
                <CardDescription>
                  {queryResult.rowCount} rows returned in {queryResult.executionTime}ms
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {queryResult.columns.map((col) => (
                          <TableHead key={col}>{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queryResult.rows.map((row, idx) => (
                        <TableRow key={idx}>
                          {queryResult.columns.map((col) => (
                            <TableCell key={col} className="font-mono text-xs">
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
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="presets" className="space-y-4 pt-4">
          <div className="flex items-center gap-4 mb-4">
            <span className="text-sm font-medium">Filter by tag:</span>
            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {allTags.map(tag => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {filteredQueries.filter(q => !('id' in q)).map((query, idx) => (
              <Card key={idx}>
                <CardHeader>
                  <CardTitle className="text-base">{query.name}</CardTitle>
                  <CardDescription>{query.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {query.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 bg-muted text-xs rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-32 mb-3">
                    {query.sql}
                  </pre>
                  <Button size="sm" onClick={() => loadQuery(query.sql)}>
                    Load Query
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="saved" className="space-y-4 pt-4">
          {loadingSaved ? (
            <p className="text-muted-foreground">Loading saved queries...</p>
          ) : savedQueries.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-center">
                  No saved queries yet. Write a query and click "Save Query" to save it.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {savedQueries.map((query) => (
                <Card key={query.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{query.name}</CardTitle>
                    <CardDescription>{query.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {query.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-muted text-xs rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-32 mb-3">
                      {query.sql}
                    </pre>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => loadQuery(query.sql)}>
                        Load
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteMutation.mutate(query.id)}
                      >
                        Delete
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Created: {new Date(query.created_at).toLocaleDateString()}
                      {query.run_count > 0 && ` | Runs: ${query.run_count}`}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
