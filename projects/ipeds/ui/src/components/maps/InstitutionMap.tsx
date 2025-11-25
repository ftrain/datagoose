import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Institution {
  unitid: number;
  name: string;
  city?: string;
  state?: string;
  latitude: number | null;
  longitude: number | null;
}

interface InstitutionMapProps {
  institutions: Institution[];
  center?: [number, number];
  zoom?: number;
  height?: number;
  showRadius?: {
    center: [number, number];
    radiusMiles: number;
  };
  onMarkerClick?: (unitid: number) => void;
  selectedId?: number;
}

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

export function InstitutionMap({
  institutions,
  center,
  zoom = 10,
  height = 400,
  showRadius,
  onMarkerClick,
  selectedId,
}: InstitutionMapProps) {
  // Filter to institutions with valid coordinates
  const validInstitutions = institutions.filter(
    (i) => i.latitude !== null && i.longitude !== null
  );

  // Calculate center from institutions if not provided
  const mapCenter = center || (validInstitutions.length > 0
    ? [
        validInstitutions.reduce((sum, i) => sum + (i.latitude || 0), 0) / validInstitutions.length,
        validInstitutions.reduce((sum, i) => sum + (i.longitude || 0), 0) / validInstitutions.length,
      ] as [number, number]
    : [39.8283, -98.5795] as [number, number]); // Center of US

  // Create custom icons
  const defaultIcon = new L.Icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  const selectedIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  return (
    <div style={{ height, width: '100%' }} className="rounded-lg overflow-hidden border">
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController center={mapCenter} zoom={zoom} />

        {showRadius && (
          <Circle
            center={showRadius.center}
            radius={showRadius.radiusMiles * 1609.34} // Convert miles to meters
            pathOptions={{
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.1,
              weight: 2,
            }}
          />
        )}

        {validInstitutions.map((institution) => (
          <Marker
            key={institution.unitid}
            position={[institution.latitude!, institution.longitude!]}
            icon={institution.unitid === selectedId ? selectedIcon : defaultIcon}
            eventHandlers={{
              click: () => onMarkerClick?.(institution.unitid),
            }}
          >
            <Popup>
              <div className="text-sm">
                <strong className="block">{institution.name}</strong>
                {institution.city && institution.state && (
                  <span className="text-gray-600">{institution.city}, {institution.state}</span>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
