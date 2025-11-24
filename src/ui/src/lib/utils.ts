import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num)
}

export function formatCapacity(mw: number): string {
  if (mw >= 1000) {
    return `${(mw / 1000).toFixed(1)} GW`
  }
  return `${mw.toFixed(0)} MW`
}

// Fuel type colors for charts
export const fuelColors: Record<string, string> = {
  Coal: '#4a4a4a',
  Gas: '#60a5fa',
  Hydro: '#3b82f6',
  Nuclear: '#a855f7',
  Oil: '#f97316',
  Solar: '#facc15',
  Wind: '#22c55e',
  Biomass: '#84cc16',
  Geothermal: '#ef4444',
  Other: '#6b7280',
  Waste: '#78716c',
  Storage: '#06b6d4',
  Cogeneration: '#ec4899',
  Petcoke: '#1f2937',
  'Wave and Tidal': '#0ea5e9',
}
