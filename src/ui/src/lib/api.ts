const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export const api = {
  get: <T>(path: string): Promise<T> =>
    fetch(`${API_BASE}${path}`).then(handleResponse<T>),
}

// Types
export interface PowerPlant {
  id: number
  gppd_idnr: string
  name: string
  country_code: string
  country: string
  capacity_mw: number
  latitude: number
  longitude: number
  primary_fuel: string
  commissioning_year?: number
  owner?: string
}

export interface PowerPlantDetail extends PowerPlant {
  other_fuel1?: string
  other_fuel2?: string
  other_fuel3?: string
  source?: string
  url?: string
  generation: {
    year: number
    generation_gwh?: number
    estimated_generation_gwh?: number
    estimation_method?: string
  }[]
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PowerPlantListResponse {
  data: PowerPlant[]
  pagination: Pagination
}

export interface SummaryStats {
  totalPlants: number
  totalCapacityMw: number
  totalCapacityGw: number
  totalCountries: number
  fuelTypes: number
  avgCapacityMw: number
  maxCapacityMw: number
}

export interface CountryStats {
  countryCode: string
  country: string
  plantCount: number
  totalCapacityMw: number
  totalCapacityGw: number
}

export interface FuelStats {
  fuel: string
  plantCount: number
  totalCapacityMw: number
  totalCapacityGw: number
  percentageOfTotal: string
}
