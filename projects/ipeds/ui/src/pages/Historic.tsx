import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendChart } from '@/components/charts/TrendChart';
import { BarChart } from '@/components/charts/BarChart';

export default function Historic() {
  const { data: coverage, isLoading: coverageLoading } = useQuery({
    queryKey: ['historic-coverage'],
    queryFn: () => api.getHistoricCoverage(),
  });

  const { data: enrollment, isLoading: enrollmentLoading } = useQuery({
    queryKey: ['historic-enrollment'],
    queryFn: () => api.getHistoricEnrollment(),
  });

  const { data: completions, isLoading: completionsLoading } = useQuery({
    queryKey: ['historic-completions'],
    queryFn: () => api.getHistoricCompletions(),
  });

  const { data: graduation, isLoading: graduationLoading } = useQuery({
    queryKey: ['historic-graduation'],
    queryFn: () => api.getHistoricGraduation(),
  });

  const { data: completionsByField, isLoading: completionsByFieldLoading } = useQuery({
    queryKey: ['historic-completions-by-field'],
    queryFn: () => api.getHistoricCompletionsByField(2008),
  });

  // Get modern data for comparison
  const { data: modernEnrollment, isLoading: modernEnrollmentLoading } = useQuery({
    queryKey: ['modern-enrollment'],
    queryFn: () => api.getEnrollmentStatsTrends(),
  });

  // Combine historic and modern enrollment data
  const combinedEnrollment = [
    ...(enrollment?.data || []).map(d => ({
      year: d.year,
      total_enrollment: Number(d.total_enrollment),
      era: 'historic' as const,
    })),
    ...(modernEnrollment?.data || []).map(d => ({
      year: d.year,
      total_enrollment: Number(d.total_enrollment),
      era: 'modern' as const,
    })),
  ].sort((a, b) => a.year - b.year);

  // Find the earliest and latest enrollment for calculating change
  const earliestEnrollment = combinedEnrollment[0];
  const latestEnrollment = combinedEnrollment[combinedEnrollment.length - 1];
  const totalChange = earliestEnrollment && latestEnrollment
    ? ((latestEnrollment.total_enrollment - earliestEnrollment.total_enrollment) / earliestEnrollment.total_enrollment * 100).toFixed(1)
    : null;

  // Transform completions by field data for bar chart
  const fieldChartData = completionsByField?.data
    .slice(0, 15)
    .map(d => ({
      name: d.field_name?.replace(/\.$/, '').substring(0, 25) || `CIP ${d.cip_2digit}`,
      value: Number(d.total_completions),
    })) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Historic Data (1980-2008)</h1>
        <p className="text-muted-foreground">
          Explore long-term trends in U.S. higher education spanning over 4 decades
        </p>
      </div>

      {/* Data Coverage */}
      <Card>
        <CardHeader>
          <CardTitle>Data Coverage</CardTitle>
          <CardDescription>
            Years available in historic data tables (note: gaps reflect missing IPEDS source files)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {coverageLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {coverage?.data.map(table => (
                <div key={table.table_name} className="p-4 rounded-lg border">
                  <h4 className="font-medium capitalize">{table.table_name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {table.records.toLocaleString()} records
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Years: {table.years?.slice(0, 3).join(', ')}
                    {table.years?.length > 3 && `... ${table.years[table.years.length - 1]}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Span</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1980-2024</div>
            <p className="text-xs text-muted-foreground">
              44+ years of higher ed data
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Earliest Enrollment</CardTitle>
          </CardHeader>
          <CardContent>
            {enrollmentLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {earliestEnrollment
                    ? `${(earliestEnrollment.total_enrollment / 1000000).toFixed(1)}M`
                    : '-'}
                </div>
                <p className="text-xs text-muted-foreground">
                  In {earliestEnrollment?.year}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Latest Enrollment</CardTitle>
          </CardHeader>
          <CardContent>
            {modernEnrollmentLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {latestEnrollment
                    ? `${(latestEnrollment.total_enrollment / 1000000).toFixed(1)}M`
                    : '-'}
                </div>
                <p className="text-xs text-muted-foreground">
                  In {latestEnrollment?.year}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Change</CardTitle>
          </CardHeader>
          <CardContent>
            {enrollmentLoading || modernEnrollmentLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${Number(totalChange) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalChange ? `${Number(totalChange) >= 0 ? '+' : ''}${totalChange}%` : '-'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Since {earliestEnrollment?.year}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Enrollment Chart - Full Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>National Enrollment (1980-2024)</CardTitle>
          <CardDescription>
            Total higher education enrollment spanning historic (1980-2008) and modern (2009-2024) eras.
            Gaps reflect years where IPEDS didn't publish data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {enrollmentLoading || modernEnrollmentLoading ? (
            <Skeleton className="h-[350px] w-full" />
          ) : combinedEnrollment.length > 0 ? (
            <TrendChart
              data={combinedEnrollment}
              dataKey="total_enrollment"
              height={350}
              formatValue={(v) => `${(v / 1000000).toFixed(1)}M`}
              color="#3b82f6"
            />
          ) : (
            <p className="text-muted-foreground">No enrollment data available</p>
          )}
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Historic Completions */}
        <Card>
          <CardHeader>
            <CardTitle>Degree Completions (1980-2008)</CardTitle>
            <CardDescription>
              Total degrees and certificates awarded annually
            </CardDescription>
          </CardHeader>
          <CardContent>
            {completionsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : completions?.data && completions.data.length > 0 ? (
              <TrendChart
                data={completions.data.map(d => ({
                  year: d.year,
                  total_completions: Number(d.total_completions),
                }))}
                dataKey="total_completions"
                height={300}
                formatValue={(v) => `${(v / 1000000).toFixed(2)}M`}
                color="#10b981"
              />
            ) : (
              <p className="text-muted-foreground">No completions data available</p>
            )}
          </CardContent>
        </Card>

        {/* Graduation Rates */}
        <Card>
          <CardHeader>
            <CardTitle>Average Graduation Rate (1997-2008)</CardTitle>
            <CardDescription>
              Average 150% time graduation rate across all institutions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {graduationLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : graduation?.data && graduation.data.length > 0 ? (
              <TrendChart
                data={graduation.data.map(d => ({
                  year: d.year,
                  avg_grad_rate: d.avg_grad_rate,
                }))}
                dataKey="avg_grad_rate"
                height={300}
                formatValue={(v) => `${v.toFixed(1)}%`}
                color="#f59e0b"
              />
            ) : (
              <p className="text-muted-foreground">No graduation data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Completions by Field */}
      <Card>
        <CardHeader>
          <CardTitle>Top Fields of Study (2008)</CardTitle>
          <CardDescription>
            Most popular degree fields by total completions in the final historic year
          </CardDescription>
        </CardHeader>
        <CardContent>
          {completionsByFieldLoading ? (
            <Skeleton className="h-[400px] w-full" />
          ) : fieldChartData.length > 0 ? (
            <BarChart
              data={fieldChartData}
              height={400}
              color="#8b5cf6"
            />
          ) : (
            <p className="text-muted-foreground">No completions by field data available</p>
          )}
        </CardContent>
      </Card>

      {/* Context and Notes */}
      <Card>
        <CardHeader>
          <CardTitle>About Historic Data</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-medium mb-2">Data Sources</h4>
              <p className="text-sm text-muted-foreground">
                Historic data comes from IPEDS surveys 1980-2008. Not all surveys were conducted
                every year - gaps in the charts represent years where IPEDS did not collect or
                publish comparable data.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Methodology Notes</h4>
              <p className="text-sm text-muted-foreground">
                Historic tables use simplified schemas (total enrollment only, 2-digit CIP codes)
                to allow cross-era comparisons. Race/ethnicity categories changed significantly
                in 2010, making detailed demographic comparisons difficult.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Key Events</h4>
              <ul className="text-sm text-muted-foreground list-disc list-inside">
                <li>1980: Baby boom generation entering college</li>
                <li>1997: Graduation rate tracking begins</li>
                <li>2001: Post-9/11 enrollment shifts</li>
                <li>2008: Great Recession begins</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Using This Data</h4>
              <p className="text-sm text-muted-foreground">
                This data is best for understanding broad trends rather than precise year-over-year
                comparisons. For detailed analysis, use the modern data (2009-2024) which has
                consistent methodology and comprehensive coverage.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
