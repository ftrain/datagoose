import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { TrendChart } from '@/components/charts/TrendChart';
import { BarChart } from '@/components/charts/BarChart';
import { PieChart } from '@/components/charts/PieChart';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
  });

  const { data: statsBySector, isLoading: sectorLoading } = useQuery({
    queryKey: ['stats-by-sector'],
    queryFn: () => api.getStatsBySector(),
  });

  const { data: statsByState, isLoading: stateLoading } = useQuery({
    queryKey: ['stats-by-state'],
    queryFn: () => api.getStatsByState(),
  });

  const { data: enrollmentTrends, isLoading: enrollmentLoading } = useQuery({
    queryKey: ['enrollment-trends'],
    queryFn: () => api.getEnrollmentStatsTrends(),
  });

  const { data: selective, isLoading: selectiveLoading } = useQuery({
    queryKey: ['most-selective'],
    queryFn: () => api.getMostSelective(2023, 10),
  });

  const { data: affordable, isLoading: affordableLoading } = useQuery({
    queryKey: ['most-affordable'],
    queryFn: () => api.getMostAffordable(2023, undefined, undefined, 10),
  });

  const { data: topGrad, isLoading: topGradLoading } = useQuery({
    queryKey: ['top-graduation'],
    queryFn: () => api.getTopGraduationRates(2023, undefined, 10),
  });

  const { data: highPell, isLoading: highPellLoading } = useQuery({
    queryKey: ['high-pell'],
    queryFn: () => api.getHighPell(2023, undefined, 70, 10),
  });

  // Transform sector data for pie chart
  const sectorChartData = statsBySector?.data
    .filter(s => Number(s.institution_count) > 50)
    .map(s => ({
      name: s.sector_name.replace(', 4-year or above', ' 4yr').replace(', 2-year', ' 2yr').replace('not-for-profit', 'nonprofit').replace('-than 2-year', '<2yr'),
      value: Number(s.institution_count),
    })) || [];

  // Get top 15 states for bar chart
  const stateChartData = statsByState?.data
    .sort((a, b) => Number(b.institution_count) - Number(a.institution_count))
    .slice(0, 15)
    .map(s => ({
      name: s.state,
      value: Number(s.institution_count),
    })) || [];

  // Calculate some interesting facts
  const totalInstitutions = stats?.data.total_institutions || 0;
  const latestEnrollment = enrollmentTrends?.data?.[enrollmentTrends.data.length - 1];
  const earliestEnrollment = enrollmentTrends?.data?.[0];
  const latestEnrollmentNum = Number(latestEnrollment?.total_enrollment || 0);
  const earliestEnrollmentNum = Number(earliestEnrollment?.total_enrollment || 0);
  const enrollmentChange = latestEnrollment && earliestEnrollment && earliestEnrollmentNum > 0
    ? ((latestEnrollmentNum - earliestEnrollmentNum) / earliestEnrollmentNum * 100).toFixed(1)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">IPEDS Data Explorer</h1>
        <p className="text-muted-foreground">
          Explore data from {totalInstitutions.toLocaleString()} institutions in the Integrated Postsecondary Education Data System
        </p>
      </div>

      {/* Key Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Institutions</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {stats?.data.total_institutions.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  Across 50 states + territories
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Enrollment</CardTitle>
          </CardHeader>
          <CardContent>
            {enrollmentLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {latestEnrollmentNum > 0
                    ? (latestEnrollmentNum / 1000000).toFixed(1) + 'M'
                    : '-'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Students enrolled ({latestEnrollment?.year})
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enrollment Change</CardTitle>
          </CardHeader>
          <CardContent>
            {enrollmentLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${Number(enrollmentChange) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {enrollmentChange ? `${Number(enrollmentChange) >= 0 ? '+' : ''}${enrollmentChange}%` : '-'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Since {earliestEnrollment?.year}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">15+ years</div>
                <p className="text-xs text-muted-foreground">
                  2009-2024 data available
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>National Enrollment Trends</CardTitle>
            <CardDescription>
              Total higher education enrollment over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            {enrollmentLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : enrollmentTrends?.data ? (
              <TrendChart
                data={enrollmentTrends.data.map(d => ({
                  year: d.year,
                  total_enrollment: Number(d.total_enrollment)
                }))}
                dataKey="total_enrollment"
                height={300}
                formatValue={(v) => `${(v / 1000000).toFixed(1)}M`}
                color="#3b82f6"
              />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Institutions by Sector</CardTitle>
            <CardDescription>
              Distribution across public, private, and for-profit sectors
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sectorLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <PieChart
                data={sectorChartData}
                height={300}
                showLegend={true}
                outerRadius={90}
                innerRadius={40}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* State Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Institutions by State (Top 15)</CardTitle>
          <CardDescription>
            States with the most higher education institutions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stateLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <BarChart
              data={stateChartData}
              height={300}
              color="#10b981"
            />
          )}
        </CardContent>
      </Card>

      {/* Rankings Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Most Selective</CardTitle>
            <CardDescription className="text-xs">Lowest admission rates (2023)</CardDescription>
          </CardHeader>
          <CardContent>
            {selectiveLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {selective?.data.slice(0, 8).map((school, i) => (
                  <div key={school.unitid} className="flex justify-between text-sm">
                    <Link
                      to={`/institutions/${school.unitid}`}
                      className="truncate hover:underline flex-1 mr-2 text-xs"
                    >
                      {i + 1}. {school.name} ({school.state})
                    </Link>
                    <span className="text-muted-foreground whitespace-nowrap text-xs font-mono">
                      {(parseFloat(school.admit_rate || '0') * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Highest Graduation</CardTitle>
            <CardDescription className="text-xs">Best 6-year grad rates (2023)</CardDescription>
          </CardHeader>
          <CardContent>
            {topGradLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {topGrad?.data.slice(0, 8).map((school, i) => (
                  <div key={school.unitid} className="flex justify-between text-sm">
                    <Link
                      to={`/institutions/${school.unitid}`}
                      className="truncate hover:underline flex-1 mr-2 text-xs"
                    >
                      {i + 1}. {school.name} ({school.state})
                    </Link>
                    <span className="text-muted-foreground whitespace-nowrap text-xs font-mono">
                      {school.grad_rate}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Most Affordable</CardTitle>
            <CardDescription className="text-xs">Lowest net price (2023)</CardDescription>
          </CardHeader>
          <CardContent>
            {affordableLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {affordable?.data.slice(0, 8).map((school, i) => (
                  <div key={school.unitid} className="flex justify-between text-sm">
                    <Link
                      to={`/institutions/${school.unitid}`}
                      className="truncate hover:underline flex-1 mr-2 text-xs"
                    >
                      {i + 1}. {school.name} ({school.state})
                    </Link>
                    <span className="text-muted-foreground whitespace-nowrap text-xs font-mono">
                      ${school.net_price?.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Highest Pell %</CardTitle>
            <CardDescription className="text-xs">Most Pell grant recipients (2023)</CardDescription>
          </CardHeader>
          <CardContent>
            {highPellLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {highPell?.data.slice(0, 8).map((school, i) => (
                  <div key={school.unitid} className="flex justify-between text-sm">
                    <Link
                      to={`/institutions/${school.unitid}`}
                      className="truncate hover:underline flex-1 mr-2 text-xs"
                    >
                      {i + 1}. {school.name} ({school.state})
                    </Link>
                    <span className="text-muted-foreground whitespace-nowrap text-xs font-mono">
                      {(parseFloat(school.pell_pct || '0') * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Explore */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Explore</CardTitle>
          <CardDescription>
            Jump into the data by type, region, or state
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Institution Types */}
          <div>
            <h4 className="text-sm font-medium mb-2 text-muted-foreground">By Type</h4>
            <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-2">
              <Link to="/explore?hbcu=true" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-lg font-bold text-blue-600">HBCU</div>
                <div className="text-[10px] text-muted-foreground">100 schools</div>
              </Link>
              <Link to="/explore?sector=1" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-lg font-bold text-green-600">Public 4yr</div>
                <div className="text-[10px] text-muted-foreground">{Number(statsBySector?.data.find(s => s.sector === 1)?.institution_count || 0).toLocaleString()}</div>
              </Link>
              <Link to="/explore?sector=2" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-lg font-bold text-purple-600">Private 4yr</div>
                <div className="text-[10px] text-muted-foreground">{Number(statsBySector?.data.find(s => s.sector === 2)?.institution_count || 0).toLocaleString()}</div>
              </Link>
              <Link to="/explore?sector=4" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-lg font-bold text-amber-600">Comm. Coll.</div>
                <div className="text-[10px] text-muted-foreground">{Number(statsBySector?.data.find(s => s.sector === 4)?.institution_count || 0).toLocaleString()}</div>
              </Link>
              <Link to="/explore?sector=3" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-lg font-bold text-red-600">For-Profit 4yr</div>
                <div className="text-[10px] text-muted-foreground">{Number(statsBySector?.data.find(s => s.sector === 3)?.institution_count || 0).toLocaleString()}</div>
              </Link>
              <Link to="/explore?sector=5" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-lg font-bold text-orange-600">Priv. 2yr</div>
                <div className="text-[10px] text-muted-foreground">{Number(statsBySector?.data.find(s => s.sector === 5)?.institution_count || 0).toLocaleString()}</div>
              </Link>
              <Link to="/explore?sector=6" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-lg font-bold text-pink-600">FP 2yr</div>
                <div className="text-[10px] text-muted-foreground">{Number(statsBySector?.data.find(s => s.sector === 6)?.institution_count || 0).toLocaleString()}</div>
              </Link>
              <Link to="/explore?level=1" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-lg font-bold text-indigo-600">4-Year+</div>
                <div className="text-[10px] text-muted-foreground">All levels</div>
              </Link>
              <Link to="/explore?level=2" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-lg font-bold text-teal-600">2-Year</div>
                <div className="text-[10px] text-muted-foreground">All levels</div>
              </Link>
            </div>
          </div>

          {/* Regions */}
          <div>
            <h4 className="text-sm font-medium mb-2 text-muted-foreground">By Region</h4>
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
              <Link to="/explore?state=CT,ME,MA,NH,RI,VT" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-base font-bold text-cyan-600">New Eng.</div>
              </Link>
              <Link to="/explore?state=NJ,NY,PA" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-base font-bold text-blue-600">Mid-Atl.</div>
              </Link>
              <Link to="/explore?state=IL,IN,MI,OH,WI" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-base font-bold text-green-600">Gr. Lakes</div>
              </Link>
              <Link to="/explore?state=IA,KS,MN,MO,NE,ND,SD" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-base font-bold text-amber-600">Plains</div>
              </Link>
              <Link to="/explore?state=DE,DC,FL,GA,MD,NC,SC,VA,WV" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-base font-bold text-rose-600">Southeast</div>
              </Link>
              <Link to="/explore?state=AL,KY,MS,TN" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-base font-bold text-orange-600">South</div>
              </Link>
              <Link to="/explore?state=AR,LA,OK,TX" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-base font-bold text-red-600">Southwest</div>
              </Link>
              <Link to="/explore?state=AZ,CO,ID,MT,NV,NM,UT,WY" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-base font-bold text-yellow-600">Mountain</div>
              </Link>
              <Link to="/explore?state=AK,CA,HI,OR,WA" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-base font-bold text-purple-600">Pacific</div>
              </Link>
              <Link to="/explore?state=PR,VI,GU,AS,MP" className="p-2 rounded-lg border hover:bg-muted text-center transition-colors">
                <div className="text-base font-bold text-pink-600">Territories</div>
              </Link>
            </div>
          </div>

          {/* Top States */}
          <div>
            <h4 className="text-sm font-medium mb-2 text-muted-foreground">Top States</h4>
            <div className="grid grid-cols-5 md:grid-cols-10 lg:grid-cols-15 gap-1">
              {['CA', 'TX', 'NY', 'FL', 'PA', 'OH', 'IL', 'MI', 'NC', 'GA', 'VA', 'MA', 'NJ', 'AZ', 'TN', 'MO', 'IN', 'WA', 'MN', 'WI', 'CO', 'AL', 'MD', 'LA', 'SC', 'KY', 'OK', 'OR', 'CT', 'IA'].map(st => (
                <Link key={st} to={`/explore?state=${st}`} className="p-1.5 rounded border hover:bg-muted text-center transition-colors">
                  <div className="text-sm font-mono font-bold">{st}</div>
                </Link>
              ))}
            </div>
          </div>

          {/* Quick Filters */}
          <div>
            <h4 className="text-sm font-medium mb-2 text-muted-foreground">Quick Filters</h4>
            <div className="flex flex-wrap gap-2">
              <Link to="/explore?control=1" className="px-3 py-1.5 rounded-full border hover:bg-muted text-xs transition-colors">
                Public
              </Link>
              <Link to="/explore?control=2" className="px-3 py-1.5 rounded-full border hover:bg-muted text-xs transition-colors">
                Private Non-Profit
              </Link>
              <Link to="/explore?control=3" className="px-3 py-1.5 rounded-full border hover:bg-muted text-xs transition-colors">
                For-Profit
              </Link>
              <span className="text-muted-foreground">|</span>
              <Link to="/explore?sort=enrollment&order=desc" className="px-3 py-1.5 rounded-full border hover:bg-muted text-xs transition-colors">
                Largest
              </Link>
              <Link to="/explore?sort=admit_rate&order=asc" className="px-3 py-1.5 rounded-full border hover:bg-muted text-xs transition-colors">
                Most Selective
              </Link>
              <Link to="/explore?sort=grad_rate&order=desc" className="px-3 py-1.5 rounded-full border hover:bg-muted text-xs transition-colors">
                Best Grad Rate
              </Link>
              <Link to="/explore?sort=net_price&order=asc" className="px-3 py-1.5 rounded-full border hover:bg-muted text-xs transition-colors">
                Most Affordable
              </Link>
              <Link to="/explore?sort=pell_pct&order=desc" className="px-3 py-1.5 rounded-full border hover:bg-muted text-xs transition-colors">
                High Pell %
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
