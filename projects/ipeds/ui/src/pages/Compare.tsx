import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SECTORS: Record<number, string> = {
  1: 'Public, 4-year',
  2: 'Private nonprofit, 4-year',
  3: 'Private for-profit, 4-year',
  4: 'Public, 2-year',
  5: 'Private nonprofit, 2-year',
  6: 'Private for-profit, 2-year',
  7: 'Public, < 2-year',
  8: 'Private nonprofit, < 2-year',
  9: 'Private for-profit, < 2-year',
};

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return `$${value.toLocaleString()}`;
}

function formatPercent(value: string | number | null | undefined, multiply = true): string {
  if (value == null) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return multiply ? `${(num * 100).toFixed(1)}%` : `${num.toFixed(1)}%`;
}

function formatNumber(value: number | string | null | undefined): string {
  if (value == null) return '-';
  const num = typeof value === 'string' ? parseInt(value) : value;
  if (isNaN(num)) return '-';
  return num.toLocaleString();
}

// Cell shading helper - calculates background color based on relative position in row
// higherIsBetter: true = green for highest values, false = green for lowest values
function getCellShading(
  value: number | null | undefined,
  allValues: (number | null | undefined)[],
  higherIsBetter: boolean
): string {
  if (value == null) return '';

  const validValues = allValues.filter((v): v is number => v != null && !isNaN(v));
  if (validValues.length < 2) return '';

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  if (min === max) return '';

  // Calculate position from 0 to 1
  let position = (value - min) / (max - min);

  // If lower is better, invert the position
  if (!higherIsBetter) {
    position = 1 - position;
  }

  // Use a color scale: red (worst) -> yellow (middle) -> green (best)
  // Position: 0 = worst, 1 = best
  if (position >= 0.8) {
    // Best - green
    return 'bg-green-100 dark:bg-green-900/30';
  } else if (position >= 0.6) {
    // Good - light green
    return 'bg-green-50 dark:bg-green-900/20';
  } else if (position >= 0.4) {
    // Middle - yellow
    return 'bg-yellow-50 dark:bg-yellow-900/20';
  } else if (position >= 0.2) {
    // Below middle - light red/orange
    return 'bg-orange-50 dark:bg-orange-900/20';
  } else {
    // Worst - red
    return 'bg-red-100 dark:bg-red-900/30';
  }
}

// Helper to extract numeric value from various formats
function extractNumeric(value: string | number | null | undefined, isPercent = false): number | null {
  if (value == null) return null;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return null;
  return isPercent ? num * 100 : num;
}

