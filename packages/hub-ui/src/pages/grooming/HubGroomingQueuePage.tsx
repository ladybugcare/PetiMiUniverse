import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { apiRequest, getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { hubGroomingApi, type GroomingDayBoardItem } from '../../api/hubGroomingApi';
import { hubAgendaApi } from '../../api/hubAgendaApi';
import { hubStaffApi, type HubStaffMember } from '../../api/hubStaffApi';
import {
  dayRangeIsoLocal,
  isUuid,
  loadAgendaPersistedFilters,
  saveAgendaPersistedUnit,
} from '../agenda/agendaFilters';
import { getItemBoardStage, groomingOpenSessionStage, type GroomingStage } from './groomingStages';
import { isGroomingFloorStaff } from './groomingAccess';
import GroomingQueueBoard, { type GroomingQuickAction } from './GroomingQueueBoard';
import GroomingAppointmentDrawer from './GroomingAppointmentDrawer';
import GroomingWalkInPanel from './GroomingWalkInPanel';
import { PORTE_LABELS, PORTE_VALUES } from '../../utils/hubServiceTypesPricingMatrix';

const POLL_MS = 30_000;
const MOBILE_MQ = '(max-width: 900px)';

const PORTE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos os portes' },
  ...PORTE_VALUES.map((p) => ({ value: p, label: PORTE_LABELS[p] })),
];

function useIsNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_MQ).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

