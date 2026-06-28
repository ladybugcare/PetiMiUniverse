import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { apiRequest, getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
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
import { getItemBoardStage, type GroomingStage } from './groomingStages';
import GroomingQueueBoard, { type GroomingQuickAction } from './GroomingQueueBoard';
import GroomingAppointmentDrawer from './GroomingAppointmentDrawer';
import GroomingWalkInPanel from './GroomingWalkInPanel';
import { PORTE_LABELS, PORTE_VALUES } from '../../utils/hubServiceTypesPricingMatrix';
import '../clinica/clinica-page.css';
import '../clientes/clientes.css';
import './grooming-page.css';

const POLL_MS = 30_000;

const PORTE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos os portes' },
  ...PORTE_VALUES.map((p) => ({ value: p, label: PORTE_LABELS[p] })),
];

const HubGroomingQueuePage: React.FC = () => {
  const { showError, showSuccess } = useAlert();
  const { role: authRole } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const clinicId = getStoredClinicId();
  const accessAllowed = hasPermission('grooming.queue.read');
  const canWrite =
    hasPermission('grooming.queue.manage') && hasPermission('hub.appointments.write');
  /** Valores (R$) no drawer operacional: só quem gere catálogo/preços (`hub.service_types.write`). */
  const showOperationalPricing = hasPermission('hub.service_types.write');
  const showWriteGateHint =
    accessAllowed && !canWrite && hasPermission('grooming.queue.manage');
  const canViewFinancial = hasPermission('hub.financial.read');
  const canDragQueue = hasPermission('grooming.queue.manage');
  const canPauseQueue = hasPermission('grooming.queue.manage');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [filterPriorityOnly, setFilterPriorityOnly] = useState(false);
  const [filterLtOnly, setFilterLtOnly] = useState(false);
  const [filterPorte, setFilterPorte] = useState('all');
  const [filterBanhoOnly, setFilterBanhoOnly] = useState(false);
  const [items, setItems] = useState<GroomingDayBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
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


  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await hubGroomingApi.dayBoard(clinicId, dayRange, {
        staffId: staffFilter || undefined,
        unitId: unitIdParam,
      });
      setItems(res.items ?? []);
      setGroomingTypesConfigured(res.grooming_types_configured !== false);
      setSelected((prev) => {
        if (!prev) return null;
        const key = prev.session_id || prev.appointment_id;
        return res.items?.find((i) => (i.session_id || i.appointment_id) === key) ?? prev;
      });
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar fila de Banho & Tosa');
      setItems([]);
      setGroomingTypesConfigured(true);
    } finally {
      setLoading(false);
    }
  }, [clinicId, dayRange, staffFilter, unitIdParam, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

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
    void hubStaffApi.list(clinicId).then((r) => setStaff(r.staff ?? [])).catch(() => setStaff([]));
  }, [clinicId]);

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

  const handleQuickAction = async (item: GroomingDayBoardItem, action: GroomingQuickAction) => {
    if (!clinicId || !canWrite) return;
    setActionBusy(true);
    try {
      if (action.type === 'confirm_appointment' && item.appointment_id) {
        await hubAgendaApi.patch(item.appointment_id, { clinic_id: clinicId, status: 'confirmed' });
      } else if (action.type === 'check_in' && item.appointment_id) {
        await hubGroomingApi.openFromAppointment(clinicId, item.appointment_id);
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
      if (!clinicId || !item.session_id || !canDragQueue) return;
      setActionBusy(true);
      try {
        await hubGroomingApi.patchSession(item.session_id, { clinic_id: clinicId, grooming_stage: stage });
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
    const late = items.filter((i) => i.is_late).length;
    return { total, inService, late };
  }, [items]);

  if (!permLoading && !clinicId) {
    return (
      <p className="hub-clientes__muted hub-clinic-page__pad">Selecione uma clínica para acessar Banho & Tosa.</p>
    );
  }

  if (permLoading || !accessAllowed) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Carregando…</p>;
  }

  const dateLabel = cursor.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="hub-grooming-page">
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
            Tem permissão de fila (<code>grooming.queue.manage</code>), mas as ações de edição nesta página também
            exigem <code>hub.appointments.write</code> (edição da Agenda): check-in na sessão, checklist, adicionais,
            marcar serviço como executado, avulso e notas operacionais. Peça a um gestor para associar as duas
            permissões ao seu utilizador.
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
          <span className="hub-clinic-atendimentos__date-label">{dateLabel}</span>
          <button type="button" className="hub-clientes__icon-btn" onClick={() => shiftDay(1)} aria-label="Próximo dia">
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
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          onClick={() => void load()}
          disabled={loading}
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
          Agenda
        </Link>
      </div>

      <div className="hub-grooming-page__filters" role="toolbar" aria-label="Filtros da fila">
        <label className="hub-grooming-page__filter-field hub-clientes__muted">
          <span className="hub-grooming-page__filter-label">Porte</span>
          <select
            className="hub-clientes__select hub-grooming-page__filter-select"
            value={filterPorte}
            onChange={(e) => setFilterPorte(e.target.value)}
          >
            {PORTE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`hub-clientes__btn hub-clientes__btn--sm${filterBanhoOnly ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'}`}
          onClick={() => setFilterBanhoOnly((v) => !v)}
          title="Serviços de grooming do item sem «tosa» no nome ou código (heurística)"
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
      </div>

      {!loading ? (
        <p className="hub-clientes__muted hub-grooming-page__metrics">
          {metrics.total} na fila · {metrics.inService} em atendimento
          {metrics.late > 0 ? ` · ${metrics.late} em atraso` : ''}
        </p>
      ) : null}

      {loading ? (
        <p className="hub-clientes__muted hub-clinic-page__pad">Carregando fila…</p>
      ) : items.length === 0 ? (
        <p className="hub-clientes__muted hub-clinic-page__pad">
          Nenhum agendamento de Banho & Tosa neste dia. Os serviços agendados na Agenda com grupo Banho & Tosa
          aparecem aqui automaticamente.
        </p>
      ) : items.length > 0 && itemsFiltered.length === 0 ? (
        <p className="hub-clientes__muted hub-clinic-page__pad">Nenhum card corresponde aos filtros.</p>
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
      />

      {/* Checkout centralizado no Caixa — removido daqui */}

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
