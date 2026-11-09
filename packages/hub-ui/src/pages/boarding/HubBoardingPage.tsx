import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, RefreshCw, Search } from 'lucide-react';
import { apiRequest, getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { HubDayNav } from '../../components/HubDayNav';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { hubBoardingApi, type BoardingOpsStay, type BoardingTask } from '../../api/hubBoardingApi';
import { useAlert } from '../../components/AlertProvider';
import {
  dayRangeIsoLocal,
  isUuid,
  loadAgendaPersistedFilters,
  saveAgendaPersistedUnit,
} from '../agenda/agendaFilters';
import { isBoardingFloorStaff } from './boardingAccess';
import {
  BATCH_TASK_KINDS,
  sortStays,
  stayMatchesFilter,
  stayMatchesSearch,
  type StayFilter,
} from './boardingCareUi';
import { useBoardingOpsBoard } from './useBoardingOpsBoard';
import { useBoardingTaskRunner } from './useBoardingTaskRunner';
import BoardingStayCard from './BoardingStayCard';
import BoardingTaskList from './BoardingTaskList';
import BoardingCalendarView from './BoardingCalendarView';
import BoardingStayPanel, { type BoardingStayTarget } from './BoardingStayPanel';
import BoardingCheckInPanel, { type CheckInRequest } from './BoardingCheckInPanel';
import BoardingCheckOutPanel from './BoardingCheckOutPanel';
import BoardingNewStayPanel from './BoardingNewStayPanel';
import BoardingHandoffPanel from './BoardingHandoffPanel';
import BoardingGroupActivityPanel from './BoardingGroupActivityPanel';
import '../clinica/clinica-page.css';
import '../clientes/clientes.css';
import '../grooming/grooming-page.css';
import './boarding-page.css';

type ViewMode = 'pets' | 'tasks' | 'calendar';

const FILTERS: { id: StayFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'attention', label: 'Precisam de atenção' },
  { id: 'hotel', label: 'Hotel' },
  { id: 'daycare', label: 'Creche' },
  { id: 'arrivals', label: 'Chegadas' },
  { id: 'departures', label: 'Saídas' },
];

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'pets', label: 'Por pet' },
  { id: 'tasks', label: 'Por tarefa' },
  { id: 'calendar', label: 'Calendário' },
];

/** Passagem recente sem ciência (até 12h): o próximo turno precisa ler. */
function handoffNeedsAck(h: { created_at: string; acknowledged_at?: string | null } | null | undefined): boolean {
  if (!h || h.acknowledged_at) return false;
  return Date.now() - new Date(h.created_at).getTime() < 12 * 3600_000;
}