const HubGroomingQueuePage: React.FC = () => {
  const { showError } = useAlert();
  const { role: authRole } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const clinicId = getStoredClinicId();
  const isNarrow = useIsNarrowViewport();
  const accessAllowed = hasPermission('grooming.queue.read');
  const canWrite =
    hasPermission('grooming.queue.manage') && hasPermission('hub.appointments.write');
  /** Valores (R$) no drawer operacional: só quem gere catálogo/preços (`hub.service_types.write`). */
  const showOperationalPricing = hasPermission('hub.service_types.write');
  const showWriteGateHint =
    accessAllowed && !canWrite && hasPermission('grooming.queue.manage');
  const canViewFinancial = hasPermission('hub.financial.read');
  const canDragQueue = hasPermission('grooming.queue.manage') && !isNarrow;
  const canPauseQueue = hasPermission('grooming.queue.manage');
  /** Tosador / CSTAFF de chão → Minha fila (padrão L&T motorista). */
  const isFloorStaff = isGroomingFloorStaff(authRole, hasPermission('hub.appointments.write'));

  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadSeqRef = useRef(0);
  const [filterPriorityOnly, setFilterPriorityOnly] = useState(false);
  const [filterLtOnly, setFilterLtOnly] = useState(false);
  const [filterPorte, setFilterPorte] = useState('all');
  const [filterBanhoOnly, setFilterBanhoOnly] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [items, setItems] = useState<GroomingDayBoardItem[]>([]);
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(clinicId);
  const [actionBusy, setActionBusy] = useState(false);
  const [staff, setStaff] = useState<HubStaffMember[]>([]);
  const [staffFilter, setStaffFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState(() => loadAgendaPersistedFilters().unit ?? 'all');
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [groomingTypesConfigured, setGroomingTypesConfigured] = useState(true);
  const [selected, setSelected] = useState<GroomingDayBoardItem | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInBusy, setWalkInBusy] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());

  const itemsFiltered = useMemo(() => {
    let list = items;
    if (filterPriorityOnly) list = list.filter((i) => (i.priority ?? 0) > 0);
    if (filterLtOnly) list = list.filter((i) => i.appointment_kind === 'pickup_route');
    if (filterPorte !== 'all') list = list.filter((i) => (i.pet?.size_tier || '') === filterPorte);
    if (filterBanhoOnly) list = list.filter((i) => i.grooming_service_mix === 'banho_only');
    return list;
  }, [items, filterPriorityOnly, filterLtOnly, filterPorte, filterBanhoOnly]);

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

  const dayRange = useMemo(() => dayRangeIsoLocal(cursor), [cursor]);

  const unitIdParam = useMemo(() => {
    if (unitFilter === 'all') return undefined;
    if (isUuid(unitFilter)) return unitFilter;
    const match = units.find((u) => u.name === unitFilter);
    return match?.id;
  }, [unitFilter, units]);

  const load = useCallback(
    async () => {
      if (!clinicId) return;
      const seq = ++loadSeqRef.current;
      begin();
      try {
        const res = await hubGroomingApi.dayBoard(clinicId, dayRange, {
          staffId: staffFilter || undefined,
          unitId: unitIdParam,
        });
        if (seq !== loadSeqRef.current) return;
        setItems(res.items ?? []);
        setGroomingTypesConfigured(res.grooming_types_configured !== false);
        setSelected((prev) => {
          if (!prev) return null;
          const key = prev.session_id || prev.appointment_id;
          return res.items?.find((i) => (i.session_id || i.appointment_id) === key) ?? prev;
        });
        succeed();
      } catch (e: unknown) {
        if (seq !== loadSeqRef.current) return;
        showError((e as Error)?.message || 'Erro ao carregar fila de Banho & Tosa');
        setItems([]);
        setGroomingTypesConfigured(true);
      } finally {
        if (seq === loadSeqRef.current) finish();
      }
    },
    [clinicId, dayRange, staffFilter, unitIdParam, showError, begin, succeed, finish],
  );

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) {
      redirectAwayFromHub(authRole as AppRole);
      return;
    }
    if (isFloorStaff) {
      navigate('/hub/banho-tosa/minha-fila', { replace: true });
    }
  }, [permLoading, accessAllowed, authRole, isFloorStaff, navigate]);

  useEffect(() => {
    if (!clinicId || !accessAllowed || isFloorStaff) return;
    void load();
  }, [clinicId, accessAllowed, isFloorStaff, load]);

  useEffect(() => {
    if (!clinicId || !accessAllowed || isFloorStaff) return;
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [clinicId, accessAllowed, isFloorStaff, load]);

  useEffect(() => {
    if (!clinicId || isFloorStaff) return;
    void hubStaffApi
      .list(clinicId)
      .then((r) => setStaff(r.staff ?? []))
      .catch(() => setStaff([]));
  }, [clinicId, isFloorStaff]);

  useEffect(() => {
    if (!clinicId || isFloorStaff) return;
    void (apiRequest(`/units/clinic/${encodeURIComponent(clinicId)}?activeOnly=true`) as Promise<{
      units?: { id: string; name: string }[];
    }>)
      .then((r) => setUnits(r.units ?? []))
      .catch(() => setUnits([]));
  }, [clinicId, isFloorStaff]);

  const handleUnitFilterChange = (value: string) => {
    setUnitFilter(value);
    saveAgendaPersistedUnit(value);
  };

  const handleQuickAction = async (item: GroomingDayBoardItem, action: GroomingQuickAction) => {
    if (!clinicId || !canWrite) return;
    setActionBusy(true);
    try {
      if (action.type === 'confirm_appointment' && item.appointment_id) {
        await hubAgendaApi.patch(item.appointment_id, { clinic_id: clinicId, status: 'confirmed' });
      } else if (action.type === 'check_in' && item.appointment_id) {
        await hubGroomingApi.openFromAppointment(
          clinicId,
          item.appointment_id,
          groomingOpenSessionStage(item),
        );
      } else if (action.type === 'advance' && item.session_id) {
        await hubGroomingApi.advanceSession(item.session_id, clinicId);
      }
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar atendimento');
    } finally {
      setActionBusy(false);
    }
  };

  const handleStageDrop = useCallback(
    async (item: GroomingDayBoardItem, stage: GroomingStage) => {
      if (!clinicId || !canDragQueue) return;
      if (!item.session_id && !item.appointment_id) return;
      setActionBusy(true);
      try {
        if (item.session_id) {
          await hubGroomingApi.patchSession(item.session_id, { clinic_id: clinicId, grooming_stage: stage });
        } else if (item.appointment_id) {
          await hubGroomingApi.openFromAppointment(clinicId, item.appointment_id, stage);
        }
        await load();
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Transição não permitida');
      } finally {
        setActionBusy(false);
      }
    },
    [clinicId, canDragQueue, load, showError],
  );

  const handlePauseToggle = async (item: GroomingDayBoardItem) => {
    if (!clinicId || !item.session_id || !canPauseQueue) return;
    setActionBusy(true);
    try {
      const nextPaused = !item.paused_at;
      await hubGroomingApi.patchSession(item.session_id, { clinic_id: clinicId, paused: nextPaused });
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao pausar ou retomar atendimento');
    } finally {
      setActionBusy(false);
    }
  };

  const handleTogglePriority = async (item: GroomingDayBoardItem) => {
    if (!clinicId || !canWrite || !item.session_id) return;
    setActionBusy(true);
    try {
      const next = (item.priority ?? 0) > 0 ? 0 : 1;
      await hubGroomingApi.patchSession(item.session_id, { clinic_id: clinicId, priority: next });
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao alterar prioridade');
    } finally {
      setActionBusy(false);
    }
  };

  const createWalkIn = async (payload: { petId: string; staffId: string; notes: string }) => {
    if (!clinicId) return;
    setWalkInBusy(true);
    try {
      await hubGroomingApi.createSession({
        clinic_id: clinicId,
        pet_id: payload.petId,
        hub_staff_member_id: payload.staffId,
        unit_id: unitIdParam ?? null,
        operational_notes: payload.notes.trim() || null,
      });
      setWalkInOpen(false);
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar avulso');
    } finally {
      setWalkInBusy(false);
    }
  };

  const unitOptions: HubComboboxOption[] = useMemo(() => {
    const rows: HubComboboxOption[] = [{ value: 'all', label: 'Todas as unidades' }];
    for (const u of units) rows.push({ value: u.id, label: u.name });
    if (unitFilter !== 'all' && !rows.some((o) => o.value === unitFilter)) {
      rows.push({ value: unitFilter, label: unitFilter });
    }
    return rows;
  }, [units, unitFilter]);

  const staffOptions: HubComboboxOption[] = useMemo(
    () => [
      { value: '', label: 'Todos os profissionais' },
      ...staff.filter((s) => s.active !== false).map((s) => ({ value: s.id, label: s.full_name })),
    ],
    [staff],
  );

  const shiftDay = (delta: number) => {
    setCursor((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + delta);
      return n;
    });
  };

  const metrics = useMemo(() => {
    const total = items.length;
    const inService = items.filter((i) => {
      const s = getItemBoardStage(i);
      return s === 'in_service' || s === 'finishing';
    }).length;
    const ready = items.filter((i) => getItemBoardStage(i) === 'ready').length;
    const late = items.filter((i) => i.is_late).length;
    return { total, inService, ready, late };
  }, [items]);

  const hasActiveFilters =
    filterPorte !== 'all' || filterBanhoOnly || filterPriorityOnly || filterLtOnly;

  const clearFilters = () => {
    setFilterPorte('all');
    setFilterBanhoOnly(false);
    setFilterPriorityOnly(false);
    setFilterLtOnly(false);
  };

  const isToday = useMemo(() => {
    const now = new Date();
    return (
      cursor.getFullYear() === now.getFullYear() &&
      cursor.getMonth() === now.getMonth() &&
      cursor.getDate() === now.getDate()
    );
  }, [cursor]);

  if (!permLoading && !clinicId) {
    return (
      <p className="hub-clientes__muted hub-clinic-page__pad">Selecione uma clínica para acessar Banho & Tosa.</p>
    );
  }

  if (permLoading || !accessAllowed || isFloorStaff) {
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

  const unitStaffFilters = (
    <>
      <div className="hub-servicos__filter-field hub-clinic-atendimentos__staff-filter">
        <HubSearchableCombobox
          id="hub-grooming-unit-filter"
          className="hub-combobox--clientes"
          options={unitOptions}
          value={unitFilter}
          onChange={handleUnitFilterChange}
          placeholder="Unidade"
          allowCreate={false}
        />
      </div>
      <div className="hub-servicos__filter-field hub-clinic-atendimentos__staff-filter">
        <HubSearchableCombobox
          id="hub-grooming-staff-filter"
          className="hub-combobox--clientes"
          options={staffOptions}
          value={staffFilter}
          onChange={setStaffFilter}
          placeholder="Profissional"
          allowCreate={false}
        />
      </div>
    </>
  );

  return (
    <div className="hub-grooming-queue-page">
      {!groomingTypesConfigured && !loading ? (
        <div className="hub-clinic-banner">
          <p>
            Configure tipos de serviço com grupo <strong>Banho & Tosa</strong> para ver agendamentos da Agenda nesta
            fila.
          </p>
          <Link to="/hub/servicos" className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm">
            Configurar serviços
          </Link>
        </div>
      ) : null}

      {showWriteGateHint ? (
        <div className="hub-clinic-banner hub-grooming-page__perm-banner" role="status">
          <p>
            Você pode acompanhar a fila, mas não alterar atendimentos. Peça a um gestor para liberar a edição da
            Agenda. No celular, use a aba <strong>Minha fila</strong>.
          </p>
        </div>
      ) : null}
      {accessAllowed && !canWrite && !hasPermission('grooming.queue.manage') ? (
        <p className="hub-clientes__muted hub-grooming-page__perm-banner">Visualização da fila (somente leitura).</p>
      ) : null}

      <div className="hub-clientes__toolbar hub-clinic-atendimentos__toolbar">
        <div className="hub-clinic-atendimentos__date-nav">
          <button type="button" className="hub-clientes__icon-btn" onClick={() => shiftDay(-1)} aria-label="Dia anterior">
            <ChevronLeft size={18} />
          </button>
          <span className="hub-clinic-atendimentos__date-label hub-grooming-page__date-label">{dateLabel}</span>
          <button type="button" className="hub-clientes__icon-btn" onClick={() => shiftDay(1)} aria-label="Próximo dia">
            <ChevronRight size={18} />
          </button>
          {!isToday ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              onClick={() => setCursor(new Date())}
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
            placeholder="Buscar pet ou tutor… (/)"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </div>
        {!isNarrow ? unitStaffFilters : null}
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          onClick={() => void load()}
          disabled={loading || refreshing}
          aria-label="Atualizar fila"
        >
          <RefreshCw size={16} />
        </button>
        {canWrite ? (
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={() => setWalkInOpen(true)}>
            Avulso
          </button>
        ) : null}
        <Link to="/hub/appointments" className="hub-clientes__btn hub-clientes__btn--ghost">
          <CalendarDays size={16} aria-hidden />
          Agenda
        </Link>
      </div>

      {isNarrow ? (
        <div className="hub-grooming-page__more-filters">
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            onClick={() => setMoreFiltersOpen((v) => !v)}
            aria-expanded={moreFiltersOpen}
          >
            {moreFiltersOpen ? 'Ocultar filtros' : 'Mais filtros'}
          </button>
          {moreFiltersOpen ? <div className="hub-grooming-page__more-filters-body">{unitStaffFilters}</div> : null}
        </div>
      ) : null}

      <div className="hub-grooming-page__filters" role="toolbar" aria-label="Filtros da fila">
        <span className="hub-grooming-page__filters-label">Filtros</span>
        {PORTE_FILTER_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
          <button
            key={o.value}
            type="button"
            className={`hub-clientes__btn hub-clientes__btn--sm${filterPorte === o.value ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'}`}
            onClick={() => setFilterPorte((cur) => (cur === o.value ? 'all' : o.value))}
          >
            {o.label}
          </button>
        ))}
        <button
          type="button"
          className={`hub-clientes__btn hub-clientes__btn--sm${filterBanhoOnly ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'}`}
          onClick={() => setFilterBanhoOnly((v) => !v)}
          title="Serviços de grooming do item sem «tosa» no nome ou código"
        >
          Só banho
        </button>
        <button
          type="button"
          className={`hub-clientes__btn hub-clientes__btn--sm${filterPriorityOnly ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'}`}
          onClick={() => setFilterPriorityOnly((v) => !v)}
        >
          Só prioritários
        </button>
        <button
          type="button"
          className={`hub-clientes__btn hub-clientes__btn--sm${filterLtOnly ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'}`}
          onClick={() => setFilterLtOnly((v) => !v)}
        >
          Só leva e traz
        </button>
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

      {!loading ? (
        <div className="hub-clientes__metrics hub-clinic-metrics hub-grooming-page__metrics-grid">
          <div className="hub-clientes__metric-card">
            <span className="hub-clientes__metric-label">Na fila</span>
            <span className="hub-clientes__metric-value">{metrics.total}</span>
          </div>
          <div className="hub-clientes__metric-card">
            <span className="hub-clientes__metric-label">Em atendimento</span>
            <span className="hub-clientes__metric-value">{metrics.inService}</span>
          </div>
          <div className="hub-clientes__metric-card">
            <span className="hub-clientes__metric-label">Prontos</span>
            <span className="hub-clientes__metric-value">{metrics.ready}</span>
          </div>
          <div
            className={`hub-clientes__metric-card${metrics.late > 0 ? ' hub-grooming-page__metric-card--late' : ''}`}
          >
            <span className="hub-clientes__metric-label">Atrasados</span>
            <span className="hub-clientes__metric-value">{metrics.late}</span>
          </div>
        </div>
      ) : null}

      <HubRefreshingBanner show={refreshing} label="Atualizando fila…" />

      {loading ? (
        <HubLoading variant="block" label="Carregando fila…" className="hub-clinic-page__pad" />
      ) : items.length === 0 ? (
        <p className="hub-clientes__muted hub-clinic-page__pad">
          Nenhum agendamento de Banho & Tosa neste dia. Os serviços agendados na Agenda com grupo Banho & Tosa
          aparecem aqui automaticamente.
        </p>
      ) : items.length > 0 && itemsFiltered.length === 0 ? (
        <div className="hub-grooming-page__empty-filters">
          <p className="hub-clientes__muted">Nenhum card corresponde aos filtros.</p>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            onClick={clearFilters}
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <GroomingQueueBoard
          items={itemsFiltered}
          canWrite={canWrite}
          canDragQueue={canDragQueue}
          canPauseQueue={canPauseQueue}
          onStageDrop={handleStageDrop}
          onPauseToggle={(item) => void handlePauseToggle(item)}
          searchQ={searchQ}
          onSelect={setSelected}
          onQuickAction={(item, action) => void handleQuickAction(item, action)}
          onTogglePriority={(item) => void handleTogglePriority(item)}
        />
      )}

      <GroomingAppointmentDrawer
        item={selected}
        open={!!selected}
        canWrite={canWrite}
        canPauseQueue={canPauseQueue}
        onPauseToggle={(item) => void handlePauseToggle(item)}
        showOperationalPricing={showOperationalPricing}
        busy={actionBusy}
        onClose={() => setSelected(null)}
        onQuickAction={handleQuickAction}
        onSessionUpdated={() => void load()}
        checkoutEnabled={false}
        canViewFinancial={canViewFinancial}
        onTogglePriority={canWrite ? (item) => void handleTogglePriority(item) : undefined}
        canAddExtras={canWrite}
      />

      <GroomingWalkInPanel
        open={walkInOpen}
        clinicId={clinicId!}
        unitId={unitIdParam}
        onClose={() => setWalkInOpen(false)}
        onSubmit={createWalkIn}
        submitting={walkInBusy}
      />
    </div>
  );
};

export default HubGroomingQueuePage;
