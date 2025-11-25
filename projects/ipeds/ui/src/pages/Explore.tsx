import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InstitutionMap } from '@/components/maps/InstitutionMap';

const API_BASE = '/api';

interface FilterOption {
  value: number | string;
  label: string;
  count?: number;
  states?: string[];
}

interface FiltersData {
  sectors: FilterOption[];
  states: FilterOption[];
  regions: FilterOption[];
  control: FilterOption[];
  level: FilterOption[];
  races: FilterOption[];
  genders: FilterOption[];
  years: Record<string, number[]>;
  counts: { total: number; hbcu: number };
}

interface ExploreFilters {
  sector?: number;
  control?: number;
  level?: number;
  hbcu?: boolean;
  state?: string;
  region?: string;
  year?: number;
  race?: string;
  gender?: 'men' | 'women' | 'total';
  dataType: 'basic' | 'enrollment' | 'admissions' | 'financial' | 'graduation' | 'completions';
}

interface ExploreResult {
  unitid: number;
  name: string;
  city: string;
  state: string;
  sector: number;
  control: number;
  level: number;
  hbcu: boolean;
  latitude: number | null;
  longitude: number | null;
  sector_name: string;
  data_year?: number;
  // Enrollment fields
  total_enrollment?: number;
  undergrad_enrollment?: number;
  grad_enrollment?: number;
  // Admissions fields
  applicants_total?: number;
  admitted_total?: number;
  enrolled_total?: number;
  admit_rate?: number;
  yield_rate?: number;
  sat_math_25?: number;
  sat_math_75?: number;
  sat_verbal_25?: number;
  sat_verbal_75?: number;
  sat_total_avg?: number;
  // Financial fields
  avg_net_price?: number;
  avg_net_price_0_30k?: number;
  pell_recipients?: number;
  pell_pct?: number;
  // Graduation fields
  cohort_size?: number;
  completers_150pct?: number;
  grad_rate?: number;
  // Completions fields
  total_completions?: number;
}

type SortField =
  | 'name' | 'state' | 'city' | 'sector_name'
  | 'total_enrollment' | 'applicants_total' | 'admit_rate' | 'sat_total_avg'
  | 'avg_net_price' | 'avg_net_price_0_30k' | 'pell_pct' | 'pell_recipients'
  | 'grad_rate' | 'yield_rate' | 'total_completions'
  | 'undergrad_enrollment' | 'grad_enrollment' | 'cohort_size';
type SortDir = 'asc' | 'desc';

async function fetchFilters(): Promise<FiltersData> {
  const res = await fetch(`${API_BASE}/explore/filters`);
  if (!res.ok) throw new Error('Failed to load filters');
  return res.json();
}

async function fetchExplore(filters: ExploreFilters, sortBy: string, sortDir: SortDir, limit: number): Promise<{
  data: ExploreResult[];
  meta: { total: number; limit: number; offset: number; filters: ExploreFilters };
}> {
  const params = new URLSearchParams();
  params.set('dataType', filters.dataType);
  params.set('limit', String(limit));
  params.set('sortBy', sortBy);
  params.set('sortDir', sortDir);

  if (filters.sector !== undefined) params.set('sector', String(filters.sector));
  if (filters.control !== undefined) params.set('control', String(filters.control));
  if (filters.level !== undefined) params.set('level', String(filters.level));
  if (filters.hbcu !== undefined) params.set('hbcu', String(filters.hbcu));
  if (filters.state) params.set('state', filters.state);
  if (filters.region) params.set('region', filters.region);
  if (filters.year) params.set('year', String(filters.year));
  if (filters.race) params.set('race', filters.race);
  if (filters.gender) params.set('gender', filters.gender);

  const res = await fetch(`${API_BASE}/explore?${params}`);
  if (!res.ok) throw new Error('Failed to load data');
  return res.json();
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return n.toLocaleString();
}

function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return `${n.toFixed(1)}%`;
}

function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return `$${n.toLocaleString()}`;
}