const HubBoardingPage: React.FC = () => {
  const { role: authRole } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError, showSuccess } = useAlert();
  const navigate = useNavigate();
  const clinicId = getStoredClinicId();

  const accessAllowed = hasPermission('boarding.reservations.read');
  const canWrite = hasPermission('boarding.reservations.manage') && hasPermission('hub.appointments.write');
  const isFloorStaff = isBoardingFloorStaff(authRole, hasPermission('hub.appointments.write'));
  const canDailyReport = hasPermission('boarding.daily_report.write');
  const canViewFinancial = hasPermission('hub.financial.read');
  const canWriteInventory = hasPermission('hub.inventory.write');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(() => new Date());
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [unitFilter, setUnitFilter] = useState(() => loadAgendaPersistedFilters().unit ?? 'all');
  const [searchQ, setSearchQ] = useState('');
  const [filter, setFilter] = useState<StayFilter>('all');
  const [view, setView] = useState<ViewMode>('pets');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  const [stayTarget, setStayTarget] = useState<BoardingStayTarget | null>(null);
  const [checkInRequest, setCheckInRequest] = useState<CheckInRequest | null>(null);
  const [checkOutId, setCheckOutId] = useState<string | null>(null);
  const [newStayOpen, setNewStayOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [groupActivity, setGroupActivity] = useState<{
    kind: 'recreation' | 'walk' | 'custom';
    title?: string;
    reservationIds: string[];
  } | null>(null);
  const [showOccupancy, setShowOccupancy] = useState(false);

  const dateYmd = useMemo(() => dayRangeIsoLocal(cursor).dateYmd, [cursor]);
  const unitIdParam = useMemo(() => {
    if (unitFilter === 'all') return undefined;
    if (isUuid(unitFilter)) return unitFilter;
    return units.find((u) => u.name === unitFilter)?.id;
  }, [unitFilter, units]);

  const enabled = Boolean(clinicId) && accessAllowed && !isFloorStaff && !permLoading;
  const { board, loading, refreshing, reload } = useBoardingOpsBoard({
    clinicId,
    unitId: unitIdParam,
    dateYmd,
    enabled,
    channelKey: 'hub_boarding_board',
  });
  const refresh = () => void reload({ soft: true });
  const { busyTaskId, run } = useBoardingTaskRunner(clinicId, () => reload({ soft: true }));

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
    if (isFloorStaff) navigate('/hub/hotel-creche/minha-fila', { replace: true });
  }, [permLoading, accessAllowed, authRole, isFloorStaff, navigate]);

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

  useEffect(() => {
    if (!clinicId || isFloorStaff) return;
    void (apiRequest(`/units/clinic/${encodeURIComponent(clinicId)}?activeOnly=true`) as Promise<{
      units?: { id: string; name: string }[];
    }>)
      .then((r) => setUnits(r.units ?? []))
      .catch(() => setUnits([]));
  }, [clinicId, isFloorStaff]);

  useEffect(() => {
    setSelectedTaskIds(new Set());
  }, [dateYmd, unitIdParam, view]);

  const unitOptions: HubComboboxOption[] = useMemo(() => {
    const rows: HubComboboxOption[] = [{ value: 'all', label: 'Todas as unidades' }];
    for (const u of units) rows.push({ value: u.id, label: u.name });
    if (unitFilter !== 'all' && !rows.some((o) => o.value === unitFilter)) {
      rows.push({ value: unitFilter, label: unitFilter });
    }
    return rows;
  }, [units, unitFilter]);

  const stays = board?.stays ?? [];
  const filterCounts = useMemo(() => {
    const out = {} as Record<StayFilter, number>;
    for (const f of FILTERS) out[f.id] = stays.filter((s) => stayMatchesFilter(s, f.id)).length;
    return out;
  }, [stays]);

  const visibleStays = useMemo(
    () => sortStays(stays.filter((s) => stayMatchesFilter(s, filter) && stayMatchesSearch(s, searchQ))),
    [stays, filter, searchQ],
  );
  const sections = useMemo(
    () => [
      { key: 'present', title: 'Hospedados agora', items: visibleStays.filter((s) => s.stage === 'checked_in') },
      { key: 'arriving', title: 'Chegadas previstas', items: visibleStays.filter((s) => s.stage === 'reserved') },
      { key: 'left', title: 'Saíram', items: visibleStays.filter((s) => s.stage === 'checked_out') },
    ],
    [visibleStays],
  );

  const visibleTasks = useMemo(() => {
    const rids = new Set(visibleStays.map((s) => s.reservation_id).filter(Boolean) as string[]);
    return (board?.tasks ?? []).filter((t) => rids.has(t.hub_boarding_reservation_id));
  }, [board?.tasks, visibleStays]);

  const selectedTasks = visibleTasks.filter((t) => selectedTaskIds.has(t.id));
  const selectedKind = selectedTasks[0]?.kind;

  const toggleTask = (task: BoardingTask) =>
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(task.id)) next.delete(task.id);
      else {
        // Lote só junta tarefas do mesmo tipo.
        const kind = visibleTasks.find((t) => prev.has(t.id))?.kind;
        if (kind && kind !== task.kind) next.clear();
        next.add(task.id);
      }
      return next;
    });

  const openStay = (stay: BoardingOpsStay, initialTab?: BoardingStayTarget['initialTab']) =>
    setStayTarget({ reservationId: stay.reservation_id, stay, initialTab });

  const openStayFromTask = (task: BoardingTask) => {
    const stay = stays.find((s) => s.reservation_id === task.hub_boarding_reservation_id) ?? null;
    setStayTarget({ reservationId: task.hub_boarding_reservation_id, stay, initialTab: 'routine' });
  };

  const requestCheckIn = (stay: BoardingOpsStay) =>
    setCheckInRequest({ reservationId: stay.reservation_id, appointmentId: stay.appointment_id ?? null, stay });

  const attachTaskPhoto = async (task: BoardingTask, file: File) => {
    if (!clinicId) return;
    try {
      await hubBoardingApi.uploadMedia({
        clinicId,
        reservationId: task.hub_boarding_reservation_id,
        file,
        taskId: task.id,
        caption: task.title,
      });
      showSuccess('Foto anexada à tarefa');
      refresh();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao enviar a foto');
    }
  };

  if (!permLoading && !clinicId) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Selecione uma clínica para acessar Hotel & Creche.</p>;
  }

  if (permLoading || !accessAllowed || isFloorStaff) {
    return (
      <div className="hub-clinic-page__pad">
        <HubLoading variant="block" />
      </div>
    );
  }

  const occ = board?.occupancy;
  const overHotel = occ?.hotel.max != null && occ.hotel.current > occ.hotel.max;
  const overDaycare = occ?.daycare.max != null && occ.daycare.current > occ.daycare.max;
  const pendingHandoff = handoffNeedsAck(board?.last_handoff);
  const hasGroupCandidates = stays.some((s) => s.stage === 'checked_in');

  return (
    <div className="hub-boarding-queue-page">
      {board && !board.boarding_types_configured ? (
        <div className="hub-clinic-banner">
          <p>
            Configure tipos de serviço com grupo <strong>hotel</strong> ou <strong>creche</strong> para usar este painel.
          </p>
          <Link to="/hub/servicos" className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm">
            Configurar serviços
          </Link>
        </div>
      ) : null}
      {board && !board.migrations_ready ? (
        <div className="hub-clinic-banner hub-clinic-banner--warning">
          <p>Rotina, cuidados e acomodações ainda não estão disponíveis neste ambiente. Aplique as migrações do módulo.</p>
        </div>
      ) : null}
      {pendingHandoff ? (
        <div className="hub-clinic-banner hub-clinic-banner--warning">
          <p>
            Passagem de turno{board?.last_handoff?.shift_label ? ` (${board.last_handoff.shift_label})` : ''} ainda sem ciência.
          </p>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            onClick={() => setHandoffOpen(true)}
          >
            Ler passagem
          </button>
        </div>
      ) : null}
      {overHotel || overDaycare ? (
        <div className="hub-clinic-banner hub-clinic-banner--warning">
          <p>
            {overHotel ? (
              <>
                <strong>Hotel</strong>: {occ!.hotel.current}/{occ!.hotel.max} vagas.{' '}
              </>
            ) : null}
            {overDaycare ? (
              <>
                <strong>Creche</strong>: {occ!.daycare.current}/{occ!.daycare.max} cães.{' '}
              </>
            ) : null}
            Capacidade excedida.
          </p>
        </div>
      ) : null}

      <div className="hub-clientes__toolbar hub-clinic-atendimentos__toolbar">
        <HubDayNav dateFieldId="hub-boarding-date" value={cursor} onChange={setCursor} />

        <div className="hub-clientes__search hub-clinic-atendimentos__search">
          <Search size={16} className="hub-clientes__search-icon" aria-hidden />
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Buscar pet, tutor ou acomodação… (/)"
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
            onChange={(v) => {
              setUnitFilter(v);
              saveAgendaPersistedUnit(v);
            }}
            placeholder="Unidade"
            allowCreate={false}
          />
        </div>

        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          onClick={() => void reload()}
          disabled={loading}
          aria-label="Atualizar painel"
        >
          <RefreshCw size={16} />
        </button>
        <Link to="/hub/appointments" className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm">
          <CalendarDays size={16} aria-hidden />
          Agenda
        </Link>
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
          onClick={() => setHandoffOpen(true)}
        >
          Passagem de turno
        </button>
        {canWrite ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            onClick={() => setNewStayOpen(true)}
          >
            Nova hospedagem
          </button>
        ) : null}
      </div>

      <div
        className="hub-clientes__metrics hub-clinic-metrics hub-grooming-page__metrics-grid hub-boarding-page__metrics"
        role="toolbar"
        aria-label="Filtrar pets do dia"
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={[
              'hub-clientes__metric-card',
              'hub-grooming-page__metric-btn',
              filter === f.id ? 'hub-grooming-page__metric-btn--active' : '',
              f.id === 'attention' && filterCounts.attention > 0 ? 'hub-grooming-page__metric-card--late' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-pressed={filter === f.id}
            onClick={() => setFilter((cur) => (cur === f.id && f.id !== 'all' ? 'all' : f.id))}
          >
            <span className="hub-clientes__metric-value">{loading && !board ? '–' : filterCounts[f.id]}</span>
            <span className="hub-clientes__metric-label">{f.label}</span>
          </button>
        ))}
      </div>

      <div className="hub-grooming-page__filters hub-boarding-page__views" role="toolbar" aria-label="Visualização">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            className={`hub-clientes__btn hub-clientes__btn--sm${view === v.id ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
            {v.id === 'tasks' && board?.counts.tasks_overdue ? (
              <span className="hub-boarding-page__view-badge">{board.counts.tasks_overdue}</span>
            ) : null}
          </button>
        ))}
        {occ && (occ.hotel.max != null || occ.daycare.max != null || occ.spaces.length) ? (
          <button
            type="button"
            className="hub-clientes__link-btn hub-boarding-page__occupancy"
            aria-expanded={showOccupancy}
            onClick={() => setShowOccupancy((v) => !v)}
          >
            {[
              occ.hotel.max != null ? `Hotel ${occ.hotel.current}/${occ.hotel.max}` : null,
              occ.daycare.max != null ? `Creche ${occ.daycare.current}/${occ.daycare.max}` : null,
              occ.spaces.length
                ? `${occ.spaces.filter((s) => s.current < s.capacity).length} de ${occ.spaces.length} acomodações livres`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {occ.spaces.length ? (showOccupancy ? ' · ocultar' : ' · ver acomodações') : null}
          </button>
        ) : null}
        {canDailyReport && hasGroupCandidates && view !== 'calendar' ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-boarding-page__group-btn"
            onClick={() => setGroupActivity({ kind: 'recreation', reservationIds: [] })}
          >
            Atividade em grupo
          </button>
        ) : null}
      </div>

      <HubRefreshingBanner show={refreshing && !loading} label="Atualizando…" />

      {showOccupancy && occ?.spaces.length ? (
        <section className="hub-boarding-page__occupancy-panel" aria-label="Ocupação por acomodação">
          <h3 className="hub-clinic-queue__col-title">Acomodações</h3>
          <ul className="hub-boarding-page__occupancy-list">
            {occ.spaces.map((s) => {
              const full = s.current >= s.capacity;
              return (
                <li
                  key={s.id}
                  className={`hub-boarding-page__occupancy-item${full ? ' hub-boarding-page__occupancy-item--full' : ''}`}
                >
                  <span className="hub-boarding-page__occupancy-name">{s.name}</span>
                  <span className="hub-boarding-page__occupancy-fill">
                    {s.current}/{s.capacity}
                    {full ? ' · lotada' : ''}
                  </span>
                  {s.pets.length ? (
                    <span className="hub-boarding-page__occupancy-pets">{s.pets.join(', ')}</span>
                  ) : (
                    <span className="hub-boarding-page__occupancy-pets">Livre</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {view === 'calendar' ? (
        <BoardingCalendarView
          clinicId={clinicId ?? ''}
          unitId={unitIdParam}
          mode={filter === 'hotel' || filter === 'daycare' ? filter : 'all'}
          onSelectReservationId={(id) => setStayTarget({ reservationId: id })}
        />
      ) : loading && !board ? (
        <HubLoading variant="block" label="Carregando painel…" className="hub-clinic-page__pad" />
      ) : view === 'tasks' ? (
        <div className="hub-boarding-page__tasks">
          {selectedTasks.length ? (
            <div className="hub-boarding-page__batchbar" role="region" aria-label="Registro em lote">
              <span>
                {selectedTasks.length} {selectedTasks.length === 1 ? 'tarefa selecionada' : 'tarefas selecionadas'}
              </span>
              <div className="hub-clientes__btn-row">
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  onClick={() => setSelectedTaskIds(new Set())}
                >
                  Limpar
                </button>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                  disabled={!selectedKind || !BATCH_TASK_KINDS.includes(selectedKind)}
                  onClick={() =>
                    setGroupActivity({
                      kind: selectedKind as 'recreation' | 'walk' | 'custom',
                      title: selectedTasks[0]?.title,
                      reservationIds: [...new Set(selectedTasks.map((t) => t.hub_boarding_reservation_id))],
                    })
                  }
                >
                  Registrar em lote
                </button>
              </div>
            </div>
          ) : null}
          <BoardingTaskList
            tasks={visibleTasks}
            showPet
            grouped
            canExecute={canDailyReport}
            busyTaskId={busyTaskId}
            onAction={(task, action) => void run(task, action)}
            onOpenPet={openStayFromTask}
            onAttachPhoto={canDailyReport ? (task, file) => void attachTaskPhoto(task, file) : undefined}
            selection={canDailyReport ? { ids: selectedTaskIds, onToggle: toggleTask } : null}
            emptyLabel={stays.some((s) => s.stage === 'checked_in') ? 'Nenhuma tarefa para este filtro.' : 'Nenhum pet hospedado neste dia.'}
          />
        </div>
      ) : visibleStays.length === 0 ? (
        <div className="hub-boarding-page__empty">
          <p className="hub-clientes__muted">
            {stays.length
              ? 'Nenhum pet para este filtro.'
              : 'Nenhum pet em Hotel & Creche neste dia. Reservas feitas aqui ou na Agenda aparecem automaticamente.'}
          </p>
          {canWrite && !stays.length ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              onClick={() => setNewStayOpen(true)}
            >
              Nova hospedagem
            </button>
          ) : null}
        </div>
      ) : (
        sections
          .filter((s) => s.items.length)
          .map((section) => (
            <section key={section.key} className="hub-boarding-page__section" aria-label={section.title}>
              <h3 className="hub-clinic-queue__col-title">
                {section.title} <span className="hub-clinic-queue__count">{section.items.length}</span>
              </h3>
              <div className="hub-boarding-page__grid">
                {section.items.map((stay) => (
                  <BoardingStayCard
                    key={stay.key}
                    stay={stay}
                    canWrite={canWrite}
                    onOpen={(s) => openStay(s)}
                    onCheckIn={requestCheckIn}
                    onCheckOut={(s) => s.reservation_id && setCheckOutId(s.reservation_id)}
                  />
                ))}
              </div>
            </section>
          ))
      )}

      <BoardingStayPanel
        open={!!stayTarget}
        target={stayTarget}
        canManage={canWrite}
        canDailyReport={canDailyReport}
        canViewFinancial={canViewFinancial}
        canWriteInventory={canWriteInventory}
        onClose={() => setStayTarget(null)}
        onUpdated={refresh}
        onRequestCheckIn={(req) => setCheckInRequest(req)}
        onRequestCheckOut={(rid) => setCheckOutId(rid)}
      />

      {canWrite ? (
        <>
          <BoardingCheckInPanel
            open={!!checkInRequest}
            clinicId={clinicId ?? ''}
            unitId={unitIdParam}
            request={checkInRequest}
            onClose={() => setCheckInRequest(null)}
            onDone={() => {
              setCheckInRequest(null);
              refresh();
            }}
          />
          <BoardingCheckOutPanel
            open={!!checkOutId}
            clinicId={clinicId ?? ''}
            reservationId={checkOutId}
            onClose={() => setCheckOutId(null)}
            onDone={refresh}
          />
          <BoardingNewStayPanel
            open={newStayOpen}
            clinicId={clinicId ?? ''}
            unitId={unitIdParam}
            settings={board?.settings}
            onClose={() => setNewStayOpen(false)}
            onCreated={(rid) => {
              setNewStayOpen(false);
              refresh();
              setStayTarget({ reservationId: rid, initialTab: 'care' });
            }}
          />
        </>
      ) : null}

      <BoardingHandoffPanel
        open={handoffOpen}
        clinicId={clinicId ?? ''}
        unitId={unitIdParam}
        board={board}
        canWrite={canDailyReport || canWrite}
        onClose={() => setHandoffOpen(false)}
        onChanged={refresh}
      />

      {canDailyReport ? (
        <BoardingGroupActivityPanel
          open={!!groupActivity}
          clinicId={clinicId ?? ''}
          stays={stays}
          initial={groupActivity}
          onClose={() => setGroupActivity(null)}
          onDone={() => {
            setGroupActivity(null);
            setSelectedTaskIds(new Set());
            refresh();
          }}
        />
      ) : null}
    </div>
  );
};

export default HubBoardingPage;
