import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

const API_BASE = '/api'; // Data Dictionary API

interface ColumnInfo {
  type: string;
  description: string;
  example?: string;
  values?: Record<string, string>;
  joinTo?: string;
}

interface SuggestedQuery {
  description: string;
  sql: string;
}

interface TableInfo {
  description: string;
  rowCount?: string;
  years?: string;
  updateFrequency?: string;
  primaryKey?: string;
  columns?: Record<string, ColumnInfo>;
  suggestedQueries?: SuggestedQuery[];
  applications?: string[];
  notes?: string[];
  cipFamilies?: Record<string, string>;
}

interface SpecialFeature {
  name: string;
  description: string;
  examples: Array<{ description: string; sql: string }>;
  vectorDimensions?: string[];
  coordinates?: Record<string, { lat: number; lng: number }>;
}

interface DataDictionary {
  tables: Record<string, TableInfo>;
  specialFeatures: Record<string, SpecialFeature>;
  historicData: {
    description: string;
    tables: Record<string, { years: string; columns: string }>;
    notes: string[];
  };
}

interface SearchResult {
  type: 'table' | 'column';
  name?: string;
  table?: string;
  column?: string;
  description: string;
  dataType?: string;
}

interface DbStats {
  tableCounts: Array<{ table_name: string; row_count: number }>;
  yearRanges: Array<{ tbl: string; min_year: number; max_year: number }>;
  timestamp: string;
}

function formatNumber(num: number | null | undefined): string {
  if (num == null) return '-';
  return num.toLocaleString();
}

