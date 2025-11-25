export interface Institution {
  unitid: number;
  name: string;
  city: string;
  state: string;
  zip: string;
  sector: number;
  sector_name?: string;
  level: number;
  control: number;
  hbcu: boolean;
  latitude: number | null;
  longitude: number | null;
  website?: string;
}

export interface Admissions {
  unitid: number;
  year: number;
  applicants_total: number | null;
  applicants_men: number | null;
  applicants_women: number | null;
  admissions_total: number | null;
  admissions_men: number | null;
  admissions_women: number | null;
  enrolled_total: number | null;
  enrolled_men: number | null;
  enrolled_women: number | null;
  sat_verbal_25: number | null;
  sat_verbal_75: number | null;
  sat_math_25: number | null;
  sat_math_75: number | null;
  act_composite_25: number | null;
  act_composite_75: number | null;
  admit_rate?: number;
  yield_rate?: number;
}

export interface GraduationRate {
  unitid: number;
  year: number;
  cohort: string;
  race: string;
  gender: string;
  cohort_count: number | null;
  completers_150: number | null;
  grad_rate: number | null;
}

export interface Enrollment {
  unitid: number;
  year: number;
  level: string;
  race: string;
  gender: string;
  enrollment: number;
}

export interface Completion {
  unitid: number;
  year: number;
  cip_code: string;
  cip_title: string;
  award_level: number;
  race: string;
  gender: string;
  completions: number;
}

export interface FinancialAid {
  unitid: number;
  year: number;
  avg_net_price: number | null;
  avg_net_price_0_30k: number | null;
  avg_net_price_30_48k: number | null;
  avg_net_price_48_75k: number | null;
  avg_net_price_75_110k: number | null;
  avg_net_price_110k_plus: number | null;
  pell_recipients: number | null;
  pell_pct: number | null;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
