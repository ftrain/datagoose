import { useParams, Link } from 'react-router-dom'
import { usePowerPlant } from '@/hooks/usePowerPlants'
import { formatCapacity, fuelColors } from '@/lib/utils'
import { ArrowLeft, MapPin, Calendar, Building2, ExternalLink, Zap } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

export default function PowerPlantDetail() {
  const { id } = useParams()
  const { data: plant, isLoading, error } = usePowerPlant(Number(id))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error || !plant) {
    return (
      <div className="text-center py-12">
        <p className="text-lg text-muted-foreground">Power plant not found</p>
        <Link to="/power-plants" className="text-primary hover:underline mt-2 inline-block">
          Back to list
        </Link>
      </div>
    )
  }

  const generationData = plant.generation?.map(g => ({
    year: g.year,
    reported: g.generation_gwh,
    estimated: g.estimated_generation_gwh,
  })) || []

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        to="/power-plants"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Power Plants
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{plant.name}</h1>
          <p className="text-muted-foreground font-mono">{plant.gppd_idnr}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: `${fuelColors[plant.primary_fuel]}20`,
              color: fuelColors[plant.primary_fuel],
            }}
          >
            {plant.primary_fuel}
          </span>
          <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary/10 text-primary">
            {formatCapacity(plant.capacity_mw)}
          </span>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Location</p>
              <p className="font-medium">{plant.country}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {Number(plant.latitude).toFixed(4)}, {Number(plant.longitude).toFixed(4)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Capacity</p>
              <p className="font-medium">{formatCapacity(plant.capacity_mw)}</p>
              <p className="text-xs text-muted-foreground">
                {Number(plant.capacity_mw).toLocaleString()} MW
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Commissioned</p>
              <p className="font-medium">
                {plant.commissioning_year || 'Unknown'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Owner</p>
              <p className="font-medium truncate" title={plant.owner || 'Unknown'}>
                {plant.owner || 'Unknown'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Fuel Types */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Fuel Types</h2>
        <div className="flex flex-wrap gap-2">
          <span
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: `${fuelColors[plant.primary_fuel]}20`,
              color: fuelColors[plant.primary_fuel],
            }}
          >
            {plant.primary_fuel} (Primary)
          </span>
          {plant.other_fuel1 && (
            <span
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: `${fuelColors[plant.other_fuel1]}20`,
                color: fuelColors[plant.other_fuel1],
              }}
            >
              {plant.other_fuel1}
            </span>
          )}
          {plant.other_fuel2 && (
            <span
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: `${fuelColors[plant.other_fuel2]}20`,
                color: fuelColors[plant.other_fuel2],
              }}
            >
              {plant.other_fuel2}
            </span>
          )}
          {plant.other_fuel3 && (
            <span
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: `${fuelColors[plant.other_fuel3]}20`,
                color: fuelColors[plant.other_fuel3],
              }}
            >
              {plant.other_fuel3}
            </span>
          )}
        </div>
      </div>

      {/* Generation Chart */}
      {generationData.length > 0 && (
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Annual Generation (GWh)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={generationData}>
                <XAxis dataKey="year" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="reported" name="Reported" fill="hsl(var(--primary))" />
                <Bar dataKey="estimated" name="Estimated" fill="hsl(var(--primary) / 0.5)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Source Information */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Source Information</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-muted-foreground">Data Source</dt>
            <dd className="font-medium">{plant.source || 'Unknown'}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Geolocation Source</dt>
            <dd className="font-medium">{plant.geolocation_source || 'Unknown'}</dd>
          </div>
          {plant.url && (
            <div className="md:col-span-2">
              <dt className="text-sm text-muted-foreground">Reference URL</dt>
              <dd>
                <a
                  href={plant.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  {plant.url}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Map Link */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Location</h2>
        <a
          href={`https://www.google.com/maps?q=${plant.latitude},${plant.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          <MapPin className="h-4 w-4" />
          View on Google Maps
        </a>
        <p className="mt-2 text-sm text-muted-foreground">
          Coordinates: {Number(plant.latitude).toFixed(6)}, {Number(plant.longitude).toFixed(6)}
        </p>
      </div>
    </div>
  )
}
