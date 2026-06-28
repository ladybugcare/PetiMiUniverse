import React, { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';

// ─── Tipos ─────────────────────────────────────────────────────────────────

export type MapStop = {
  id: string;
  petName: string;
  guardianName?: string | null;
  address?: string | null;
  direction: 'pickup' | 'delivery' | 'unknown';
  sequence: number;
  time?: string | null;
  lat: number;
  lng: number;
};

export type MapAvailableStop = {
  id: string;
  petName: string;
  guardianName?: string | null;
  address?: string | null;
  direction: 'pickup' | 'delivery' | 'unknown';
  lat: number;
  lng: number;
};

type Props = {
  /** Paradas selecionadas na rota (numeradas por sequence). */
  stops: MapStop[];
  /** Pernas soltas ainda não adicionadas à rota (plotadas em cinza). */
  availableStops?: MapAvailableStop[];
};

// ─── Ícones ────────────────────────────────────────────────────────────────

function makeNumberedIcon(sequence: number, direction: 'pickup' | 'delivery' | 'unknown'): L.DivIcon {
  const bg =
    direction === 'pickup' ? '#1d4ed8' : direction === 'delivery' ? '#15803d' : '#64748b';
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${bg};
      color:#fff;
      width:28px;
      height:28px;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:13px;
      font-weight:700;
      border:2px solid rgba(255,255,255,0.9);
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
      font-family:system-ui,sans-serif;
    ">${sequence + 1}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

const grayIcon = L.divIcon({
  className: '',
  html: `<div style="
    background:#94a3b8;
    width:18px;
    height:18px;
    border-radius:50%;
    border:2px solid rgba(255,255,255,0.8);
    box-shadow:0 1px 4px rgba(0,0,0,0.25);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -12],
});

// ─── FitBounds interno ────────────────────────────────────────────────────

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [map, JSON.stringify(points)]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ─── Componente principal ─────────────────────────────────────────────────

function formatTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export const PickupRouteMap: React.FC<Props> = ({ stops, availableStops = [] }) => {
  const allPoints: [number, number][] = [
    ...stops.map((s): [number, number] => [s.lat, s.lng]),
    ...availableStops.map((s): [number, number] => [s.lat, s.lng]),
  ];

  // Pontos da polyline em ordem de sequence
  const routeLine: [number, number][] = stops
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((s): [number, number] => [s.lat, s.lng]);

  // Centro inicial (São Paulo como fallback)
  const center: [number, number] = allPoints[0] ?? [-23.5505, -46.6333];

  const withoutMap = stops.filter((s) => !s.lat || !s.lng);
  const availWithoutMap = availableStops.filter((s) => !s.lat || !s.lng);
  const missingCount = withoutMap.length + availWithoutMap.length;

  return (
    <div className="hub-pickup-builder__map-wrapper">
      <MapContainer
        center={center}
        zoom={12}
        className="hub-pickup-builder__map"
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        {allPoints.length > 0 ? <FitBounds points={allPoints} /> : null}

        {/* Polyline da rota selecionada */}
        {routeLine.length >= 2 ? (
          <Polyline
            positions={routeLine}
            pathOptions={{ color: '#4f46e5', weight: 3, opacity: 0.7, dashArray: '8 4' }}
          />
        ) : null}

        {/* Marcadores numerados das paradas selecionadas */}
        {stops.map((stop) => (
          <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={makeNumberedIcon(stop.sequence, stop.direction)}>
            <Popup>
              <div style={{ fontSize: '0.8125rem', lineHeight: '1.5', minWidth: '160px' }}>
                <strong>{stop.petName}</strong>
                <br />
                {stop.guardianName ? <span style={{ color: '#475569' }}>{stop.guardianName}</span> : null}
                {stop.address ? (
                  <>
                    <br />
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{stop.address}</span>
                  </>
                ) : null}
                {stop.time ? (
                  <>
                    <br />
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{formatTime(stop.time)}</span>
                  </>
                ) : null}
                <br />
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: '4px',
                    padding: '1px 6px',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: stop.direction === 'pickup' ? '#dbeafe' : stop.direction === 'delivery' ? '#dcfce7' : '#f1f5f9',
                    color: stop.direction === 'pickup' ? '#1d4ed8' : stop.direction === 'delivery' ? '#15803d' : '#64748b',
                  }}
                >
                  {stop.direction === 'pickup' ? '↓ Coleta' : stop.direction === 'delivery' ? '↑ Entrega' : 'L&T'} · #{stop.sequence + 1}
                </span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Marcadores cinzas das pernas soltas disponíveis */}
        {availableStops.map((stop) => (
          <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={grayIcon}>
            <Popup>
              <div style={{ fontSize: '0.8125rem', lineHeight: '1.5' }}>
                <strong>{stop.petName}</strong>
                {stop.guardianName ? (
                  <>
                    <br />
                    <span style={{ color: '#475569' }}>{stop.guardianName}</span>
                  </>
                ) : null}
                {stop.address ? (
                  <>
                    <br />
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{stop.address}</span>
                  </>
                ) : null}
                <br />
                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Perna solta (não adicionada)</span>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {missingCount > 0 ? (
        <p className="hub-pickup-builder__map-missing">
          {missingCount} parada{missingCount !== 1 ? 's' : ''} sem coordenadas (endereço não geocodificado ainda — aparecerá no mapa após salvar a rota)
        </p>
      ) : null}
    </div>
  );
};

export default PickupRouteMap;
