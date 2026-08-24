import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, RefreshCw, User } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import {
  hubPickupApi,
  type PickupRouteDetailResponse,
  type PickupStop,
  type PickupStopEvent,
} from '../../api/hubPickupApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import PickupRouteMap, { type MapStop } from './PickupRouteMap';
import { inferDriverMapPosition } from './inferDriverMapPosition';
import { stopToMapPoint } from './pickupMapsLinks';
import './pickup-page.css';

const POLL_MS = 20_000;

const STOP_STATUS_LABELS: Record<string, string> = {
  pending: 'A fazer',
  en_route: 'A caminho',
  arrived: 'No endereço',
  in_transit: 'Pet a bordo',
  completed: 'Concluída',
  failed: 'Falhou',
};

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function directionShort(direction: string | undefined): string {
  if (direction === 'pickup') return 'Coleta';
  if (direction === 'delivery') return 'Entrega';
  if (direction === 'clinic_return') return 'Retorno';
  return 'Parada';
}

function stopDisplayName(stop: PickupStop | undefined): string {
  if (!stop) return 'Parada';
  if (stop.direction === 'clinic_return') return 'Retorno à clínica';
  return stop.pet?.name?.trim() || directionShort(stop.direction);
}

function addressText(stop: PickupStop): string | null {
  const p = stopToMapPoint(stop);
  return p.address ?? null;
}

type Props = {
  routeId?: string;
};

