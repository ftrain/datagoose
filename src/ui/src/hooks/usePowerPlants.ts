import { useQuery } from '@tanstack/react-query'
import { api, PowerPlantListResponse, PowerPlantDetail, SummaryStats } from '@/lib/api'

interface UsePowerPlantsParams {
  page?: number
  limit?: number
  country?: string
  fuel?: string
  search?: string
  minCapacity?: number
  maxCapacity?: number
}

export function usePowerPlants(params: UsePowerPlantsParams = {}) {
  const { page = 1, limit = 20, country, fuel, search, minCapacity, maxCapacity } = params

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (country) queryParams.set('country', country)
  if (fuel) queryParams.set('fuel', fuel)
  if (search) queryParams.set('search', search)
  if (minCapacity) queryParams.set('minCapacity', String(minCapacity))
  if (maxCapacity) queryParams.set('maxCapacity', String(maxCapacity))

  return useQuery({
    queryKey: ['power-plants', params],
    queryFn: () => api.get<PowerPlantListResponse>(`/power-plants?${queryParams}`),
  })
}

export function usePowerPlant(id: number) {
  return useQuery({
    queryKey: ['power-plant', id],
    queryFn: () => api.get<PowerPlantDetail>(`/power-plants/${id}`),
    enabled: !!id,
  })
}

export function useSummaryStats() {
  return useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: () => api.get<SummaryStats>('/stats/summary'),
  })
}

export function useCountryStats(limit = 20) {
  return useQuery({
    queryKey: ['stats', 'by-country', limit],
    queryFn: () => api.get<{ data: any[] }>(`/stats/by-country?limit=${limit}`),
  })
}

export function useFuelStats() {
  return useQuery({
    queryKey: ['stats', 'by-fuel'],
    queryFn: () => api.get<{ data: any[]; totalCapacityMw: number }>('/stats/by-fuel'),
  })
}

export function useTopPlants(limit = 10, fuel?: string) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (fuel) params.set('fuel', fuel)

  return useQuery({
    queryKey: ['stats', 'top-plants', limit, fuel],
    queryFn: () => api.get<{ data: any[] }>(`/stats/top-plants?${params}`),
  })
}
