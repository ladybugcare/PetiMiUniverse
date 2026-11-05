import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  Radio,
  Truck,
  User,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getStoredClinicId } from '@petimi/web-core';
import {
  hubPickupApi,
  type PickupDayBoardItem,
  type PickupDirection,
  type PickupRoute,
  type PickupRouteStatus,
} from '../../api/hubPickupApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';

const STATUS_LABELS: Record<PickupRouteStatus, string> = {
  planned: 'Planejada',
  in_progress: 'Em rota',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

const STATUS_CLASS: Record<PickupRouteStatus, string> = {
  planned: 'hub-clientes__pill',
  in_progress: 'hub-clientes__pill hub-clinic-queue__pill--progress',
  done: 'hub-clientes__pill hub-clinic-queue__pill--done',
  cancelled: 'hub-clientes__pill hub-clinic-queue__pill--waiting',
};

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function directionLabel(direction: PickupDirection): string {
  if (direction === 'pickup') return 'Coleta';
  if (direction === 'delivery') return 'Entrega';
  return 'L&T';
}

function isStopDone(item: PickupDayBoardItem): boolean {
  return (
    item.stop_status === 'completed' ||
    item.stop_status === 'failed' ||
    (!item.stop_status && (item.status === 'done' || item.status === 'paid'))
  );
}

/** Rota atrasada: ainda não concluída e tem parada pendente cujo horário já passou. */
export function isPickupRouteLate(route: PickupRoute, stops: PickupDayBoardItem[], nowMs = Date.now()): boolean {
  if (route.status === 'done' || route.status === 'cancelled') return false;
  return stops.some((s) => {
    if (isStopDone(s)) return false;
    if (!s.starts_at) return false;
    return new Date(s.starts_at).getTime() < nowMs;
  });
}

function petStopsOf(stops: PickupDayBoardItem[]): PickupDayBoardItem[] {
  return stops.filter((s) => s.direction !== 'clinic_return');
}

function routeAnchorIso(stops: PickupDayBoardItem[]): string | null {
  const pets = petStopsOf(stops);
  let best: string | null = null;
  let bestMs = Number.POSITIVE_INFINITY;
  for (const s of pets) {
    if (!s.starts_at) continue;
    const t = new Date(s.starts_at).getTime();
    if (Number.isNaN(t)) continue;
    if (t < bestMs) {
      bestMs = t;
      best = s.starts_at;
    }
  }
  return best;
}

function petsPreview(stops: PickupDayBoardItem[], max = 3): string {
  const names = petStopsOf(stops)
    .map((s) => s.pet?.name)
    .filter(Boolean) as string[];
  if (names.length === 0) return 'Sem pets';
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max}`;
}

function shortAddress(addr?: string | null, max = 40): string {
  if (!addr?.trim()) return '';
  const t = addr.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Evita “Lote 1 · 07:30” duplicar o horário da coluna. */
function displayRouteLabel(label: string | null | undefined, timeLabel: string): string {
  const raw = label?.trim() || 'Rota';
  if (!timeLabel || timeLabel === '—') return raw;
  const escaped = timeLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = raw.replace(new RegExp(`[·\\-]\\s*${escaped}\\s*$`), '').trim();
  return stripped || raw;
}

type Props = {
  dateYmd: string;
  unitId?: string;
  canManage: boolean;
  onBuildRoute: () => void;
  onSelectRoute: (route: PickupRoute) => void;
  refreshTrigger?: number;
  highlightLoose?: boolean;
  dayItems?: PickupDayBoardItem[];
  onlyLate?: boolean;
  onSelectStop?: (item: PickupDayBoardItem) => void;
  /** Expande automaticamente rotas atrasadas (padrão: true). */
  autoExpandLate?: boolean;
};

const PickupRoutePanel: React.FC<Props> = ({
  dateYmd,
  unitId,
  canManage,
  onBuildRoute,
  onSelectRoute,
  refreshTrigger,
  highlightLoose = false,
  dayItems = [],
  onlyLate = false,
  onSelectStop,
  autoExpandLate = false,
}) => {
  const clinicId = getStoredClinicId();
  const { showError, showSuccess } = useAlert();
  const [routes, setRoutes] = useState<PickupRoute[]>([]);
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(clinicId, false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [lateSeeded, setLateSeeded] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const stopsByRoute = useMemo(() => {
    const map = new Map<string, PickupDayBoardItem[]>();
    for (const item of dayItems) {
      if (!item.route_id) continue;
      const list = map.get(item.route_id) ?? [];
      list.push(item);
      map.set(item.route_id, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        const sa = a.sequence ?? Number.POSITIVE_INFINITY;
        const sb = b.sequence ?? Number.POSITIVE_INFINITY;
        if (sa !== sb) return sa - sb;
        const ta = a.starts_at ? new Date(a.starts_at).getTime() : 0;
        const tb = b.starts_at ? new Date(b.starts_at).getTime() : 0;
        return ta - tb;
      });
    }
    return map;
  }, [dayItems]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    begin();
    try {
      const res = await hubPickupApi.listRoutes(clinicId, { date: dateYmd, unitId });
      setRoutes(res.routes ?? []);
      succeed();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar rotas');
    } finally {
      finish();
    }
  }, [clinicId, dateYmd, unitId, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  // Ao mudar o dia / filtro, permite reseedar expansão das atrasadas
  useEffect(() => {
    setLateSeeded(false);
    setExpandedIds(new Set());
  }, [dateYmd, unitId, onlyLate]);

  const displayRoutes = useMemo(() => {
    const withMeta = routes.map((r, idx) => {
      const stops = stopsByRoute.get(r.id) ?? [];
      const late = isPickupRouteLate(r, stops, nowMs);
      const anchorIso = routeAnchorIso(stops);
      const anchor = anchorIso ? new Date(anchorIso).getTime() : Number.POSITIVE_INFINITY;
      return { route: r, stops, late, idx, anchor, anchorIso };
    });
    const filtered = onlyLate ? withMeta.filter((x) => x.late) : withMeta;
    // Timeline cronológica; atrasadas só ganham destaque visual
    return filtered.slice().sort((a, b) => {
      if (a.anchor !== b.anchor) return a.anchor - b.anchor;
      return a.idx - b.idx;
    });
  }, [routes, stopsByRoute, nowMs, onlyLate]);

  useEffect(() => {
    if (!autoExpandLate || lateSeeded || displayRoutes.length === 0) return;
    const lateIds = displayRoutes.filter((x) => x.late).map((x) => x.route.id);
    if (lateIds.length === 0) {
      setLateSeeded(true);
      return;
    }
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of lateIds) next.add(id);
      return next;
    });
    setLateSeeded(true);
  }, [autoExpandLate, lateSeeded, displayRoutes]);

  const lateCount = useMemo(
    () => routes.filter((r) => isPickupRouteLate(r, stopsByRoute.get(r.id) ?? [], nowMs)).length,
    [routes, stopsByRoute, nowMs],
  );

  const toggleExpanded = (routeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  };

  const moveRoute = async (route: PickupRoute, direction: -1 | 1) => {
    if (!clinicId || !canManage) return;
    const idx = routes.findIndex((r) => r.id === route.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= routes.length) return;
    const other = routes[swapIdx];
    setReorderingId(route.id);
    try {
      const aOrder = route.sort_order ?? idx;
      const bOrder = other.sort_order ?? swapIdx;
      await Promise.all([
        hubPickupApi.patchRoute(route.id, { clinic_id: clinicId, sort_order: bOrder }),
        hubPickupApi.patchRoute(other.id, { clinic_id: clinicId, sort_order: aOrder }),
      ]);
      showSuccess('Ordem das rotas atualizada.');
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao reordenar rotas');
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <div
      className={`hub-pickup-route-panel hub-pickup-route-panel--timeline${highlightLoose && routes.length === 0 ? ' hub-pickup-route-panel--awaiting' : ''}${lateCount > 0 ? ' hub-pickup-route-panel--has-late' : ''}`}
    >
      <div className="hub-pickup-route-panel__header">
        <span className="hub-pickup-route-panel__title">
          <Truck size={15} aria-hidden />
          Rotas do dia — {formatDate(dateYmd)}
        </span>
        {canManage && routes.length > 0 ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--sm hub-clientes__btn--ghost"
            onClick={onBuildRoute}
          >
            <PlusCircle size={14} aria-hidden />
            Nova rota
          </button>
        ) : null}
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando rotas…" />
      {loading && routes.length === 0 ? (
        <HubLoading variant="inline" size="sm" label="Carregando rotas…" />
      ) : routes.length === 0 ? (
        <p className="hub-clientes__muted hub-pickup-route-panel__empty">
          Nenhuma rota montada para este dia.
          {canManage ? ' Use “Nova rota” para montar a sequência de paradas.' : ''}
        </p>
      ) : displayRoutes.length === 0 && onlyLate ? (
        <p className="hub-clientes__muted hub-pickup-route-panel__empty">
          Nenhuma rota atrasada neste momento.
        </p>
      ) : (
        <ol className="hub-pickup-timeline" aria-label="Timeline de rotas do dia">
          {displayRoutes.map(({ route: r, stops, late, anchorIso }) => {
            const idx = routes.findIndex((x) => x.id === r.id);
            const pets = petStopsOf(stops);
            const doneCount = pets.filter(isStopDone).length;
            const expanded = expandedIds.has(r.id);
            const timeLabel = formatTime(anchorIso);
            const labelText = displayRouteLabel(r.label, timeLabel);
            const driverShort = r.driver?.full_name || 'Sem motorista';

            return (
              <li
                key={r.id}
                className={`hub-pickup-timeline__item${late ? ' hub-pickup-timeline__item--late' : ''}${r.status === 'in_progress' ? ' hub-pickup-timeline__item--active' : ''}${r.status === 'done' ? ' hub-pickup-timeline__item--done' : ''}`}
              >
                <div className="hub-pickup-timeline__rail" aria-hidden>
                  <span className="hub-pickup-timeline__dot" />
                </div>

                <div className={`hub-pickup-timeline__card${expanded ? ' is-expanded' : ''}`}>
                  <div className="hub-pickup-timeline__row">
                    <button
                      type="button"
                      className="hub-pickup-timeline__expand"
                      aria-expanded={expanded}
                      aria-label={expanded ? 'Recolher paradas' : 'Ver paradas'}
                      onClick={() => toggleExpanded(r.id)}
                    >
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    <time className="hub-pickup-timeline__time" dateTime={anchorIso ?? undefined}>
                      {timeLabel}
                    </time>

                    <button
                      type="button"
                      className="hub-pickup-timeline__label"
                      onClick={() => toggleExpanded(r.id)}
                      title="Ver paradas"
                    >
                      {labelText}
                    </button>

                    {late ? (
                      <span className="hub-grooming-queue__late-tag">Atraso</span>
                    ) : (
                      <span className={`${STATUS_CLASS[r.status]} hub-pickup-timeline__status`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    )}

                    <span className="hub-pickup-timeline__driver" title={r.vehicle_label ? `${driverShort} · ${r.vehicle_label}` : driverShort}>
                      <User size={11} aria-hidden />
                      {driverShort}
                    </span>

                    <span className="hub-pickup-timeline__pets-preview" title={petsPreview(stops, 20)}>
                      {petsPreview(stops, 2)}
                    </span>

                    <span className="hub-pickup-timeline__progress">
                      {pets.length > 0 ? `${doneCount}/${pets.length}` : `${r.stops_count ?? 0}`}
                    </span>

                    <div className="hub-pickup-timeline__actions">
                      {canManage ? (
                        <Link
                          to={`/hub/leva-e-traz/monitoramento/${r.id}`}
                          className="hub-clientes__icon-btn hub-pickup-timeline__monitor"
                          title="Monitorar rota"
                          aria-label="Monitorar rota"
                        >
                          <Radio size={14} aria-hidden />
                        </Link>
                      ) : null}
                      {canManage && routes.length > 1 ? (
                        <>
                          <button
                            type="button"
                            className="hub-clientes__icon-btn"
                            aria-label="Subir na fila"
                            disabled={idx === 0 || reorderingId === r.id}
                            onClick={() => void moveRoute(r, -1)}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            className="hub-clientes__icon-btn"
                            aria-label="Descer na fila"
                            disabled={idx === routes.length - 1 || reorderingId === r.id}
                            onClick={() => void moveRoute(r, 1)}
                          >
                            <ArrowDown size={13} />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {expanded ? (
                    <div className="hub-pickup-timeline__detail">
                      <ul className="hub-pickup-timeline__stops">
                        {pets.length === 0 ? (
                          <li className="hub-clientes__muted hub-pickup-timeline__stop-empty">
                            Sem detalhe de paradas —{' '}
                            <button
                              type="button"
                              className="hub-pickup-timeline__linkish"
                              onClick={() => onSelectRoute(r)}
                            >
                              editar rota
                            </button>
                          </li>
                        ) : (
                          pets.map((s) => {
                            const DirIcon =
                              s.direction === 'delivery' ? ArrowUpFromLine : ArrowDownToLine;
                            const stopLate =
                              !isStopDone(s) &&
                              Boolean(s.starts_at) &&
                              new Date(s.starts_at).getTime() < nowMs;
                            return (
                              <li key={s.appointment_id}>
                                <button
                                  type="button"
                                  className={`hub-pickup-timeline__stop${stopLate ? ' hub-pickup-timeline__stop--late' : ''}${isStopDone(s) ? ' hub-pickup-timeline__stop--done' : ''}`}
                                  onClick={() => {
                                    if (onSelectStop) onSelectStop(s);
                                    else onSelectRoute(r);
                                  }}
                                >
                                  <span className="hub-pickup-timeline__stop-time">
                                    {formatTime(s.starts_at)}
                                  </span>
                                  <span
                                    className={`hub-clientes__pill hub-pickup-card__direction-pill hub-pickup-card__direction-pill--${s.direction || 'unknown'} hub-pickup-route-card__pet-dir`}
                                  >
                                    <DirIcon size={10} aria-hidden />
                                    {directionLabel(s.direction)}
                                  </span>
                                  <span className="hub-pickup-timeline__stop-pet">
                                    {s.pet?.name || 'Sem pet'}
                                  </span>
                                  <span className="hub-pickup-timeline__stop-meta">
                                    {[s.guardian?.full_name, shortAddress(s.address, 42)]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </span>
                                </button>
                              </li>
                            );
                          })
                        )}
                      </ul>
                      <button
                        type="button"
                        className="hub-pickup-timeline__edit"
                        onClick={() => onSelectRoute(r)}
                      >
                        Editar rota
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

export default PickupRoutePanel;
