import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest, useAuth, getStoredClinicId, usePermissions, type AppRole } from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import {
  hubAgendaApi,
  type HubAgendaCalendarBlock,
  type HubAppointment,
  type HubAppointmentStatus,
  type HubSeriesEndingSoon,
  type ListHubAppointmentsParams,
} from '../../api/hubAgendaApi';
import { hubStaffApi } from '../../api/hubStaffApi';
import type { HubStaffMember } from '../../api/hubStaffApi';
import { hubServiceTypesApi } from '../../api/hubServiceTypesApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import { hubServiceGroupsApi } from '../../api/hubServiceGroupsApi';
import { hubResourcesApi, type HubResource } from '../../api/hubResourcesApi';
import { hubGuardiansApi } from '../../api/hubGuardiansApi';
import { hubQuotesApi, type HubQuoteLine, type HubQuoteLineServiceEmbed } from '../../api/hubQuotesApi';
import type { PackageSaleAgendaNavigationState } from '../finance/packageSaleScheduleUtils';
import { AppointmentSidePanel } from './AppointmentSidePanel';
import { NewAppointmentModal } from './NewAppointmentModal';
import type { CreateHubAppointmentResult, NewAppointmentInitial } from './NewAppointmentModal';
import { SERVICE_GROUP_OPTIONS } from '../../utils/serviceTypeSlug';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-agenda-page.css';
import {
  type AgendaAppointment,
  type AgendaDensity,
  type AgendaGroupMode,
  type AgendaStatus,
  type AgendaView,
  AGENDA_DENSITY_SLOT_H,
  AGENDA_DENSITY_STORAGE_KEY,
  DAY_LANE_DEFAULT_WIDTH_PX,
  DAY_OVERFLOW_RAIL_PX,
  DAY_MAX_VISIBLE_COLUMNS,
  isAgendaDayStay,
  agendaDayStayPeriodLabel,
  STATUS_META,
  minutesSinceDayStart,
  formatHm,
  formatWeekdayShort,
  formatMonthYear,
  startOfWeekMonday,
  addDays,
  isSameDay,
  startOfDay,
  startOfMonth,
  shiftAppointmentToDay,
  monthMatrix,
  serviceGroupLabel,
  laneKeyForAppointment,
  computeOverlapConflictIds,
  layoutDayLaneAppointments,
  planDayLaneOverflowDisplay,
  clampAppointmentToDayLane,
  computeAgendaHourRange,
  parseStaffWorkHours,
  agendaAppointmentEditBlockReason,
  canEditAgendaAppointment,
  enrichAgendaCardsForGrid,
  isPartnerCareLocation,
} from './agendaModel';
import { mapHubAppointmentToAgenda, buildDuplicateAppointmentInitial, buildSeriesRenewalInitial } from './mapHubAgenda';
import { findExtraBlockChildren } from './extraBlockAgendaUtils';
import { AgendaAppointmentCard } from './AgendaAppointmentCard';
import { AgendaToolbar } from './AgendaToolbar';
import { AgendaFiltersBar, type AgendaFilterChip } from './AgendaFiltersBar';
import { AgendaConflictSummary } from './AgendaConflictSummary';
import { AgendaDayOverflowMenu } from './AgendaDayOverflowMenu';
import {
  AGENDA_DRAG_THRESHOLD_PX,
  hitTestAgendaDrop,
  minutesFromLanePointer,
} from './agendaPointerDrag';
import { hubEncountersApi, type DayBoardItem } from '../../api/hubClinicalApi';
import { hubGroomingApi } from '../../api/hubGroomingApi';
import { hubBoardingApi } from '../../api/hubBoardingApi';
import { isWalkInAppointmentKind, resolveOperationalModuleFromServiceGroups } from './walkInUtils';
import {
  SCHEDULE_OVERLAP_CANCEL_TEXT,
  SCHEDULE_OVERLAP_CONFIRM_TEXT,
  SCHEDULE_OVERLAP_CONFIRM_TITLE,
  agendaAppointmentToConflictSlot,
  buildScheduleOverlapConfirmMessage,
  findLocalScheduleConflict,
  isScheduleConflictMessage,
} from './scheduleConflict';
import { ComandaCheckoutDrawer } from '../finance/ComandaCheckoutDrawer';
import { hubComandaApi as hubComandaApiAgenda } from '../../api/hubComandaApi';
import StartEncounterModal from '../clinica/StartEncounterModal';
import { getSelectedUnitId } from '../../utils/useSelectedUnitId';
import {
  AGENDA_FILTERS_STORAGE_KEY,
  loadAgendaPersistedFilters,
  isUuid,
  type AgendaPersistedFilters,
} from './agendaFilters';

const FILTERS_STORAGE_KEY = AGENDA_FILTERS_STORAGE_KEY;

const MOBILE_MQ = '(max-width: 900px)';
const SLOT_MIN = 30;
const HEADER_H = 48;
const DAY_STAY_ROW_H = 24;
const DAY_STAY_MAX_ROWS = 3;
/** Largura de coluna sem nenhum atendimento no dia. */
const DAY_COL_EMPTY_W = 140;
/** Largura por card simultâneo ao dimensionar a coluna (até DAY_MAX_VISIBLE_COLUMNS). */
const DAY_COL_PER_CARD_W = 112;

function loadPersistedDensity(): AgendaDensity {
  try {
    const raw = sessionStorage.getItem(AGENDA_DENSITY_STORAGE_KEY);
    if (raw === 'compact' || raw === 'comfortable' || raw === 'spacious') return raw;
  } catch {
    /* ignore */
  }
  return 'comfortable';
}

type PersistedFilters = AgendaPersistedFilters & { groupMode: AgendaGroupMode };

