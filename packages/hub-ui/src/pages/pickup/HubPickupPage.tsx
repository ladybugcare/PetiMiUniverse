import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, MapPin, PlusCircle, RefreshCw, Search } from 'lucide-react';
import { apiRequest, getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { hubPickupApi, type PickupDayBoardItem, type PickupRoute } from '../../api/hubPickupApi';
import {
  dayRangeIsoLocal,
  isUuid,
  loadAgendaPersistedFilters,
  saveAgendaPersistedUnit,
} from '../agenda/agendaFilters';
import PickupRoutePanel, { isPickupRouteLate } from './PickupRoutePanel';
import PickupRouteBuilder from './PickupRouteBuilder';
import PickupStopDrawer from './PickupStopDrawer';
import PickupPlanningList from './PickupPlanningList';
import PickupInProgressSection from './PickupInProgressSection';
import { isPickupDriverOnly } from './pickupAccess';

const POLL_MS = 30_000;

type DirectionFilter = 'all' | 'pickup' | 'delivery';
type MetricFocus = 'loose' | 'active' | 'done' | 'late' | null;

const DIRECTION_OPTIONS: { value: DirectionFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'pickup', label: 'Coletas' },
  { value: 'delivery', label: 'Entregas' },
];

function useIsNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 900px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

function isDoneItem(item: PickupDayBoardItem): boolean {
  return (
    item.stop_status === 'completed' ||
    item.stop_status === 'failed' ||
    (!item.stop_status && (item.status === 'done' || item.status === 'paid'))
  );
}

function isActiveItem(item: PickupDayBoardItem): boolean {
  return (
    item.stop_status === 'en_route' ||
    item.stop_status === 'arrived' ||
    item.stop_status === 'in_transit'
  );
}

