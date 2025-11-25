const API_BASE = '/api';

export interface Institution {
  unitid: number;
  name: string;
  city: string;
  state: string;
  sector: number;
  sector_name?: string;
  level?: number;
  control?: number;
  hbcu: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface AdmissionsData {
  unitid: number;
  name: string;
  state: string;
  year: number;
  applicants_total: number | null;
  admitted_total: number | null;
  enrolled_total: number | null;
  admit_rate: string | null;
  yield_rate: string | null;
  sat_verbal_25: number | null;
  sat_verbal_75: number | null;
  sat_math_25: number | null;
  sat_math_75: number | null;
  act_composite_25: number | null;
  act_composite_75: number | null;
}

export interface StatsData {
  total_institutions: number;
  data_coverage: {
    admissions: string;
    graduation_rates: string;
    enrollment: string;
    completions: string;
    financial_aid: string;
  };
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
}

async function fetchApi<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    });
  }
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || 'API request failed');
  }
  return res.json();
}

export const api = {
  // Institutions
  getInstitutions: (params?: { state?: string; sector?: number; hbcu?: boolean; search?: string; limit?: number; offset?: number }) =>
    fetchApi<ApiResponse<Institution[]>>('/institutions', params),

  getInstitution: (unitid: number) =>
    fetchApi<ApiResponse<Institution>>(`/institutions/${unitid}`),

  getSimilarInstitutions: (unitid: number, limit = 10) =>
    fetchApi<ApiResponse<Institution[]>>(`/institutions/${unitid}/similar`, { limit }),

  getNearbyInstitutions: (lat: number, lng: number, radius_miles = 25, limit = 20) =>
    fetchApi<ApiResponse<Institution[]>>('/search/nearby', { lat, lng, radius_miles, limit }),

  // Admissions
  getAdmissions: (params?: { unitid?: number; state?: string; year_start?: number; year_end?: number; limit?: number; offset?: number }) =>
    fetchApi<ApiResponse<AdmissionsData[]>>('/admissions', params),

  getAdmissionsTrends: (unitid: number) =>
    fetchApi<ApiResponse<AdmissionsData[]>>(`/admissions/trends/${unitid}`),

  getMostSelective: (year = 2023, limit = 20) =>
    fetchApi<ApiResponse<AdmissionsData[]>>('/admissions/most-selective', { year, limit }),

  // Enrollment
  getEnrollmentTotals: (params?: { year?: number; state?: string }) =>
    fetchApi<ApiResponse<{ year: number; total_enrollment: number }[]>>('/enrollment/totals', params),

  getEnrollmentTrends: (unitid: number) =>
    fetchApi<ApiResponse<{ year: number; total_enrollment: number }[]>>(`/enrollment/trends/${unitid}`),

  getEnrollmentByRace: (unitid: number, year = 2023) =>
    fetchApi<ApiResponse<{ race: string; race_label: string; enrollment: number; pct: string }[]>>(`/enrollment/by-race/${unitid}`, { year }),

  getEnrollmentByLevel: (unitid: number, year = 2023) =>
    fetchApi<ApiResponse<{ level: string; full_time: number; part_time: number; total: number }[]>>(`/enrollment/by-level/${unitid}`, { year }),

  getEnrollmentByGender: (unitid: number, year = 2023) =>
    fetchApi<ApiResponse<{ gender: string; enrollment: number; pct: string }[]>>(`/enrollment/by-gender/${unitid}`, { year }),

  // Graduation
  getGraduationRates: (unitid: number) =>
    fetchApi<ApiResponse<{ year: number; total_cohort: number; total_completers: number; grad_rate: string }[]>>(`/graduation/rates/${unitid}`),

  getGraduationByRace: (unitid: number, year = 2023) =>
    fetchApi<ApiResponse<{ race: string; cohort_count: number; completers: number; grad_rate: string }[]>>(`/graduation/by-race/${unitid}`, { year }),

  getTopGraduationRates: (year = 2023, state?: string, limit = 20) =>
    fetchApi<ApiResponse<{ unitid: number; name: string; state: string; cohort_count: number; completers: number; grad_rate: string }[]>>('/graduation/top', { year, state, limit }),

  // Financial
  getFinancialTrends: (unitid: number) =>
    fetchApi<ApiResponse<{
      year: number;
      avg_net_price: number;
      avg_net_price_0_30k: number;
      avg_net_price_30_48k: number;
      avg_net_price_48_75k: number;
      avg_net_price_75_110k: number;
      avg_net_price_110k_plus: number;
      pell_recipients: number;
      pell_pct: string;
    }[]>>(`/financial/trends/${unitid}`),

  // Completions
  getCompletionsTrends: (unitid: number) =>
    fetchApi<ApiResponse<{ year: number; total_completions: number }[]>>(`/completions/trends/${unitid}`),

  getCompletionsByField: (unitid: number, year = 2023) =>
    fetchApi<ApiResponse<{ cip_family: string; field_name: string; completions: number }[]>>(`/completions/by-field/${unitid}`, { year }),

  getCompletionsByAwardLevel: (unitid: number, year = 2023) =>
    fetchApi<ApiResponse<{ award_level: number; award_name: string; completions: number }[]>>(`/completions/by-award-level/${unitid}`, { year }),

  getMostAffordable: (year = 2023, state?: string, income_bracket?: string, limit = 20) =>
    fetchApi<ApiResponse<{ unitid: number; name: string; state: string; net_price: number; pell_pct: string }[]>>('/financial/most-affordable', { year, state, income_bracket, limit }),

  getHighPell: (year = 2023, state?: string, min_pct = 50, limit = 20) =>
    fetchApi<ApiResponse<{ unitid: number; name: string; state: string; pell_pct: string; pell_recipients: number }[]>>('/financial/high-pell', { year, state, min_pct, limit }),

  // Search
  searchText: (q: string, limit = 20) =>
    fetchApi<ApiResponse<Institution[]>>('/search/text', { q, limit }),

  advancedSearch: (params: {
    name?: string;
    state?: string;
    sector?: number;
    hbcu?: boolean;
    min_enrollment?: number;
    max_enrollment?: number;
    min_grad_rate?: number;
    max_admit_rate?: number;
    max_net_price?: number;
    year?: number;
    limit?: number;
  }) => fetchApi<ApiResponse<Institution[]>>('/search/advanced', params),

  // Stats
  getStats: () =>
    fetchApi<ApiResponse<StatsData>>('/stats'),

  getStatsByState: () =>
    fetchApi<ApiResponse<{ state: string; institution_count: number }[]>>('/stats/by-state'),

  getStatsBySector: () =>
    fetchApi<ApiResponse<{ sector: number; sector_name: string; institution_count: number }[]>>('/stats/by-sector'),

  getEnrollmentStatsTrends: () =>
    fetchApi<ApiResponse<{ year: number; total_enrollment: number }[]>>('/stats/enrollment-trends'),

  getCompletionsStatsTrends: (state?: string, award_level?: number) =>
    fetchApi<ApiResponse<{ year: number; total_completions: number }[]>>('/stats/completions-trends', { state, award_level }),
};