function parseYmd(s: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return startOfDay(dt);
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadPersistedFilters(): Partial<PersistedFilters> {
  return loadAgendaPersistedFilters() as Partial<PersistedFilters>;
}

function savePersistedFilters(p: PersistedFilters) {
  try {
    sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function quoteLineServiceName(line: HubQuoteLine): string | null {
  const svc = embedOne<HubQuoteLineServiceEmbed>(line.hub_service_types);
  return svc?.name ?? line.description ?? null;
}

/** Evita reabrir o encaixe vazio no remount do Strict Mode (mesma location.key). */
const consumedWalkInKeys = new Set<string>();

const HubAgendaPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showAlert, showInfo, showSuccess, showError, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const clinicId = getStoredClinicId();
  const [searchParams, setSearchParams] = useSearchParams();

  const accessAllowed = hasPermission('hub.appointments.read');
  const canWrite = hasPermission('hub.appointments.write');
  const canClinicWrite = hasPermission('hub.clinic.write');
  const canGroomingWrite =
    hasPermission('grooming.queue.manage') && hasPermission('hub.appointments.write');
  const canBoardingWrite =
    hasPermission('boarding.reservations.manage') && hasPermission('hub.appointments.write');
  const canCreateReceivable = hasPermission('hub.receivables.create');
  const canViewFinancial = hasPermission('hub.financial.read');

  const persisted = useMemo(() => loadPersistedFilters(), []);

  const [view, setView] = useState<AgendaView>('day');
  const [cursorDate, setCursorDate] = useState<Date>(() => {
    const fromUrl = parseYmd(searchParams.get('date'));
    return fromUrl ?? startOfDay(new Date());
  });

  const [groupMode, setGroupMode] = useState<AgendaGroupMode>(persisted.groupMode ?? 'professional');
  const [unitFilter, setUnitFilter] = useState(persisted.unit ?? 'all');
  const [professionalFilter, setProfessionalFilter] = useState(persisted.professional ?? 'all');
  const [groupFilter, setGroupFilter] = useState(persisted.group ?? 'all');
  const [statusFilter, setStatusFilter] = useState(persisted.status ?? 'all');
  const [resourceFilter, setResourceFilter] = useState((persisted as Partial<PersistedFilters>).resource_label ?? 'all');
  const [catalogResources, setCatalogResources] = useState<HubResource[]>([]);
  const [serviceTypeFilter, setServiceTypeFilter] = useState(
    (persisted as Partial<PersistedFilters>).service_type_id ?? 'all',
  );
  const [searchQ, setSearchQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMode, setDetailMode] = useState<'view' | 'edit'>('view');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHoverKey, setDropHoverKey] = useState<string | null>(null);
  const skipClickAfterDragRef = useRef(false);
  const skipClickUntilRef = useRef(0);
  const pointerDragRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    activated: boolean;
  } | null>(null);

  const [remoteLoading, setRemoteLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [seriesEndingSoon, setSeriesEndingSoon] = useState<HubSeriesEndingSoon[]>([]);
  const [seriesEndingLoaded, setSeriesEndingLoaded] = useState(false);
  const [seriesBannerExpanded, setSeriesBannerExpanded] = useState(false);
  const consumedRenewSeriesRef = useRef<string | null>(null);
  const [rawList, setRawList] = useState<AgendaAppointment[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [pollTick, setPollTick] = useState(0);
  const [clinicUnits, setClinicUnits] = useState<{ id: string; name: string }[]>([]);
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string; role: string; hasLogin: boolean }[]>([]);
  const [fullStaff, setFullStaff] = useState<HubStaffMember[]>([]);
  const [serviceTypes, setServiceTypes] = useState<{ id: string; name: string }[]>([]);
  const [fullSvcTypes, setFullSvcTypes] = useState<HubServiceType[]>([]);
  const [serviceGroupColors, setServiceGroupColors] = useState<Map<string, string>>(() => new Map());
  const [calendarBlocks, setCalendarBlocks] = useState<HubAgendaCalendarBlock[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState<NewAppointmentInitial | null>(null);
  const [createModalLayout, setCreateModalLayout] = useState<'default' | 'clinical_routine' | 'walk_in'>('default');
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutAppointmentId, setCheckoutAppointmentId] = useState<string | null>(null);
  const [agendaStartModalItem, setAgendaStartModalItem] = useState<DayBoardItem | null>(null);
  const [agendaStarting, setAgendaStarting] = useState(false);
  const consumedQuoteRef = useRef<string | null>(null);
  const consumedPetCreateRef = useRef<string | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_MQ).matches : false,
  );
  const [density, setDensity] = useState<AgendaDensity>(() => loadPersistedDensity());
  const SLOT_H = AGENDA_DENSITY_SLOT_H[density];

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(AGENDA_DENSITY_STORAGE_KEY, density);
    } catch {
      /* ignore */
    }
  }, [density]);

  const allAppointments = rawList;

  const fullSvcTypesRef = useRef(fullSvcTypes);
  fullSvcTypesRef.current = fullSvcTypes;
  const cursorDateRef = useRef(cursorDate);
  cursorDateRef.current = cursorDate;

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    const p: PersistedFilters = {
      unit: unitFilter,
      professional: professionalFilter,
      group: groupFilter,
      status: statusFilter,
      groupMode,
      resource_label: resourceFilter,
      service_type_id: serviceTypeFilter,
    };
    savePersistedFilters(p);
  }, [unitFilter, professionalFilter, groupFilter, statusFilter, groupMode, resourceFilter, serviceTypeFilter]);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set('date', toYmd(cursorDate));
    setSearchParams(next, { replace: true });
  }, [cursorDate, setSearchParams]);

  const bumpReload = useCallback(() => setReloadToken((t) => t + 1), []);
  const openAppointmentDetail = useCallback((appointmentId: string) => {
    setSelectedId(appointmentId);
    setDetailOpen(true);
    setDetailMode('view');
  }, []);

  const closeAppointmentDetail = useCallback(() => {
    setDetailOpen(false);
    setSelectedId(null);
    setDetailMode('view');
    setSearchParams((prev) => {
      if (!prev.has('appointment_id')) return prev;
      const next = new URLSearchParams(prev);
      next.delete('appointment_id');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  /** Deep link: /hub/appointments?appointment_id=…&date=YYYY-MM-DD */
  useEffect(() => {
    const id = searchParams.get('appointment_id');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    const d = parseYmd(searchParams.get('date'));
    if (d) setCursorDate(startOfDay(d));
    openAppointmentDetail(id);
  }, [searchParams, openAppointmentDetail]);

  const handleAppointmentUpdated = useCallback((_appointment: HubAppointment) => {
    bumpReload();
    setDetailMode('view');
    showSuccess('Agendamento atualizado.');
  }, [bumpReload, showSuccess]);
  const bumpPoll = useCallback(() => setPollTick((t) => t + 1), []);

  const openCreateModal = useCallback(
    (initial?: NewAppointmentInitial | null, layout: 'default' | 'clinical_routine' | 'walk_in' = 'default') => {
      setCreateInitial(initial ?? null);
      setCreateModalLayout(layout);
      setCreateOpen(true);
    },
    [],
  );

  /** Perfil do pet → ação rápida “Agendar”: abre o painel com tutor e pet preenchidos. */
  useEffect(() => {
    const st = location.state as {
      openPetCreate?: boolean;
      petAppointmentInitial?: NewAppointmentInitial;
    } | null;
    const petIdParam = searchParams.get('petId');
    const guardianIdParam = searchParams.get('guardianId');
    const prefillDateParam = searchParams.get('prefillDate');
    const requestedByState = Boolean(st?.openPetCreate && st.petAppointmentInitial);
    const requestedByUrl = searchParams.get('openCreate') === '1' && Boolean(petIdParam);
    if ((!requestedByState && !requestedByUrl) || !clinicId || !canWrite) return;
    if (consumedPetCreateRef.current === location.key) return;
    consumedPetCreateRef.current = location.key;

    const initial: NewAppointmentInitial = {
      ...(st?.petAppointmentInitial ?? {}),
      date: st?.petAppointmentInitial?.date ?? prefillDateParam ?? toYmd(new Date()),
      pet_id: st?.petAppointmentInitial?.pet_id ?? petIdParam,
      guardian_id: st?.petAppointmentInitial?.guardian_id ?? guardianIdParam,
    };
    if (initial.date) {
      const date = parseYmd(initial.date);
      if (date) {
        setCursorDate(startOfDay(date));
        setView('day');
      }
    }
    openCreateModal(initial);
    const next = new URLSearchParams(searchParams);
    next.delete('openCreate');
    next.delete('petId');
    next.delete('guardianId');
    next.delete('prefillDate');
    navigate(`${location.pathname}${next.toString() ? `?${next.toString()}` : ''}`, {
      replace: true,
      state: null,
    });
  }, [
    location.state,
    location.key,
    location.pathname,
    searchParams,
    clinicId,
    canWrite,
    openCreateModal,
    navigate,
  ]);

  /** Fluxo Clínica → «Agendar na agenda»: abre o modal de novo agendamento com dados pré-preenchidos. */
  useEffect(() => {
    const st = location.state as {
      openClinicalCreate?: boolean;
      clinicalIntakeInitial?: NewAppointmentInitial;
    } | null;
    if (!st?.openClinicalCreate || !st.clinicalIntakeInitial || !clinicId) return;

    const initial = st.clinicalIntakeInitial;
    const dedupeKey = `hub:agenda:clinical_prefill:${clinicId}:${initial.date ?? ''}:${initial.pet_id ?? ''}:${initial.guardian_id ?? ''}:${(initial.services ?? []).map((s) => s.hub_service_type_id).join(',')}`;

    let skipOpen = false;
    try {
      if (sessionStorage.getItem(dedupeKey) === '1') skipOpen = true;
      else sessionStorage.setItem(dedupeKey, '1');
    } catch {
      /* ignore */
    }

    if (initial.date) {
      const d = parseYmd(initial.date);
      if (d) {
        setCursorDate(startOfDay(d));
        setView('day');
      }
    }
    if (!skipOpen) {
      openCreateModal(initial, 'clinical_routine');
    }

    navigate(`${location.pathname}${location.search ? location.search : ''}`, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, clinicId, openCreateModal, navigate]);

  /** Venda de pacote → «Agendar» ou «Cobrar e agendar»: abre o modal com tutor, pet e serviços do pacote. */
  useEffect(() => {
    const st = location.state as PackageSaleAgendaNavigationState | null;
    if (!st?.packageSaleSchedule || !clinicId) return;

    const { initial, remainingLines, packageName } = st.packageSaleSchedule;
    const dedupeKey = `hub:agenda:package_sale:${clinicId}:${initial.pet_id ?? ''}:${initial.guardian_id ?? ''}:${(initial.services ?? []).map((s) => s.hub_service_type_id).join(',')}`;

    let skipOpen = false;
    try {
      if (sessionStorage.getItem(dedupeKey) === '1') skipOpen = true;
      else sessionStorage.setItem(dedupeKey, '1');
    } catch {
      /* ignore */
    }

    if (initial.date) {
      const d = parseYmd(initial.date);
      if (d) {
        setCursorDate(startOfDay(d));
        setView('day');
      }
    }
    if (!skipOpen) {
      openCreateModal(initial);
      const occ = initial.suggest_recurrence?.occurrences;
      if (remainingLines.length > 0) {
        const otherSummary = remainingLines.map((ln) => `${ln.petName} (${ln.packageName})`).join(', ');
        showInfo(
          `Pacote «${packageName}»: o primeiro item já veio pré-selecionado${occ && occ >= 2 ? ` com ${occ} ocorrências` : ''}. Agende também: ${otherSummary}.`,
          'Pacotes',
        );
      } else {
        showInfo(
          occ && occ >= 2
            ? `Agenda aberta com repetição de ${occ} ocorrências (saldo do pacote). Ajuste a frequência se quiser.`
            : 'Agenda aberta com dados da venda do pacote.',
          'Pacotes',
        );
      }
    }

    navigate(`${location.pathname}${location.search ? location.search : ''}`, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, clinicId, openCreateModal, navigate, showInfo]);

  const focusAppointmentOnAgenda = useCallback(
    (appointmentId: string, startsAtIso: string) => {
      const start = new Date(startsAtIso);
      if (!Number.isNaN(start.getTime())) {
        setView('day');
        setCursorDate(startOfDay(start));
      }
      setPendingFocusId(appointmentId);
      openAppointmentDetail(appointmentId);
      bumpReload();
    },
    [bumpReload, openAppointmentDetail],
  );

  const handleAppointmentCreated = useCallback(
    (result: CreateHubAppointmentResult) => {
      const { appointment, created_count, conflicts } = result;

      if (isWalkInAppointmentKind(appointment.appointment_kind)) {
        showSuccess('Encaixe registrado com check-in.');
        bumpReload();
        focusAppointmentOnAgenda(appointment.id, appointment.starts_at);
        const groups = [
          appointment.service_type?.service_group,
          ...(appointment.services ?? []).map((s) => s.service_type?.service_group),
        ];
        if (
          resolveOperationalModuleFromServiceGroups(groups) === 'grooming' &&
          clinicId &&
          canGroomingWrite
        ) {
          void hubGroomingApi
            .openFromAppointment(clinicId, appointment.id, 'queued')
            .catch((e: unknown) => {
              showError(
                (e as Error)?.message ||
                  'Encaixe criado, mas não foi possível abrir na fila de Banho & Tosa.',
              );
            });
        }
        return;
      }

      let message = 'Deseja criar outro agendamento, ir ao Caixa ou voltar à agenda com este agendamento em foco?';
      const isSeriesResult = Boolean(appointment.series_id) || (conflicts && conflicts.length > 0);
      if (created_count > 1 && isSeriesResult) {
        message = `${created_count} ocorrências foram criadas na série. ${message}`;
      } else if (created_count > 1) {
        message = `${created_count} agendamentos foram criados nesta visita. ${message}`;
      }
      if (conflicts && conflicts.length > 0) {
        message = `${conflicts.length} data(s) da série entraram em conflito e não foram criadas. ${message}`;
      }

      const appointmentDate = appointment.starts_at?.slice(0, 10) ?? '';

      showAlert({
        type: 'success',
        title: 'Agendamento criado!',
        message,
        showCancel: true,
        cancelText: 'Voltar à agenda',
        secondaryText: 'Ir ao Caixa',
        confirmText: 'Novo agendamento',
        onConfirm: () => {
          bumpReload();
          openCreateModal(null);
        },
        onCancel: () => focusAppointmentOnAgenda(appointment.id, appointment.starts_at),
        onSecondary: () => {
          const qs = appointmentDate ? `?date=${encodeURIComponent(appointmentDate)}` : '';
          navigate(`/hub/caixa${qs}`);
        },
      });
    },
    [showAlert, showSuccess, showError, openCreateModal, focusAppointmentOnAgenda, bumpReload, navigate, clinicId, canGroomingWrite],
  );

  const openWalkInParam = searchParams.get('openWalkIn') === '1';

  useEffect(() => {
    if (!clinicId || !openWalkInParam || !canWrite) return;

    const st = location.state as { walkInInitial?: NewAppointmentInitial } | null;
    const petIdParam = searchParams.get('petId');
    const petNameParam = searchParams.get('petName');
    const guardianIdParam = searchParams.get('guardianId');
    const guardianNameParam = searchParams.get('guardianName');
    const dateParam = searchParams.get('date');

    const initial: NewAppointmentInitial = {
      ...(st?.walkInInitial ?? {}),
      date: st?.walkInInitial?.date ?? dateParam ?? toYmd(new Date()),
      pet_id: st?.walkInInitial?.pet_id ?? petIdParam ?? null,
      pet_name: st?.walkInInitial?.pet_name ?? petNameParam ?? null,
      guardian_id: st?.walkInInitial?.guardian_id ?? guardianIdParam ?? null,
      guardian_name: st?.walkInInitial?.guardian_name ?? guardianNameParam ?? null,
    };

    // Dedup por location.key — sobrevive ao remount do Strict Mode sem abrir de novo vazio.
    const alreadyOpened = consumedWalkInKeys.has(location.key);
    if (!alreadyOpened) {
      consumedWalkInKeys.add(location.key);
      if (initial.date) {
        const date = parseYmd(initial.date);
        if (date) {
          setCursorDate(startOfDay(date));
          setView('day');
        }
      }
      openCreateModal(initial, 'walk_in');
    }

    const next = new URLSearchParams(searchParams);
    next.delete('openWalkIn');
    next.delete('petId');
    next.delete('petName');
    next.delete('guardianId');
    next.delete('guardianName');
    navigate(`${location.pathname}${next.toString() ? `?${next.toString()}` : ''}`, {
      replace: true,
      state: null,
    });
  }, [
    clinicId,
    openWalkInParam,
    canWrite,
    openCreateModal,
    searchParams,
    location.pathname,
    location.key,
    location.state,
    navigate,
  ]);

  const fromQuoteParam = searchParams.get('fromQuote');
  const shouldOpenFromQuote = searchParams.get('openCreate') === '1';

  useEffect(() => {
    if (!clinicId || !fromQuoteParam || !shouldOpenFromQuote) return;
    if (consumedQuoteRef.current === fromQuoteParam) return;
    // Marca como consumido imediatamente (via ref, sem re-render) para evitar
    // que mudanças benignas de estado/URL (ex.: sincronização do parâmetro
    // `date`, carregamento de tipos de serviço ou o double-invoke do StrictMode)
    // disparem novamente este efeito e cancelem o fetch em andamento.
    consumedQuoteRef.current = fromQuoteParam;
    (async () => {
      try {
        const { quote } = await hubQuotesApi.get(fromQuoteParam, clinicId);
        const guardianPayload = quote.guardian_id
          ? await hubGuardiansApi.getById(quote.guardian_id, clinicId).catch(() => null)
          : null;
        const guardian = guardianPayload?.guardian ?? null;
        const pets = guardianPayload?.pets ?? [];
        const quotePets = [...(quote.pets ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const firstQuotePet = quotePets[0] ?? null;
        const matchedPet =
          firstQuotePet && pets?.length
            ? pets.find((p) => {
                const quoteName = (firstQuotePet.display_name || '').trim().toLowerCase();
                const petName = (p.name || '').trim().toLowerCase();
                if (quoteName && petName === quoteName) return true;
                return (
                  String(p.species || '').toLowerCase() === String(firstQuotePet.species || '').toLowerCase() &&
                  String((p as { breed?: string | null }).breed || '').toLowerCase() ===
                    String((firstQuotePet as { breed?: string | null }).breed || '').toLowerCase()
                );
              }) ?? pets[0]
            : pets?.[0] ?? null;

        const initialServices = (quote.lines ?? [])
          .filter((line) => line.hub_service_type_id)
          .map((line) => {
            const serviceType = fullSvcTypesRef.current.find((st) => st.id === line.hub_service_type_id);
            return {
              hub_service_type_id: line.hub_service_type_id!,
              name: quoteLineServiceName(line) || serviceType?.name || 'Serviço',
              duration_minutes: serviceType?.default_duration_minutes || 60,
              pricing_variant: line.pricing_variant ?? null,
            };
          });

        openCreateModal({
          date: toYmd(cursorDateRef.current),
          guardian_id: quote.guardian_id ?? null,
          guardian_name: guardian?.full_name ?? null,
          pet_id: matchedPet?.id ?? null,
          pet_name: matchedPet?.name ?? firstQuotePet?.display_name ?? null,
          services: initialServices,
          title: `Orçamento #${quote.id.slice(0, 8).toUpperCase()}${matchedPet?.name ? ` - ${matchedPet.name}` : ''}`,
          notes: quote.client_notes || null,
          financial_notes: [`Origem: orçamento #${quote.id.slice(0, 8).toUpperCase()}`, quote.notes || null]
            .filter(Boolean)
            .join('\n'),
          source_quote_id: quote.id,
        });
        showInfo(
          quote.guardian_id && matchedPet
            ? 'Agenda aberta com dados do orçamento.'
            : 'Agenda aberta com dados do orçamento. Complete tutor/pet antes de salvar.',
          'Orçamentos',
        );
      } catch (e: unknown) {
        // Em caso de falha, libera a trava para permitir nova tentativa.
        consumedQuoteRef.current = null;
        showError((e as Error)?.message || 'Erro ao abrir agendamento do orçamento');
      }
    })();
  }, [clinicId, fromQuoteParam, shouldOpenFromQuote, openCreateModal, showError, showInfo]);

  useEffect(() => {
    if (!pendingFocusId) return;
    const found = allAppointments.some((a) => a.id === pendingFocusId);
    if (found) {
      openAppointmentDetail(pendingFocusId);
      setPendingFocusId(null);
    }
  }, [allAppointments, pendingFocusId, openAppointmentDetail]);

  const rangeIso = useMemo(() => {
    if (view === 'day') {
      const y = cursorDate.getFullYear();
      const m = cursorDate.getMonth();
      const d = cursorDate.getDate();
      const from = new Date(y, m, d, 0, 0, 0, 0);
      const to = new Date(y, m, d, 23, 59, 59, 999);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    if (view === 'week') {
      const ws = startOfWeekMonday(cursorDate);
      const we = addDays(ws, 7);
      return { from: startOfDay(ws).toISOString(), to: new Date(we.getTime() - 1).toISOString() };
    }
    const sm = startOfMonth(cursorDate);
    const em = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from: sm.toISOString(), to: em.toISOString() };
  }, [view, cursorDate]);

  useEffect(() => {
    if (!clinicId || permLoading || !accessAllowed) return;
    let cancelled = false;
    (async () => {
      try {
        const { staff } = await hubStaffApi.list(clinicId, { active_only: true });
        if (cancelled) return;
        setFullStaff(staff ?? []);
        setStaffOptions(
          (staff ?? []).map((s) => ({
            id: s.id,
            name: s.full_name,
            role: s.job_title,
            hasLogin: s.has_hub_access,
          })),
        );
      } catch {
        if (!cancelled) setStaffOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, permLoading, accessAllowed]);

  useEffect(() => {
    if (!clinicId || permLoading || !accessAllowed) return;
    let cancelled = false;
    (async () => {
      try {
        const r = (await apiRequest(
          `/units/clinic/${encodeURIComponent(clinicId)}?activeOnly=true`,
        )) as { units?: { id: string; name: string }[] };
        if (cancelled) return;
        setClinicUnits(r.units ?? []);
      } catch {
        if (!cancelled) setClinicUnits([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, permLoading, accessAllowed]);

  useEffect(() => {
    if (!clinicUnits.length) return;
    if (unitFilter === 'all' || unitFilter === '__partner__' || isUuid(unitFilter)) return;
    const match = clinicUnits.find((u) => u.name === unitFilter);
    if (match) setUnitFilter(match.id);
  }, [clinicUnits, unitFilter]);

  useEffect(() => {
    if (!clinicId || permLoading || !accessAllowed) return;
    let cancelled = false;
    (async () => {
      try {
        const { service_types } = await hubServiceTypesApi.list(clinicId);
        if (cancelled) return;
        const active = (service_types ?? []).filter((st) => !st.deleted_at && st.active !== false);
        setFullSvcTypes(active);
        setServiceTypes(active.map((st) => ({ id: st.id, name: st.name })));
      } catch {
        if (!cancelled) setServiceTypes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, permLoading, accessAllowed]);

  useEffect(() => {
    if (!clinicId || permLoading || !accessAllowed) return;
    let cancelled = false;
    (async () => {
      try {
        const { service_groups } = await hubServiceGroupsApi.list(clinicId);
        if (cancelled) return;
        const colors = new Map<string, string>();
        for (const g of service_groups ?? []) {
          if (g.slug && g.color && /^#[0-9A-Fa-f]{6}$/.test(g.color)) {
            colors.set(g.slug, g.color);
          }
        }
        setServiceGroupColors(colors);
      } catch {
        if (!cancelled) setServiceGroupColors(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, permLoading, accessAllowed]);

  useEffect(() => {
    if (!clinicId || permLoading || !accessAllowed || view !== 'month') return;
    let cancelled = false;
    const sm = startOfMonth(cursorDate);
    const em = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 0);
    const fromY = toYmd(sm);
    const toY = toYmd(em);
    (async () => {
      try {
        const { blocks } = await hubAgendaApi.listCalendarBlocks(clinicId, fromY, toY);
        if (!cancelled) setCalendarBlocks(blocks ?? []);
      } catch {
        if (!cancelled) setCalendarBlocks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, permLoading, accessAllowed, view, cursorDate, reloadToken]);

  useEffect(() => {
    if (!clinicId || permLoading || !accessAllowed) return;
    let cancelled = false;
    setSeriesEndingLoaded(false);
    (async () => {
      try {
        const { series } = await hubAgendaApi.listSeriesEndingSoon({ clinic_id: clinicId });
        if (!cancelled) {
          setSeriesEndingSoon(series ?? []);
          if ((series ?? []).length <= 2) setSeriesBannerExpanded(false);
          setSeriesEndingLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setSeriesEndingSoon([]);
          setSeriesBannerExpanded(false);
          setSeriesEndingLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, permLoading, accessAllowed, reloadToken]);

  useEffect(() => {
    if (!clinicId || permLoading || !accessAllowed) return;
    let cancelled = false;
    (async () => {
      setRemoteLoading(true);
      try {
        const params: ListHubAppointmentsParams = {
          clinic_id: clinicId,
          from: rangeIso.from,
          to: rangeIso.to,
        };
        if (unitFilter === '__partner__') params.care_location_kind = 'partner_clinic';
        else if (unitFilter !== 'all' && isUuid(unitFilter)) params.unit_id = unitFilter;
        if (professionalFilter === '__na__') params.hub_staff_member_id = '__na__';
        else if (professionalFilter !== 'all') params.hub_staff_member_id = professionalFilter;
        if (groupFilter !== 'all') params.service_group = groupFilter;
        if (statusFilter !== 'all') params.status = statusFilter as HubAppointmentStatus;
        if (resourceFilter !== 'all') params.resource_label = resourceFilter;
        if (serviceTypeFilter !== 'all') params.hub_service_type_id = serviceTypeFilter;

        const { appointments } = await hubAgendaApi.list(params);
        if (cancelled) return;
        setRawList((appointments ?? []).map(mapHubAppointmentToAgenda));
        setAppointmentsError(null);
      } catch {
        if (!cancelled) {
          setAppointmentsError(
            'Não foi possível carregar os agendamentos. Verifique a ligação e se a migração da agenda foi aplicada no Supabase.',
          );
          setRawList([]);
        }
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    clinicId,
    permLoading,
    accessAllowed,
    rangeIso.from,
    rangeIso.to,
    unitFilter,
    professionalFilter,
    groupFilter,
    statusFilter,
    resourceFilter,
    serviceTypeFilter,
    reloadToken,
    pollTick,
  ]);

  useEffect(() => {
    if (!clinicId || permLoading || !accessAllowed) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') bumpPoll();
    }, 90_000);
    return () => window.clearInterval(id);
  }, [clinicId, permLoading, accessAllowed, bumpPoll]);

  const unitComboOptions = useMemo((): HubComboboxOption[] => {
    const rows: HubComboboxOption[] = [{ value: 'all', label: 'Todas' }];
    for (const u of clinicUnits) {
      rows.push({ value: u.id, label: u.name });
    }
    rows.push({ value: '__partner__', label: 'Clínica parceira' });
    if (unitFilter !== 'all' && !rows.some((o) => o.value === unitFilter)) {
      const fromAppt = allAppointments.find((a) => a.unitId === unitFilter);
      rows.push({
        value: unitFilter,
        label: fromAppt?.unitName && fromAppt.unitName !== '—' ? fromAppt.unitName : unitFilter,
      });
    }
    return rows;
  }, [clinicUnits, unitFilter, allAppointments]);

  useEffect(() => {
    if (!clinicId) {
      setCatalogResources([]);
      return;
    }
    let cancelled = false;
    const unitId = isUuid(unitFilter) ? unitFilter : undefined;
    void Promise.all([
      hubResourcesApi.list({ clinicId, unitId }),
      hubResourcesApi.listKinds(clinicId),
    ])
      .then(([res, kindsRes]) => {
        if (cancelled) return;
        const enabled = new Set(
          (kindsRes.settings ?? []).filter((s) => s.enabled).map((s) => s.service_group_slug),
        );
        setCatalogResources(
          (res.resources ?? []).filter((r) => r.service_group_slug != null && enabled.has(r.service_group_slug)),
        );
      })
      .catch(() => {
        if (!cancelled) setCatalogResources([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId, unitFilter]);

  const visibleCatalogResources = useMemo(() => {
    if (groupFilter === 'all') return catalogResources;
    return catalogResources.filter((r) => r.service_group_slug === groupFilter);
  }, [catalogResources, groupFilter]);

  const resourceFieldLabel = useMemo(() => {
    const names = new Set(visibleCatalogResources.map((r) => r.kind_name).filter(Boolean));
    if (names.size === 1) return [...names][0]!;
    if (visibleCatalogResources.length > 0) return 'Recurso';
    return 'Recurso / sala';
  }, [visibleCatalogResources]);

  const resourceOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of visibleCatalogResources) s.add(r.name);
    for (const a of allAppointments) {
      const r = (a.resourceLabel ?? '').trim();
      if (r && r !== '—') s.add(r);
    }
    return ['all', ...Array.from(s).sort()];
  }, [allAppointments, visibleCatalogResources]);

  const professionalComboOptions = useMemo((): HubComboboxOption[] => {
    const rows: HubComboboxOption[] = [{ value: 'all', label: 'Todos' }];
    for (const p of staffOptions) {
      rows.push({ value: p.id, label: p.name });
    }
    rows.push({ value: '__na__', label: 'Não atribuído' });
    if (
      professionalFilter !== 'all' &&
      professionalFilter !== '__na__' &&
      !staffOptions.some((s) => s.id === professionalFilter)
    ) {
      rows.push({
        value: professionalFilter,
        label:
          professionalFilter.length > 12
            ? `Profissional (${professionalFilter.slice(0, 8)}…)`
            : `Profissional (${professionalFilter})`,
      });
    }
    return rows;
  }, [staffOptions, professionalFilter]);

  const groupComboOptions = useMemo(
    (): HubComboboxOption[] => [
      { value: 'all', label: 'Todos' },
      ...SERVICE_GROUP_OPTIONS.map((g) => ({ value: g.value, label: g.label })),
    ],
    [],
  );

  const resourceComboOptions = useMemo((): HubComboboxOption[] => {
    const rows: HubComboboxOption[] = [{ value: 'all', label: 'Todos' }];
    for (const r of resourceOptions.filter((x) => x !== 'all')) {
      rows.push({ value: r, label: r });
    }
    if (resourceFilter !== 'all' && !rows.some((o) => o.value === resourceFilter)) {
      rows.push({ value: resourceFilter, label: resourceFilter });
    }
    return rows;
  }, [resourceOptions, resourceFilter]);

  const serviceTypeComboOptions = useMemo((): HubComboboxOption[] => {
    const rows: HubComboboxOption[] = [{ value: 'all', label: 'Todos' }];
    for (const st of serviceTypes) {
      rows.push({ value: st.id, label: st.name });
    }
    if (serviceTypeFilter !== 'all' && !serviceTypes.some((s) => s.id === serviceTypeFilter)) {
      rows.push({
        value: serviceTypeFilter,
        label:
          serviceTypeFilter.length > 12
            ? `Tipo (${serviceTypeFilter.slice(0, 8)}…)`
            : `Tipo (${serviceTypeFilter})`,
      });
    }
    return rows;
  }, [serviceTypes, serviceTypeFilter]);

  const statusComboOptions = useMemo(
    (): HubComboboxOption[] => [
      { value: 'all', label: 'Todos' },
      ...(Object.keys(STATUS_META) as AgendaStatus[]).map((s) => ({
        value: s,
        label: STATUS_META[s].label,
      })),
    ],
    [],
  );

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return allAppointments.filter((a) => {
      // Cancelados só na grade quando o filtro de status pede explicitamente.
      if (statusFilter === 'all' && a.status === 'cancelled') return false;
      if (unitFilter !== 'all') {
        if (unitFilter === '__partner__') {
          if (!isPartnerCareLocation(a)) return false;
        } else if (!isPartnerCareLocation(a)) {
          const unitMatch = isUuid(unitFilter)
            ? a.unitId === unitFilter
            : a.unitName === unitFilter;
          if (!unitMatch) return false;
        }
      }
      if (professionalFilter !== 'all') {
        if (professionalFilter === '__na__') {
          if (a.professionalId !== null) return false;
        } else if (a.professionalId !== professionalFilter) return false;
      }
      if (groupFilter !== 'all' && a.group !== groupFilter) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (resourceFilter !== 'all') {
        const r = (a.resourceLabel ?? '').trim();
        if (r !== resourceFilter) return false;
      }
      if (serviceTypeFilter !== 'all') {
        if (a.hub_service_type_id !== serviceTypeFilter) return false;
      }
      if (q) {
        const blob = `${a.petName} ${a.guardianName} ${a.serviceName} ${a.professionalName} ${a.partnerClinic?.name ?? ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [
    allAppointments,
    unitFilter,
    professionalFilter,
    groupFilter,
    statusFilter,
    resourceFilter,
    serviceTypeFilter,
    searchQ,
  ]);

  const gridAppointments = useMemo(() => enrichAgendaCardsForGrid(filtered), [filtered]);

  const selected = useMemo(
    () => filtered.find((x) => x.id === selectedId) ?? allAppointments.find((x) => x.id === selectedId) ?? null,
    [filtered, allAppointments, selectedId],
  );

  const selectedExtraBlockChildren = useMemo(() => {
    if (!selected) return [];
    return findExtraBlockChildren(selected, allAppointments);
  }, [selected, allAppointments]);

  const seriesEndingMap = useMemo(() => {
    const m = new Map<string, HubSeriesEndingSoon>();
    for (const s of seriesEndingSoon) m.set(s.series_id, s);
    return m;
  }, [seriesEndingSoon]);

  const renewSeries = useCallback(
    (series: HubSeriesEndingSoon) => {
      const sampleAppt = allAppointments.find((a) => a.id === series.sample_appointment_id) ?? null;
      openCreateModal(buildSeriesRenewalInitial(series, sampleAppt));
    },
    [allAppointments, openCreateModal],
  );

  /** Deep link: /hub/appointments?renew_series=<uuid> (sino / notificações). */
  useEffect(() => {
    const seriesId = searchParams.get('renew_series')?.trim() ?? '';
    if (!seriesId || !/^[0-9a-f-]{36}$/i.test(seriesId)) return;
    if (!clinicId || permLoading || !accessAllowed || !seriesEndingLoaded) return;

    const consumeKey = `${location.key}:${seriesId}`;
    if (consumedRenewSeriesRef.current === consumeKey) return;
    consumedRenewSeriesRef.current = consumeKey;

    const clearParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete('renew_series');
      navigate(`${location.pathname}${next.toString() ? `?${next.toString()}` : ''}`, {
        replace: true,
      });
    };

    const series = seriesEndingSoon.find((s) => s.series_id === seriesId) ?? null;
    if (!series) {
      showInfo('Esta série já não precisa de renovação.', 'Agenda');
      clearParam();
      return;
    }

    setSeriesBannerExpanded(true);
    if (canWrite) renewSeries(series);
    clearParam();
  }, [
    searchParams,
    clinicId,
    permLoading,
    accessAllowed,
    seriesEndingLoaded,
    seriesEndingSoon,
    canWrite,
    renewSeries,
    location.key,
    location.pathname,
    navigate,
    showInfo,
  ]);

  const goToday = useCallback(() => {
    setCursorDate(startOfDay(new Date()));
  }, []);

  const goNow = useCallback(() => {
    const n = new Date();
    setCursorDate(startOfDay(n));
    setView('day');
    showInfo('Linha «Agora» visível na vista diária.', 'Agenda');
  }, [showInfo]);

  const shiftDay = (delta: number) => {
    setCursorDate((d) => addDays(d, delta));
  };

  const shiftWeek = (delta: number) => {
    setCursorDate((d) => addDays(d, delta * 7));
  };

  const shiftMonth = (delta: number) => {
    setCursorDate((d) => {
      const x = new Date(d);
      x.setMonth(x.getMonth() + delta);
      return startOfDay(x);
    });
  };

  const weekStart = useMemo(() => startOfWeekMonday(cursorDate), [cursorDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const dayAppointments = useMemo(() => {
    return gridAppointments.filter((a) => isSameDay(a.start, cursorDate));
  }, [gridAppointments, cursorDate]);

  const overlapIdsDay = useMemo(
    () => computeOverlapConflictIds(dayAppointments, groupMode),
    [dayAppointments, groupMode],
  );

  const dayAppointmentsUI = useMemo(
    () => dayAppointments.map((a) => ({ ...a, conflict: overlapIdsDay.has(a.id) })),
    [dayAppointments, overlapIdsDay],
  );

  const weekAppointments = useMemo(() => {
    const end = addDays(weekStart, 7);
    return gridAppointments.filter((a) => a.start >= weekStart && a.start < end);
  }, [gridAppointments, weekStart]);

  const monthAppointments = useMemo(() => {
    const sm = startOfMonth(cursorDate);
    const em = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return filtered.filter((a) => a.start >= sm && a.start <= em);
  }, [filtered, cursorDate]);

  const { startHour, endHour } = useMemo(() => {
    const staffWorkHours = fullStaff
      .filter((s) => s.active && s.accepts_appointments)
      .map((s) => parseStaffWorkHours(s.work_hours));
    const appts = view === 'day' ? dayAppointments : weekAppointments;
    return computeAgendaHourRange(appts, { staffWorkHours, slotMin: SLOT_MIN });
  }, [view, dayAppointments, weekAppointments, fullStaff]);

  const slots = useMemo(() => {
    const n = ((endHour - startHour) * 60) / SLOT_MIN;
    const arr: Date[] = [];
    const base = startOfDay(cursorDate);
    base.setHours(startHour, 0, 0, 0);
    for (let i = 0; i < n; i++) {
      arr.push(new Date(base.getTime() + i * SLOT_MIN * 60_000));
    }
    return arr;
  }, [cursorDate, startHour, endHour]);

  const laneH = slots.length * SLOT_H;
  const dayStart = useMemo(() => {
    const b = startOfDay(cursorDate);
    b.setHours(startHour, 0, 0, 0);
    return b;
  }, [cursorDate, startHour]);

  const pxPerMin = SLOT_H / SLOT_MIN;

  const nowLineTop = useMemo(() => {
    if (!isSameDay(cursorDate, new Date())) return null;
    const now = new Date();
    const mins = minutesSinceDayStart(now, dayStart);
    const maxM = (endHour - startHour) * 60;
    if (mins < 0 || mins > maxM) return null;
    return mins * pxPerMin;
  }, [cursorDate, dayStart, pxPerMin, startHour, endHour]);

  const dayColumns = useMemo(() => {
    if (groupMode === 'professional') {
      const cols = staffOptions.map((p) => ({
        key: p.id,
        title: p.name,
        subtitle: p.role + (p.hasLogin ? '' : ' · sem login'),
      }));
      cols.push({ key: '__na__', title: 'Não atribuído', subtitle: 'Recepção define depois' });
      return cols;
    }
    const source = view === 'day' ? dayAppointments : weekAppointments;
    if (groupMode === 'category') {
      const used = new Set(source.map((a) => a.group));
      const withAppts = SERVICE_GROUP_OPTIONS.filter((g) => used.has(g.value));
      const groups =
        withAppts.length > 0
          ? withAppts
          : SERVICE_GROUP_OPTIONS.filter((g) => groupFilter === 'all' || g.value === groupFilter);
      return groups.map((g) => ({
        key: g.value,
        title: g.label,
        subtitle: 'Grupo de serviço',
      }));
    }
    const unitNameById = new Map(clinicUnits.map((u) => [u.id, u.name]));
    if (visibleCatalogResources.length > 0) {
      const cols = visibleCatalogResources.map((r) => {
        const unitName = unitNameById.get(r.unit_id);
        const kind = r.kind_name || 'Recurso';
        const subtitle =
          !isUuid(unitFilter) && unitName ? `${kind} · ${unitName}` : kind;
        return {
          key: r.id,
          title: r.name,
          subtitle,
        };
      });
      const known = new Set(cols.map((c) => c.key));
      const extra = new Set<string>();
      source.forEach((a) => {
        const k = laneKeyForAppointment(a, 'resource');
        if (k !== '__none__' && !known.has(k)) extra.add(k);
      });
      for (const k of [...extra].sort()) {
        cols.push({ key: k, title: k, subtitle: 'Texto livre' });
      }
      cols.push({ key: '__none__', title: 'Sem recurso', subtitle: 'Definir na hora' });
      return cols;
    }
    const keys = new Set<string>();
    source.forEach((a) => keys.add(laneKeyForAppointment(a, 'resource')));
    if (keys.size === 0) keys.add('__none__');
    return [...keys].sort().map((k) => ({
      key: k,
      title: k === '__none__' ? 'Sem recurso/sala' : k,
      subtitle: k === '__none__' ? 'Sem catálogo nesta unidade' : 'Texto livre',
    }));
  }, [
    groupMode,
    view,
    dayAppointments,
    weekAppointments,
    staffOptions,
    visibleCatalogResources,
    unitFilter,
    clinicUnits,
    groupFilter,
  ]);

  const weekRows = dayColumns;

  const [dayColsEl, setDayColsEl] = useState<HTMLDivElement | null>(null);
  const [dayColWidths, setDayColWidths] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!dayColsEl) return;
    const measure = () => {
      const next: Record<string, number> = {};
      dayColsEl.querySelectorAll<HTMLElement>('[data-col-key]').forEach((el) => {
        next[el.dataset.colKey!] = Math.floor(el.getBoundingClientRect().width);
      });
      setDayColWidths((prev) => {
        const keys = Object.keys(next);
        if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k])) return prev;
        return next;
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    dayColsEl.querySelectorAll('[data-col-key]').forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [dayColsEl, dayColumns]);

  const apptsForDayColumn = (colKey: string) => {
    if (groupMode === 'professional') {
      if (colKey === '__na__') return dayAppointmentsUI.filter((a) => a.professionalId === null);
      return dayAppointmentsUI.filter((a) => a.professionalId === colKey);
    }
    if (groupMode === 'category') {
      return dayAppointmentsUI.filter((a) => a.group === colKey);
    }
    if (colKey === '__none__') {
      return dayAppointmentsUI.filter((a) => laneKeyForAppointment(a, 'resource') === '__none__');
    }
    return dayAppointmentsUI.filter((a) => laneKeyForAppointment(a, 'resource') === colKey);
  };

  const apptsForWeekCell = (rowKey: string, day: Date) => {
    const dayList = weekAppointments.filter((a) => isSameDay(a.start, day));
    if (groupMode === 'professional') {
      if (rowKey === '__na__') return dayList.filter((a) => a.professionalId === null);
      return dayList.filter((a) => a.professionalId === rowKey);
    }
    if (groupMode === 'category') {
      return dayList.filter((a) => a.group === rowKey);
    }
    if (rowKey === '__none__') {
      return dayList.filter((a) => laneKeyForAppointment(a, 'resource') === '__none__');
    }
    return dayList.filter((a) => laneKeyForAppointment(a, 'resource') === rowKey);
  };

  const monthGrid = useMemo(() => monthMatrix(cursorDate), [cursorDate]);

  const monthDayMap = useMemo(() => {
    const m = new Map<string, AgendaAppointment[]>();
    for (const a of monthAppointments) {
      const k = toYmd(startOfDay(a.start));
      const arr = m.get(k) ?? [];
      arr.push(a);
      m.set(k, arr);
    }
    return m;
  }, [monthAppointments]);

  const blockByYmd = useMemo(() => {
    const m = new Map<string, HubAgendaCalendarBlock>();
    for (const b of calendarBlocks) {
      m.set(b.block_date, b);
    }
    return m;
  }, [calendarBlocks]);

  const metricsList = useMemo(() => {
    if (view === 'day') return dayAppointments;
    if (view === 'week') return weekAppointments;
    return monthAppointments;
  }, [view, dayAppointments, weekAppointments, monthAppointments]);

  const conflictIdsView = useMemo(
    () => computeOverlapConflictIds(metricsList, groupMode),
    [metricsList, groupMode],
  );

  const sidebarMetrics = useMemo(() => {
    const pets = new Set(metricsList.map((a) => a.petName));
    const mins = metricsList.reduce((acc, a) => acc + (a.end.getTime() - a.start.getTime()) / 60_000, 0);
    return {
      total: metricsList.length,
      pets: pets.size,
      hours: Math.round((mins / 60) * 10) / 10,
      conflicts: conflictIdsView.size,
    };
  }, [metricsList, conflictIdsView]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (unitFilter !== 'all') count += 1;
    if (professionalFilter !== 'all') count += 1;
    if (groupFilter !== 'all') count += 1;
    if (statusFilter !== 'all') count += 1;
    if (resourceFilter !== 'all') count += 1;
    if (serviceTypeFilter !== 'all') count += 1;
    return count;
  }, [unitFilter, professionalFilter, groupFilter, statusFilter, resourceFilter, serviceTypeFilter]);

  const filterChips = useMemo((): AgendaFilterChip[] => {
    const chips: AgendaFilterChip[] = [];
    const labelOf = (opts: HubComboboxOption[], value: string) =>
      opts.find((o) => o.value === value)?.label ?? value;
    if (unitFilter !== 'all') {
      chips.push({
        key: 'unit',
        label: `Unidade: ${labelOf(unitComboOptions, unitFilter)}`,
        onClear: () => setUnitFilter('all'),
      });
    }
    if (professionalFilter !== 'all') {
      chips.push({
        key: 'professional',
        label: `Profissional: ${labelOf(professionalComboOptions, professionalFilter)}`,
        onClear: () => setProfessionalFilter('all'),
      });
    }
    if (groupFilter !== 'all') {
      chips.push({
        key: 'group',
        label: `Grupo: ${labelOf(groupComboOptions, groupFilter)}`,
        onClear: () => setGroupFilter('all'),
      });
    }
    if (resourceFilter !== 'all') {
      chips.push({
        key: 'resource',
        label: `${resourceFieldLabel}: ${labelOf(resourceComboOptions, resourceFilter)}`,
        onClear: () => setResourceFilter('all'),
      });
    }
    if (serviceTypeFilter !== 'all') {
      chips.push({
        key: 'service_type',
        label: `Tipo: ${labelOf(serviceTypeComboOptions, serviceTypeFilter)}`,
        onClear: () => setServiceTypeFilter('all'),
      });
    }
    if (statusFilter !== 'all') {
      chips.push({
        key: 'status',
        label: `Status: ${labelOf(statusComboOptions, statusFilter)}`,
        onClear: () => setStatusFilter('all'),
      });
    }
    return chips;
  }, [
    unitFilter,
    professionalFilter,
    groupFilter,
    resourceFilter,
    serviceTypeFilter,
    statusFilter,
    unitComboOptions,
    professionalComboOptions,
    groupComboOptions,
    resourceComboOptions,
    serviceTypeComboOptions,
    statusComboOptions,
    resourceFieldLabel,
  ]);

  const clearAllFilters = useCallback(() => {
    setUnitFilter('all');
    setProfessionalFilter('all');
    setGroupFilter('all');
    setResourceFilter('all');
    setServiceTypeFilter('all');
    setStatusFilter('all');
  }, []);

  /** Prévia de impressão do dia do cursor, com os filtros ativos da agenda. */
  const printAgendaHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('date', toYmd(cursorDate));
    params.set('from', 'agenda');
    if (groupFilter !== 'all') params.set('grupo', groupFilter);
    if (serviceTypeFilter !== 'all') params.set('servico', serviceTypeFilter);
    if (professionalFilter !== 'all') params.set('profissional', professionalFilter);
    if (resourceFilter !== 'all') params.set('recurso', resourceFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    const q = searchQ.trim();
    if (q) params.set('q', q);
    return `/hub/impressoes/agenda?${params.toString()}`;
  }, [
    cursorDate,
    groupFilter,
    serviceTypeFilter,
    professionalFilter,
    resourceFilter,
    statusFilter,
    searchQ,
  ]);

  const patchAppointmentStatus = async (status: AgendaStatus) => {
    if (!clinicId || !selected || !canWrite) return;
    try {
      await hubAgendaApi.patch(selected.id, { clinic_id: clinicId, status });
      bumpReload();
      showInfo('Atendimento atualizado.', 'Agenda');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar');
    }
  };

  const handleAppointmentStatusChange = useCallback(
    async (status: AgendaStatus) => {
      if (!selected || !canWrite) return;
      if (status === 'cancelled' && selected.status !== 'cancelled') {
        showConfirm(
          'Cancelar este atendimento?',
          () => void patchAppointmentStatus('cancelled'),
          'Cancelar',
        );
        return;
      }
      await patchAppointmentStatus(status);
    },
    [selected, canWrite, showConfirm, clinicId],
  );

  const handleOpenInClinic = useCallback(
    (appointmentId: string) => {
      if (!clinicId || !canClinicWrite) return;
      const appt =
        filtered.find((x) => x.id === appointmentId) ?? allAppointments.find((x) => x.id === appointmentId) ?? null;
      if (!appt) return;
      const item: DayBoardItem = {
        kind: 'appointment_slot',
        appointment_id: appt.id,
        appointment_status: appt.status,
        appointment_kind: appt.appointment_kind ?? null,
        starts_at: appt.start.toISOString(),
        ends_at: appt.end.toISOString(),
        pet_id: appt.petId ?? null,
        guardian_id: appt.guardianId ?? null,
        hub_staff_member_id: appt.professionalId ?? null,
        pet: appt.petId ? { id: appt.petId, name: appt.petName } : null,
        guardian: appt.guardianId ? { id: appt.guardianId, full_name: appt.guardianName } : null,
        staff_member: appt.professionalId ? { id: appt.professionalId, full_name: appt.professionalName } : null,
        service_type: appt.hub_service_type_id
          ? { id: appt.hub_service_type_id, name: appt.serviceName }
          : null,
        title: appt.title ?? null,
        notes: appt.notes ?? null,
      };
      setAgendaStartModalItem(item);
    },
    [clinicId, canClinicWrite, filtered, allAppointments],
  );

  const handleAgendaStartEncounter = async (
    item: DayBoardItem,
    opts: { hub_case_id?: string | null; create_new_case?: boolean; new_case_title?: string | null },
  ) => {
    if (!clinicId || !item.appointment_id) return;
    setAgendaStarting(true);
    try {
      const { encounter } = await hubEncountersApi.openFromAppointment(clinicId, item.appointment_id, opts);
      setAgendaStartModalItem(null);
      navigate(`/hub/clinica/atendimentos/${encounter.id}`);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao abrir na Clínica');
    } finally {
      setAgendaStarting(false);
    }
  };

  const handleOpenInGrooming = useCallback(
    async (appointmentId: string) => {
      if (!clinicId || !canGroomingWrite) return;
      try {
        await hubGroomingApi.openFromAppointment(clinicId, appointmentId, 'queued');
        showSuccess('Pet adicionado à fila de Banho & Tosa.');
        navigate('/hub/banho-tosa');
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao abrir na fila B&T');
      }
    },
    [clinicId, canGroomingWrite, navigate, showSuccess, showError],
  );

  const handleOpenInBoarding = useCallback(
    async (appointmentId: string) => {
      if (!clinicId || !canBoardingWrite) return;
      try {
        await hubBoardingApi.openFromAppointment(clinicId, appointmentId);
        showSuccess('Reserva aberta no Hotel & Creche.');
        navigate('/hub/hotel-creche');
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao abrir reserva');
      }
    },
    [clinicId, canBoardingWrite, navigate, showSuccess, showError],
  );

  const handleOpenCheckout = useCallback(
    (appointmentId: string) => {
      if (!clinicId || !canCreateReceivable) return;
      const appt =
        filtered.find((x) => x.id === appointmentId) ?? allAppointments.find((x) => x.id === appointmentId) ?? null;
      const unitResolved = appt?.unitId ?? (isUuid(unitFilter) ? unitFilter : null) ?? getSelectedUnitId();
      if (!unitResolved) {
        showError('Selecione uma unidade no filtro da agenda ou no cabeçalho para abrir o checkout.');
        return;
      }
      setCheckoutAppointmentId(appointmentId);
      setCheckoutOpen(true);
    },
    [clinicId, canCreateReceivable, filtered, allAppointments, unitFilter, showError],
  );

  /** Abre (ou cria) a comanda para um agendamento — pagamento antecipado — e vai à ficha para cobrar. */
  const handleOpenComanda = useCallback(
    async (appointmentId: string) => {
      if (!clinicId || !canCreateReceivable) return;
      const appt =
        filtered.find((x) => x.id === appointmentId) ??
        allAppointments.find((x) => x.id === appointmentId) ??
        null;
      const unitResolved = appt?.unitId ?? (isUuid(unitFilter) ? unitFilter : null) ?? getSelectedUnitId();
      try {
        const detail = await hubComandaApiAgenda.openComanda({
          clinic_id: clinicId,
          origin_type: 'appointment',
          origin_id: appointmentId,
          unit_id: unitResolved,
        });
        const comandaId = (detail.comanda as Record<string, unknown> | undefined)?.id as string | undefined;
        showSuccess('Comanda aberta.');
        bumpReload();
        if (comandaId) {
          navigate(`/hub/caixa/comanda/${comandaId}`);
          return;
        }
      } catch (e: unknown) {
        const msg = (e as Error)?.message ?? '';
        if (msg.includes('Já existe comanda aberta')) {
          try {
            const existing = await hubComandaApiAgenda.getComandaByOrigin({
              clinic_id: clinicId,
              origin_type: 'appointment',
              origin_id: appointmentId,
            });
            const comandaId = (existing.comanda as Record<string, unknown> | undefined)?.id as string | undefined;
            if (comandaId) {
              navigate(`/hub/caixa/comanda/${comandaId}`);
              return;
            }
          } catch {
            /* fall through */
          }
          showError('Já existe uma comanda aberta para este agendamento.');
        } else {
          showError(msg || 'Erro ao abrir comanda');
        }
      }
    },
    [
      clinicId,
      canCreateReceivable,
      filtered,
      allAppointments,
      unitFilter,
      showSuccess,
      showError,
      bumpReload,
      navigate,
    ],
  );

  const handleViewComanda = useCallback(
    (comandaId: string) => {
      navigate(`/hub/caixa/comanda/${comandaId}`);
    },
    [navigate],
  );

  const checkoutUnitId = useMemo(() => {
    if (!checkoutAppointmentId) return null;
    const appt =
      filtered.find((x) => x.id === checkoutAppointmentId) ??
      allAppointments.find((x) => x.id === checkoutAppointmentId) ??
      null;
    return appt?.unitId ?? (isUuid(unitFilter) ? unitFilter : null) ?? getSelectedUnitId();
  }, [checkoutAppointmentId, filtered, allAppointments, unitFilter]);

  const duplicateSelectedAppointment = useCallback(() => {
    if (!selected) return;
    const extraChildren = findExtraBlockChildren(selected, allAppointments);
    closeAppointmentDetail();
    openCreateModal(buildDuplicateAppointmentInitial(selected, extraChildren));
  }, [selected, allAppointments, openCreateModal, closeAppointmentDetail]);

  const requestCancelSelected = useCallback(() => {
    if (!canWrite) return;
    showConfirm(
      'Cancelar este atendimento?',
      () => void patchAppointmentStatus('cancelled'),
      'Cancelar',
    );
  }, [canWrite, showConfirm, selected, clinicId]);

  const patchMoveWithOverlapConfirm = async (
    id: string,
    payload: Parameters<typeof hubAgendaApi.patch>[1],
    allowOverlap = false,
  ) => {
    if (!allowOverlap) {
      const ap = allAppointments.find((x) => x.id === id);
      if (ap) {
        const startMs = payload.starts_at ? new Date(payload.starts_at).getTime() : ap.start.getTime();
        const endMs = payload.ends_at ? new Date(payload.ends_at).getTime() : ap.end.getTime();
        const staffId =
          payload.hub_staff_member_id !== undefined ? payload.hub_staff_member_id : ap.professionalId;
        const resourceLabel =
          payload.resource_label !== undefined ? payload.resource_label : ap.resourceLabel;
        const found = findLocalScheduleConflict(
          [{ staffId, resourceLabel, startMs, endMs }],
          allAppointments.map(agendaAppointmentToConflictSlot),
          [id],
        );
        if (found) {
          showAlert({
            type: 'warning',
            title: SCHEDULE_OVERLAP_CONFIRM_TITLE,
            message: buildScheduleOverlapConfirmMessage({ detail: found.label, reason: found.reason }),
            showCancel: true,
            confirmText: SCHEDULE_OVERLAP_CONFIRM_TEXT,
            cancelText: SCHEDULE_OVERLAP_CANCEL_TEXT,
            onConfirm: () => void patchMoveWithOverlapConfirm(id, payload, true),
          });
          return;
        }
      }
    }
    try {
      await hubAgendaApi.patch(id, { ...payload, allow_schedule_overlap: allowOverlap || undefined });
      bumpReload();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Não foi possível mover';
      if (!allowOverlap && isScheduleConflictMessage(msg)) {
        showAlert({
          type: 'warning',
          title: SCHEDULE_OVERLAP_CONFIRM_TITLE,
          message: buildScheduleOverlapConfirmMessage({ reason: msg }),
          showCancel: true,
          confirmText: SCHEDULE_OVERLAP_CONFIRM_TEXT,
          cancelText: SCHEDULE_OVERLAP_CANCEL_TEXT,
          onConfirm: () => void patchMoveWithOverlapConfirm(id, payload, true),
        });
        return;
      }
      showError(msg);
    }
  };

  const consumeSkipClickAfterDrag = () => {
    const gatedByTime = Date.now() < skipClickUntilRef.current;
    if (!skipClickAfterDragRef.current && !gatedByTime) return false;
    skipClickAfterDragRef.current = false;
    return true;
  };

  const assignmentPatchFromColKey = (
    colKey: string | undefined,
  ): { hub_staff_member_id?: string | null; resource_label?: string | null; hub_resource_id?: string | null } => {
    if (!colKey) return {};
    if (groupMode === 'professional') {
      return { hub_staff_member_id: colKey === '__na__' ? null : colKey };
    }
    if (groupMode === 'resource') {
      if (colKey === '__none__') return { hub_resource_id: null, resource_label: null };
      if (isUuid(colKey)) return { hub_resource_id: colKey };
      return { resource_label: colKey, hub_resource_id: null };
    }
    return {};
  };

  const moveAppointmentTo = useCallback(
    async (id: string, newStart: Date, newEnd: Date, colKey?: string) => {
      if (!canWrite || !clinicId) return;
      const ap = allAppointments.find((x) => x.id === id);
      if (!ap || !canEditAgendaAppointment(ap, { canWrite })) return;
      const assignment = assignmentPatchFromColKey(colKey);
      const sameStart = ap.start.getTime() === newStart.getTime();
      const sameEnd = ap.end.getTime() === newEnd.getTime();
      const sameStaff =
        assignment.hub_staff_member_id === undefined ||
        (assignment.hub_staff_member_id ?? null) === (ap.professionalId ?? null);
      const currentResource = ap.resourceLabel === '—' ? null : ap.resourceLabel;
      const sameResource =
        assignment.hub_resource_id !== undefined
          ? (assignment.hub_resource_id ?? null) === (ap.hubResourceId ?? null)
          : assignment.resource_label === undefined ||
            ((assignment.resource_label ?? null) === currentResource && !ap.hubResourceId);
      if (sameStart && sameEnd && sameStaff && sameResource) return;
      await patchMoveWithOverlapConfirm(id, {
        clinic_id: clinicId,
        starts_at: newStart.toISOString(),
        ends_at: newEnd.toISOString(),
        ...assignment,
      });
    },
    // patchMoveWithOverlapConfirm / assignmentPatchFromColKey fecham sobre estado atual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, clinicId, allAppointments, groupMode],
  );

  const markSkipClickAfterDrag = () => {
    skipClickAfterDragRef.current = true;
    skipClickUntilRef.current = Date.now() + 500;
    window.setTimeout(() => {
      skipClickAfterDragRef.current = false;
    }, 500);
  };

  const appointmentDragHandlers = (a: AgendaAppointment) => {
    const blockReason = canWrite ? agendaAppointmentEditBlockReason(a, { canWrite }) : null;
    const canDrag = canWrite && !blockReason;
    return {
      draggable: canDrag,
      dragging: draggingId === a.id,
      dragBlockedReason: canWrite ? blockReason : null,
      onDragPointerDown: canDrag
        ? (e: React.PointerEvent) => {
            if (e.button !== 0) return;
            pointerDragRef.current = {
              id: a.id,
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              activated: false,
            };
          }
        : undefined,
    };
  };

  // Arraste por pointer (HTML5 DnD era intermitente nos cards da agenda).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const session = pointerDragRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      const dx = e.clientX - session.startX;
      const dy = e.clientY - session.startY;
      if (!session.activated) {
        if (dx * dx + dy * dy < AGENDA_DRAG_THRESHOLD_PX * AGENDA_DRAG_THRESHOLD_PX) return;
        session.activated = true;
        markSkipClickAfterDrag();
        setDraggingId(session.id);
      }
      const hit = hitTestAgendaDrop(e.clientX, e.clientY);
      const key =
        hit == null
          ? null
          : hit.kind === 'lane'
            ? `day:${hit.colKey}`
            : `cal:${hit.ymd}${hit.colKey ? `:${hit.colKey}` : ''}`;
      setDropHoverKey((prev) => (prev === key ? prev : key));
    };

    const finish = (e: PointerEvent) => {
      const session = pointerDragRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      pointerDragRef.current = null;
      const activated = session.activated;
      setDraggingId(null);
      setDropHoverKey(null);
      if (!activated) return;
      markSkipClickAfterDrag();
      const hit = hitTestAgendaDrop(e.clientX, e.clientY);
      if (!hit) return;
      const ap = allAppointments.find((x) => x.id === session.id);
      if (!ap || !canEditAgendaAppointment(ap, { canWrite })) return;
      if (hit.kind === 'lane') {
        const dayMinutes = (endHour - startHour) * 60;
        const snapped = minutesFromLanePointer(e.clientY, hit.el, pxPerMin, dayMinutes);
        const newStart = new Date(dayStart.getTime() + snapped * 60_000);
        const durMs = ap.end.getTime() - ap.start.getTime();
        const newEnd = new Date(newStart.getTime() + durMs);
        void moveAppointmentTo(session.id, newStart, newEnd, hit.colKey);
        return;
      }
      const targetDay = parseYmd(hit.ymd);
      if (!targetDay) return;
      const moved = shiftAppointmentToDay(ap.start, ap.end, targetDay);
      void moveAppointmentTo(session.id, moved.start, moved.end, hit.colKey);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [allAppointments, canWrite, dayStart, endHour, moveAppointmentTo, pxPerMin, startHour]);

  const navLabel = useMemo(() => {
    if (view === 'day') {
      return cursorDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    if (view === 'week') {
      const end = addDays(weekStart, 6);
      return `${weekStart.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} — ${end.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return formatMonthYear(cursorDate);
  }, [view, cursorDate, weekStart]);

  const handleLaneClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, colKey: string) => {
      if (skipClickAfterDragRef.current) {
        skipClickAfterDragRef.current = false;
        return;
      }
      if (!canWrite) return;
      const lane = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - lane.top;
      let minutesFromStart = y / pxPerMin;
      minutesFromStart = Math.max(0, Math.min(minutesFromStart, (endHour - startHour) * 60 - 30));
      const snapped = Math.round(minutesFromStart / 15) * 15;
      const startsDate = new Date(dayStart.getTime() + snapped * 60_000);
      const endsDate = new Date(startsDate.getTime() + 60 * 60_000);
      const initial: NewAppointmentInitial = {
        date: toYmd(cursorDate),
        starts_at: startsDate.toISOString(),
        ends_at: endsDate.toISOString(),
      };
      if (groupMode === 'professional' && colKey !== '__na__') {
        initial.hub_staff_member_id = colKey;
      }
      if (groupMode === 'resource' && colKey !== '__none__') {
        if (isUuid(colKey)) initial.hub_resource_id = colKey;
        else initial.resource_label = colKey;
      }
      openCreateModal(initial);
    },
    [canWrite, pxPerMin, dayStart, cursorDate, groupMode, openCreateModal, startHour, endHour],
  );

  const dayGridMinutes = (endHour - startHour) * 60;
  const dayStaysByCol = new Map<string, AgendaAppointment[]>();
  if (view === 'day') {
    for (const col of dayColumns) {
      const stays = apptsForDayColumn(col.key)
        .filter((a) => isAgendaDayStay(a, dayStart, dayGridMinutes))
        .sort((a, b) => a.start.getTime() - b.start.getTime());
      if (stays.length) dayStaysByCol.set(col.key, stays);
    }
  }
  const maxDayStays = Math.max(0, ...[...dayStaysByCol.values()].map((s) => s.length));
  const dayStayRows = Math.min(maxDayStays, DAY_STAY_MAX_ROWS);
  const dayStaysH = dayStayRows > 0 ? dayStayRows * DAY_STAY_ROW_H + (dayStayRows - 1) * 3 + 12 : 0;
  const dayTopH = HEADER_H + dayStaysH;

  const renderDayStays = (colKey: string) => {
    const stays = dayStaysByCol.get(colKey) ?? [];
    const fits = stays.length <= DAY_STAY_MAX_ROWS;
    const shown = fits ? stays : stays.slice(0, DAY_STAY_MAX_ROWS - 1);
    return (
      <div className="hub-agenda-day__stays" style={{ height: dayStaysH }}>
        {shown.map((a) => (
          <AgendaAppointmentCard
            key={a.id}
            appointment={a}
            variant="stay"
            periodLabel={agendaDayStayPeriodLabel(a, cursorDate)}
            selected={selectedId === a.id}
            {...appointmentDragHandlers(a)}
            onClick={(e) => {
              e.stopPropagation();
              if (consumeSkipClickAfterDrag()) return;
              openAppointmentDetail(a.id);
            }}
          />
        ))}
        {!fits ? (
          <AgendaDayOverflowMenu
            className="hub-agenda-overflow--stays"
            appointments={stays}
            hiddenCount={stays.length - shown.length}
            label={`+${stays.length - shown.length} no dia todo`}
            hasConflict={stays.some((a) => a.conflict)}
            onSelect={openAppointmentDetail}
          />
        ) : null}
      </div>
    );
  };

  const dayLaneData = new Map<
    string,
    { list: AgendaAppointment[]; layouts: ReturnType<typeof layoutDayLaneAppointments>; basisPx: number }
  >();
  if (view === 'day') {
    for (const col of dayColumns) {
      const list = apptsForDayColumn(col.key).filter((a) => !isAgendaDayStay(a, dayStart, dayGridMinutes));
      const layouts = layoutDayLaneAppointments(list, { dayStart, dayMinutes: dayGridMinutes });
      const maxCols = Math.max(0, ...[...layouts.values()].map((l) => l.columnCount));
      const empty = list.length === 0 && !dayStaysByCol.has(col.key);
      const basisPx = empty
        ? DAY_COL_EMPTY_W
        : Math.max(DAY_LANE_DEFAULT_WIDTH_PX, Math.min(maxCols, DAY_MAX_VISIBLE_COLUMNS) * DAY_COL_PER_CARD_W + 16);
      dayLaneData.set(col.key, { list, layouts, basisPx });
    }
  }

  const renderDayLane = (colKey: string) => {
    const dayMinutes = dayGridMinutes;
    const data = dayLaneData.get(colKey);
    const list = data?.list ?? [];
    const laneLayouts = data?.layouts ?? new Map();
    const laneWidthPx = dayColWidths[colKey] ?? data?.basisPx ?? DAY_LANE_DEFAULT_WIDTH_PX;
    let railPx = 0;
    let lanePlan = planDayLaneOverflowDisplay(list, laneLayouts, { laneWidthPx });
    if (lanePlan.overflows.length > 0) {
      railPx = DAY_OVERFLOW_RAIL_PX;
      lanePlan = planDayLaneOverflowDisplay(list, laneLayouts, { laneWidthPx: laneWidthPx - railPx });
    }
    const { display, overflows } = lanePlan;
    const byId = new Map(list.map((a) => [a.id, a]));
    const lines: React.ReactNode[] = [];
    const hoverKey = `day:${colKey}`;
    const slotCount = Math.round(dayMinutes / SLOT_MIN);
    for (let i = 0; i <= slotCount; i++) {
      const top = i * SLOT_H;
      const isHour = i % 2 === 0;
      lines.push(
        <div
          key={`slot-${i}`}
          className={isHour ? 'hub-agenda-day__hour-line' : 'hub-agenda-day__half-line'}
          style={{ top }}
        />,
      );
    }
    return (
      <div
        className={`hub-agenda-day__lane${dropHoverKey === hoverKey ? ' hub-agenda-day__lane--drop-hover' : ''}`}
        style={{ height: laneH, ['--ag-lane-h' as string]: `${laneH}px` }}
        data-agenda-drop={`lane:${colKey}`}
        onClick={(e) => handleLaneClick(e, colKey)}
      >
        {lines}
        {nowLineTop !== null ? <div className="hub-agenda-day__now-line" style={{ top: nowLineTop }} /> : null}
        {list.map((a) => {
          const pack = display.get(a.id);
          if (!pack) return null;
          const clamped = clampAppointmentToDayLane(a.start, a.end, dayStart, dayMinutes);
          if (!clamped) return null;
          const top = clamped.startMins * pxPerMin;
          const h = Math.max((clamped.endMins - clamped.startMins) * pxPerMin, 22);
          const frac = 1 / pack.columnCount;
          const estimatedWidthPx = (laneWidthPx - railPx) * frac - 6;
          const selected = selectedId === a.id;
          return (
            <div
              key={a.id}
              className="hub-agenda-day__card-wrap"
              style={{
                top,
                height: h,
                left: `calc((100% - ${railPx}px) * ${pack.column * frac} + 3px)`,
                width: `calc((100% - ${railPx}px) * ${frac} - 6px)`,
                zIndex: selected ? 6 : pack.column + 1,
              }}
            >
              <AgendaAppointmentCard
                appointment={a}
                heightPx={h}
                widthPx={estimatedWidthPx}
                selected={selected}
                showProfessional={groupMode !== 'professional'}
                showResource={groupMode !== 'resource'}
                {...appointmentDragHandlers(a)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (consumeSkipClickAfterDrag()) return;
                  openAppointmentDetail(a.id);
                }}
              />
            </div>
          );
        })}
        {overflows.map((ov) => {
          const startMins = Math.max(0, (ov.startMs - dayStart.getTime()) / 60_000);
          const endMins = Math.min(dayMinutes, (ov.endMs - dayStart.getTime()) / 60_000);
          const top = startMins * pxPerMin;
          const height = Math.max((endMins - startMins) * pxPerMin - 4, 28);
          const clusterAppts = ov.allIds.map((id) => byId.get(id)!).filter(Boolean);
          return (
            <div
              key={`ov-${ov.hiddenIds.join('-')}`}
              className="hub-agenda-day__overflow-wrap"
              style={{
                top: top + 2,
                height,
                right: 2,
                width: railPx - 4,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <AgendaDayOverflowMenu
                appointments={clusterAppts}
                hiddenCount={ov.hiddenIds.length}
                hasConflict={ov.hasConflict}
                onSelect={openAppointmentDetail}
              />
            </div>
          );
        })}
      </div>
    );
  };

  const renderMobileDayList = () => {
    const sorted = [...dayAppointmentsUI].sort((a, b) => a.start.getTime() - b.start.getTime());
    const showNow = isSameDay(cursorDate, new Date());

    return (
      <div className="hub-agenda-day-list">
        {showNow ? (
          <div className="hub-agenda-day-list__now" aria-live="polite">
            Agora · {formatHm(new Date())}
          </div>
        ) : null}
        {sorted.length === 0 ? (
          <p className="hub-clientes__muted hub-agenda-day-list__empty">Nenhum agendamento neste dia.</p>
        ) : (
          sorted.map((a) => (
            <div key={a.id} className="hub-agenda-day-list__item">
              <div className="hub-agenda-day-list__time-col">
                <span className="hub-agenda-day-list__time">{formatHm(a.start)}</span>
                <span className="hub-agenda-day-list__time-end">{formatHm(a.end)}</span>
              </div>
              <div className="hub-agenda-day-list__card">
                <AgendaAppointmentCard
                  appointment={a}
                  variant="week"
                  selected={selectedId === a.id}
                  showProfessional={groupMode !== 'professional'}
                  showResource={groupMode !== 'resource'}
                  onClick={() => openAppointmentDetail(a.id)}
                />
                {groupMode === 'professional' ? (
                  <p className="hub-agenda-day-list__lane">{a.professionalName || 'Não atribuído'}</p>
                ) : null}
                {groupMode === 'category' ? (
                  <p className="hub-agenda-day-list__lane">{serviceGroupLabel(a.group)}</p>
                ) : null}
                {groupMode === 'resource' ? (
                  <p className="hub-agenda-day-list__lane">{a.resourceLabel !== '—' ? a.resourceLabel : 'Sem recurso'}</p>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  if (!user) return <Navigate to="/login" replace />;
  if (!permLoading && !clinicId) {
    return (
      <div className="hub-clientes hub-agenda-page" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Selecione uma clínica.</p>
      </div>
    );
  }
  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clientes hub-agenda-page" style={{ padding: 24 }}>
        <HubLoading variant="block" />
      </div>
    );
  }

  return (
    <div className="hub-clientes hub-servicos-page hub-agenda-page">
      <div className="hub-agenda">
        <div className="hub-agenda__main">
          {appointmentsError ? (
            <div
              className="hub-clientes__muted"
              style={{
                margin: '0 0 14px',
                padding: '12px 14px',
                background: '#fff5f5',
                border: '1px solid #fecaca',
                borderRadius: 8,
                color: '#991b1b',
                fontSize: 14,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span>{appointmentsError}</span>
              <button
                type="button"
                className="hub-agenda__view-btn hub-agenda__view-btn--active"
                onClick={() => bumpReload()}
              >
                Tentar novamente
              </button>
            </div>
          ) : null}

          {seriesEndingSoon.length > 0 ? (
            <div className="hub-agenda__series-ending-banner" role="status">
              <div className="hub-agenda__series-ending-banner-head">
                <div className="hub-agenda__series-ending-banner-text">
                  <strong>Séries a renovar</strong>
                  <span className="hub-clientes__muted">
                    {seriesEndingSoon.length === 1
                      ? '1 série precisa de renovação em breve'
                      : `${seriesEndingSoon.length} séries precisam de renovação em breve`}
                  </span>
                </div>
                {seriesEndingSoon.length > 2 ? (
                  <button
                    type="button"
                    className="hub-agenda__series-ending-toggle"
                    aria-expanded={seriesBannerExpanded}
                    onClick={() => setSeriesBannerExpanded((v) => !v)}
                  >
                    {seriesBannerExpanded ? 'Recolher' : `+${seriesEndingSoon.length - 2}`}
                  </button>
                ) : null}
              </div>
              <ul className="hub-agenda__series-ending-list">
                {(seriesBannerExpanded ? seriesEndingSoon : seriesEndingSoon.slice(0, 2)).map((s) => (
                  <li key={s.series_id} className="hub-agenda__series-ending-item">
                    <span>
                      {s.title?.trim() || 'Agendamento'} · {s.remaining_count}{' '}
                      {s.remaining_count === 1 ? 'restante' : 'restantes'}
                    </span>
                    {canWrite ? (
                      <button
                        type="button"
                        className="hub-btn hub-btn--secondary hub-btn--sm"
                        onClick={() => renewSeries(s)}
                      >
                        Renovar
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <AgendaToolbar
            view={view}
            onViewChange={setView}
            cursorYmd={toYmd(cursorDate)}
            onCursorYmd={(iso) => {
              const d = parseYmd(iso);
              if (d) setCursorDate(d);
            }}
            onShiftPrev={() => (view === 'day' ? shiftDay(-1) : view === 'week' ? shiftWeek(-1) : shiftMonth(-1))}
            onShiftNext={() => (view === 'day' ? shiftDay(1) : view === 'week' ? shiftWeek(1) : shiftMonth(1))}
            onToday={goToday}
            onNow={goNow}
            density={density}
            onDensityChange={setDensity}
            searchQ={searchQ}
            onSearchQ={setSearchQ}
            canWrite={canWrite}
            onNewAppointment={() => openCreateModal({ date: toYmd(cursorDate) })}
            onWalkIn={() => openCreateModal({ date: toYmd(new Date()) }, 'walk_in')}
            printHref={accessAllowed ? printAgendaHref : null}
            prevLabel={view === 'day' ? 'Dia anterior' : view === 'week' ? 'Semana anterior' : 'Mês anterior'}
            nextLabel={view === 'day' ? 'Próximo dia' : view === 'week' ? 'Próxima semana' : 'Próximo mês'}
          />

          {!remoteLoading && !appointmentsError ? (
            <div className="hub-agenda__view-metrics" aria-label="Resumo da vista">
              <span>{sidebarMetrics.total} atend.</span>
              <span className="hub-agenda__view-metrics-sep" aria-hidden>
                ·
              </span>
              <span>{sidebarMetrics.pets} pets</span>
              <span className="hub-agenda__view-metrics-sep" aria-hidden>
                ·
              </span>
              <span>{sidebarMetrics.hours}h</span>
              {sidebarMetrics.conflicts > 0 ? (
                <>
                  <span className="hub-agenda__view-metrics-sep" aria-hidden>
                    ·
                  </span>
                  <AgendaConflictSummary
                    conflictIds={conflictIdsView}
                    appointments={metricsList}
                    onSelect={openAppointmentDetail}
                  />
                </>
              ) : null}
            </div>
          ) : null}

          <AgendaFiltersBar
            activeFilterCount={activeFilterCount}
            chips={filterChips}
            onClearAll={clearAllFilters}
            unitFilter={unitFilter}
            onUnitFilter={setUnitFilter}
            unitOptions={unitComboOptions}
            professionalFilter={professionalFilter}
            onProfessionalFilter={setProfessionalFilter}
            professionalOptions={professionalComboOptions}
            groupFilter={groupFilter}
            onGroupFilter={setGroupFilter}
            groupOptions={groupComboOptions}
            resourceFilter={resourceFilter}
            onResourceFilter={setResourceFilter}
            resourceOptions={resourceComboOptions}
            resourceFieldLabel={resourceFieldLabel}
            serviceTypeFilter={serviceTypeFilter}
            onServiceTypeFilter={setServiceTypeFilter}
            serviceTypeOptions={serviceTypeComboOptions}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            statusOptions={statusComboOptions}
            groupMode={groupMode}
            onGroupMode={setGroupMode}
            serviceGroupColors={serviceGroupColors}
          />

          <p className="hub-clientes__muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
            <strong style={{ color: 'var(--hc-text, #4a3b3a)' }}>{navLabel}</strong>
            {' · '}
            {filtered.length} atendimento(s) no período filtrado
            {appointmentsError ? ' · Erro ao carregar' : null}
          </p>

          <div className={`hub-agenda__calendar-wrap${draggingId ? ' hub-agenda--dnd-active' : ''}`}>
            {remoteLoading && rawList.length === 0 && !appointmentsError ? (
              <HubLoading variant="block" label="Carregando agenda…" />
            ) : (
              <>
          {view === 'day' ? (
            isMobile ? (
              renderMobileDayList()
            ) : (
            <div
              className="hub-agenda-day"
              style={{ ['--ag-slot-h' as string]: `${SLOT_H}px`, ['--ag-lane-h' as string]: `${laneH}px` }}
            >
              <div className="hub-agenda-day__flex">
                <div className="hub-agenda-day__gutter">
                  <div className="hub-agenda-day__gutter-spacer" style={{ height: dayTopH }}>
                    {dayStaysH > 0 ? (
                      <div className="hub-agenda-day__gutter-stays" style={{ height: dayStaysH }}>
                        Dia todo
                      </div>
                    ) : null}
                  </div>
                  {slots.map((t) => {
                    const slotMins = minutesSinceDayStart(t, dayStart);
                    const nowMins = nowLineTop != null ? nowLineTop / pxPerMin : null;
                    const isNowSlot =
                      nowMins != null && nowMins >= slotMins && nowMins < slotMins + SLOT_MIN;
                    return (
                      <div
                        key={t.toISOString()}
                        className={`hub-agenda-day__gutter-time${isNowSlot ? ' hub-agenda-day__gutter-time--now' : ''}`}
                        style={{ height: SLOT_H }}
                      >
                        {formatHm(t)}
                      </div>
                    );
                  })}
                </div>
                <div className="hub-agenda-day__cols" ref={setDayColsEl}>
                  {dayColumns.map((col) => (
                    <div
                      key={col.key}
                      className="hub-agenda-day__col"
                      data-col-key={col.key}
                      style={(() => {
                        const basis = dayLaneData.get(col.key)?.basisPx ?? DAY_LANE_DEFAULT_WIDTH_PX;
                        return { flex: `1 0 ${basis}px`, minWidth: basis };
                      })()}
                    >
                      <div className="hub-agenda-day__col-top" style={{ height: dayTopH }}>
                        <div
                          className="hub-agenda-day__col-head"
                          style={{ height: HEADER_H }}
                          title={`${col.title} — ${col.subtitle}`}
                        >
                          <span className="hub-agenda-day__col-head-title">{col.title}</span>
                          <small className="hub-agenda-day__col-head-sub">{col.subtitle}</small>
                        </div>
                        {dayStaysH > 0 ? renderDayStays(col.key) : null}
                      </div>
                      {renderDayLane(col.key)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            )
          ) : null}

          {view === 'week' ? (
            <div className="hub-agenda-week">
              <table className="hub-agenda-week__table">
                <thead>
                  <tr>
                    <th>
                      {groupMode === 'professional'
                        ? 'Profissional'
                        : groupMode === 'category'
                          ? 'Categoria'
                          : resourceFieldLabel}
                    </th>
                    {weekDays.map((d) => (
                      <th key={toYmd(d)}>
                        {formatWeekdayShort(d)}
                        <strong>{d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</strong>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weekRows.map((row) => (
                    <tr key={row.key}>
                      <td title={`${row.title} — ${row.subtitle}`}>
                        <div className="hub-agenda-week__row-title">{row.title}</div>
                        <div className="hub-agenda-week__row-sub">{row.subtitle}</div>
                      </td>
                      {weekDays.map((d) => {
                        const cell = apptsForWeekCell(row.key, d).sort((a, b) => a.start.getTime() - b.start.getTime());
                        const show = cell.slice(0, 3);
                        const more = cell.length - show.length;
                        const hoverKey = `cal:${toYmd(d)}:${row.key}`;
                        return (
                          <td key={toYmd(d)}>
                            <div
                              className={`hub-agenda-week__cell-stack${dropHoverKey === hoverKey ? ' hub-agenda-week__cell-stack--hover' : ''}`}
                              data-agenda-drop={`cal:${toYmd(d)}:${row.key}`}
                            >
                              {show.map((a) => (
                                <AgendaAppointmentCard
                                  key={a.id}
                                  appointment={a}
                                  variant="week"
                                  selected={selectedId === a.id}
                                  showResource={groupMode !== 'resource'}
                                  {...appointmentDragHandlers(a)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (consumeSkipClickAfterDrag()) return;
                                    openAppointmentDetail(a.id);
                                    setCursorDate(startOfDay(d));
                                    setView('day');
                                  }}
                                />
                              ))}
                              {more > 0 ? (
                                <AgendaDayOverflowMenu
                                  appointments={cell}
                                  hiddenCount={more}
                                  label={`+${more} atendimento${more > 1 ? 's' : ''}`}
                                  hasConflict={cell.some((a) => conflictIdsView.has(a.id))}
                                  onSelect={(id) => {
                                    openAppointmentDetail(id);
                                    setCursorDate(startOfDay(d));
                                  }}
                                  onViewDay={() => {
                                    setCursorDate(startOfDay(d));
                                    setView('day');
                                  }}
                                />
                              ) : null}
                              {(() => {
                                const hotel = cell.filter((x) => x.appointment_kind === 'hotel_stay').length;
                                const routes = cell.filter((x) => x.appointment_kind === 'pickup_route').length;
                                if (!hotel && !routes) return null;
                                return (
                                  <div className="hub-clientes__muted" style={{ fontSize: 10, marginTop: 4 }}>
                                    {hotel ? `Hotel: ${hotel}` : ''}
                                    {hotel && routes ? ' · ' : ''}
                                    {routes ? `Leva e traz: ${routes}` : ''}
                                  </div>
                                );
                              })()}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {view === 'month' ? (
            <div className="hub-agenda-month">
              <div className="hub-agenda-month__grid">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
                  <div key={d} className="hub-agenda-month__dow">
                    {d}
                  </div>
                ))}
                {monthGrid.flat().map((d) => {
                  const inMonth = d.getMonth() === cursorDate.getMonth();
                  const k = toYmd(d);
                  const list = monthDayMap.get(k) ?? [];
                  const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
                  const show = sorted.slice(0, 3);
                  const more = sorted.length - show.length;
                  const busy = list.length >= 8;
                  const isToday = isSameDay(d, new Date());
                  const blk = blockByYmd.get(k);
                  const hoverKey = `cal:${k}`;
                  const blockCls =
                    blk?.kind === 'holiday'
                      ? ' hub-agenda-month__day--holiday'
                      : blk
                        ? ' hub-agenda-month__day--blocked'
                        : '';
                  const dropCls = dropHoverKey === hoverKey ? ' hub-agenda-month__day--drop-hover' : '';
                  return (
                    <div
                      key={k}
                      title={blk?.label}
                      className={`hub-agenda-month__day ${!inMonth ? 'hub-agenda-month__day--muted' : ''} ${busy ? 'hub-agenda-month__day--busy' : ''} ${isToday ? 'hub-agenda-month__day--today' : ''}${blockCls}${dropCls}`}
                      data-agenda-drop={`cal:${k}`}
                      onClick={() => {
                        if (consumeSkipClickAfterDrag()) return;
                        setCursorDate(startOfDay(d));
                        setView('day');
                      }}
                    >
                      <div className="hub-agenda-month__day-num">{d.getDate()}</div>
                      {show.length > 0 ? (
                        <div className="hub-agenda-month__chips">
                          {show.map((a) => (
                            <AgendaAppointmentCard
                              key={a.id}
                              appointment={a}
                              variant="month"
                              selected={selectedId === a.id}
                              {...appointmentDragHandlers(a)}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (consumeSkipClickAfterDrag()) return;
                                openAppointmentDetail(a.id);
                              }}
                            />
                          ))}
                          {more > 0 ? (
                            <AgendaDayOverflowMenu
                              appointments={sorted}
                              hiddenCount={more}
                              label={`+${more} atendimento${more > 1 ? 's' : ''}`}
                              onSelect={(id) => {
                                openAppointmentDetail(id);
                                setCursorDate(startOfDay(d));
                              }}
                              onViewDay={() => {
                                setCursorDate(startOfDay(d));
                                setView('day');
                              }}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <div className="hub-agenda-month__counts">{blk ? null : '—'}</div>
                      )}
                      {blk ? (
                        <div className="hub-agenda-month__block-chip" title={blk.label}>
                          {blk.kind === 'holiday' ? 'Feriado' : blk.label}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
                {remoteLoading ? (
                  <HubLoading variant="overlay" label="Atualizando…" />
                ) : null}
              </>
            )}
          </div>
        </div>

        {selected && detailOpen ? (
          <AppointmentSidePanel
            open={detailOpen}
            mode={detailMode}
            appointment={selected}
            canWrite={canWrite}
            onClose={closeAppointmentDetail}
            onEdit={() => setDetailMode('edit')}
            onBackToView={() => setDetailMode('view')}
            onStatusChange={handleAppointmentStatusChange}
            onDuplicate={duplicateSelectedAppointment}
            onCancel={requestCancelSelected}
            onOpenComanda={canCreateReceivable ? handleOpenComanda : undefined}
            onViewComanda={canCreateReceivable || canViewFinancial ? handleViewComanda : undefined}
            onOpenInClinic={canClinicWrite ? handleOpenInClinic : undefined}
            onOpenInGrooming={canGroomingWrite ? handleOpenInGrooming : undefined}
            onOpenInBoarding={canBoardingWrite ? handleOpenInBoarding : undefined}
            canViewFinancial={canViewFinancial}
            staffOptions={fullStaff}
            serviceTypes={fullSvcTypes}
            onUpdated={handleAppointmentUpdated}
            extraBlockChildren={selectedExtraBlockChildren}
            existingAppointments={allAppointments}
            seriesEndingInfo={
              selected.series_id ? seriesEndingMap.get(selected.series_id) ?? null : null
            }
            onRenewSeries={
              canWrite && selected.series_id && seriesEndingMap.has(selected.series_id)
                ? () => {
                    const info = seriesEndingMap.get(selected.series_id!);
                    if (info) renewSeries(info);
                  }
                : undefined
            }
          />
        ) : null}
      </div>

      <NewAppointmentModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCreateInitial(null);
          setCreateModalLayout('default');
        }}
        onCreated={handleAppointmentCreated}
        initial={createInitial}
        layoutVariant={createModalLayout}
        staffOptions={fullStaff}
        serviceTypes={fullSvcTypes}
        existingAppointments={allAppointments}
      />

      {clinicId && checkoutOpen && checkoutAppointmentId && checkoutUnitId ? (
        <ComandaCheckoutDrawer
          open={checkoutOpen}
          onClose={() => {
            setCheckoutOpen(false);
            setCheckoutAppointmentId(null);
          }}
          clinicId={clinicId}
          unitId={checkoutUnitId}
          originType="appointment"
          originId={checkoutAppointmentId}
          onSuccess={() => {
            bumpReload();
            showSuccess('Cobrança concluída.');
          }}
        />
      ) : null}

      <StartEncounterModal
        open={agendaStartModalItem !== null}
        clinicId={clinicId ?? ''}
        item={agendaStartModalItem}
        onClose={() => setAgendaStartModalItem(null)}
        onStart={handleAgendaStartEncounter}
        starting={agendaStarting}
      />
    </div>
  );
};

export default HubAgendaPage;
