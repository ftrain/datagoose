import { useSummaryStats, useFuelStats, useCountryStats, useTopPlants } from '@/hooks/usePowerPlants'
import { formatNumber, formatCapacity, fuelColors } from '@/lib/utils'
import { Zap, Globe, Fuel, TrendingUp } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
}) {
  return (
    <div className="bg-card border rounded-lg p-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 rounded-lg">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useSummaryStats()
  const { data: fuelData } = useFuelStats()
  const { data: countryData } = useCountryStats(10)
  const { data: topPlants } = useTopPlants(5)

  if (summaryLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  const pieData = fuelData?.data.slice(0, 8).map(item => ({
    name: item.fuel,
    value: item.totalCapacityGw,
    color: fuelColors[item.fuel] || '#6b7280',
  })) || []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Global Power Plant Database</h1>
        <p className="text-muted-foreground mt-2">
          Explore {formatNumber(summary?.totalPlants || 0)} power plants across {summary?.totalCountries} countries
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Power Plants"
          value={formatNumber(summary?.totalPlants || 0)}
          icon={Zap}
        />
        <StatCard
          title="Total Capacity"
          value={formatCapacity(summary?.totalCapacityMw || 0)}
          subtitle={`${formatNumber(Math.round(summary?.totalCapacityGw || 0))} GW`}
          icon={TrendingUp}
        />
        <StatCard
          title="Countries"
          value={summary?.totalCountries || 0}
          icon={Globe}
        />
        <StatCard
          title="Fuel Types"
          value={summary?.fuelTypes || 0}
          icon={Fuel}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Capacity by Fuel Type */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Capacity by Fuel Type</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value.toFixed(1)} GW`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Countries by Capacity */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Top Countries by Capacity</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countryData?.data.slice(0, 10)} layout="vertical">
                <XAxis type="number" tickFormatter={(v) => `${v.toFixed(0)} GW`} />
                <YAxis type="category" dataKey="country" width={100} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => `${value.toFixed(1)} GW`} />
                <Bar dataKey="totalCapacityGw" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Fuel Type Breakdown Table */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Fuel Type Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4">Fuel Type</th>
                <th className="text-right py-2 px-4">Plants</th>
                <th className="text-right py-2 px-4">Capacity (GW)</th>
                <th className="text-right py-2 px-4">% of Total</th>
                <th className="text-right py-2 px-4">Countries</th>
              </tr>
            </thead>
            <tbody>
              {fuelData?.data.map((fuel) => (
                <tr key={fuel.fuel} className="border-b hover:bg-muted/50">
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: fuelColors[fuel.fuel] || '#6b7280' }}
                      />
                      {fuel.fuel}
                    </div>
                  </td>
                  <td className="text-right py-2 px-4">{formatNumber(fuel.plantCount)}</td>
                  <td className="text-right py-2 px-4">{fuel.totalCapacityGw.toFixed(1)}</td>
                  <td className="text-right py-2 px-4">{fuel.percentageOfTotal}%</td>
                  <td className="text-right py-2 px-4">{fuel.countryCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Largest Power Plants */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Largest Power Plants</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4">Rank</th>
                <th className="text-left py-2 px-4">Name</th>
                <th className="text-left py-2 px-4">Country</th>
                <th className="text-left py-2 px-4">Fuel</th>
                <th className="text-right py-2 px-4">Capacity</th>
              </tr>
            </thead>
            <tbody>
              {topPlants?.data.map((plant, index) => (
                <tr key={plant.id} className="border-b hover:bg-muted/50">
                  <td className="py-2 px-4 font-mono">#{index + 1}</td>
                  <td className="py-2 px-4 font-medium">{plant.name}</td>
                  <td className="py-2 px-4">{plant.country}</td>
                  <td className="py-2 px-4">
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
                  <td className="text-right py-2 px-4 font-mono">
                    {formatCapacity(plant.capacity_mw)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
