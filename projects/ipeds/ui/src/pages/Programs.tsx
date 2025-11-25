import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { TrendChart } from '@/components/charts/TrendChart';

const API_BASE = '/api';

interface CipFamily {
  code: string;
  title: string;
  institution_count: number;
  total_completions: number;
}

interface CipChild {
  code: string;
  title: string;
  level: number;
  institution_count: number;
  total_completions: number;
}

interface CipInstitution {
  unitid: number;
  name: string;
  state: string;
  completions: number;
}

interface CipTrend {
  year: number;
  completions: number;
  [key: string]: number;
}

interface CipDetail {
  code: string;
  code_display: string;
  title: string;
  definition: string;
  level: number;
  family: string;
  cross_references: string | null;
  examples: string | null;
  children: CipChild[];
  top_institutions: CipInstitution[];
  trends: CipTrend[];
}

interface SearchResult {
  code: string;
  title: string;
  level: number;
  family: string;
  match_score: number;
}

function formatNumber(num: number | null | undefined): string {
  if (num == null) return '-';
  return num.toLocaleString();
}

function CipFamilyGrid() {
  const { data, isLoading, error } = useQuery<{ data: CipFamily[] }>({
    queryKey: ['cip-families'],
    queryFn: () => fetch(`${API_BASE}/cip`).then(r => r.json()),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading programs...</div>;
  if (error) return <div className="text-destructive">Error loading programs</div>;

  const families = data?.data ?? [];

  // Group into categories for display
  const categories = [
    { name: 'STEM', codes: ['11', '14', '15', '26', '27', '40', '41'] },
    { name: 'Business & Law', codes: ['22', '44', '52'] },
    { name: 'Health', codes: ['51', '60', '61'] },
    { name: 'Arts & Humanities', codes: ['05', '16', '23', '24', '38', '39', '50', '54'] },
    { name: 'Social Sciences', codes: ['42', '45'] },
    { name: 'Education', codes: ['13'] },
    { name: 'Communications', codes: ['09', '10'] },
    { name: 'Agriculture & Environment', codes: ['01', '03'] },
    { name: 'Architecture & Design', codes: ['04'] },
    { name: 'Services & Trades', codes: ['12', '19', '31', '43', '46', '47', '48', '49'] },
  ];

  return (
    <div className="space-y-8">
      {categories.map(cat => {
        const catFamilies = families.filter(f => cat.codes.includes(f.code));
        if (catFamilies.length === 0) return null;

        return (
          <div key={cat.name}>
            <h3 className="text-lg font-semibold mb-3">{cat.name}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {catFamilies.map(family => (
                <Link
                  key={family.code}
                  to={`/programs/${family.code}`}
                  className="block"
                >
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="text-2xl font-bold text-muted-foreground w-10">
                          {family.code}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm line-clamp-2">
                            {family.title}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatNumber(family.institution_count)} schools &middot; {formatNumber(family.total_completions)} completions
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {/* Show any remaining families not in categories */}
      {(() => {
        const categorizedCodes = categories.flatMap(c => c.codes);
        const uncategorized = families.filter(f => !categorizedCodes.includes(f.code) && f.total_completions);
        if (uncategorized.length === 0) return null;

        return (
          <div>
            <h3 className="text-lg font-semibold mb-3">Other</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {uncategorized.map(family => (
                <Link
                  key={family.code}
                  to={`/programs/${family.code}`}
                  className="block"
                >
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="text-2xl font-bold text-muted-foreground w-10">
                          {family.code}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm line-clamp-2">
                            {family.title}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatNumber(family.institution_count)} schools &middot; {formatNumber(family.total_completions)} completions
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function CipSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [inputValue, setInputValue] = useState(query);

  const { data, isLoading } = useQuery<{ data: SearchResult[] }>({
    queryKey: ['cip-search', query],
    queryFn: () => fetch(`${API_BASE}/cip/search?q=${encodeURIComponent(query)}&limit=20`).then(r => r.json()),
    enabled: query.length >= 2,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      setSearchParams({ q: inputValue.trim() });
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Search programs (e.g., computer science, nursing, business)"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          className="flex-1"
        />
        <Button type="submit">Search</Button>
      </form>

      {query && (
        <div>
          {isLoading ? (
            <div className="text-muted-foreground">Searching...</div>
          ) : data?.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead className="w-24">Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map(result => (
                  <TableRow key={result.code}>
                    <TableCell>
                      <Link
                        to={`/programs/${result.code}`}
                        className="font-mono text-blue-600 hover:underline"
                      >
                        {result.code}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/programs/${result.code}`}
                        className="hover:underline"
                      >
                        {result.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {result.level === 2 ? 'Family' : result.level === 4 ? 'Series' : 'Program'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-muted-foreground">No programs found for "{query}"</div>
          )}
        </div>
      )}
    </div>
  );
}

function CipDetailView({ code }: { code: string }) {
  const { data, isLoading, error } = useQuery<{ data: CipDetail }>({
    queryKey: ['cip-detail', code],
    queryFn: () => fetch(`${API_BASE}/cip/${code}`).then(r => r.json()),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading program details...</div>;
  if (error) return <div className="text-destructive">Error loading program</div>;

  const cip = data?.data;
  if (!cip) return <div className="text-destructive">Program not found</div>;

  const levelName = cip.level === 2 ? 'Family' : cip.level === 4 ? 'Series' : 'Program';

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/programs">All Programs</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {cip.level > 2 && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={`/programs/${cip.family}`}>
                    {cip.family}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          {cip.level === 6 && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={`/programs/${cip.code.substring(0, 5)}`}>
                    {cip.code.substring(0, 5)}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{cip.code}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl font-bold text-muted-foreground">{cip.code}</span>
          <span className="text-xs px-2 py-1 bg-muted rounded">{levelName}</span>
        </div>
        <h1 className="text-2xl font-bold">{cip.title}</h1>
        {cip.definition && (
          <p className="text-muted-foreground mt-2 max-w-3xl">{cip.definition}</p>
        )}
        {cip.examples && (
          <p className="text-sm text-muted-foreground mt-2">
            <strong>Examples:</strong> {cip.examples}
          </p>
        )}
      </div>

      {/* Children (subcategories) */}
      {cip.children.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {cip.level === 2 ? 'Program Series' : 'Specific Programs'}
            </CardTitle>
            <CardDescription>
              {cip.children.length} {cip.level === 2 ? 'series' : 'programs'} in this category
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="text-right">Schools</TableHead>
                  <TableHead className="text-right">Completions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cip.children.map(child => (
                  <TableRow key={child.code}>
                    <TableCell>
                      <Link
                        to={`/programs/${child.code}`}
                        className="font-mono text-blue-600 hover:underline"
                      >
                        {child.code}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/programs/${child.code}`}
                        className="hover:underline"
                      >
                        {child.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(child.institution_count)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(child.total_completions)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend chart */}
        {cip.trends.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Completions Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendChart
                data={cip.trends}
                dataKey="completions"
              />
            </CardContent>
          </Card>
        )}

        {/* Top institutions */}
        {cip.top_institutions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top Schools</CardTitle>
              <CardDescription>
                By number of completions (2023)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institution</TableHead>
                    <TableHead className="text-right">Completions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cip.top_institutions.map(inst => (
                    <TableRow key={inst.unitid}>
                      <TableCell>
                        <Link
                          to={`/institutions/${inst.unitid}`}
                          className="text-blue-600 hover:underline"
                        >
                          {inst.name}
                        </Link>
                        <span className="text-muted-foreground ml-1">({inst.state})</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(inst.completions)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4">
                <Link
                  to={`/programs/${cip.code}/institutions`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View all institutions offering this program →
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function Programs() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const isSearching = searchParams.has('q');

  return (
    <div className="space-y-6">
      {!code && (
        <>
          <div>
            <h1 className="text-3xl font-bold mb-2">Academic Programs (CIP Codes)</h1>
            <p className="text-muted-foreground">
              Browse programs by field of study using the Classification of Instructional Programs (CIP).
              Find schools offering specific programs and track completion trends.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Search Programs</CardTitle>
            </CardHeader>
            <CardContent>
              <CipSearch />
            </CardContent>
          </Card>

          {!isSearching && (
            <Card>
              <CardHeader>
                <CardTitle>Browse by Field</CardTitle>
                <CardDescription>
                  Click on a program family to explore subcategories and find schools
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CipFamilyGrid />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {code && <CipDetailView code={code} />}
    </div>
  );
}
