import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePowerPlants } from '@/hooks/usePowerPlants'
import { formatCapacity, fuelColors } from '@/lib/utils'
import { Search, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'

const FUEL_TYPES = [
  'Coal', 'Gas', 'Hydro', 'Nuclear', 'Oil', 'Solar', 'Wind',
  'Biomass', 'Geothermal', 'Other', 'Waste', 'Storage'
]

export default function PowerPlants() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [fuel, setFuel] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading } = usePowerPlants({
    page,
    limit: 20,
    search: search || undefined,
    fuel: fuel || undefined,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Power Plants</h1>
        <p className="text-muted-foreground mt-2">
          Browse and search the global power plant database
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by plant name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </form>

        <select
          value={fuel}
          onChange={(e) => {
            setFuel(e.target.value)
            setPage(1)
          }}
          className="px-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Fuel Types</option>
          {FUEL_TYPES.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {/* Active Filters */}
      {(search || fuel) && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filters:</span>
          {search && (
            <button
              onClick={() => { setSearch(''); setSearchInput('') }}
              className="px-2 py-1 text-sm bg-secondary rounded-md hover:bg-secondary/80"
            >
              Search: {search} ×
            </button>
          )}
          {fuel && (
            <button
              onClick={() => setFuel('')}
              className="px-2 py-1 text-sm bg-secondary rounded-md hover:bg-secondary/80"
            >
              Fuel: {fuel} ×
            </button>
          )}
        </div>
      )}

      {/* Results Table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">Name</th>
                    <th className="text-left py-3 px-4 font-medium">Country</th>
                    <th className="text-left py-3 px-4 font-medium">Fuel</th>
                    <th className="text-right py-3 px-4 font-medium">Capacity</th>
                    <th className="text-right py-3 px-4 font-medium">Year</th>
                    <th className="text-center py-3 px-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {data?.data.map((plant) => (
                    <tr key={plant.id} className="border-t hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <Link
                          to={`/power-plants/${plant.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {plant.name}
                        </Link>
                        <p className="text-xs text-muted-foreground font-mono">
                          {plant.gppd_idnr}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-sm">{plant.country_code}</span>
                        <p className="text-xs text-muted-foreground">{plant.country}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${fuelColors[plant.primary_fuel]}20`,
                            color: fuelColors[plant.primary_fuel],
                          }}
                        >
                          {plant.primary_fuel}
                        </span>
                      </td>
                      <td className="text-right py-3 px-4 font-mono">
                        {formatCapacity(plant.capacity_mw)}
                      </td>
                      <td className="text-right py-3 px-4 text-muted-foreground">
                        {plant.commissioning_year || '-'}
                      </td>
                      <td className="text-center py-3 px-4">
                        <Link
                          to={`/power-plants/${plant.id}`}
                          className="p-1 hover:bg-muted rounded"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Showing {((data?.pagination.page || 1) - 1) * 20 + 1} to{' '}
                {Math.min((data?.pagination.page || 1) * 20, data?.pagination.total || 0)} of{' '}
                {data?.pagination.total?.toLocaleString()} results
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 py-1 text-sm">
                  Page {data?.pagination.page} of {data?.pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= (data?.pagination.totalPages || 1)}
                  className="p-2 rounded border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
