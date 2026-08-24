import React, { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import type { PickupStopStatus } from '../../api/hubPickupApi';

// ─── Tipos ─────────────────────────────────────────────────────────────────

export type MapStopDirection = 'pickup' | 'delivery' | 'clinic_return' | 'unknown';

export type MapStop = {
  id: string;
  petName: string;
  guardianName?: string | null;
  address?: string | null;
  direction: MapStopDirection;
  sequence: number;
  time?: string | null;
  lat: number;
  lng: number;
  status?: PickupStopStatus | string | null;
};

export type MapAvailableStop = {
  id: string;
  petName: string;
  guardianName?: string | null;
  address?: string | null;
  direction: MapStopDirection;
  lat: number;
  lng: number;
};

export type InferredMapMarker = {
  lat: number;
  lng: number;
  label: string;
};

type Props = {
  /** Paradas selecionadas na rota (numeradas por sequence). */
  stops: MapStop[];
  /** Pernas soltas ainda não adicionadas à rota (plotadas em cinza). */
  availableStops?: MapAvailableStop[];
  /** Ponto de saída do motorista (clínica ou endereço custom). */
  startPoint?: { lat: number; lng: number; label: string; address?: string | null } | null;
  /** Última posição conhecida inferida (monitoramento sem GPS). */
  inferredPosition?: InferredMapMarker | null;
  /** Destaca a parada de destino (ex.: a caminho de). */
  highlightStopId?: string | null;
  /** Altura do mapa (px). Default do CSS do builder. */
  mapHeight?: number;
};

// ─── Ícones ────────────────────────────────────────────────────────────────

function directionColor(direction: MapStopDirection): string {
  if (direction === 'pickup') return '#1d4ed8';
  if (direction === 'delivery') return '#15803d';
  if (direction === 'clinic_return') return '#c86a4d';
  return '#64748b';
}

function statusOpacity(status?: string | null): number {
  if (!status) return 1;
  if (status === 'completed') return 0.55;
  if (status === 'failed') return 0.4;
  if (status === 'pending') return 0.85;
  return 1;
}

function makeNumberedIcon(
  sequence: number,
  direction: MapStopDirection,
  opts?: { status?: string | null; highlighted?: boolean },
): L.DivIcon {
  const bg = directionColor(direction);
  const opacity = statusOpacity(opts?.status);
  const ring = opts?.highlighted ? '3px solid #f59e0b' : '2px solid rgba(255,255,255,0.9)';
  const size = opts?.highlighted ? 32 : 28;
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${bg};
      color:#fff;
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:13px;
      font-weight:700;
      border:${ring};
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
      font-family:system-ui,sans-serif;
      opacity:${opacity};
    ">${sequence + 1}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -16],
  });
}

const startIcon = L.divIcon({
  className: '',
  html: `<div style="
    background:#c86a4d;
    color:#fff;
    width:30px;
    height:30px;
    border-radius:8px;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:11px;
    font-weight:700;
    border:2px solid rgba(255,255,255,0.95);
    box-shadow:0 2px 6px rgba(0,0,0,0.3);
    font-family:system-ui,sans-serif;
  ">S</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -16],
});

const grayIcon = L.divIcon({
  className: '',
  html: `<div style="
    background:#94a3b8;
    color:#fff;
    width:22px;
    height:22px;
    border-radius:50%;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:11px;
    font-weight:700;
    border:2px solid rgba(255,255,255,0.9);
    box-shadow:0 1px 4px rgba(0,0,0,0.25);
    font-family:system-ui,sans-serif;
  ">·</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
});

const inferredIcon = L.divIcon({
  className: '',
  html: `<div style="
    background:#0f172a;
    color:#fff;
    width:34px;
    height:34px;
    border-radius:10px;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:12px;
    font-weight:800;
    border:3px solid #fbbf24;
    box-shadow:0 3px 10px rgba(0,0,0,0.35);
    font-family:system-ui,sans-serif;
  ">M</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -18],
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

function directionLabel(direction: MapStopDirection): string {
  if (direction === 'pickup') return '↓ Coleta';
  if (direction === 'delivery') return '↑ Entrega';
  if (direction === 'clinic_return') return '↩ Clínica';
  return 'L&T';
}

export const PickupRouteMap: React.FC<Props> = ({
  stops,
  availableStops = [],
  startPoint = null,
  inferredPosition = null,
  highlightStopId = null,
  mapHeight,
}) => {
  const allPoints: [number, number][] = [
    ...(startPoint ? ([[startPoint.lat, startPoint.lng]] as [number, number][]) : []),
    ...stops.map((s): [number, number] => [s.lat, s.lng]),
    ...availableStops.map((s): [number, number] => [s.lat, s.lng]),
    ...(inferredPosition
      ? ([[inferredPosition.lat, inferredPosition.lng]] as [number, number][])
      : []),
  ];

  // Pontos da polyline: saída → paradas em ordem
  const routeLine: [number, number][] = [
    ...(startPoint ? ([[startPoint.lat, startPoint.lng]] as [number, number][]) : []),
    ...stops
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((s): [number, number] => [s.lat, s.lng]),
  ];

  // Centro inicial (São Paulo como fallback)
  const center: [number, number] = allPoints[0] ?? [-23.5505, -46.6333];

  const withoutMap = stops.filter((s) => !s.lat || !s.lng);
  const availWithoutMap = availableStops.filter((s) => !s.lat || !s.lng);
  const missingCount = withoutMap.length + availWithoutMap.length;

  return (
    <div
      className="hub-pickup-builder__map-wrapper"
      style={mapHeight ? { minHeight: mapHeight } : undefined}
    >
      <MapContainer
        center={center}
        zoom={12}
        className="hub-pickup-builder__map"
        style={mapHeight ? { height: mapHeight } : undefined}
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

        {startPoint ? (
          <Marker position={[startPoint.lat, startPoint.lng]} icon={startIcon}>
            <Popup>
              <div style={{ fontSize: '0.8125rem', lineHeight: '1.5', minWidth: '160px' }}>
                <strong>{startPoint.label}</strong>
                {startPoint.address ? <div>{startPoint.address}</div> : null}
              </div>
            </Popup>
          </Marker>
        ) : null}

        {/* Marcadores numerados das paradas selecionadas */}
        {stops.map((stop) => (
          <Marker
            key={stop.id}
            position={[stop.lat, stop.lng]}
            icon={makeNumberedIcon(stop.sequence, stop.direction, {
              status: stop.status,
              highlighted: highlightStopId === stop.id,
            })}
          >
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
                {stop.status ? (
                  <>
                    <br />
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Status: {stop.status}</span>
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
                    background:
                      stop.direction === 'pickup'
                        ? '#dbeafe'
                        : stop.direction === 'delivery'
                          ? '#dcfce7'
                          : stop.direction === 'clinic_return'
                            ? '#ffedd5'
                            : '#f1f5f9',
                    color: directionColor(stop.direction),
                  }}
                >
                  {directionLabel(stop.direction)} · #{stop.sequence + 1}
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

        {inferredPosition ? (
          <Marker
            position={[inferredPosition.lat, inferredPosition.lng]}
            icon={inferredIcon}
            zIndexOffset={1000}
          >
            <Popup>
              <div style={{ fontSize: '0.8125rem', lineHeight: '1.5', minWidth: '160px' }}>
                <strong>Motorista (inferido)</strong>
                <br />
                <span>{inferredPosition.label}</span>
                <br />
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                  Posição baseada no status da rota — sem GPS
                </span>
              </div>
            </Popup>
          </Marker>
        ) : null}
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