function AskQuestion() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const mutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch(`${API_BASE}/dictionary/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Failed to get answer');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setAnswer(data.answer);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim()) {
      mutation.mutate(question);
    }
  };

  const exampleQuestions = [
    'What data does IPEDS have about college affordability?',
    'How can I find the most selective colleges?',
    'What is the difference between admissions and enrollment data?',
    'How do I analyze graduation rate equity gaps?',
    'What CIP codes are related to computer science?',
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask About the Data</CardTitle>
        <CardDescription>
          Ask questions about the IPEDS database schema, what data is available, and how to analyze it
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder="e.g., How can I find schools with high graduation rates for low-income students?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Thinking...' : 'Ask'}
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          {exampleQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => {
                setQuestion(q);
                mutation.mutate(q);
              }}
              className="text-xs text-muted-foreground hover:text-foreground bg-muted px-2 py-1 rounded transition-colors"
            >
              {q}
            </button>
          ))}
        </div>

        {mutation.isError && (
          <div className="text-destructive text-sm">
            Error: {mutation.error.message}
          </div>
        )}

        {answer && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Answer:</h4>
            <div className="prose prose-sm max-w-none prose-neutral prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-pre:bg-background prose-pre:border prose-code:bg-background prose-code:text-foreground prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
              <Markdown>{answer}</Markdown>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TableOverview() {
  const { data, isLoading, error } = useQuery<DataDictionary>({
    queryKey: ['dictionary'],
    queryFn: () => fetch(`${API_BASE}/dictionary`).then((r) => r.json()),
  });

  const { data: stats } = useQuery<DbStats>({
    queryKey: ['dictionary-stats'],
    queryFn: () => fetch(`${API_BASE}/dictionary/stats`).then((r) => r.json()),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  if (error) return <div className="text-destructive">Error loading dictionary</div>;
  if (!data) return null;

  const mainTables = ['institution', 'admissions', 'enrollment', 'graduation_rates', 'completions', 'financial_aid'];
  const refTables = ['ref_cip', 'ref_sector', 'ref_race'];

  const getRowCount = (tableName: string) => {
    const stat = stats?.tableCounts.find((s) => s.table_name === tableName);
    return stat ? formatNumber(stat.row_count) : data.tables[tableName]?.rowCount || '-';
  };

  const getYearRange = (tableName: string) => {
    const range = stats?.yearRanges.find((r) => r.tbl === tableName);
    if (range) return `${range.min_year}-${range.max_year}`;
    return data.tables[tableName]?.years || '-';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Main Data Tables</CardTitle>
          <CardDescription>Core IPEDS datasets with annual updates</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead>Years</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mainTables.map((name) => (
                <TableRow key={name}>
                  <TableCell className="font-mono font-medium">{name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {data.tables[name]?.description}
                  </TableCell>
                  <TableCell className="text-right">{getRowCount(name)}</TableCell>
                  <TableCell>{getYearRange(name)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reference Tables</CardTitle>
          <CardDescription>Lookup tables for codes and categories</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refTables.map((name) => (
                <TableRow key={name}>
                  <TableCell className="font-mono font-medium">{name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {data.tables[name]?.description}
                  </TableCell>
                  <TableCell className="text-right">{getRowCount(name)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TableDetail({ tableName }: { tableName: string }) {
  const { data, isLoading, error } = useQuery<TableInfo & { name: string }>({
    queryKey: ['dictionary-table', tableName],
    queryFn: () => fetch(`${API_BASE}/dictionary/tables/${tableName}`).then((r) => r.json()),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  if (error) return <div className="text-destructive">Error loading table info</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-mono">{data.name}</h2>
        <p className="text-muted-foreground mt-1">{data.description}</p>
        <div className="flex gap-4 mt-2 text-sm">
          {data.rowCount && <span>Rows: {data.rowCount}</span>}
          {data.years && <span>Years: {data.years}</span>}
          {data.primaryKey && <span>Key: {data.primaryKey}</span>}
        </div>
      </div>

      {data.columns && (
        <Card>
          <CardHeader>
            <CardTitle>Columns</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Column</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Example/Values</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(data.columns).map(([name, col]) => (
                  <TableRow key={name}>
                    <TableCell className="font-mono font-medium">{name}</TableCell>
                    <TableCell className="font-mono text-xs">{col.type}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {col.description}
                      {col.joinTo && (
                        <Badge variant="outline" className="ml-2">
                          FK: {col.joinTo}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {col.values ? (
                        <div className="max-h-24 overflow-y-auto">
                          {Object.entries(col.values).map(([k, v]) => (
                            <div key={k} className="text-xs">
                              <span className="font-mono">{k}</span>: {v}
                            </div>
                          ))}
                        </div>
                      ) : (
                        col.example
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.suggestedQueries && data.suggestedQueries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Example Queries</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              {data.suggestedQueries.map((q, i) => (
                <AccordionItem key={i} value={`query-${i}`}>
                  <AccordionTrigger>{q.description}</AccordionTrigger>
                  <AccordionContent>
                    <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                      {q.sql}
                    </pre>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {data.applications && data.applications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Application Ideas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              {data.applications.map((app, i) => (
                <li key={i}>{app}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.notes && data.notes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Important Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.notes.map((note, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-yellow-500">!</span>
                  <span className="text-sm">{note}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.cipFamilies && (
        <Card>
          <CardHeader>
            <CardTitle>CIP Code Families</CardTitle>
            <CardDescription>2-digit program family codes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
              {Object.entries(data.cipFamilies).map(([code, title]) => (
                <div key={code} className="flex gap-2">
                  <span className="font-mono font-medium">{code}</span>
                  <span className="text-muted-foreground truncate">{title}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SpecialFeatures() {
  const { data, isLoading, error } = useQuery<DataDictionary>({
    queryKey: ['dictionary'],
    queryFn: () => fetch(`${API_BASE}/dictionary`).then((r) => r.json()),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  if (error) return <div className="text-destructive">Error loading</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {Object.entries(data.specialFeatures).map(([key, feature]) => (
        <Card key={key}>
          <CardHeader>
            <CardTitle>{feature.name}</CardTitle>
            <CardDescription>{feature.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {feature.vectorDimensions && (
              <div>
                <h4 className="font-medium mb-2">Vector Dimensions (10D):</h4>
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                  {feature.vectorDimensions.map((dim, i) => (
                    <li key={i}>{dim}</li>
                  ))}
                </ol>
              </div>
            )}

            {feature.coordinates && (
              <div>
                <h4 className="font-medium mb-2">Reference Coordinates:</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  {Object.entries(feature.coordinates).map(([city, coords]) => (
                    <div key={city}>
                      <span className="font-medium">{city}:</span>{' '}
                      <span className="text-muted-foreground font-mono text-xs">
                        {coords.lat}, {coords.lng}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {feature.examples.map((ex, i) => (
              <div key={i}>
                <h4 className="font-medium mb-1">{ex.description}</h4>
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                  {ex.sql}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Historic Data (1980-2008)</CardTitle>
          <CardDescription>{data.historicData.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead>Years</TableHead>
                <TableHead>Key Columns</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(data.historicData.tables).map(([name, info]) => (
                <TableRow key={name}>
                  <TableCell className="font-mono">{name}</TableCell>
                  <TableCell>{info.years}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {info.columns}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div>
            <h4 className="font-medium mb-2">Notes:</h4>
            <ul className="space-y-1">
              {data.historicData.notes.map((note, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-yellow-500">!</span>
                  <span className="text-muted-foreground">{note}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SearchDictionary() {
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading } = useQuery<{ query: string; results: SearchResult[] }>({
    queryKey: ['dictionary-search', searchQuery],
    queryFn: () =>
      fetch(`${API_BASE}/dictionary/search?q=${encodeURIComponent(searchQuery)}`).then((r) =>
        r.json()
      ),
    enabled: searchQuery.length >= 2,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(query.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search Data Dictionary</CardTitle>
        <CardDescription>Find tables and columns by name or description</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search tables, columns, descriptions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <Button type="submit">Search</Button>
        </form>

        {isLoading && <div className="text-muted-foreground">Searching...</div>}

        {data?.results && data.results.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.results.map((result, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Badge variant={result.type === 'table' ? 'default' : 'secondary'}>
                      {result.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">
                    {result.type === 'table' ? result.name : `${result.table}.${result.column}`}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {result.description}
                    {result.dataType && (
                      <span className="ml-2 font-mono text-xs">({result.dataType})</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {searchQuery && data?.results?.length === 0 && (
          <div className="text-muted-foreground">No results found for "{searchQuery}"</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dictionary() {
  usePageTitle('Data Dictionary');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const tables = [
    'institution',
    'admissions',
    'enrollment',
    'graduation_rates',
    'completions',
    'financial_aid',
    'ref_cip',
    'ref_sector',
    'ref_race',
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Data Dictionary</h1>
        <p className="text-muted-foreground">
          Explore the IPEDS database schema, understand what data is available, and learn how to
          query it effectively.
        </p>
      </div>

      <Tabs defaultValue="ask" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ask">Ask Questions</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tables">Table Details</TabsTrigger>
          <TabsTrigger value="features">Special Features</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
        </TabsList>

        <TabsContent value="ask">
          <AskQuestion />
        </TabsContent>

        <TabsContent value="overview">
          <TableOverview />
        </TabsContent>

        <TabsContent value="tables" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {tables.map((t) => (
              <Button
                key={t}
                variant={selectedTable === t ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedTable(t)}
                className="font-mono"
              >
                {t}
              </Button>
            ))}
          </div>
          {selectedTable ? (
            <TableDetail tableName={selectedTable} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Select a table above to view its detailed schema
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="features">
          <SpecialFeatures />
        </TabsContent>

        <TabsContent value="search">
          <SearchDictionary />
        </TabsContent>
      </Tabs>
    </div>
  );
}