export default function Explore() {
  const [filters, setFilters] = useState<ExploreFilters>({ dataType: 'basic' });
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [limit, setLimit] = useState(100);
  const [view, setView] = useState<'table' | 'map'>('table');

  // Load filter options
  const { data: filterOptions, isLoading: loadingFilters } = useQuery({
    queryKey: ['explore-filters'],
    queryFn: fetchFilters,
  });

  // Load explore data
  const { data: exploreData, isLoading: loadingData, isFetching: fetchingData } = useQuery({
    queryKey: ['explore', filters, sortBy, sortDir, limit],
    queryFn: () => fetchExplore(filters, sortBy, sortDir, limit),
    enabled: !loadingFilters,
  });

  // Show loading on initial load or when refetching with filter changes
  const showLoading = loadingData || fetchingData;

  const handleFilterChange = (key: keyof ExploreFilters, value: string | undefined) => {
    setFilters(prev => {
      const next = { ...prev };
      if (value === undefined || value === '' || value === 'all') {
        delete next[key];
      } else if (key === 'sector' || key === 'control' || key === 'level' || key === 'year') {
        (next as Record<string, unknown>)[key] = parseInt(value, 10);
      } else if (key === 'hbcu') {
        (next as Record<string, unknown>)[key] = value === 'true';
      } else {
        (next as Record<string, unknown>)[key] = value;
      }
      return next;
    });
  };

  const handleDataTypeChange = (dataType: string) => {
    setFilters(prev => ({
      ...prev,
      dataType: dataType as ExploreFilters['dataType'],
    }));
    // Reset sort when changing data type
    if (dataType === 'enrollment') setSortBy('total_enrollment');
    else if (dataType === 'admissions') setSortBy('admit_rate');
    else if (dataType === 'financial') setSortBy('avg_net_price');
    else if (dataType === 'graduation') setSortBy('grad_rate');
    else if (dataType === 'completions') setSortBy('total_completions');
    else setSortBy('name');
    setSortDir(dataType === 'basic' || dataType === 'admissions' || dataType === 'financial' ? 'asc' : 'desc');
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir(['name', 'state', 'avg_net_price', 'admit_rate'].includes(field) ? 'asc' : 'desc');
    }
  };

  const clearFilters = () => {
    setFilters({ dataType: filters.dataType });
  };

  // Get available years for current data type
  const availableYears = useMemo(() => {
    if (!filterOptions) return [];
    const typeMap: Record<string, string> = {
      enrollment: 'enrollment',
      admissions: 'admissions',
      financial: 'financial',
      graduation: 'graduation',
      completions: 'completions',
    };
    const key = typeMap[filters.dataType];
    return key ? (filterOptions.years[key] || []) : [];
  }, [filterOptions, filters.dataType]);

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50 select-none"
      onClick={() => handleSort(field)}
    >
      {label}
      {sortBy === field && (
        <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
      )}
    </TableHead>
  );

  // Data type specific columns
  const renderDataColumns = (row: ExploreResult) => {
    switch (filters.dataType) {
      case 'enrollment':
        return (
          <>
            <TableCell className="text-right font-mono">{formatNumber(row.total_enrollment)}</TableCell>
            <TableCell className="text-right font-mono">{formatNumber(row.undergrad_enrollment)}</TableCell>
            <TableCell className="text-right font-mono">{formatNumber(row.grad_enrollment)}</TableCell>
          </>
        );
      case 'admissions':
        return (
          <>
            <TableCell className="text-right font-mono">{formatNumber(row.applicants_total)}</TableCell>
            <TableCell className="text-right font-mono">{formatPercent(row.admit_rate)}</TableCell>
            <TableCell className="text-right font-mono">{formatPercent(row.yield_rate)}</TableCell>
            <TableCell className="text-right font-mono">
              {row.sat_math_25 && row.sat_math_75 ? `${row.sat_math_25}-${row.sat_math_75}` : '-'}
            </TableCell>
            <TableCell className="text-right font-mono">
              {row.sat_verbal_25 && row.sat_verbal_75 ? `${row.sat_verbal_25}-${row.sat_verbal_75}` : '-'}
            </TableCell>
          </>
        );
      case 'financial':
        return (
          <>
            <TableCell className="text-right font-mono">{formatCurrency(row.avg_net_price)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(row.avg_net_price_0_30k)}</TableCell>
            <TableCell className="text-right font-mono">{formatNumber(row.pell_recipients)}</TableCell>
            <TableCell className="text-right font-mono">{formatPercent(row.pell_pct ? parseFloat(String(row.pell_pct)) * 100 : null)}</TableCell>
          </>
        );
      case 'graduation':
        return (
          <>
            <TableCell className="text-right font-mono">{formatNumber(row.cohort_size)}</TableCell>
            <TableCell className="text-right font-mono">{formatNumber(row.completers_150pct)}</TableCell>
            <TableCell className="text-right font-mono">{formatPercent(row.grad_rate)}</TableCell>
          </>
        );
      case 'completions':
        return (
          <>
            <TableCell className="text-right font-mono">{formatNumber(row.total_completions)}</TableCell>
          </>
        );
      default: // basic - comprehensive view
        return (
          <>
            <TableCell className="text-right font-mono">{formatNumber(row.total_enrollment)}</TableCell>
            <TableCell className="text-right font-mono">{formatPercent(row.admit_rate)}</TableCell>
            <TableCell className="text-right font-mono">{formatNumber(row.sat_total_avg)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(row.avg_net_price)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(row.avg_net_price_0_30k)}</TableCell>
            <TableCell className="text-right font-mono">{formatPercent(row.pell_pct ? parseFloat(String(row.pell_pct)) * 100 : null)}</TableCell>
            <TableCell className="text-right font-mono">{formatPercent(row.grad_rate)}</TableCell>
          </>
        );
    }
  };

  const renderDataHeaders = () => {
    switch (filters.dataType) {
      case 'enrollment':
        return (
          <>
            <SortHeader field="total_enrollment" label="Total Enroll" />
            <SortHeader field="undergrad_enrollment" label="Undergrad" />
            <SortHeader field="grad_enrollment" label="Graduate" />
          </>
        );
      case 'admissions':
        return (
          <>
            <SortHeader field="applicants_total" label="Applicants" />
            <SortHeader field="admit_rate" label="Admit %" />
            <SortHeader field="yield_rate" label="Yield %" />
            <TableHead className="text-right">SAT Math</TableHead>
            <TableHead className="text-right">SAT Verbal</TableHead>
          </>
        );
      case 'financial':
        return (
          <>
            <SortHeader field="avg_net_price" label="Net Price" />
            <SortHeader field="avg_net_price_0_30k" label="Net (0-30k)" />
            <SortHeader field="pell_recipients" label="Pell #" />
            <SortHeader field="pell_pct" label="Pell %" />
          </>
        );
      case 'graduation':
        return (
          <>
            <SortHeader field="cohort_size" label="Cohort" />
            <TableHead className="text-right">Completers</TableHead>
            <SortHeader field="grad_rate" label="Grad Rate" />
          </>
        );
      case 'completions':
        return (
          <>
            <SortHeader field="total_completions" label="Completions" />
          </>
        );
      default: // basic - comprehensive view
        return (
          <>
            <SortHeader field="total_enrollment" label="Enrollment" />
            <SortHeader field="admit_rate" label="Admit %" />
            <SortHeader field="sat_total_avg" label="SAT Avg" />
            <SortHeader field="avg_net_price" label="Net Price" />
            <SortHeader field="avg_net_price_0_30k" label="Net (0-30k)" />
            <SortHeader field="pell_pct" label="Pell %" />
            <SortHeader field="grad_rate" label="Grad %" />
          </>
        );
    }
  };

  const hasActiveFilters = Object.keys(filters).some(k => k !== 'dataType' && filters[k as keyof ExploreFilters] !== undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Data Explorer</h1>
        <p className="text-muted-foreground">
          Explore aggregate data across institutions with filtering, sorting, and visualization.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filters</CardTitle>
          <CardDescription>
            Filter institutions by type, location, and view different data metrics.
            {exploreData && (
              <span className="ml-2 font-medium text-foreground">
                {exploreData.meta.total.toLocaleString()} institutions
                {filters.dataType !== 'basic' && exploreData.data[0]?.data_year && (
                  <span className="text-muted-foreground"> (Year: {exploreData.data[0].data_year})</span>
                )}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {/* Data Type */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Data Type</label>
              <Select value={filters.dataType} onValueChange={handleDataTypeChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Overview (All Key Metrics)</SelectItem>
                  <SelectItem value="enrollment">Enrollment Details</SelectItem>
                  <SelectItem value="admissions">Admissions Details</SelectItem>
                  <SelectItem value="financial">Financial Aid Details</SelectItem>
                  <SelectItem value="graduation">Graduation Details</SelectItem>
                  <SelectItem value="completions">Completions Details</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Year (only for non-basic data types) */}
            {filters.dataType !== 'basic' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Year</label>
                <Select
                  value={filters.year?.toString() ?? 'latest'}
                  onValueChange={(v) => handleFilterChange('year', v === 'latest' ? undefined : v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">Latest Available</SelectItem>
                    {availableYears.slice().reverse().map(y => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Race (only for enrollment and completions) */}
            {(filters.dataType === 'enrollment' || filters.dataType === 'completions') && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Race/Ethnicity</label>
                <Select
                  value={filters.race ?? 'APTS'}
                  onValueChange={(v) => handleFilterChange('race', v === 'APTS' ? undefined : v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {filterOptions?.races.map(r => (
                      <SelectItem key={r.value} value={r.value.toString()}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Gender (only for enrollment and completions) */}
            {(filters.dataType === 'enrollment' || filters.dataType === 'completions') && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Gender</label>
                <Select
                  value={filters.gender ?? 'total'}
                  onValueChange={(v) => handleFilterChange('gender', v === 'total' ? undefined : v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {filterOptions?.genders.map(g => (
                      <SelectItem key={g.value} value={g.value.toString()}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Sector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Sector</label>
              <Select
                value={filters.sector?.toString() ?? 'all'}
                onValueChange={(v) => handleFilterChange('sector', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sectors</SelectItem>
                  {filterOptions?.sectors.map(s => (
                    <SelectItem key={s.value} value={s.value.toString()}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Control */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Control</label>
              <Select
                value={filters.control?.toString() ?? 'all'}
                onValueChange={(v) => handleFilterChange('control', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {filterOptions?.control.map(c => (
                    <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Level */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Level</label>
              <Select
                value={filters.level?.toString() ?? 'all'}
                onValueChange={(v) => handleFilterChange('level', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  {filterOptions?.level.map(l => (
                    <SelectItem key={l.value} value={l.value.toString()}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Region */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Region</label>
              <Select
                value={filters.region ?? 'all'}
                onValueChange={(v) => handleFilterChange('region', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  {filterOptions?.regions.map(r => (
                    <SelectItem key={r.value} value={r.value.toString()}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* State */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">State</label>
              <Select
                value={filters.state ?? 'all'}
                onValueChange={(v) => handleFilterChange('state', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {filterOptions?.states.map(s => (
                    <SelectItem key={s.value} value={s.value.toString()}>
                      {s.label} ({s.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* HBCU */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">HBCU</label>
              <Select
                value={filters.hbcu === undefined ? 'all' : filters.hbcu.toString()}
                onValueChange={(v) => handleFilterChange('hbcu', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Institutions</SelectItem>
                  <SelectItem value="true">HBCUs Only{filterOptions?.counts.hbcu ? ` (${filterOptions.counts.hbcu})` : ''}</SelectItem>
                  <SelectItem value="false">Non-HBCUs Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Result Limit */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Show</label>
              <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v, 10))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 results</SelectItem>
                  <SelectItem value="100">100 results</SelectItem>
                  <SelectItem value="250">250 results</SelectItem>
                  <SelectItem value="500">500 results</SelectItem>
                  <SelectItem value="1000">1000 results</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-3 pt-3 border-t flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {filters.sector !== undefined && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                  Sector: {filterOptions?.sectors.find(s => s.value === filters.sector)?.label}
                </span>
              )}
              {filters.control !== undefined && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                  {filterOptions?.control.find(c => c.value === filters.control)?.label}
                </span>
              )}
              {filters.level !== undefined && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                  {filterOptions?.level.find(l => l.value === filters.level)?.label}
                </span>
              )}
              {filters.region && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                  {filters.region.charAt(0).toUpperCase() + filters.region.slice(1)}
                </span>
              )}
              {filters.state && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                  {filters.state}
                </span>
              )}
              {filters.hbcu !== undefined && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                  {filters.hbcu ? 'HBCU' : 'Non-HBCU'}
                </span>
              )}
              {filters.year && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                  Year: {filters.year}
                </span>
              )}
              {filters.race && filters.race !== 'APTS' && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                  {filterOptions?.races.find(r => r.value === filters.race)?.label}
                </span>
              )}
              {filters.gender && filters.gender !== 'total' && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                  {filterOptions?.genders.find(g => g.value === filters.gender)?.label}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={clearFilters}>Clear all</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Toggle */}
      <Tabs value={view} onValueChange={(v) => setView(v as 'table' | 'map')}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="table">Table View</TabsTrigger>
            <TabsTrigger value="map">Map View</TabsTrigger>
          </TabsList>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const params = new URLSearchParams();
              if (filters.sector !== undefined) params.set('sector', String(filters.sector));
              if (filters.control !== undefined) params.set('control', String(filters.control));
              if (filters.level !== undefined) params.set('level', String(filters.level));
              if (filters.hbcu !== undefined) params.set('hbcu', String(filters.hbcu));
              if (filters.state) params.set('state', filters.state);
              if (filters.region) params.set('region', filters.region);
              if (filters.year) params.set('year', String(filters.year));
              if (filters.race) params.set('race', filters.race);
              if (filters.gender) params.set('gender', filters.gender);
              params.set('limit', '10000');

              const url = `${API_BASE}/explore/csv?${params}`;
              const a = document.createElement('a');
              a.href = url;
              a.download = 'ipeds_data.csv';
              a.click();
            }}
            disabled={!exploreData?.data.length}
          >
            Download CSV
          </Button>
        </div>

        <TabsContent value="table" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {showLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2" />
                  Loading data...
                </div>
              ) : !exploreData?.data.length ? (
                <div className="p-8 text-center text-muted-foreground">No institutions found matching filters.</div>
              ) : (
                <div className="overflow-auto max-h-[600px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <SortHeader field="name" label="Institution" />
                        <SortHeader field="state" label="State" />
                        <TableHead>Sector</TableHead>
                        {renderDataHeaders()}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exploreData.data.map((row) => (
                        <TableRow key={row.unitid}>
                          <TableCell>
                            <Link
                              to={`/institutions/${row.unitid}`}
                              className="font-medium hover:underline"
                            >
                              {row.name}
                            </Link>
                            <div className="text-xs text-muted-foreground">{row.city}</div>
                          </TableCell>
                          <TableCell>{row.state}</TableCell>
                          <TableCell className="text-xs">{row.sector_name}</TableCell>
                          {renderDataColumns(row)}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {loadingData ? (
                <div className="h-[500px] flex items-center justify-center text-muted-foreground">
                  Loading map data...
                </div>
              ) : !exploreData?.data.length ? (
                <div className="h-[500px] flex items-center justify-center text-muted-foreground">
                  No institutions found matching filters.
                </div>
              ) : (
                <>
                  <div className="mb-2 text-sm text-muted-foreground">
                    Showing {exploreData.data.filter(i => i.latitude && i.longitude).length} institutions with location data
                  </div>
                  <InstitutionMap
                    institutions={exploreData.data}
                    height={500}
                    zoom={4}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
