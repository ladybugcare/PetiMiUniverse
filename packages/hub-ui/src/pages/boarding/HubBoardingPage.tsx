import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, PlusCircle, RefreshCw, Search } from 'lucide-react';
import { apiRequest, getStoredClinicId, getSupabase, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { hubBoardingApi, type BoardingDayBoardItem, type BoardingOccupancyResponse } from '../../api/hubBoardingApi';
import { hubAgendaApi } from '../../api/hubAgendaApi';
import {
  dayRangeIsoLocal,
  isUuid,
  loadAgendaPersistedFilters,
  saveAgendaPersistedUnit,
} from '../agenda/agendaFilters';
import type { BoardingMode } from './boardingStages';
import BoardingDayBoard from './BoardingDayBoard';
import BoardingReservationDrawer from './BoardingReservationDrawer';
import BoardingCalendarView from './BoardingCalendarView';
import BoardingWalkInPanel from './BoardingWalkInPanel';
import '../clinica/clinica-page.css';
import '../clientes/clientes.css';
import './boarding-page.css';

const POLL_MS = 30_000;

const HubBoardingPage: React.FC = () => {
  const { showError } = useAlert();
  const { role: authRole } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const clinicId = getStoredClinicId();

  const accessAllowed = hasPermission('boarding.reservations.read');
  const canWrite =
    hasPermission('boarding.reservations.manage') && hasPermission('hub.appointments.write');
  const canDailyReport = hasPermission('boarding.daily_report.write');
  const canManageFinance = hasPermission('hub.receivables.create');
  const canWriteInventory = hasPermission('hub.inventory.write');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeMode, setActiveMode] = useState<BoardingMode>('all');
  const [items, setItems] = useState<BoardingDayBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [unitFilter, setUnitFilter] = useState(() => loadAgendaPersistedFilters().unit ?? 'all');
  const [searchQ, setSearchQ] = useState('');
  const [boardingTypesConfigured, setBoardingTypesConfigured] = useState(true);
  const [selected, setSelected] = useState<BoardingDayBoardItem | null>(null);
  const [cursor, setCursor] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<'board' | 'calendar'>('board');
  const [occupancy, setOccupancy] = useState<BoardingOccupancyResponse | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInBusy, setWalkInBusy] = useState(false);

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
      const res = await hubBoardingApi.dayBoard(clinicId, dayRange, {
        unitId: unitIdParam,
        mode: activeMode === 'all' ? undefined : activeMode,
      });
      setItems(res.items ?? []);
      setBoardingTypesConfigured(res.boarding_types_configured !== false);
      setSelected((prev) => {
        if (!prev) return null;
        const key = prev.reservation_id || prev.appointment_id;
        return res.items?.find((i) => (i.reservation_id || i.appointment_id) === key) ?? prev;
      });
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar painel de Hotel & Creche');
      setItems([]);
      setBoardingTypesConfigured(true);
    } finally {
      setLoading(false);
    }
  }, [clinicId, dayRange, unitIdParam, activeMode, showError]);

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
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Realtime: escuta mudanças em hub_boarding_reservations para o clinic_id atual.
  // Complementa o polling (não o substitui) para reduzir latência de atualizações.
  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel(`hub_boarding_${clinicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hub_boarding_reservations',
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => { void load(); }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [clinicId, accessAllowed, load]);

  useEffect(() => {
    if (!clinicId) return;
    void (apiRequest(`/units/clinic/${encodeURIComponent(clinicId)}?activeOnly=true`) as Promise<{
      units?: { id: string; name: string }[];
    }>)
      .then((r) => setUnits(r.units ?? []))
      .catch(() => setUnits([]));
  }, [clinicId]);

  const loadOccupancy = useCallback(async () => {
    if (!clinicId) return;
    try {
      const occ = await hubBoardingApi.getOccupancy(clinicId, {
        unitId: unitIdParam,
        dateYmd: dayRange.dateYmd,
        mode: activeMode === 'all' ? undefined : activeMode,
      });
      setOccupancy(occ);
    } catch {
      // Ocupação é não-crítica: falha silenciosa
    }
  }, [clinicId, unitIdParam, dayRange.dateYmd, activeMode]);

  useEffect(() => {
    void loadOccupancy();
  }, [loadOccupancy]);

  const handleUnitFilterChange = (value: string) => {
    setUnitFilter(value);
    saveAgendaPersistedUnit(value);
  };

  const handleWalkIn = async (payload: {
    petId: string;
    guardianId?: string;
    mode: BoardingMode;
    expectedCheckIn?: string;
    expectedCheckOut?: string;
    notes?: string;
  }) => {
    if (!clinicId) return;
    setWalkInBusy(true);
    try {
      await hubBoardingApi.createReservation({
        clinic_id: clinicId,
        pet_id: payload.petId,
        guardian_id: payload.guardianId ?? null,
        unit_id: unitIdParam ?? null,
        mode: payload.mode,
        expected_check_in: payload.expectedCheckIn ?? null,
        expected_check_out: payload.expectedCheckOut ?? null,
        notes: payload.notes ?? null,
      });
      setWalkInOpen(false);
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar entrada avulsa');
    } finally {
      setWalkInBusy(false);
    }
  };

  const handleCheckIn = async (item: BoardingDayBoardItem) => {
    if (!clinicId || !canWrite) return;
    setActionBusy(true);
    try {
      if (item.reservation_id) {
        await hubBoardingApi.patchReservation(item.reservation_id, {
          clinic_id: clinicId,
          status: 'checked_in',
          checked_in_at: new Date().toISOString(),
        });
      } else if (item.appointment_id) {
        await hubBoardingApi.openFromAppointment(clinicId, item.appointment_id);
        await hubAgendaApi.patch(item.appointment_id, { clinic_id: clinicId, status: 'in_progress' });
      }
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao fazer check-in');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCheckOut = async (item: BoardingDayBoardItem) => {
    if (!clinicId || !canWrite) return;
    setActionBusy(true);
    try {
      if (item.reservation_id) {
        await hubBoardingApi.patchReservation(item.reservation_id, {
          clinic_id: clinicId,
          status: 'checked_out',
          checked_out_at: new Date().toISOString(),
        });
      } else if (item.appointment_id) {
        await hubAgendaApi.patch(item.appointment_id, { clinic_id: clinicId, status: 'done' });
      }
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao fazer check-out');
    } finally {
      setActionBusy(false);
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

  const shiftDay = (delta: number) => {
    setCursor((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + delta);
      return n;
    });
  };

  const metrics = useMemo(() => {
    const total = items.length;
    const hosting = items.filter((i) => {
      const stage = String(i.boarding_stage ?? '');
      return stage === 'checked_in' || i.appointment_status === 'in_progress';
    }).length;
    const late = items.filter((i) => i.is_late).length;
    return { total, hosting, late };
  }, [items]);

  if (!permLoading && !clinicId) {
    return (
      <p className="hub-clientes__muted hub-clinic-page__pad">
        Selecione uma clínica para acessar Hotel & Creche.
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

  const tabsConfig: { mode: BoardingMode; label: string }[] = [
    { mode: 'all', label: 'Todos' },
    { mode: 'hotel', label: 'Hotel' },
    { mode: 'daycare', label: 'Creche' },
  ];

  const overHotel = occupancy?.hotel.over_capacity ?? false;
  const overDaycare = occupancy?.daycare.over_capacity ?? false;
  const hasOverbooking = overHotel || overDaycare;

  return (
    <div className="hub-grooming-page hub-boarding-page">
      {!boardingTypesConfigured && !loading && (
        <div className="hub-clinic-banner">
          <p>
            Configure tipos de serviço com grupo <strong>hotel</strong> ou <strong>creche</strong>{' '}
            para ver agendamentos neste painel.
          </p>
          <Link to="/hub/servicos" className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm">
            Configurar serviços
          </Link>
        </div>
      )}
      {hasOverbooking && (
        <div className="hub-clinic-banner hub-clinic-banner--warning">
          <p>
            {overHotel && (
              <>
                <strong>Hotel</strong>: {occupancy!.hotel.current}/{occupancy!.hotel.max} vagas ocupadas.{' '}
              </>
            )}
            {overDaycare && (
              <>
                <strong>Creche</strong>: {occupancy!.daycare.current}/{occupancy!.daycare.max} cães no turno.{' '}
              </>
            )}
            Capacidade excedida. As reservas continuam sendo aceitas.
          </p>
        </div>
      )}

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
            id="hub-boarding-unit-filter"
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
          aria-label="Atualizar painel"
        >
          <RefreshCw size={16} />
        </button>

        <button
          type="button"
          className={`hub-clientes__btn hub-clientes__btn--ghost${viewMode === 'calendar' ? ' hub-clientes__btn--primary' : ''}`}
          onClick={() => setViewMode((v) => (v === 'board' ? 'calendar' : 'board'))}
          aria-label="Alternar para calendário"
          title="Calendário de reservas"
        >
          <CalendarDays size={16} />
        </button>

        {canWrite && (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            onClick={() => setWalkInOpen(true)}
            aria-label="Entrada avulsa"
            title="Entrada avulsa"
          >
            <PlusCircle size={16} />
          </button>
        )}

        <Link to="/hub/appointments" className="hub-clientes__btn hub-clientes__btn--ghost">
          Agenda
        </Link>
      </div>

      {/* Abas Hotel / Creche */}
      <div className="hub-grooming-page__filters" role="tablist" aria-label="Modo de hospedagem">
        {tabsConfig.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={activeMode === mode}
            className={`hub-clientes__btn hub-clientes__btn--sm${
              activeMode === mode ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'
            }`}
            onClick={() => setActiveMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>

      {!loading && (
        <p className="hub-clientes__muted hub-grooming-page__metrics">
          {metrics.total} previstos · {metrics.hosting} hospedados
          {metrics.late > 0 ? ` · ${metrics.late} em atraso` : ''}
          {occupancy && (occupancy.hotel.max != null || occupancy.daycare.max != null) && (
            <span className={`hub-boarding-page__occupancy-chip${hasOverbooking ? ' hub-boarding-page__occupancy-chip--over' : ''}`}>
              {occupancy.hotel.max != null && ` · ${occupancy.hotel.current}/${occupancy.hotel.max} hotel`}
              {occupancy.daycare.max != null && ` · ${occupancy.daycare.current}/${occupancy.daycare.max} creche`}
            </span>
          )}
        </p>
      )}

      {viewMode === 'calendar' ? (
        <BoardingCalendarView
          clinicId={clinicId ?? ''}
          unitId={unitIdParam}
          mode={activeMode}
          onSelectReservationId={(id) => {
            const found = items.find((i) => i.reservation_id === id);
            if (found) setSelected(found);
          }}
        />
      ) : loading ? (
        <HubLoading variant="block" label="Carregando painel…" className="hub-clinic-page__pad" />
      ) : items.length === 0 ? (
        <p className="hub-clientes__muted hub-clinic-page__pad">
          Nenhum agendamento de Hotel & Creche neste dia. Os serviços agendados na Agenda com grupos{' '}
          <strong>hotel</strong> ou <strong>creche</strong> aparecem aqui automaticamente.
        </p>
      ) : (
        <BoardingDayBoard
          items={items}
          canWrite={canWrite && !actionBusy}
          searchQ={searchQ}
          onSelect={setSelected}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
        />
      )}

      <BoardingReservationDrawer
        item={selected}
        open={!!selected}
        canWrite={canWrite}
        canDailyReport={canDailyReport}
        canManageFinance={canManageFinance}
        canWriteInventory={canWriteInventory}
        unitId={unitIdParam}
        onClose={() => setSelected(null)}
        onUpdated={() => void load()}
      />

      {canWrite && (
        <BoardingWalkInPanel
          open={walkInOpen}
          clinicId={clinicId ?? ''}
          unitId={unitIdParam}
          onClose={() => setWalkInOpen(false)}
          onSubmit={handleWalkIn}
          submitting={walkInBusy}
        />
      )}
    </div>
  );
};

export default HubBoardingPage;