const HubPickupPage: React.FC = () => {
  const { showError } = useAlert();
  const { role: authRole } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const isNarrow = useIsNarrowViewport();
  const accessAllowed = hasPermission('pickup.routes.read');
  const canUpdateStops = hasPermission('pickup.stops.update');
  const canManage = hasPermission('pickup.routes.manage');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadSeqRef = useRef(0);
  const [items, setItems] = useState<PickupDayBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [metricFocus, setMetricFocus] = useState<MetricFocus>(null);
  const [unitFilter, setUnitFilter] = useState(() => loadAgendaPersistedFilters().unit ?? 'all');
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());

  const [selectedItem, setSelectedItem] = useState<PickupDayBoardItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [routeRefreshTrigger, setRouteRefreshTrigger] = useState(0);
  const [editingRoute, setEditingRoute] = useState<PickupRoute | null>(null);
  const [editingStops, setEditingStops] = useState<
    (PickupDayBoardItem & { _direction: 'pickup' | 'delivery' })[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const dayRange = useMemo(() => dayRangeIsoLocal(cursor), [cursor]);

  const unitIdParam = useMemo(() => {
    if (unitFilter === 'all') return undefined;
    if (isUuid(unitFilter)) return unitFilter;
    const match = units.find((u) => u.name === unitFilter);
    return match?.id;
  }, [unitFilter, units]);

  const looseItems = useMemo(() => items.filter((i) => !i.route_id), [items]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) {
      redirectAwayFromHub(authRole as AppRole);
      return;
    }
    if (isPickupDriverOnly(canManage, canUpdateStops)) {
      navigate('/hub/leva-e-traz/minha-rota', { replace: true });
    }
  }, [permLoading, accessAllowed, canManage, canUpdateStops, authRole, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!clinicId) return;
      const seq = ++loadSeqRef.current;
      if (!opts?.soft) setLoading(true);
      try {
        const res = await hubPickupApi.dayBoard(clinicId, dayRange, {
          unitId: unitIdParam,
          direction: directionFilter === 'all' ? undefined : directionFilter,
        });
        if (seq !== loadSeqRef.current) return;
        setItems(res.items ?? []);
        setSelectedItem((prev) => {
          if (!prev) return null;
          return res.items?.find((i) => i.appointment_id === prev.appointment_id) ?? prev;
        });
        setSelectedIds((prev) => {
          if (prev.size === 0) return prev;
          const next = new Set<string>();
          for (const id of prev) {
            if (res.items?.some((i) => i.appointment_id === id && !i.route_id)) next.add(id);
          }
          return next;
        });
      } catch (e: unknown) {
        if (seq !== loadSeqRef.current) return;
        showError((e as Error)?.message || 'Erro ao carregar paradas de Leva e Traz');
        setItems([]);
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    },
    [clinicId, dayRange, unitIdParam, directionFilter, showError],
  );

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    const id = window.setInterval(() => void load({ soft: true }), POLL_MS);
    return () => window.clearInterval(id);
  }, [clinicId, accessAllowed, load]);

  useEffect(() => {
    if (!clinicId) return;
    void (apiRequest(`/units/clinic/${encodeURIComponent(clinicId)}?activeOnly=true`) as Promise<{
      units?: { id: string; name: string }[];
    }>)
      .then((r) => setUnits(r.units ?? []))
      .catch(() => setUnits([]));
  }, [clinicId]);

  const handleUnitFilterChange = (value: string) => {
    setUnitFilter(value);
    saveAgendaPersistedUnit(value);
  };

  const openBuilder = (
    preselected: (PickupDayBoardItem & { _direction: 'pickup' | 'delivery' })[] = [],
  ) => {
    setEditingRoute(null);
    setEditingStops(preselected);
    setBuilderOpen(true);
  };

  const handleSelectRoute = async (route: PickupRoute) => {
    if (!clinicId) return;
    try {
      const detail = await hubPickupApi.getRoute(route.id, clinicId);
      const sortedStops = (detail.stops ?? []).slice().sort((a, b) => a.sequence - b.sequence);
      const prePopulated = sortedStops
        .filter((stop) => stop.direction !== 'clinic_return' && stop.hub_appointment_id)
        .map((stop) => {
          const boardItem = items.find((i) => i.appointment_id === stop.hub_appointment_id);
          if (!boardItem) return null;
          const dir = stop.direction === 'delivery' ? 'delivery' : 'pickup';
          return {
            ...boardItem,
            _direction: dir,
            cage_id: stop.cage_id ?? boardItem.cage_id ?? null,
          } as PickupDayBoardItem & { _direction: 'pickup' | 'delivery' };
        })
        .filter(Boolean) as (PickupDayBoardItem & { _direction: 'pickup' | 'delivery' })[];
      setEditingRoute(route);
      setEditingStops(prePopulated);
      setBuilderOpen(true);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar detalhes da rota');
    }
  };

  const handleBuilderSaved = () => {
    setBuilderOpen(false);
    setEditingRoute(null);
    setEditingStops([]);
    setSelectedIds(new Set());
    setRouteRefreshTrigger((n) => n + 1);
    void load({ soft: true });
  };

  const handleSelectItem = (item: PickupDayBoardItem) => {
    setSelectedItem(item);
    setDrawerOpen(true);
  };

  const handleDrawerUpdated = async () => {
    await load({ soft: true });
    setRouteRefreshTrigger((n) => n + 1);
  };

  const unitOptions: HubComboboxOption[] = useMemo(() => {
    const rows: HubComboboxOption[] = [{ value: 'all', label: 'Todas as unidades' }];
    for (const u of units) rows.push({ value: u.id, label: u.name });
    if (unitFilter !== 'all' && !rows.some((o) => o.value === unitFilter)) {
      rows.push({ value: unitFilter, label: unitFilter });
    }
    return rows;
  }, [units, unitFilter]);

  const shiftDay = (delta: number) => {
    setCursor((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + delta);
      return n;
    });
  };

  const goToday = () => setCursor(new Date());

  const metrics = useMemo(() => {
    const loose = items.filter((i) => !i.route_id).length;
    const active = items.filter(isActiveItem).length;
    const done = items.filter(isDoneItem).length;
    const now = Date.now();
    const byRoute = new Map<string, typeof items>();
    for (const i of items) {
      if (!i.route_id) continue;
      const list = byRoute.get(i.route_id) ?? [];
      list.push(i);
      byRoute.set(i.route_id, list);
    }
    let late = 0;
    for (const [, stops] of byRoute) {
      const routeStatus: 'planned' | 'in_progress' | 'done' | 'cancelled' = stops.every(isDoneItem)
        ? 'done'
        : stops.some(isActiveItem)
          ? 'in_progress'
          : 'planned';
      const fakeRoute = { id: stops[0].route_id!, status: routeStatus } as PickupRoute;
      if (isPickupRouteLate(fakeRoute, stops, now)) late += 1;
    }
    return { loose, active, done, late, total: items.length };
  }, [items]);

  const planningItems = looseItems;

  const routesSectionRef = useRef<HTMLDivElement>(null);

  const toggleMetricFocus = (focus: MetricFocus) => {
    setMetricFocus((prev) => (prev === focus ? null : focus));
  };

  const focusLateRoutes = () => {
    setMetricFocus('late');
    window.requestAnimationFrame(() => {
      routesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const hasActiveFilters =
    directionFilter !== 'all' || metricFocus != null || unitFilter !== 'all' || searchQ.trim() !== '';

  const clearFilters = () => {
    setDirectionFilter('all');
    setMetricFocus(null);
    setSearchQ('');
    if (unitFilter !== 'all') handleUnitFilterChange('all');
  };

  if (!permLoading && !clinicId) {
    return (
      <p className="hub-clientes__muted hub-clinic-page__pad">
        Selecione uma clínica para acessar Leva e Traz.
      </p>
    );
  }

  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clinic-page__pad">
        <HubLoading variant="block" />
      </div>
    );
  }

  const dateLabel = cursor.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const dateYmd = dayRange.dateYmd;
  const isToday = dayRangeIsoLocal(new Date()).dateYmd === dateYmd;

  return (
    <div className="hub-pickup-page hub-pickup-page--planning">
      {accessAllowed && !canUpdateStops && !canManage ? (
        <p className="hub-clientes__muted hub-grooming-page__perm-banner">
          Visualização do painel (somente leitura).
        </p>
      ) : null}

      <div className="hub-clientes__toolbar hub-clinic-atendimentos__toolbar">
        <div className="hub-clinic-atendimentos__date-nav">
          <button
            type="button"
            className="hub-clientes__icon-btn"
            onClick={() => shiftDay(-1)}
            aria-label="Dia anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="hub-clinic-atendimentos__date-label">{dateLabel}</span>
          <button
            type="button"
            className="hub-clientes__icon-btn"
            onClick={() => shiftDay(1)}
            aria-label="Próximo dia"
          >
            <ChevronRight size={18} />
          </button>
          {!isToday ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              onClick={goToday}
            >
              Hoje
            </button>
          ) : null}
        </div>
        <div className="hub-clientes__search hub-clinic-atendimentos__search">
          <Search size={16} aria-hidden />
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Buscar pet, tutor ou endereço… (/)"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </div>
        {!isNarrow ? (
          <div className="hub-servicos__filter-field hub-clinic-atendimentos__staff-filter">
            <HubSearchableCombobox
              id="hub-pickup-unit-filter"
              className="hub-combobox--clientes"
              options={unitOptions}
              value={unitFilter}
              onChange={handleUnitFilterChange}
              placeholder="Unidade"
              allowCreate={false}
            />
          </div>
        ) : null}
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Atualizar paradas"
        >
          <RefreshCw size={16} />
        </button>
        {canManage ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            onClick={() => openBuilder([])}
            disabled={loading}
          >
            <PlusCircle size={16} aria-hidden />
            Nova rota
          </button>
        ) : null}
        <Link to="/hub/appointments" className="hub-clientes__btn hub-clientes__btn--ghost">
          Agenda
        </Link>
        {isNarrow ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            onClick={() => setMoreFiltersOpen((v) => !v)}
            aria-expanded={moreFiltersOpen}
          >
            Mais filtros
          </button>
        ) : null}
      </div>

      {isNarrow && moreFiltersOpen ? (
        <div className="hub-grooming-page__more-filters">
          <div className="hub-servicos__filter-field">
            <HubSearchableCombobox
              id="hub-pickup-unit-filter-mobile"
              className="hub-combobox--clientes"
              options={unitOptions}
              value={unitFilter}
              onChange={handleUnitFilterChange}
              placeholder="Unidade"
              allowCreate={false}
            />
          </div>
        </div>
      ) : null}

      <div className="hub-grooming-page__filters" role="toolbar" aria-label="Filtro por sentido">
        {DIRECTION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`hub-clientes__btn hub-clientes__btn--sm${
              directionFilter === opt.value ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'
            }`}
            onClick={() => setDirectionFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
        {hasActiveFilters ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-grooming-page__filters-clear"
            onClick={clearFilters}
          >
            Limpar
          </button>
        ) : null}
      </div>

      {!loading && metrics.late > 0 ? (
        <div className="hub-pickup-command-banner hub-pickup-command-banner--late" role="status">
          <AlertTriangle size={18} aria-hidden />
          <div className="hub-pickup-command-banner__text">
            <strong>
              {metrics.late} rota{metrics.late !== 1 ? 's' : ''} atrasada
              {metrics.late !== 1 ? 's' : ''}
            </strong>
            <span>Horário já passou e o lote ainda não foi concluído.</span>
          </div>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--sm hub-clientes__btn--primary"
            onClick={focusLateRoutes}
          >
            Ver atrasadas
          </button>
        </div>
      ) : null}

      {!loading && metrics.loose > 0 && metricFocus !== 'late' ? (
        <div className="hub-pickup-command-banner hub-pickup-command-banner--loose" role="status">
          <MapPin size={18} aria-hidden />
          <div className="hub-pickup-command-banner__text">
            <strong>
              {metrics.loose} perna{metrics.loose !== 1 ? 's' : ''} sem rota
            </strong>
            <span>Monte os lotes antes de liberar os motoristas.</span>
          </div>
          {canManage ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--sm hub-clientes__btn--primary"
              onClick={() => openBuilder([])}
            >
              Nova rota
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading ? (
        <div
          className="hub-clientes__metrics hub-clinic-metrics hub-grooming-page__metrics-grid hub-pickup-metrics--compact"
          role="toolbar"
          aria-label="Resumo do dia"
        >
          <button
            type="button"
            className={`hub-clientes__metric-card hub-grooming-page__metric-btn${metricFocus === 'loose' ? ' hub-grooming-page__metric-btn--active' : ''}${metrics.loose > 0 ? ' hub-pickup-metric--loose' : ''}`}
            onClick={() => toggleMetricFocus('loose')}
            aria-pressed={metricFocus === 'loose'}
          >
            <span className="hub-clientes__metric-label">Sem rota</span>
            <span className="hub-clientes__metric-value hub-grooming-page__metric-value--waiting">
              {metrics.loose}
            </span>
          </button>
          <button
            type="button"
            className={`hub-clientes__metric-card hub-grooming-page__metric-btn${metricFocus === 'active' ? ' hub-grooming-page__metric-btn--active' : ''}`}
            onClick={() => toggleMetricFocus('active')}
            aria-pressed={metricFocus === 'active'}
          >
            <span className="hub-clientes__metric-label">Em deslocamento</span>
            <span className="hub-clientes__metric-value hub-grooming-page__metric-value--service">
              {metrics.active}
            </span>
          </button>
          <button
            type="button"
            className={`hub-clientes__metric-card hub-grooming-page__metric-btn${metricFocus === 'late' ? ' hub-grooming-page__metric-btn--active' : ''}${metrics.late > 0 ? ' hub-grooming-page__metric-card--late' : ''}`}
            onClick={() => {
              if (metricFocus === 'late') setMetricFocus(null);
              else focusLateRoutes();
            }}
            aria-pressed={metricFocus === 'late'}
          >
            <span className="hub-clientes__metric-label">Atrasadas</span>
            <span className="hub-clientes__metric-value">{metrics.late}</span>
          </button>
          <button
            type="button"
            className={`hub-clientes__metric-card hub-grooming-page__metric-btn${metricFocus === 'done' ? ' hub-grooming-page__metric-btn--active' : ''}`}
            onClick={() => toggleMetricFocus('done')}
            aria-pressed={metricFocus === 'done'}
          >
            <span className="hub-clientes__metric-label">Concluídas</span>
            <span className="hub-clientes__metric-value hub-grooming-page__metric-value--ready">
              {metrics.done}
            </span>
          </button>
        </div>
      ) : null}

      {loading ? (
        <HubLoading variant="block" label="Carregando paradas…" className="hub-clinic-page__pad" />
      ) : (
        <>
          {metricFocus === 'active' ? (
            <PickupInProgressSection
              items={items}
              searchQ={searchQ}
              onSelect={handleSelectItem}
            />
          ) : null}

          {metrics.loose > 0 && (metricFocus === null || metricFocus === 'loose') ? (
            <PickupPlanningList
              items={planningItems}
              allDayItems={items}
              canManage={canManage}
              searchQ={searchQ}
              selectedIds={selectedIds}
              onToggleSelect={(id) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              onSelectAll={(ids) => setSelectedIds(new Set(ids))}
              onClearSelection={() => setSelectedIds(new Set())}
              onAddToRoute={(stops) => {
                setSelectedIds(new Set());
                openBuilder(stops);
              }}
              onSelectItem={handleSelectItem}
              onClearSearch={() => setSearchQ('')}
            />
          ) : null}

          {metricFocus === 'done' ? (
            <p className="hub-clientes__muted hub-clinic-page__pad hub-pickup-metric-hint">
              {metrics.done} parada{metrics.done !== 1 ? 's' : ''} concluída
              {metrics.done !== 1 ? 's' : ''} hoje.
            </p>
          ) : null}

          <div ref={routesSectionRef}>
            <PickupRoutePanel
              dateYmd={dateYmd}
              unitId={unitIdParam}
              canManage={canManage}
              onBuildRoute={() => openBuilder([])}
              onSelectRoute={(r) => void handleSelectRoute(r)}
              refreshTrigger={routeRefreshTrigger}
              highlightLoose={metrics.loose > 0}
              dayItems={items}
              onlyLate={metricFocus === 'late'}
              onSelectStop={handleSelectItem}
            />
          </div>
        </>
      )}

      {builderOpen ? (
        <PickupRouteBuilder
          open
          looseItems={looseItems}
          dateYmd={dateYmd}
          unitId={unitIdParam}
          editingRoute={editingRoute}
          editingStops={editingStops.length > 0 ? editingStops : undefined}
          onClose={() => {
            setBuilderOpen(false);
            setEditingRoute(null);
            setEditingStops([]);
          }}
          onSaved={handleBuilderSaved}
        />
      ) : null}

      <PickupStopDrawer
        item={selectedItem}
        open={drawerOpen}
        canUpdate={canUpdateStops}
        onClose={() => setDrawerOpen(false)}
        onUpdated={() => void handleDrawerUpdated()}
      />
    </div>
  );
};

export default HubPickupPage;
