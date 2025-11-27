import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
} from '@/components/ui/dialog';
import { TrendChart, BarChart, PieChart } from '@/components/charts';
import { InstitutionMap } from '@/components/maps';

const SECTORS: Record<number, string> = {
  1: 'Public, 4-year or above',
  2: 'Private nonprofit, 4-year or above',
  3: 'Private for-profit, 4-year or above',
  4: 'Public, 2-year',
  5: 'Private nonprofit, 2-year',
  6: 'Private for-profit, 2-year',
  7: 'Public, less than 2-year',
  8: 'Private nonprofit, less than 2-year',
  9: 'Private for-profit, less than 2-year',
};

const CONTROL: Record<number, string> = {
  1: 'Public',
  2: 'Private nonprofit',
  3: 'Private for-profit',
};

const LEVEL: Record<number, string> = {
  1: 'Four or more years',
  2: 'At least 2 but less than 4 years',
  3: 'Less than 2 years',
};

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return `$${value.toLocaleString()}`;
}

function formatPercent(value: string | number | null | undefined): string {
  if (value == null) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return `${(num * 100).toFixed(1)}%`;
}

function formatNumber(value: number | string | null | undefined): string {
  if (value == null) return '-';
  const num = typeof value === 'string' ? parseInt(value) : value;
  if (isNaN(num)) return '-';
  return num.toLocaleString();
}