const PickupRouteMonitorPage: React.FC<Props> = ({ routeId: routeIdProp }) => {
  const params = useParams<{ routeId: string }>();
  const routeId = routeIdProp ?? params.routeId;
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const canManage = hasPermission('pickup.routes.manage');

  const [data, setData] = useState<PickupRouteDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    if (permLoading) return;
    if (!canManage) {
      navigate('/hub/leva-e-traz', { replace: true });
    }
  }, [permLoading, canManage, navigate]);

  const load = useCallback(async () => {
    if (!clinicId || !routeId) return;
    const seq = ++loadSeqRef.current;
    try {
      const res = await hubPickupApi.getRoute(routeId, clinicId);
      if (seq !== loadSeqRef.current) return;
      setData(res);
    } catch (e: unknown) {
      if (seq !== loadSeqRef.current) return;
      showError((e as Error)?.message || 'Erro ao carregar monitoramento');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [clinicId, routeId, showError]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const stops = data?.stops ?? [];
  const events = data?.events ?? [];
  const route = data?.route;

  const stopById = useMemo(() => {
    const m = new Map<string, PickupStop>();
    for (const s of stops) m.set(s.id, s);
    return m;
  }, [stops]);

  const inferred = useMemo(() => {
    if (!route) return null;
    return inferDriverMapPosition(route, stops);
  }, [route, stops]);

  const mapStops = useMemo((): MapStop[] => {
    const out: MapStop[] = [];
    for (const s of stops) {
      const p = stopToMapPoint(s);
      let lat = typeof p.lat === 'number' && Number.isFinite(p.lat) ? p.lat : null;
      let lng = typeof p.lng === 'number' && Number.isFinite(p.lng) ? p.lng : null;
      if ((lat == null || lng == null) && s.direction === 'clinic_return' && route) {
        if (
          typeof route.start_lat === 'number' &&
          Number.isFinite(route.start_lat) &&
          typeof route.start_lng === 'number' &&
          Number.isFinite(route.start_lng)
        ) {
          lat = route.start_lat;
          lng = route.start_lng;
        }
      }
      if (lat == null || lng == null) continue;
      out.push({
        id: s.id,
        petName: stopDisplayName(s),
        guardianName: s.guardian?.full_name ?? null,
        address: p.address,
        direction:
          s.direction === 'pickup' || s.direction === 'delivery' || s.direction === 'clinic_return'
            ? s.direction
            : 'unknown',
        sequence: s.sequence,
        time: s.planned_at ?? s.completed_at ?? null,
        lat,
        lng,
        status: s.status,
      });
    }
    return out;
  }, [stops, route]);

  const startPoint = useMemo(() => {
    if (
      !route ||
      typeof route.start_lat !== 'number' ||
      !Number.isFinite(route.start_lat) ||
      typeof route.start_lng !== 'number' ||
      !Number.isFinite(route.start_lng)
    ) {
      return null;
    }
    return {
      lat: route.start_lat,
      lng: route.start_lng,
      label: route.start_kind === 'custom' ? 'Saída' : 'Clínica',
      address: route.start_address ?? null,
    };
  }, [route]);

  const activeStop = useMemo(() => {
    if (!inferred?.activeStopId) return null;
    return stopById.get(inferred.activeStopId) ?? null;
  }, [inferred, stopById]);

  const historyNewestFirst = useMemo(
    () => [...events].sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at))),
    [events],
  );

  if (permLoading || (!canManage && !loading)) {
    return <HubLoading label="Carregando…" />;
  }

  if (!routeId) {
    return <p className="hub-clientes__muted" style={{ padding: '1rem' }}>ID de rota inválido.</p>;
  }

  if (loading && !data) {
    return <HubLoading label="Carregando monitoramento…" />;
  }

  if (!data || !route) {
    return (
      <div className="hub-pickup-monitor">
        <p className="hub-clientes__muted">Rota não encontrada.</p>
        <Link to="/hub/leva-e-traz" className="hub-clientes__btn hub-clientes__btn--ghost">
          Voltar ao Leva e Traz
        </Link>
      </div>
    );
  }

  return (
    <div className="hub-pickup-monitor">
      <header className="hub-pickup-monitor__header">
        <div className="hub-pickup-monitor__header-left">
          <Link
            to="/hub/leva-e-traz"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
          >
            <ArrowLeft size={14} aria-hidden />
            Board
          </Link>
          <div>
            <h1 className="hub-pickup-monitor__title">
              Monitoramento
              {route.label?.trim() ? ` · ${route.label.trim()}` : ''}
            </h1>
            <p className="hub-pickup-monitor__meta">
              {route.driver ? (
                <>
                  <User size={12} aria-hidden /> {route.driver.full_name}
                  {route.vehicle_label ? ` · ${route.vehicle_label}` : ''}
                </>
              ) : (
                'Sem motorista'
              )}
              {' · '}
              {route.status === 'in_progress'
                ? 'Em rota'
                : route.status === 'planned'
                  ? 'Planejada'
                  : route.status === 'done'
                    ? 'Concluída'
                    : route.status}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
          onClick={() => void load()}
        >
          <RefreshCw size={14} aria-hidden />
          Atualizar
        </button>
      </header>

      <div className="hub-pickup-monitor__layout">
        <section className="hub-pickup-monitor__map-col" aria-label="Mapa da rota">
          <div className="hub-pickup-monitor__inferred-banner">
            {inferred ? (
              <>
                <MapPin size={16} aria-hidden />
                <span>
                  <strong>Última posição conhecida:</strong> {inferred.label}
                </span>
              </>
            ) : (
              <span className="hub-clientes__muted">
                Sem coordenadas suficientes para inferir a posição do motorista.
              </span>
            )}
          </div>
          <PickupRouteMap
            stops={mapStops}
            startPoint={startPoint}
            inferredPosition={
              inferred
                ? { lat: inferred.lat, lng: inferred.lng, label: inferred.label }
                : null
            }
            highlightStopId={inferred?.destinationStopId ?? inferred?.activeStopId ?? null}
            mapHeight={480}
          />
          {activeStop ? (
            <div className="hub-pickup-monitor__active-card">
              <p className="hub-pickup-monitor__active-title">Parada ativa</p>
              <p className="hub-pickup-monitor__active-pet">{stopDisplayName(activeStop)}</p>
              <p className="hub-clientes__muted">
                {directionShort(activeStop.direction)} ·{' '}
                {STOP_STATUS_LABELS[activeStop.status] ?? activeStop.status}
              </p>
              {addressText(activeStop) ? (
                <p className="hub-pickup-monitor__active-address">{addressText(activeStop)}</p>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside className="hub-pickup-monitor__side" aria-label="Histórico da rota">
          <h2 className="hub-pickup-monitor__side-title">Histórico</h2>
          {historyNewestFirst.length === 0 ? (
            <p className="hub-clientes__muted hub-pickup-monitor__side-empty">
              Ainda não há mudanças de status nesta rota. Quando o motorista avançar as paradas, os
              horários aparecem aqui.
            </p>
          ) : (
            <ol className="hub-pickup-monitor__events">
              {historyNewestFirst.map((ev: PickupStopEvent) => {
                const stop = stopById.get(ev.hub_pickup_stop_id);
                const from = ev.from_status
                  ? STOP_STATUS_LABELS[ev.from_status] ?? ev.from_status
                  : '—';
                const to = STOP_STATUS_LABELS[ev.to_status] ?? ev.to_status;
                return (
                  <li key={ev.id} className="hub-pickup-monitor__event">
                    <time dateTime={ev.recorded_at}>{formatTime(ev.recorded_at)}</time>
                    <div>
                      <strong>{stopDisplayName(stop)}</strong>
                      <span className="hub-clientes__muted">
                        {' '}
                        · {directionShort(stop?.direction)}
                      </span>
                      <div className="hub-pickup-monitor__event-status">
                        {from} → {to}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <h2 className="hub-pickup-monitor__side-title hub-pickup-monitor__side-title--spaced">
            Paradas
          </h2>
          <ol className="hub-pickup-monitor__stops">
            {[...stops]
              .sort((a, b) => a.sequence - b.sequence)
              .map((s) => (
                <li
                  key={s.id}
                  className={
                    inferred?.activeStopId === s.id
                      ? 'hub-pickup-monitor__stop hub-pickup-monitor__stop--active'
                      : 'hub-pickup-monitor__stop'
                  }
                >
                  <span className="hub-pickup-monitor__stop-seq">#{s.sequence + 1}</span>
                  <div>
                    <strong>{stopDisplayName(s)}</strong>
                    <div className="hub-clientes__muted">
                      {directionShort(s.direction)} · {STOP_STATUS_LABELS[s.status] ?? s.status}
                    </div>
                  </div>
                </li>
              ))}
          </ol>
        </aside>
      </div>
    </div>
  );
};

export default PickupRouteMonitorPage;
