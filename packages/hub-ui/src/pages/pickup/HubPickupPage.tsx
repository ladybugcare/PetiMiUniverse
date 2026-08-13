import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, PlusCircle, RefreshCw, Search } from 'lucide-react';
import { apiRequest, getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { hubPickupApi, type PickupDayBoardItem, type PickupRoute, type PickupStopStatus } from '../../api/hubPickupApi';
import {
  dayRangeIsoLocal,
  isUuid,
  loadAgendaPersistedFilters,
  saveAgendaPersistedUnit,
} from '../agenda/agendaFilters';
import PickupDayBoard from './PickupDayBoard';
import PickupRoutePanel from './PickupRoutePanel';
import PickupRouteBuilder from './PickupRouteBuilder';
import PickupStopDrawer from './PickupStopDrawer';
import '../clinica/clinica-page.css';
import '../clientes/clientes.css';
import '../grooming/grooming-page.css';
import './pickup-page.css';

const POLL_MS = 30_000;

type DirectionFilter = 'all' | 'pickup' | 'delivery';

const DIRECTION_OPTIONS: { value: DirectionFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'pickup', label: 'Coletas' },
  { value: 'delivery', label: 'Entregas' },
];

const HubPickupPage: React.FC = () => {
  const { showError } = useAlert();
  const { role: authRole } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const accessAllowed = hasPermission('pickup.routes.read');
  const canWrite = hasPermission('pickup.stops.update') && hasPermission('hub.appointments.write');
  const canManage = hasPermission('pickup.routes.manage');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PickupDayBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [unitFilter, setUnitFilter] = useState(() => loadAgendaPersistedFilters().unit ?? 'all');
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [cursor, setCursor] = useState(() => new Date());

  const [selectedItem, setSelectedItem] = useState<PickupDayBoardItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [routeRefreshTrigger, setRouteRefreshTrigger] = useState(0);
  const [editingRoute, setEditingRoute] = useState<PickupRoute | null>(null);
  const [editingStops, setEditingStops] = useState<(PickupDayBoardItem & { _direction: 'pickup' | 'delivery' })[]>([]);

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
    // Motorista puro (só stops.update, sem manage) → vai direto para Minha rota
    if (!canManage && canWrite) {
      navigate('/hub/leva-e-traz/minha-rota', { replace: true });
    }
  }, [permLoading, accessAllowed, canManage, canWrite, authRole, navigate]);

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

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await hubPickupApi.dayBoard(clinicId, dayRange, {
        unitId: unitIdParam,
        direction: directionFilter === 'all' ? undefined : directionFilter,
      });
      setItems(res.items ?? []);
      setSelectedItem((prev) => {
        if (!prev) return null;
        return res.items?.find((i) => i.appointment_id === prev.appointment_id) ?? prev;
      });
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar paradas de Leva e Traz');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId, dayRange, unitIdParam, directionFilter, showError]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    const id = window.setInterval(() => void load(), POLL_MS);
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

  const handleStatusChange = async (item: PickupDayBoardItem, status: PickupStopStatus) => {
    if (!clinicId || !canWrite) return;
    setActionBusy(true);
    try {
      if (item.stop_id) {
        await hubPickupApi.patchStop(item.stop_id, { clinic_id: clinicId, status });
      } else {
        // Perna solta: materializar stop e avançar
        const dir = item.direction === 'unknown' ? 'pickup' : item.direction;
        await hubPickupApi.createLooseStop({
          clinic_id: clinicId,
          hub_appointment_id: item.appointment_id,
          direction: dir as 'pickup' | 'delivery',
          status,
        });
      }
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar status da parada');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSelectItem = (item: PickupDayBoardItem) => {
    setSelectedItem(item);
    setDrawerOpen(true);
  };

  const handleDrawerUpdated = async () => {
    await load();
  };

  const handleSelectRoute = async (route: PickupRoute) => {
    if (!clinicId) return;
    try {
      const detail = await hubPickupApi.getRoute(route.id, clinicId);
      const sortedStops = (detail.stops ?? []).slice().sort((a, b) => a.sequence - b.sequence);
      const prePopulated = sortedStops
        .map((stop) => {
          const boardItem = items.find((i) => i.appointment_id === stop.hub_appointment_id);
          if (!boardItem) return null;
          const dir = stop.direction === 'delivery' ? 'delivery' : 'pickup';
          return { ...boardItem, _direction: dir } as PickupDayBoardItem & { _direction: 'pickup' | 'delivery' };
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
    setRouteRefreshTrigger((n) => n + 1);
    void load();
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

  const metrics = useMemo(() => {
    const pickups = items.filter((i) => i.direction === 'pickup').length;
    const deliveries = items.filter((i) => i.direction === 'delivery').length;
    const enRoute = items.filter(
      (i) => i.stop_status === 'en_route' || (!i.stop_status && i.status === 'in_progress'),
    ).length;
    const onSite = items.filter(
      (i) => i.stop_status === 'arrived' || i.stop_status === 'in_transit',
    ).length;
    const loose = items.filter((i) => !i.route_id).length;
    return { total: items.length, pickups, deliveries, enRoute, onSite, loose };
  }, [items]);

  if (!permLoading && !clinicId) {
    return (
      <p className="hub-clientes__muted hub-clinic-page__pad">Selecione uma clínica para acessar Leva e Traz.</p>
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

  return (
    <div className="hub-grooming-page hub-pickup-page">
      {accessAllowed && !canWrite && !canManage ? (
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
        </div>
        <div className="hub-clientes__search hub-clinic-atendimentos__search">
          <Search size={16} aria-hidden />
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Buscar pet ou tutor… (/)"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </div>
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
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          onClick={() => void load()}
          disabled={loading || actionBusy}
          aria-label="Atualizar paradas"
        >
          <RefreshCw size={16} />
        </button>
        {canManage ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            onClick={() => setBuilderOpen(true)}
            disabled={loading}
          >
            <PlusCircle size={16} aria-hidden />
            Nova rota
          </button>
        ) : null}
        <Link to="/hub/leva-e-traz/minha-rota" className="hub-clientes__btn hub-clientes__btn--ghost">
          Minha rota
        </Link>
        <Link to="/hub/appointments" className="hub-clientes__btn hub-clientes__btn--ghost">
          Agenda
        </Link>
      </div>

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
      </div>

      {!loading ? (
        <p className="hub-clientes__muted hub-grooming-page__metrics">
          {metrics.total} parada{metrics.total !== 1 ? 's' : ''} · {metrics.pickups} coleta
          {metrics.pickups !== 1 ? 's' : ''} · {metrics.deliveries} entrega
          {metrics.deliveries !== 1 ? 's' : ''}
          {metrics.enRoute > 0 ? ` · ${metrics.enRoute} em deslocamento` : ''}
          {metrics.onSite > 0 ? ` · ${metrics.onSite} no local` : ''}
          {metrics.loose > 0 ? ` · ${metrics.loose} solta${metrics.loose !== 1 ? 's' : ''}` : ''}
        </p>
      ) : null}

      {!loading ? (
        <PickupRoutePanel
          dateYmd={dateYmd}
          unitId={unitIdParam}
          canManage={canManage}
          onBuildRoute={() => {
            setEditingRoute(null);
            setEditingStops([]);
            setBuilderOpen(true);
          }}
          onSelectRoute={(r) => void handleSelectRoute(r)}
          refreshTrigger={routeRefreshTrigger}
        />
      ) : null}

      {builderOpen ? (
        <div className="hub-pickup-builder__overlay">
          <PickupRouteBuilder
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
        </div>
      ) : null}

      {loading ? (
        <HubLoading variant="block" label="Carregando paradas…" className="hub-clinic-page__pad" />
      ) : items.length === 0 ? (
        <p className="hub-clientes__muted hub-clinic-page__pad">
          Nenhuma parada de Leva e Traz neste dia. As pernas de transporte criadas na Agenda aparecem aqui
          automaticamente.
        </p>
      ) : (
        <PickupDayBoard
          items={items}
          canWrite={canWrite && !actionBusy}
          searchQ={searchQ}
          onStatusChange={(item, status) => void handleStatusChange(item, status)}
          onSelect={handleSelectItem}
        />
      )}

      <PickupStopDrawer
        item={selectedItem}
        open={drawerOpen}
        canUpdate={canWrite}
        onClose={() => setDrawerOpen(false)}
        onUpdated={() => void handleDrawerUpdated()}
      />
    </div>
  );
};

export default HubPickupPage;