// Historical data drill-down component
function HistoricalDrillDown({
  title,
  data,
  columns,
  trigger
}: {
  title: string;
  data: any[] | undefined;
  columns: { key: string; label: string; format?: (v: any) => string }[];
  trigger: React.ReactNode;
}) {
  if (!data?.length) return <>{trigger}</>;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="hover:underline cursor-pointer text-left">
          {trigger}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{title} - Historical Data</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(col => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice().reverse().map((row, idx) => (
              <TableRow key={idx}>
                {columns.map(col => (
                  <TableCell key={col.key}>
                    {col.format ? col.format(row[col.key]) : row[col.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

// Clickable stat card that shows historical data
function StatCard({
  title,
  value,
  subtitle,
  historicalData,
  historicalColumns,
  historicalTitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
  historicalData?: any[];
  historicalColumns?: { key: string; label: string; format?: (v: any) => string }[];
  historicalTitle?: string;
}) {
  const content = (
    <Card className={historicalData?.length ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );

  if (historicalData?.length && historicalColumns) {
    return (
      <HistoricalDrillDown
        title={historicalTitle || title}
        data={historicalData}
        columns={historicalColumns}
        trigger={content}
      />
    );
  }

  return content;
}

export default function Institution() {
  const { unitid } = useParams<{ unitid: string }>();
  const id = parseInt(unitid || '0');
  const navigate = useNavigate();

  // Core institution data - fetch first for page title
  const { data: institution, isLoading: instLoading } = useQuery({
    queryKey: ['institution', id],
    queryFn: () => api.getInstitution(id),
    enabled: !!id,
  });

  // Dynamic page title based on institution name
  usePageTitle(institution?.data?.name || 'Institution');

  // Year selectors for different data types
  const [enrollmentYear, setEnrollmentYear] = useState('2023');
  const [completionsYear, setCompletionsYear] = useState('2023');

  // Admissions data
  const { data: admissions } = useQuery({
    queryKey: ['admissions-trends', id],
    queryFn: () => api.getAdmissionsTrends(id),
    enabled: !!id,
  });

  // Enrollment data
  const { data: enrollmentTrends } = useQuery({
    queryKey: ['enrollment-trends', id],
    queryFn: () => api.getEnrollmentTrends(id),
    enabled: !!id,
  });

  const { data: enrollmentByRace } = useQuery({
    queryKey: ['enrollment-by-race', id, enrollmentYear],
    queryFn: () => api.getEnrollmentByRace(id, parseInt(enrollmentYear)),
    enabled: !!id,
  });

  const { data: enrollmentByLevel } = useQuery({
    queryKey: ['enrollment-by-level', id, enrollmentYear],
    queryFn: () => api.getEnrollmentByLevel(id, parseInt(enrollmentYear)),
    enabled: !!id,
  });

  const { data: enrollmentByGender } = useQuery({
    queryKey: ['enrollment-by-gender', id, enrollmentYear],
    queryFn: () => api.getEnrollmentByGender(id, parseInt(enrollmentYear)),
    enabled: !!id,
  });

  // Graduation data
  const { data: graduation } = useQuery({
    queryKey: ['graduation-rates', id],
    queryFn: () => api.getGraduationRates(id),
    enabled: !!id,
  });

  const { data: graduationByRace } = useQuery({
    queryKey: ['graduation-by-race', id],
    queryFn: () => api.getGraduationByRace(id),
    enabled: !!id,
  });

  // Financial data
  const { data: financial } = useQuery({
    queryKey: ['financial-trends', id],
    queryFn: () => api.getFinancialTrends(id),
    enabled: !!id,
  });

  // Completions data
  const { data: completionsTrends } = useQuery({
    queryKey: ['completions-trends', id],
    queryFn: () => api.getCompletionsTrends(id),
    enabled: !!id,
  });

  const { data: completionsByField } = useQuery({
    queryKey: ['completions-by-field', id, completionsYear],
    queryFn: () => api.getCompletionsByField(id, parseInt(completionsYear)),
    enabled: !!id,
  });

  const { data: completionsByAward } = useQuery({
    queryKey: ['completions-by-award', id, completionsYear],
    queryFn: () => api.getCompletionsByAwardLevel(id, parseInt(completionsYear)),
    enabled: !!id,
  });

  // Similar institutions
  const { data: similar } = useQuery({
    queryKey: ['similar', id],
    queryFn: () => api.getSimilarInstitutions(id, 10),
    enabled: !!id,
  });

  // Nearby institutions (for map)
  const inst = institution?.data;

  const { data: nearby } = useQuery({
    queryKey: ['nearby', inst?.latitude, inst?.longitude],
    queryFn: () => api.getNearbyInstitutions(inst!.latitude!, inst!.longitude!, 50, 20),
    enabled: !!inst?.latitude && !!inst?.longitude,
  });

  // Get latest data points
  const latestAdmissions = admissions?.data?.slice().reverse()[0];
  const latestEnrollment = enrollmentTrends?.data?.slice().reverse()[0];
  const latestGraduation = graduation?.data?.slice().reverse()[0];
  const latestFinancial = financial?.data?.slice().reverse()[0];

  // Get available years for selectors
  const enrollmentYears = enrollmentTrends?.data?.map(d => d.year.toString()).reverse() || [];
  const completionsYears = completionsTrends?.data?.map(d => d.year.toString()).reverse() || [];

  // Prepare chart data
  const enrollmentChartData = enrollmentTrends?.data?.map(d => ({
    year: d.year,
    total_enrollment: typeof d.total_enrollment === 'string' ? parseInt(d.total_enrollment) : d.total_enrollment,
  })) || [];

  const admissionsChartData = admissions?.data?.map(d => ({
    year: d.year,
    admit_rate: d.admit_rate ? parseFloat(d.admit_rate) * 100 : null,
    yield_rate: d.yield_rate ? parseFloat(d.yield_rate) * 100 : null,
  })) || [];

  const graduationChartData = graduation?.data?.map(d => ({
    year: d.year,
    grad_rate: d.grad_rate ? parseFloat(d.grad_rate) : null,
  })) || [];

  const financialChartData = financial?.data?.map(d => ({
    year: d.year,
    avg_net_price: d.avg_net_price,
    pell_pct: d.pell_pct ? parseFloat(d.pell_pct) * 100 : null,
  })) || [];

  const completionsByFieldChart = completionsByField?.data?.slice(0, 10).map(d => ({
    name: d.field_name.length > 15 ? d.field_name.substring(0, 15) + '...' : d.field_name,
    value: typeof d.completions === 'string' ? parseInt(d.completions) : d.completions,
  })) || [];

  const enrollmentByRaceChart = enrollmentByRace?.data?.filter(r => r.race !== 'APTS').map(d => ({
    name: (d.race_label || d.race).length > 12 ? (d.race_label || d.race).substring(0, 12) + '...' : (d.race_label || d.race),
    value: typeof d.enrollment === 'string' ? parseInt(d.enrollment) : d.enrollment,
  })) || [];

  const completionsByAwardChart = completionsByAward?.data?.map(d => ({
    name: d.award_name.length > 12 ? d.award_name.substring(0, 12) + '...' : d.award_name,
    value: typeof d.completions === 'string' ? parseInt(d.completions) : d.completions,
  })) || [];

  if (instLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-4 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!inst) {
    return <div className="text-center py-8">Institution not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{inst.name}</h1>
          <p className="text-muted-foreground">
            {inst.city}, {inst.state} | {SECTORS[inst.sector] || `Sector ${inst.sector}`}
            {inst.hbcu && ' | HBCU'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            UNITID: {inst.unitid}
          </p>
        </div>
        <Link to={`/compare?ids=${inst.unitid}`}>
          <Button variant="outline">Add to Compare</Button>
        </Link>
      </div>

      {/* Key Stats Summary - All clickable for historical data */}
      <div className="grid gap-4 md:grid-cols-5">
        <StatCard
          title="Enrollment"
          value={formatNumber(latestEnrollment?.total_enrollment)}
          subtitle={latestEnrollment?.year?.toString()}
          historicalData={enrollmentTrends?.data}
          historicalTitle="Enrollment"
          historicalColumns={[
            { key: 'year', label: 'Year' },
            { key: 'total_enrollment', label: 'Total Enrollment', format: formatNumber },
          ]}
        />
        <StatCard
          title="Admit Rate"
          value={formatPercent(latestAdmissions?.admit_rate)}
          subtitle={latestAdmissions?.year?.toString()}
          historicalData={admissions?.data}
          historicalTitle="Admissions"
          historicalColumns={[
            { key: 'year', label: 'Year' },
            { key: 'applicants_total', label: 'Applicants', format: formatNumber },
            { key: 'admitted_total', label: 'Admitted', format: formatNumber },
            { key: 'admit_rate', label: 'Admit Rate', format: formatPercent },
          ]}
        />
        <StatCard
          title="Graduation Rate"
          value={latestGraduation?.grad_rate ? `${latestGraduation.grad_rate}%` : '-'}
          subtitle={`150% time, ${latestGraduation?.year || '-'}`}
          historicalData={graduation?.data}
          historicalTitle="Graduation Rates"
          historicalColumns={[
            { key: 'year', label: 'Year' },
            { key: 'total_cohort', label: 'Cohort', format: formatNumber },
            { key: 'total_completers', label: 'Completers', format: formatNumber },
            { key: 'grad_rate', label: 'Rate', format: (v) => v ? `${v}%` : '-' },
          ]}
        />
        <StatCard
          title="Avg Net Price"
          value={formatCurrency(latestFinancial?.avg_net_price)}
          subtitle={latestFinancial?.year?.toString()}
          historicalData={financial?.data}
          historicalTitle="Financial Aid"
          historicalColumns={[
            { key: 'year', label: 'Year' },
            { key: 'avg_net_price', label: 'Avg Net Price', format: formatCurrency },
            { key: 'pell_pct', label: 'Pell %', format: formatPercent },
          ]}
        />
        <StatCard
          title="Pell Recipients"
          value={latestFinancial?.pell_pct ? `${(parseFloat(latestFinancial.pell_pct) * 100).toFixed(0)}%` : '-'}
          subtitle={latestFinancial?.year?.toString()}
          historicalData={financial?.data}
          historicalTitle="Pell Grant Recipients"
          historicalColumns={[
            { key: 'year', label: 'Year' },
            { key: 'pell_recipients', label: 'Recipients', format: formatNumber },
            { key: 'pell_pct', label: 'Pell %', format: formatPercent },
          ]}
        />
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="admissions">Admissions</TabsTrigger>
          <TabsTrigger value="enrollment">Enrollment</TabsTrigger>
          <TabsTrigger value="outcomes">Outcomes</TabsTrigger>
          <TabsTrigger value="degrees">Degrees</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="similar">Similar</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Institution Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unit ID</span>
                  <span className="font-medium">{inst.unitid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sector</span>
                  <span className="font-medium">{SECTORS[inst.sector]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Control</span>
                  <span className="font-medium">{CONTROL[inst.control ?? 0] || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Level</span>
                  <span className="font-medium">{LEVEL[inst.level ?? 0] || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">HBCU</span>
                  <span className="font-medium">{inst.hbcu ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location</span>
                  <span className="font-medium">{inst.city}, {inst.state}</span>
                </div>
                {inst.latitude && inst.longitude && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Coordinates</span>
                    <span className="font-medium text-sm">
                      {inst.latitude.toFixed(4)}, {inst.longitude.toFixed(4)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Fields of Study</CardTitle>
                <CardDescription>Degrees awarded (latest year)</CardDescription>
              </CardHeader>
              <CardContent>
                {completionsByFieldChart.length > 0 ? (
                  <BarChart
                    data={completionsByFieldChart}
                    layout="vertical"
                    height={280}
                    color="#3b82f6"
                  />
                ) : (
                  <p className="text-muted-foreground">No completions data</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Enrollment Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {enrollmentChartData.length > 0 ? (
                  <TrendChart
                    data={enrollmentChartData}
                    dataKey="total_enrollment"
                    color="#10b981"
                    height={200}
                    formatValue={(v) => (v / 1000).toFixed(1) + 'k'}
                  />
                ) : (
                  <p className="text-muted-foreground">No enrollment data</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Student Demographics ({enrollmentYear})</CardTitle>
              </CardHeader>
              <CardContent>
                {enrollmentByRaceChart.length > 0 ? (
                  <PieChart
                    data={enrollmentByRaceChart}
                    height={250}
                    showLegend={false}
                    innerRadius={40}
                    outerRadius={70}
                  />
                ) : (
                  <p className="text-muted-foreground">No demographic data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Location Map */}
          {inst.latitude && inst.longitude && (
            <Card>
              <CardHeader>
                <CardTitle>Location</CardTitle>
                <CardDescription>Nearby institutions within 50 miles</CardDescription>
              </CardHeader>
              <CardContent>
                <InstitutionMap
                  institutions={[inst, ...(nearby?.data || [])]}
                  center={[inst.latitude, inst.longitude]}
                  zoom={10}
                  height={350}
                  selectedId={inst.unitid}
                  showRadius={{
                    center: [inst.latitude, inst.longitude],
                    radiusMiles: 50,
                  }}
                  onMarkerClick={(unitid) => {
                    if (unitid !== inst.unitid) {
                      navigate(`/institutions/${unitid}`);
                    }
                  }}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Admissions Tab - with historical drill-down */}
        <TabsContent value="admissions" className="space-y-4 pt-4">
          {/* Admissions Rate Chart */}
          {admissionsChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Admissions Rate Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <TrendChart
                  data={admissionsChartData}
                  dataKey="admit_rate"
                  color="#ef4444"
                  height={250}
                  formatValue={(v) => v.toFixed(1) + '%'}
                  multipleLines={[
                    { key: 'admit_rate', color: '#ef4444', name: 'Admit Rate' },
                    { key: 'yield_rate', color: '#3b82f6', name: 'Yield Rate' },
                  ]}
                  showLegend
                />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Admissions Data</CardTitle>
                <CardDescription>Application counts by year</CardDescription>
              </CardHeader>
              <CardContent>
                {!admissions?.data?.length ? (
                  <p className="text-muted-foreground">No admissions data available</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-right">Applied</TableHead>
                        <TableHead className="text-right">Admitted</TableHead>
                        <TableHead className="text-right">Enrolled</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {admissions.data.slice().reverse().map((row) => (
                        <TableRow key={row.year}>
                          <TableCell>{row.year}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.applicants_total)}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.admitted_total)}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.enrolled_total)}</TableCell>
                          <TableCell className="text-right">{formatPercent(row.admit_rate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Test Scores Over Time</CardTitle>
                <CardDescription>SAT and ACT score ranges by year</CardDescription>
              </CardHeader>
              <CardContent>
                {!admissions?.data?.length ? (
                  <p className="text-muted-foreground">No test score data</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-right">SAT Verbal</TableHead>
                        <TableHead className="text-right">SAT Math</TableHead>
                        <TableHead className="text-right">ACT</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {admissions.data.slice().reverse().map((row) => (
                        <TableRow key={row.year}>
                          <TableCell>{row.year}</TableCell>
                          <TableCell className="text-right">
                            {row.sat_verbal_25 && row.sat_verbal_75
                              ? `${row.sat_verbal_25}-${row.sat_verbal_75}`
                              : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.sat_math_25 && row.sat_math_75
                              ? `${row.sat_math_25}-${row.sat_math_75}`
                              : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.act_composite_25 && row.act_composite_75
                              ? `${row.act_composite_25}-${row.act_composite_75}`
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Enrollment Tab - with year selector */}
        <TabsContent value="enrollment" className="space-y-4 pt-4">
          {/* Year selector */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Select Year:</span>
            <Select value={enrollmentYear} onValueChange={setEnrollmentYear}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {enrollmentYears.map(year => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Enrollment Trend Chart */}
          {enrollmentChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Enrollment Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <TrendChart
                  data={enrollmentChartData}
                  dataKey="total_enrollment"
                  color="#10b981"
                  height={250}
                  formatValue={(v) => v.toLocaleString()}
                />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Enrollment Data</CardTitle>
                <CardDescription>Total enrollment by year</CardDescription>
              </CardHeader>
              <CardContent>
                {!enrollmentTrends?.data?.length ? (
                  <p className="text-muted-foreground">No enrollment data</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-right">Total Enrollment</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enrollmentTrends.data.slice().reverse().map((row, idx, arr) => {
                        const prevRow = arr[idx + 1];
                        const change = prevRow
                          ? ((row.total_enrollment - prevRow.total_enrollment) / prevRow.total_enrollment * 100).toFixed(1)
                          : null;
                        return (
                          <TableRow key={row.year} className={row.year.toString() === enrollmentYear ? 'bg-muted' : ''}>
                            <TableCell>{row.year}</TableCell>
                            <TableCell className="text-right">{formatNumber(row.total_enrollment)}</TableCell>
                            <TableCell className="text-right">
                              {change !== null ? (
                                <span className={parseFloat(change) >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  {parseFloat(change) >= 0 ? '+' : ''}{change}%
                                </span>
                              ) : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Demographics ({enrollmentYear})</CardTitle>
              </CardHeader>
              <CardContent>
                {enrollmentByRaceChart.length > 0 ? (
                  <PieChart
                    data={enrollmentByRaceChart}
                    height={280}
                    showLegend={false}
                    innerRadius={50}
                    outerRadius={90}
                  />
                ) : (
                  <p className="text-muted-foreground">No demographic data</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Enrollment by Level ({enrollmentYear})</CardTitle>
              </CardHeader>
              <CardContent>
                {!enrollmentByLevel?.data?.length ? (
                  <p className="text-muted-foreground">No level data</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Level</TableHead>
                        <TableHead className="text-right">Full-time</TableHead>
                        <TableHead className="text-right">Part-time</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enrollmentByLevel.data.map((row) => (
                        <TableRow key={row.level}>
                          <TableCell className="capitalize">{row.level}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.full_time)}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.part_time)}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Enrollment by Race/Ethnicity ({enrollmentYear})</CardTitle>
              </CardHeader>
              <CardContent>
                {!enrollmentByRace?.data?.length ? (
                  <p className="text-muted-foreground">No race data</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Race/Ethnicity</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enrollmentByRace.data.filter(r => r.race !== 'APTS').map((row) => (
                        <TableRow key={row.race}>
                          <TableCell>{row.race_label || row.race}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.enrollment)}</TableCell>
                          <TableCell className="text-right">{row.pct}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Enrollment by Gender ({enrollmentYear})</CardTitle>
              </CardHeader>
              <CardContent>
                {!enrollmentByGender?.data?.length ? (
                  <p className="text-muted-foreground">No gender data</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Gender</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enrollmentByGender.data.map((row) => (
                        <TableRow key={row.gender}>
                          <TableCell className="capitalize">{row.gender}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.enrollment)}</TableCell>
                          <TableCell className="text-right">{row.pct}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Outcomes Tab */}
        <TabsContent value="outcomes" className="space-y-4 pt-4">
          {/* Graduation Rate Chart */}
          {graduationChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Graduation Rate Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <TrendChart
                  data={graduationChartData}
                  dataKey="grad_rate"
                  color="#10b981"
                  height={250}
                  formatValue={(v) => v.toFixed(1) + '%'}
                />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Graduation Rates</CardTitle>
                <CardDescription>Bachelor's degree, 150% normal time</CardDescription>
              </CardHeader>
              <CardContent>
                {!graduation?.data?.length ? (
                  <p className="text-muted-foreground">No graduation data</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-right">Cohort</TableHead>
                        <TableHead className="text-right">Completers</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {graduation.data.slice().reverse().map((row) => (
                        <TableRow key={row.year}>
                          <TableCell>{row.year}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.total_cohort)}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.total_completers)}</TableCell>
                          <TableCell className="text-right">{row.grad_rate}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Graduation by Race (Latest Year)</CardTitle>
              </CardHeader>
              <CardContent>
                {!graduationByRace?.data?.length ? (
                  <p className="text-muted-foreground">No data by race</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Race</TableHead>
                        <TableHead className="text-right">Cohort</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {graduationByRace.data.map((row: { race: string; cohort_count: number; grad_rate: string }) => (
                        <TableRow key={row.race}>
                          <TableCell>{row.race}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.cohort_count)}</TableCell>
                          <TableCell className="text-right">{row.grad_rate}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* NEW Degrees Tab */}
        <TabsContent value="degrees" className="space-y-4 pt-4">
          {/* Year selector */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Select Year:</span>
            <Select value={completionsYear} onValueChange={setCompletionsYear}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {completionsYears.map(year => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Degrees Charts */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Degrees by Field ({completionsYear})</CardTitle>
              </CardHeader>
              <CardContent>
                {completionsByFieldChart.length > 0 ? (
                  <BarChart
                    data={completionsByFieldChart}
                    layout="vertical"
                    height={300}
                    color="#3b82f6"
                  />
                ) : (
                  <p className="text-muted-foreground">No field data</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Degrees by Award Level ({completionsYear})</CardTitle>
              </CardHeader>
              <CardContent>
                {completionsByAwardChart.length > 0 ? (
                  <PieChart
                    data={completionsByAwardChart}
                    height={300}
                    showLegend={false}
                    innerRadius={50}
                    outerRadius={90}
                  />
                ) : (
                  <p className="text-muted-foreground">No award data</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Total Degrees Over Time</CardTitle>
                <CardDescription>All degrees and certificates awarded</CardDescription>
              </CardHeader>
              <CardContent>
                {!completionsTrends?.data?.length ? (
                  <p className="text-muted-foreground">No completions data</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-right">Total Completions</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completionsTrends.data.slice().reverse().map((row, idx, arr) => {
                        const prevRow = arr[idx + 1];
                        const change = prevRow && prevRow.total_completions > 0
                          ? ((row.total_completions - prevRow.total_completions) / prevRow.total_completions * 100).toFixed(1)
                          : null;
                        return (
                          <TableRow key={row.year} className={row.year.toString() === completionsYear ? 'bg-muted' : ''}>
                            <TableCell>{row.year}</TableCell>
                            <TableCell className="text-right">{formatNumber(row.total_completions)}</TableCell>
                            <TableCell className="text-right">
                              {change !== null ? (
                                <span className={parseFloat(change) >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  {parseFloat(change) >= 0 ? '+' : ''}{change}%
                                </span>
                              ) : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Degrees by Award Level ({completionsYear})</CardTitle>
                <CardDescription>Certificates, Associate's, Bachelor's, Master's, Doctoral</CardDescription>
              </CardHeader>
              <CardContent>
                {!completionsByAward?.data?.length ? (
                  <p className="text-muted-foreground">No completions data</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Award Level</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const total = completionsByAward.data.reduce((sum, r) => sum + parseInt(String(r.completions)), 0);
                        return completionsByAward.data.map((row) => {
                          const pct = total > 0 ? (parseInt(String(row.completions)) / total * 100).toFixed(1) : '0';
                          return (
                            <TableRow key={row.award_level}>
                              <TableCell>{row.award_name}</TableCell>
                              <TableCell className="text-right">{formatNumber(row.completions)}</TableCell>
                              <TableCell className="text-right">{pct}%</TableCell>
                            </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Degrees by Field of Study ({completionsYear})</CardTitle>
                <CardDescription>Top 20 CIP code families</CardDescription>
              </CardHeader>
              <CardContent>
                {!completionsByField?.data?.length ? (
                  <p className="text-muted-foreground">No completions data</p>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const total = completionsByField.data.reduce((sum, r) => sum + parseInt(String(r.completions)), 0);
                          return completionsByField.data.slice(0, 10).map((row) => {
                            const pct = total > 0 ? (parseInt(String(row.completions)) / total * 100).toFixed(1) : '0';
                            return (
                              <TableRow key={row.cip_family}>
                                <TableCell>{row.field_name}</TableCell>
                                <TableCell className="text-right">{formatNumber(row.completions)}</TableCell>
                                <TableCell className="text-right">{pct}%</TableCell>
                              </TableRow>
                            );
                          });
                        })()}
                      </TableBody>
                    </Table>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const total = completionsByField.data.reduce((sum, r) => sum + parseInt(String(r.completions)), 0);
                          return completionsByField.data.slice(10, 20).map((row) => {
                            const pct = total > 0 ? (parseInt(String(row.completions)) / total * 100).toFixed(1) : '0';
                            return (
                              <TableRow key={row.cip_family}>
                                <TableCell>{row.field_name}</TableCell>
                                <TableCell className="text-right">{formatNumber(row.completions)}</TableCell>
                                <TableCell className="text-right">{pct}%</TableCell>
                              </TableRow>
                            );
                          });
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial" className="space-y-4 pt-4">
          {/* Financial Trend Charts */}
          {financialChartData.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Net Price Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendChart
                    data={financialChartData}
                    dataKey="avg_net_price"
                    color="#f59e0b"
                    height={250}
                    formatValue={(v) => '$' + (v / 1000).toFixed(0) + 'k'}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pell Grant Recipients (%)</CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendChart
                    data={financialChartData}
                    dataKey="pell_pct"
                    color="#8b5cf6"
                    height={250}
                    formatValue={(v) => v.toFixed(0) + '%'}
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Net Price by Income Chart */}
          {latestFinancial && (
            <Card>
              <CardHeader>
                <CardTitle>Net Price by Family Income ({latestFinancial.year})</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={[
                    { name: '$0-30k', value: latestFinancial.avg_net_price_0_30k || 0 },
                    { name: '$30-48k', value: latestFinancial.avg_net_price_30_48k || 0 },
                    { name: '$48-75k', value: latestFinancial.avg_net_price_48_75k || 0 },
                    { name: '$75-110k', value: latestFinancial.avg_net_price_75_110k || 0 },
                    { name: '$110k+', value: latestFinancial.avg_net_price_110k_plus || 0 },
                  ]}
                  height={250}
                  color="#f59e0b"
                  formatValue={(v) => '$' + v.toLocaleString()}
                />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Financial Aid Data</CardTitle>
              </CardHeader>
              <CardContent>
                {!financial?.data?.length ? (
                  <p className="text-muted-foreground">No financial data</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-right">Avg Net Price</TableHead>
                        <TableHead className="text-right">Pell %</TableHead>
                        <TableHead className="text-right">Pell Recipients</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financial.data.slice().reverse().map((row) => (
                        <TableRow key={row.year}>
                          <TableCell>{row.year}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.avg_net_price)}</TableCell>
                          <TableCell className="text-right">{formatPercent(row.pell_pct)}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.pell_recipients)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Net Price Details ({latestFinancial?.year || 'N/A'})</CardTitle>
                <CardDescription>Average net price by family income bracket</CardDescription>
              </CardHeader>
              <CardContent>
                {!latestFinancial ? (
                  <p className="text-muted-foreground">No data available</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Income Bracket</TableHead>
                        <TableHead className="text-right">Avg Net Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>$0 - $30,000</TableCell>
                        <TableCell className="text-right">{formatCurrency(latestFinancial.avg_net_price_0_30k)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>$30,001 - $48,000</TableCell>
                        <TableCell className="text-right">{formatCurrency(latestFinancial.avg_net_price_30_48k)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>$48,001 - $75,000</TableCell>
                        <TableCell className="text-right">{formatCurrency(latestFinancial.avg_net_price_48_75k)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>$75,001 - $110,000</TableCell>
                        <TableCell className="text-right">{formatCurrency(latestFinancial.avg_net_price_75_110k)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>$110,001+</TableCell>
                        <TableCell className="text-right">{formatCurrency(latestFinancial.avg_net_price_110k_plus)}</TableCell>
                      </TableRow>
                      <TableRow className="font-medium">
                        <TableCell>Overall Average</TableCell>
                        <TableCell className="text-right">{formatCurrency(latestFinancial.avg_net_price)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Net price over time by income bracket */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Net Price by Income Over Time</CardTitle>
                <CardDescription>How affordability has changed for different income levels</CardDescription>
              </CardHeader>
              <CardContent>
                {!financial?.data?.length ? (
                  <p className="text-muted-foreground">No data available</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-right">$0-30k</TableHead>
                        <TableHead className="text-right">$30-48k</TableHead>
                        <TableHead className="text-right">$48-75k</TableHead>
                        <TableHead className="text-right">$75-110k</TableHead>
                        <TableHead className="text-right">$110k+</TableHead>
                        <TableHead className="text-right">Overall</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financial.data.slice().reverse().map((row) => (
                        <TableRow key={row.year}>
                          <TableCell>{row.year}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.avg_net_price_0_30k)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.avg_net_price_30_48k)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.avg_net_price_48_75k)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.avg_net_price_75_110k)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.avg_net_price_110k_plus)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(row.avg_net_price)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Similar Tab */}
        <TabsContent value="similar" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Similar Institutions</CardTitle>
              <CardDescription>
                Based on feature vector similarity (enrollment, selectivity, outcomes, financials)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!similar?.data?.length ? (
                <p className="text-muted-foreground">No similar institutions found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead className="text-right">Similarity</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {similar.data.map((row: any) => (
                      <TableRow key={row.unitid}>
                        <TableCell>
                          <Link
                            to={`/institutions/${row.unitid}`}
                            className="hover:underline font-medium"
                          >
                            {row.name}
                          </Link>
                        </TableCell>
                        <TableCell>{row.city}, {row.state}</TableCell>
                        <TableCell>{SECTORS[row.sector] || '-'}</TableCell>
                        <TableCell className="text-right">
                          {(parseFloat(row.similarity) * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell>
                          <Link to={`/compare?ids=${inst.unitid},${row.unitid}`}>
                            <Button variant="ghost" size="sm">Compare</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