export default function Compare() {
  usePageTitle('Compare Institutions');
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number[]>([]);

  // Load selected from URL on mount
  useEffect(() => {
    const idsParam = searchParams.get('ids');
    if (idsParam) {
      const ids = idsParam.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      setSelected(ids.slice(0, 5));
    }
  }, []);

  // Update URL when selection changes
  useEffect(() => {
    if (selected.length > 0) {
      setSearchParams({ ids: selected.join(',') });
    } else {
      setSearchParams({});
    }
  }, [selected, setSearchParams]);

  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['search', search],
    queryFn: () => api.searchText(search, 10),
    enabled: search.length > 2,
  });

  // Fetch data for all selected institutions in parallel
  const institutionQueries = useQueries({
    queries: selected.map(unitid => ({
      queryKey: ['institution', unitid],
      queryFn: () => api.getInstitution(unitid),
    })),
  });

  const admissionsQueries = useQueries({
    queries: selected.map(unitid => ({
      queryKey: ['admissions-trends', unitid],
      queryFn: () => api.getAdmissionsTrends(unitid),
    })),
  });

  const enrollmentQueries = useQueries({
    queries: selected.map(unitid => ({
      queryKey: ['enrollment-trends', unitid],
      queryFn: () => api.getEnrollmentTrends(unitid),
    })),
  });

  const graduationQueries = useQueries({
    queries: selected.map(unitid => ({
      queryKey: ['graduation-rates', unitid],
      queryFn: () => api.getGraduationRates(unitid),
    })),
  });

  const financialQueries = useQueries({
    queries: selected.map(unitid => ({
      queryKey: ['financial-trends', unitid],
      queryFn: () => api.getFinancialTrends(unitid),
    })),
  });

  const completionsByFieldQueries = useQueries({
    queries: selected.map(unitid => ({
      queryKey: ['completions-by-field', unitid],
      queryFn: () => api.getCompletionsByField(unitid),
    })),
  });

  // Build comparison data
  const institutions = selected.map((unitid, index) => {
    const inst = institutionQueries[index]?.data?.data;
    const admissions = admissionsQueries[index]?.data?.data;
    const enrollment = enrollmentQueries[index]?.data?.data;
    const graduation = graduationQueries[index]?.data?.data;
    const financial = financialQueries[index]?.data?.data;
    const completions = completionsByFieldQueries[index]?.data?.data;

    const latestAdmissions = admissions?.slice().reverse()[0];
    const latestEnrollment = enrollment?.slice().reverse()[0];
    const latestGraduation = graduation?.slice().reverse()[0];
    const latestFinancial = financial?.slice().reverse()[0];

    return {
      unitid,
      inst,
      latestAdmissions,
      latestEnrollment,
      latestGraduation,
      latestFinancial,
      completions,
      admissionsHistory: admissions,
      graduationHistory: graduation,
      financialHistory: financial,
    };
  });

  const addToCompare = (unitid: number) => {
    if (!selected.includes(unitid) && selected.length < 5) {
      setSelected([...selected, unitid]);
      setSearch('');
    }
  };

  const removeFromCompare = (unitid: number) => {
    setSelected(selected.filter((id) => id !== unitid));
  };

  const clearAll = () => {
    setSelected([]);
  };

  const isLoading = institutionQueries.some(q => q.isLoading);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Compare Institutions</h1>
          <p className="text-muted-foreground">
            Compare up to 5 institutions side by side
          </p>
        </div>
        {selected.length > 0 && (
          <Button variant="outline" onClick={clearAll}>Clear All</Button>
        )}
      </div>

      {/* Search and Add */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add Institution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search for an institution..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          {search.length > 2 && (
            <div className="border rounded-md max-w-md max-h-64 overflow-auto">
              {searching ? (
                <div className="p-2 text-muted-foreground">Searching...</div>
              ) : !searchResults?.data?.length ? (
                <div className="p-2 text-muted-foreground">No results found</div>
              ) : (
                searchResults.data.map((inst) => (
                  <button
                    key={inst.unitid}
                    className="w-full text-left p-2 hover:bg-muted flex justify-between items-center border-b last:border-b-0 disabled:opacity-50"
                    onClick={() => addToCompare(inst.unitid)}
                    disabled={selected.includes(inst.unitid)}
                  >
                    <span className="truncate">{inst.name}</span>
                    <span className="text-muted-foreground text-sm ml-2 shrink-0">
                      {inst.city}, {inst.state}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Selected institutions chips */}
          {selected.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {institutions.map(({ unitid, inst }) => (
                <Button
                  key={unitid}
                  variant="secondary"
                  size="sm"
                  onClick={() => removeFromCompare(unitid)}
                  className="gap-2"
                >
                  {inst?.name || `Loading...`}
                  <span className="opacity-60 hover:opacity-100">×</span>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison Tables */}
      {selected.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading comparison data...</div>
            ) : (
              <Tabs defaultValue="overview">
                <TabsList className="mb-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="admissions">Admissions</TabsTrigger>
                  <TabsTrigger value="enrollment">Enrollment</TabsTrigger>
                  <TabsTrigger value="outcomes">Outcomes</TabsTrigger>
                  <TabsTrigger value="financial">Financial</TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-48 font-bold">Metric</TableHead>
                        {institutions.map(({ unitid, inst }) => (
                          <TableHead key={unitid} className="min-w-40">
                            <Link to={`/institutions/${unitid}`} className="hover:underline font-medium">
                              {inst?.name || 'Loading...'}
                            </Link>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Location</TableCell>
                        {institutions.map(({ unitid, inst }) => (
                          <TableCell key={unitid}>
                            {inst ? `${inst.city}, ${inst.state}` : '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Sector</TableCell>
                        {institutions.map(({ unitid, inst }) => (
                          <TableCell key={unitid}>
                            {inst ? SECTORS[inst.sector] || '-' : '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">HBCU</TableCell>
                        {institutions.map(({ unitid, inst }) => (
                          <TableCell key={unitid}>{inst?.hbcu ? 'Yes' : 'No'}</TableCell>
                        ))}
                      </TableRow>
                      {/* Enrollment - higher is neutral (no shading) */}
                      <TableRow>
                        <TableCell className="font-medium">Enrollment</TableCell>
                        {institutions.map(({ unitid, latestEnrollment }) => (
                          <TableCell key={unitid} className="font-semibold">
                            {formatNumber(latestEnrollment?.total_enrollment)}
                          </TableCell>
                        ))}
                      </TableRow>
                      {/* Admit Rate - lower is better (more selective) */}
                      {(() => {
                        const allAdmitRates = institutions.map(i => extractNumeric(i.latestAdmissions?.admit_rate, true));
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Admit Rate</TableCell>
                            {institutions.map(({ unitid, latestAdmissions }, idx) => (
                              <TableCell
                                key={unitid}
                                className={`font-semibold ${getCellShading(allAdmitRates[idx], allAdmitRates, false)}`}
                              >
                                {formatPercent(latestAdmissions?.admit_rate)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      {/* Graduation Rate - higher is better */}
                      {(() => {
                        const allGradRates = institutions.map(i => extractNumeric(i.latestGraduation?.grad_rate));
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Graduation Rate</TableCell>
                            {institutions.map(({ unitid, latestGraduation }, idx) => (
                              <TableCell
                                key={unitid}
                                className={`font-semibold ${getCellShading(allGradRates[idx], allGradRates, true)}`}
                              >
                                {latestGraduation?.grad_rate ? `${latestGraduation.grad_rate}%` : '-'}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      {/* Net Price - lower is better */}
                      {(() => {
                        const allNetPrices = institutions.map(i => i.latestFinancial?.avg_net_price ?? null);
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Avg Net Price</TableCell>
                            {institutions.map(({ unitid, latestFinancial }, idx) => (
                              <TableCell
                                key={unitid}
                                className={`font-semibold ${getCellShading(allNetPrices[idx], allNetPrices, false)}`}
                              >
                                {formatCurrency(latestFinancial?.avg_net_price)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      {/* Pell % - higher indicates serving more low-income students (neutral or higher is better) */}
                      {(() => {
                        const allPellPcts = institutions.map(i => extractNumeric(i.latestFinancial?.pell_pct, true));
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Pell %</TableCell>
                            {institutions.map(({ unitid, latestFinancial }, idx) => (
                              <TableCell
                                key={unitid}
                                className={`font-semibold ${getCellShading(allPellPcts[idx], allPellPcts, true)}`}
                              >
                                {formatPercent(latestFinancial?.pell_pct)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                    </TableBody>
                  </Table>
                </TabsContent>

                {/* Admissions Tab */}
                <TabsContent value="admissions">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-48 font-bold">Metric</TableHead>
                        {institutions.map(({ unitid, inst }) => (
                          <TableHead key={unitid}>{inst?.name || 'Loading...'}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Applicants</TableCell>
                        {institutions.map(({ unitid, latestAdmissions }) => (
                          <TableCell key={unitid}>
                            {formatNumber(latestAdmissions?.applicants_total)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Admitted</TableCell>
                        {institutions.map(({ unitid, latestAdmissions }) => (
                          <TableCell key={unitid}>
                            {formatNumber(latestAdmissions?.admitted_total)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Enrolled</TableCell>
                        {institutions.map(({ unitid, latestAdmissions }) => (
                          <TableCell key={unitid}>
                            {formatNumber(latestAdmissions?.enrolled_total)}
                          </TableCell>
                        ))}
                      </TableRow>
                      {/* Admit Rate - lower is better (more selective) */}
                      {(() => {
                        const allValues = institutions.map(i => extractNumeric(i.latestAdmissions?.admit_rate, true));
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Admit Rate</TableCell>
                            {institutions.map(({ unitid, latestAdmissions }, idx) => (
                              <TableCell
                                key={unitid}
                                className={`font-semibold ${getCellShading(allValues[idx], allValues, false)}`}
                              >
                                {formatPercent(latestAdmissions?.admit_rate)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      {/* Yield Rate - higher is better (more students choose to enroll) */}
                      {(() => {
                        const allValues = institutions.map(i => extractNumeric(i.latestAdmissions?.yield_rate, true));
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Yield Rate</TableCell>
                            {institutions.map(({ unitid, latestAdmissions }, idx) => (
                              <TableCell
                                key={unitid}
                                className={`font-semibold ${getCellShading(allValues[idx], allValues, true)}`}
                              >
                                {formatPercent(latestAdmissions?.yield_rate)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      {/* SAT Verbal - higher is better */}
                      {(() => {
                        const allValues = institutions.map(i => i.latestAdmissions?.sat_verbal_75 ?? null);
                        return (
                          <TableRow>
                            <TableCell className="font-medium">SAT Verbal (25-75)</TableCell>
                            {institutions.map(({ unitid, latestAdmissions }, idx) => (
                              <TableCell
                                key={unitid}
                                className={getCellShading(allValues[idx], allValues, true)}
                              >
                                {latestAdmissions?.sat_verbal_25 && latestAdmissions?.sat_verbal_75
                                  ? `${latestAdmissions.sat_verbal_25}-${latestAdmissions.sat_verbal_75}`
                                  : '-'}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      {/* SAT Math - higher is better */}
                      {(() => {
                        const allValues = institutions.map(i => i.latestAdmissions?.sat_math_75 ?? null);
                        return (
                          <TableRow>
                            <TableCell className="font-medium">SAT Math (25-75)</TableCell>
                            {institutions.map(({ unitid, latestAdmissions }, idx) => (
                              <TableCell
                                key={unitid}
                                className={getCellShading(allValues[idx], allValues, true)}
                              >
                                {latestAdmissions?.sat_math_25 && latestAdmissions?.sat_math_75
                                  ? `${latestAdmissions.sat_math_25}-${latestAdmissions.sat_math_75}`
                                  : '-'}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      {/* ACT - higher is better */}
                      {(() => {
                        const allValues = institutions.map(i => i.latestAdmissions?.act_composite_75 ?? null);
                        return (
                          <TableRow>
                            <TableCell className="font-medium">ACT Composite (25-75)</TableCell>
                            {institutions.map(({ unitid, latestAdmissions }, idx) => (
                              <TableCell
                                key={unitid}
                                className={getCellShading(allValues[idx], allValues, true)}
                              >
                                {latestAdmissions?.act_composite_25 && latestAdmissions?.act_composite_75
                                  ? `${latestAdmissions.act_composite_25}-${latestAdmissions.act_composite_75}`
                                  : '-'}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                    </TableBody>
                  </Table>
                </TabsContent>

                {/* Enrollment Tab */}
                <TabsContent value="enrollment">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-48 font-bold">Year</TableHead>
                        {institutions.map(({ unitid, inst }) => (
                          <TableHead key={unitid}>{inst?.name || 'Loading...'}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Show last 5 years of enrollment */}
                      {[2023, 2022, 2021, 2020, 2019].map(year => {
                        const hasData = institutions.some(({ unitid }) => {
                          const idx = selected.indexOf(unitid);
                          const data = enrollmentQueries[idx]?.data?.data;
                          return data?.find(d => d.year === year);
                        });
                        if (!hasData) return null;
                        return (
                          <TableRow key={year}>
                            <TableCell className="font-medium">{year}</TableCell>
                            {institutions.map(({ unitid }) => {
                              const idx = selected.indexOf(unitid);
                              const data = enrollmentQueries[idx]?.data?.data;
                              const yearData = data?.find(d => d.year === year);
                              return (
                                <TableCell key={unitid}>
                                  {formatNumber(yearData?.total_enrollment)}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TabsContent>

                {/* Outcomes Tab */}
                <TabsContent value="outcomes">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-48 font-bold">Metric</TableHead>
                        {institutions.map(({ unitid, inst }) => (
                          <TableHead key={unitid}>{inst?.name || 'Loading...'}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Graduation Rate - higher is better */}
                      {(() => {
                        const allValues = institutions.map(i => extractNumeric(i.latestGraduation?.grad_rate));
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Graduation Rate (Latest)</TableCell>
                            {institutions.map(({ unitid, latestGraduation }, idx) => (
                              <TableCell
                                key={unitid}
                                className={`font-semibold ${getCellShading(allValues[idx], allValues, true)}`}
                              >
                                {latestGraduation?.grad_rate ? `${latestGraduation.grad_rate}%` : '-'}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      <TableRow>
                        <TableCell className="font-medium">Cohort Size</TableCell>
                        {institutions.map(({ unitid, latestGraduation }) => (
                          <TableCell key={unitid}>
                            {formatNumber(latestGraduation?.total_cohort)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Completers</TableCell>
                        {institutions.map(({ unitid, latestGraduation }) => (
                          <TableCell key={unitid}>
                            {formatNumber(latestGraduation?.total_completers)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={institutions.length + 1} className="font-bold pt-4">
                          Top Fields of Study
                        </TableCell>
                      </TableRow>
                      {/* Show top 5 fields */}
                      {[0, 1, 2, 3, 4].map(fieldIndex => (
                        <TableRow key={fieldIndex}>
                          <TableCell className="font-medium text-muted-foreground">
                            #{fieldIndex + 1}
                          </TableCell>
                          {institutions.map(({ unitid, completions }) => {
                            const field = completions?.[fieldIndex];
                            return (
                              <TableCell key={unitid}>
                                {field ? (
                                  <span>
                                    {field.field_name}
                                    <span className="text-muted-foreground ml-2">
                                      ({formatNumber(field.completions)})
                                    </span>
                                  </span>
                                ) : '-'}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>

                {/* Financial Tab */}
                <TabsContent value="financial">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-48 font-bold">Metric</TableHead>
                        {institutions.map(({ unitid, inst }) => (
                          <TableHead key={unitid}>{inst?.name || 'Loading...'}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Avg Net Price - lower is better */}
                      {(() => {
                        const allValues = institutions.map(i => i.latestFinancial?.avg_net_price ?? null);
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Avg Net Price (All)</TableCell>
                            {institutions.map(({ unitid, latestFinancial }, idx) => (
                              <TableCell
                                key={unitid}
                                className={`font-semibold ${getCellShading(allValues[idx], allValues, false)}`}
                              >
                                {formatCurrency(latestFinancial?.avg_net_price)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      {/* Net Price by income bracket - lower is better */}
                      {(() => {
                        const allValues = institutions.map(i => i.latestFinancial?.avg_net_price_0_30k ?? null);
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Net Price ($0-30k)</TableCell>
                            {institutions.map(({ unitid, latestFinancial }, idx) => (
                              <TableCell
                                key={unitid}
                                className={getCellShading(allValues[idx], allValues, false)}
                              >
                                {formatCurrency(latestFinancial?.avg_net_price_0_30k)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      {(() => {
                        const allValues = institutions.map(i => i.latestFinancial?.avg_net_price_30_48k ?? null);
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Net Price ($30-48k)</TableCell>
                            {institutions.map(({ unitid, latestFinancial }, idx) => (
                              <TableCell
                                key={unitid}
                                className={getCellShading(allValues[idx], allValues, false)}
                              >
                                {formatCurrency(latestFinancial?.avg_net_price_30_48k)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      {(() => {
                        const allValues = institutions.map(i => i.latestFinancial?.avg_net_price_48_75k ?? null);
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Net Price ($48-75k)</TableCell>
                            {institutions.map(({ unitid, latestFinancial }, idx) => (
                              <TableCell
                                key={unitid}
                                className={getCellShading(allValues[idx], allValues, false)}
                              >
                                {formatCurrency(latestFinancial?.avg_net_price_48_75k)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      {(() => {
                        const allValues = institutions.map(i => i.latestFinancial?.avg_net_price_75_110k ?? null);
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Net Price ($75-110k)</TableCell>
                            {institutions.map(({ unitid, latestFinancial }, idx) => (
                              <TableCell
                                key={unitid}
                                className={getCellShading(allValues[idx], allValues, false)}
                              >
                                {formatCurrency(latestFinancial?.avg_net_price_75_110k)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      {(() => {
                        const allValues = institutions.map(i => i.latestFinancial?.avg_net_price_110k_plus ?? null);
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Net Price ($110k+)</TableCell>
                            {institutions.map(({ unitid, latestFinancial }, idx) => (
                              <TableCell
                                key={unitid}
                                className={getCellShading(allValues[idx], allValues, false)}
                              >
                                {formatCurrency(latestFinancial?.avg_net_price_110k_plus)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      {/* Pell % - higher indicates serving more low-income students */}
                      {(() => {
                        const allValues = institutions.map(i => extractNumeric(i.latestFinancial?.pell_pct, true));
                        return (
                          <TableRow>
                            <TableCell className="font-medium">Pell Grant %</TableCell>
                            {institutions.map(({ unitid, latestFinancial }, idx) => (
                              <TableCell
                                key={unitid}
                                className={`font-semibold ${getCellShading(allValues[idx], allValues, true)}`}
                              >
                                {formatPercent(latestFinancial?.pell_pct)}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })()}
                      <TableRow>
                        <TableCell className="font-medium">Pell Recipients</TableCell>
                        {institutions.map(({ unitid, latestFinancial }) => (
                          <TableCell key={unitid}>
                            {formatNumber(latestFinancial?.pell_recipients)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {selected.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">Search for institutions above to start comparing</p>
          <p className="text-sm mt-2">You can compare up to 5 institutions at once</p>
        </div>
      )}
    </div>
  );
}
