import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  Truck,
  User,
} from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import {
  hubPickupApi,
  type PickupRouteDetailResponse,
  type PickupRouteStatus,
  type PickupStop,
  type PickupStopEvent,
  type PickupStopStatus,
} from '../../api/hubPickupApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import PickupRouteMap, { type MapStop } from './PickupRouteMap';
import { inferDriverMapPosition } from './inferDriverMapPosition';
import { stopToMapPoint } from './pickupMapsLinks';
import { usePickupStopCoords, withStopCoords } from './usePickupStopCoords';
import './pickup-page.css';

const POLL_MS = 20_000;

const ROUTE_STATUS_LABELS: Record<PickupRouteStatus, string> = {
  planned: 'Planejada',
  in_progress: 'Em rota',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

const ROUTE_STATUS_CLASS: Record<PickupRouteStatus, string> = {
  planned: 'hub-clientes__pill',
  in_progress: 'hub-clientes__pill hub-clinic-queue__pill--progress',
  done: 'hub-clientes__pill hub-clinic-queue__pill--done',
  cancelled: 'hub-clientes__pill hub-clinic-queue__pill--waiting',
};

const STOP_STATUS_LABELS: Record<string, string> = {
  pending: 'A fazer',
  en_route: 'A caminho',
  arrived: 'No endereço',
  in_transit: 'Pet a bordo',
  completed: 'Concluída',
  failed: 'Falhou',
};

type SideTab = 'stops' | 'history';

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatClock(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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

function stopStatusPillClass(status: string | undefined): string {
  if (status === 'en_route' || status === 'arrived' || status === 'in_transit') {
    return 'hub-clientes__pill hub-clinic-queue__pill--progress';
  }
  if (status === 'completed') return 'hub-clientes__pill hub-clinic-queue__pill--done';
  if (status === 'failed') return 'hub-clientes__pill hub-clinic-queue__pill--cancelled';
  return 'hub-clientes__pill hub-clinic-queue__pill--waiting';
}

function stopTone(status: string | undefined, isActive: boolean): string {
  if (isActive) return 'active';
  if (status === 'completed') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'en_route' || status === 'arrived' || status === 'in_transit') return 'progress';
  return 'pending';
}

function DirectionPill({ direction }: { direction: string | undefined }) {
  const dir =
    direction === 'pickup' || direction === 'delivery' || direction === 'clinic_return'
      ? direction
      : 'unknown';
  const Icon =
    dir === 'delivery' ? ArrowUpFromLine : dir === 'clinic_return' ? Navigation : ArrowDownToLine;
  return (
    <span
      className={`hub-clientes__pill hub-pickup-card__direction-pill hub-pickup-card__direction-pill--${dir}`}
    >
      <Icon size={11} aria-hidden />
      {directionShort(direction)}
    </span>
  );
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
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<SideTab>('stops');
  const loadSeqRef = useRef(0);
  const hasDataRef = useRef(false);

  useEffect(() => {
    if (permLoading) return;
    if (!canManage) {
      navigate('/hub/leva-e-traz', { replace: true });
    }
  }, [permLoading, canManage, navigate]);

  const load = useCallback(async () => {
    if (!clinicId || !routeId) return;
    const seq = ++loadSeqRef.current;
    if (hasDataRef.current) setRefreshing(true);
    try {
      const res = await hubPickupApi.getRoute(routeId, clinicId);
      if (seq !== loadSeqRef.current) return;
      setData(res);
      hasDataRef.current = true;
      setLastLoadedAt(new Date().toISOString());
    } catch (e: unknown) {
      if (seq !== loadSeqRef.current) return;
      showError((e as Error)?.message || 'Erro ao carregar monitoramento');
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [clinicId, routeId, showError]);

  useEffect(() => {
    hasDataRef.current = false;
    setData(null);
    setLoading(true);
    setLastLoadedAt(null);
  }, [clinicId, routeId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const stops = data?.stops ?? [];
  const events = data?.events ?? [];
  const route = data?.route;

  const coordsByStopId = usePickupStopCoords(stops);
  const stopsWithCoords = useMemo(
    () => stops.map((s) => withStopCoords(s, coordsByStopId)),
    [stops, coordsByStopId],
  );

  const stopById = useMemo(() => {
    const m = new Map<string, PickupStop>();
    for (const s of stopsWithCoords) m.set(s.id, s);
    return m;
  }, [stopsWithCoords]);

  const sortedStops = useMemo(
    () => [...stopsWithCoords].sort((a, b) => a.sequence - b.sequence),
    [stopsWithCoords],
  );

  const progress = useMemo(() => {
    const total = sortedStops.length;
    const done = sortedStops.filter((s) => s.status === 'completed' || s.status === 'failed').length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct };
  }, [sortedStops]);

  const inferred = useMemo(() => {
    if (!route) return null;
    return inferDriverMapPosition(route, stopsWithCoords);
  }, [route, stopsWithCoords]);

  const mapStops = useMemo((): MapStop[] => {
    const out: MapStop[] = [];
    for (const s of stopsWithCoords) {
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
  }, [stopsWithCoords, route]);

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

  const activeStopId = useMemo(() => {
    if (inferred?.activeStopId) return inferred.activeStopId;
    const inFlight = sortedStops.find(
      (s) => s.status === 'en_route' || s.status === 'arrived' || s.status === 'in_transit',
    );
    return inFlight?.id ?? null;
  }, [inferred, sortedStops]);

  const activeStop = useMemo(() => {
    if (!activeStopId) return null;
    return stopById.get(activeStopId) ?? null;
  }, [activeStopId, stopById]);

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

  const routeStatus = route.status as PickupRouteStatus;
  const isLive = routeStatus === 'in_progress';
  const routeLabel = route.label?.trim() || 'Rota sem nome';

  return (
    <div className="hub-pickup-monitor">
      <header className="hub-pickup-monitor__header">
        <div className="hub-pickup-monitor__header-left">
          <Link
            to="/hub/leva-e-traz"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-pickup-monitor__back"
          >
            <ArrowLeft size={14} aria-hidden />
            Board
          </Link>
          <div className="hub-pickup-monitor__heading">
            <div className="hub-pickup-monitor__title-row">
              <p className="hub-pickup-monitor__title">{routeLabel}</p>
              <span className={ROUTE_STATUS_CLASS[routeStatus] ?? 'hub-clientes__pill'}>
                {ROUTE_STATUS_LABELS[routeStatus] ?? route.status}
              </span>
              {isLive ? (
                <span className="hub-pickup-monitor__live" aria-label="Atualização automática ativa">
                  <Radio size={12} aria-hidden />
                  Ao vivo
                </span>
              ) : null}
            </div>
            <div className="hub-pickup-monitor__meta">
              <span className="hub-pickup-monitor__chip">
                <User size={12} aria-hidden />
                {route.driver?.full_name?.trim() || 'Sem motorista'}
              </span>
              {route.vehicle_label ? (
                <span className="hub-pickup-monitor__chip">
                  <Truck size={12} aria-hidden />
                  {route.vehicle_label}
                </span>
              ) : null}
              <span className="hub-pickup-monitor__chip hub-pickup-monitor__chip--muted">
                Monitoramento
              </span>
            </div>
          </div>
        </div>
        <div className="hub-pickup-monitor__header-actions">
          {lastLoadedAt ? (
            <span className="hub-pickup-monitor__updated">
              Atualizado às {formatClock(lastLoadedAt)}
            </span>
          ) : null}
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            onClick={() => void load()}
            disabled={refreshing}
          >
            <RefreshCw
              size={14}
              aria-hidden
              className={refreshing ? 'hub-pickup-monitor__spin' : undefined}
            />
            Atualizar
          </button>
        </div>
      </header>

      <div className="hub-pickup-monitor__progress" aria-label="Progresso da rota">
        <div className="hub-pickup-monitor__progress-copy">
          <strong>
            {progress.done}/{progress.total}
          </strong>
          <span>paradas concluídas</span>
        </div>
        <div
          className="hub-pickup-monitor__progress-track"
          role="progressbar"
          aria-valuenow={progress.pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="hub-pickup-monitor__progress-fill"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
        <span className="hub-pickup-monitor__progress-pct">{progress.pct}%</span>
      </div>

      <div className="hub-pickup-monitor__layout">
        <section className="hub-pickup-monitor__map-col" aria-label="Mapa da rota">
          <div
            className={
              inferred
                ? 'hub-pickup-monitor__inferred-banner hub-pickup-monitor__inferred-banner--ready'
                : 'hub-pickup-monitor__inferred-banner hub-pickup-monitor__inferred-banner--empty'
            }
          >
            <MapPin size={16} aria-hidden />
            {inferred ? (
              <span>
                <strong>Última posição conhecida</strong>
                <span className="hub-pickup-monitor__inferred-label">{inferred.label}</span>
              </span>
            ) : (
              <span>
                Sem coordenadas suficientes para inferir a posição do motorista.
              </span>
            )}
          </div>

          <div className="hub-pickup-monitor__map-frame">
            <PickupRouteMap
              stops={mapStops}
              startPoint={startPoint}
              inferredPosition={
                inferred
                  ? { lat: inferred.lat, lng: inferred.lng, label: inferred.label }
                  : null
              }
              highlightStopId={inferred?.destinationStopId ?? inferred?.activeStopId ?? null}
              mapHeight={520}
            />
            {sortedStops.length > 0 && mapStops.length === 0 ? (
              <p className="hub-pickup-monitor__map-hint">
                Ainda sem coordenadas das paradas. Se os tutores tiverem endereço cadastrado, o mapa
                tenta localizá-las em instantes.
              </p>
            ) : null}
          </div>

          {activeStop ? (
            <div className="hub-pickup-monitor__active-card">
              <div className="hub-pickup-monitor__active-top">
                <p className="hub-pickup-monitor__active-title">Parada ativa</p>
                <div className="hub-pickup-monitor__active-badges">
                  <DirectionPill direction={activeStop.direction} />
                  <span className={stopStatusPillClass(activeStop.status)}>
                    {STOP_STATUS_LABELS[activeStop.status] ?? activeStop.status}
                  </span>
                </div>
              </div>
              <p className="hub-pickup-monitor__active-pet">{stopDisplayName(activeStop)}</p>
              {activeStop.guardian?.full_name ? (
                <p className="hub-pickup-monitor__active-tutor">{activeStop.guardian.full_name}</p>
              ) : null}
              {addressText(activeStop) ? (
                <p className="hub-pickup-monitor__active-address">
                  <MapPin size={13} aria-hidden />
                  {addressText(activeStop)}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside className="hub-pickup-monitor__side" aria-label="Detalhes da rota">
          <div className="hub-pickup-monitor__tabs" role="tablist" aria-label="Painel lateral">
            <button
              type="button"
              role="tab"
              aria-selected={sideTab === 'stops'}
              className={
                sideTab === 'stops'
                  ? 'hub-pickup-monitor__tab hub-pickup-monitor__tab--active'
                  : 'hub-pickup-monitor__tab'
              }
              onClick={() => setSideTab('stops')}
            >
              Paradas
              <span className="hub-pickup-monitor__tab-count">{sortedStops.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sideTab === 'history'}
              className={
                sideTab === 'history'
                  ? 'hub-pickup-monitor__tab hub-pickup-monitor__tab--active'
                  : 'hub-pickup-monitor__tab'
              }
              onClick={() => setSideTab('history')}
            >
              Histórico
              <span className="hub-pickup-monitor__tab-count">{historyNewestFirst.length}</span>
            </button>
          </div>

          {sideTab === 'stops' ? (
            <ol className="hub-pickup-monitor__stops">
              {sortedStops.map((s) => {
                const isActive = activeStopId === s.id;
                const tone = stopTone(s.status, isActive);
                return (
                  <li
                    key={s.id}
                    className={`hub-pickup-monitor__stop hub-pickup-monitor__stop--${tone}`}
                  >
                    <div className="hub-pickup-monitor__stop-rail" aria-hidden>
                      <span className="hub-pickup-monitor__stop-dot" />
                    </div>
                    <div className="hub-pickup-monitor__stop-body">
                      <div className="hub-pickup-monitor__stop-head">
                        <span className="hub-pickup-monitor__stop-seq">#{s.sequence + 1}</span>
                        <strong className="hub-pickup-monitor__stop-name">
                          {stopDisplayName(s)}
                        </strong>
                      </div>
                      <div className="hub-pickup-monitor__stop-badges">
                        <DirectionPill direction={s.direction} />
                        <span className={stopStatusPillClass(s.status)}>
                          {STOP_STATUS_LABELS[s.status] ?? s.status}
                        </span>
                      </div>
                      {s.guardian?.full_name && s.direction !== 'clinic_return' ? (
                        <p className="hub-pickup-monitor__stop-tutor">{s.guardian.full_name}</p>
                      ) : null}
                      {addressText(s) ? (
                        <p className="hub-pickup-monitor__stop-address">{addressText(s)}</p>
                      ) : null}
                      {s.status === 'failed' && s.failure_reason ? (
                        <p className="hub-pickup-monitor__stop-failure">
                          {s.failure_reason}
                          {s.failure_outcome === 'return_to_clinic'
                            ? s.failure_resolution === 'pending'
                              ? ' · pet voltando à clínica'
                              : ' · pet de volta à clínica'
                            : ''}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : historyNewestFirst.length === 0 ? (
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
                    <div className="hub-pickup-monitor__event-rail" aria-hidden>
                      <span className="hub-pickup-monitor__event-dot" />
                    </div>
                    <div className="hub-pickup-monitor__event-body">
                      <time dateTime={ev.recorded_at}>{formatTime(ev.recorded_at)}</time>
                      <p className="hub-pickup-monitor__event-title">
                        <strong>{stopDisplayName(stop)}</strong>
                        <span className="hub-clientes__muted">
                          {' '}
                          · {directionShort(stop?.direction)}
                        </span>
                      </p>
                      <div className="hub-pickup-monitor__event-status">
                        <span>{from}</span>
                        <span aria-hidden>→</span>
                        <span className={stopStatusPillClass(ev.to_status as PickupStopStatus)}>
                          {to}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
};

export default PickupRouteMonitorPage;
