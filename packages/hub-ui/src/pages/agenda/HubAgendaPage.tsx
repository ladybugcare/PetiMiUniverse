import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import { useAuth, getStoredClinicId, usePermissions, type AppRole } from '@petimi/web-core';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import { useAlert } from '../../components/AlertProvider';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubDateField } from '../../components/HubDateField';
import {
  hubAgendaApi,
  type HubAgendaCalendarBlock,
  type HubAppointmentStatus,
  type ListHubAppointmentsParams,
} from '../../api/hubAgendaApi';
import { hubStaffApi } from '../../api/hubStaffApi';
import type { HubStaffMember } from '../../api/hubStaffApi';
import { hubServiceTypesApi } from '../../api/hubServiceTypesApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import { hubGuardiansApi } from '../../api/hubGuardiansApi';
import { hubQuotesApi, type HubQuoteLine, type HubQuoteLineServiceEmbed } from '../../api/hubQuotesApi';
import { AppointmentDetailPanel } from './AppointmentDetailPanel';
import { NewAppointmentModal } from './NewAppointmentModal';
import type { CreateHubAppointmentResult, NewAppointmentInitial } from './NewAppointmentModal';
import { SERVICE_GROUP_OPTIONS, resolveServiceAccentColor } from '../../utils/serviceTypeSlug';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-agenda-page.css';
import {
  type AgendaAppointment,
  type AgendaGroupMode,
  type AgendaStatus,
  type AgendaView,
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
  monthMatrix,
  serviceGroupLabel,
  laneKeyForAppointment,
  computeOverlapConflictIds,
} from './agendaModel';
import { mapHubAppointmentToAgenda } from './mapHubAgenda';
import { hubEncountersApi, type DayBoardItem } from '../../api/hubClinicalApi';
import { ComandaCheckoutDrawer } from '../finance/ComandaCheckoutDrawer';
import StartEncounterModal from '../clinica/StartEncounterModal';
import { getSelectedUnitId } from '../../utils/useSelectedUnitId';
import {
  AGENDA_FILTERS_STORAGE_KEY,
  loadAgendaPersistedFilters,
  isUuid,
  type AgendaPersistedFilters,
} from './agendaFilters';

const FILTERS_STORAGE_KEY = AGENDA_FILTERS_STORAGE_KEY;

const START_HOUR = 7;
const END_HOUR = 20;
const SLOT_MIN = 30;
const SLOT_H = 26;
const HEADER_H = 44;

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

const HubAgendaPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showAlert, showInfo, showError, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const clinicId = getStoredClinicId();
  const [searchParams, setSearchParams] = useSearchParams();

  const accessAllowed = hasPermission('hub.appointments.read');
  const canWrite = hasPermission('hub.appointments.write');
  const canClinicWrite = hasPermission('hub.clinic.write');
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
  const [serviceTypeFilter, setServiceTypeFilter] = useState(
    (persisted as Partial<PersistedFilters>).service_type_id ?? 'all',
  );
  const [searchQ, setSearchQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [remoteLoading, setRemoteLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [rawList, setRawList] = useState<AgendaAppointment[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string; role: string; hasLogin: boolean }[]>([]);
  const [fullStaff, setFullStaff] = useState<HubStaffMember[]>([]);
  const [serviceTypes, setServiceTypes] = useState<{ id: string; name: string }[]>([]);
  const [fullSvcTypes, setFullSvcTypes] = useState<HubServiceType[]>([]);
  const [calendarBlocks, setCalendarBlocks] = useState<HubAgendaCalendarBlock[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState<NewAppointmentInitial | null>(null);
  const [createModalLayout, setCreateModalLayout] = useState<'default' | 'clinical_routine'>('default');
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutAppointmentId, setCheckoutAppointmentId] = useState<string | null>(null);
  const [agendaStartModalItem, setAgendaStartModalItem] = useState<DayBoardItem | null>(null);
  const [agendaStarting, setAgendaStarting] = useState(false);
  const consumedQuoteRef = useRef<string | null>(null);

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

  const openCreateModal = useCallback(
    (initial?: NewAppointmentInitial | null, layout: 'default' | 'clinical_routine' = 'default') => {
      setCreateInitial(initial ?? null);
      setCreateModalLayout(layout);
      setCreateOpen(true);
    },
    [],
  );

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

  const focusAppointmentOnAgenda = useCallback(
    (appointmentId: string, startsAtIso: string) => {
      const start = new Date(startsAtIso);
      if (!Number.isNaN(start.getTime())) {
        setView('day');
        setCursorDate(startOfDay(start));
      }
      setPendingFocusId(appointmentId);
      setSelectedId(appointmentId);
      bumpReload();
    },
    [bumpReload],
  );

  const handleAppointmentCreated = useCallback(
    (result: CreateHubAppointmentResult) => {
      const { appointment, created_count, conflicts } = result;
      let message = 'Deseja criar outro agendamento ou voltar à agenda com este agendamento em foco?';
      if (created_count > 1) {
        message = `${created_count} ocorrências foram criadas na série. ${message}`;
      }
      if (conflicts && conflicts.length > 0) {
        message = `${conflicts.length} data(s) da série entraram em conflito e não foram criadas. ${message}`;
      }

      showAlert({
        type: 'success',
        title: 'Agendamento criado!',
        message,
        showCancel: true,
        cancelText: 'Fechar',
        confirmText: 'Novo agendamento',
        onConfirm: () => {
          bumpReload();
          openCreateModal(null);
        },
        onCancel: () => focusAppointmentOnAgenda(appointment.id, appointment.starts_at),
      });
    },
    [showAlert, openCreateModal, focusAppointmentOnAgenda, bumpReload],
  );

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
      setSelectedId(pendingFocusId);
      setPendingFocusId(null);
    }
  }, [allAppointments, pendingFocusId]);

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
    (async () => {
      setRemoteLoading(true);
      try {
        const params: ListHubAppointmentsParams = {
          clinic_id: clinicId,
          from: rangeIso.from,
          to: rangeIso.to,
        };
        if (unitFilter !== 'all') params.unit_id = unitFilter;
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
  ]);

  useEffect(() => {
    if (!clinicId || permLoading || !accessAllowed) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') bumpReload();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [clinicId, permLoading, accessAllowed, bumpReload]);

  const unitOptions = useMemo(() => {
    const s = new Set<string>();
    for (const a of allAppointments) s.add(a.unitName);
    return ['all', ...Array.from(s).sort()];
  }, [allAppointments]);

  const resourceOptions = useMemo(() => {
    const s = new Set<string>();
    for (const a of allAppointments) {
      const r = (a.resourceLabel ?? '').trim();
      if (r && r !== '—') s.add(r);
    }
    return ['all', ...Array.from(s).sort()];
  }, [allAppointments]);

  const unitComboOptions = useMemo((): HubComboboxOption[] => {
    const rows: HubComboboxOption[] = [{ value: 'all', label: 'Todas' }];
    for (const u of unitOptions.filter((x) => x !== 'all')) {
      rows.push({ value: u, label: u });
    }
    if (unitFilter !== 'all' && !rows.some((o) => o.value === unitFilter)) {
      rows.push({ value: unitFilter, label: unitFilter });
    }
    return rows;
  }, [unitOptions, unitFilter]);

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
      if (unitFilter !== 'all' && a.unitName !== unitFilter) return false;
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
        const blob = `${a.petName} ${a.guardianName} ${a.serviceName} ${a.professionalName}`.toLowerCase();
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

  const selected = useMemo(
    () => filtered.find((x) => x.id === selectedId) ?? allAppointments.find((x) => x.id === selectedId) ?? null,
    [filtered, allAppointments, selectedId],
  );

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
    return filtered.filter((a) => isSameDay(a.start, cursorDate));
  }, [filtered, cursorDate]);

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
    return filtered.filter((a) => a.start >= weekStart && a.start < end);
  }, [filtered, weekStart]);

  const monthAppointments = useMemo(() => {
    const sm = startOfMonth(cursorDate);
    const em = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return filtered.filter((a) => a.start >= sm && a.start <= em);
  }, [filtered, cursorDate]);

  const slots = useMemo(() => {
    const n = ((END_HOUR - START_HOUR) * 60) / SLOT_MIN;
    const arr: Date[] = [];
    const base = startOfDay(cursorDate);
    base.setHours(START_HOUR, 0, 0, 0);
    for (let i = 0; i < n; i++) {
      arr.push(new Date(base.getTime() + i * SLOT_MIN * 60_000));
    }
    return arr;
  }, [cursorDate]);

  const laneH = slots.length * SLOT_H;
  const dayStart = useMemo(() => {
    const b = startOfDay(cursorDate);
    b.setHours(START_HOUR, 0, 0, 0);
    return b;
  }, [cursorDate]);

  const pxPerMin = SLOT_H / SLOT_MIN;

  const nowLineTop = useMemo(() => {
    if (!isSameDay(cursorDate, new Date())) return null;
    const now = new Date();
    const mins = minutesSinceDayStart(now, dayStart);
    const maxM = (END_HOUR - START_HOUR) * 60;
    if (mins < 0 || mins > maxM) return null;
    return mins * pxPerMin;
  }, [cursorDate, dayStart, pxPerMin]);

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
    if (groupMode === 'category') {
      return SERVICE_GROUP_OPTIONS.map((g) => ({
        key: g.value,
        title: g.label,
        subtitle: 'Grupo de serviço',
      }));
    }
    const keys = new Set<string>();
    const source = view === 'day' ? dayAppointments : weekAppointments;
    source.forEach((a) => keys.add(laneKeyForAppointment(a, 'resource')));
    if (keys.size === 0) keys.add('__none__');
    return [...keys].sort().map((k) => ({
      key: k,
      title: k === '__none__' ? 'Sem recurso/sala' : k,
      subtitle: 'Recurso',
    }));
  }, [groupMode, view, dayAppointments, weekAppointments, staffOptions]);

  const weekRows = dayColumns;

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

  const sidebarMetrics = useMemo(() => {
    const list = view === 'day' ? dayAppointments : view === 'week' ? weekAppointments : monthAppointments;
    const pets = new Set(list.map((a) => a.petName));
    const mins = list.reduce((acc, a) => acc + (a.end.getTime() - a.start.getTime()) / 60_000, 0);
    const overlapSet = computeOverlapConflictIds(list, groupMode);
    return {
      total: list.length,
      pets: pets.size,
      hours: Math.round((mins / 60) * 10) / 10,
      conflicts: overlapSet.size,
    };
  }, [view, dayAppointments, weekAppointments, monthAppointments, groupMode]);

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
    openCreateModal({
      date: toYmd(startOfDay(selected.start)),
      starts_at: selected.start.toISOString(),
      ends_at: selected.end.toISOString(),
      hub_staff_member_id: selected.professionalId,
      resource_label: selected.resourceLabel !== '—' ? selected.resourceLabel : null,
    });
  }, [selected, openCreateModal]);

  const requestCancelSelected = useCallback(() => {
    if (!canWrite) return;
    showConfirm(
      'Cancelar este atendimento?',
      () => void patchAppointmentStatus('cancelled'),
      'Cancelar',
    );
  }, [canWrite, showConfirm, selected, clinicId]);

  const handleDropOnLane = async (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    if (!canWrite || !clinicId) return;
    const id = e.dataTransfer.getData('text/appt-id');
    if (!id) return;
    const ap = allAppointments.find((x) => x.id === id);
    if (!ap) return;
    const lane = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const y = e.clientY - lane.top;
    let minutesFromStart = y / pxPerMin;
    minutesFromStart = Math.max(0, Math.min(minutesFromStart, (END_HOUR - START_HOUR) * 60 - 15));
    const snapped = Math.round(minutesFromStart / 15) * 15;
    const newStart = new Date(dayStart.getTime() + snapped * 60_000);
    const durMs = ap.end.getTime() - ap.start.getTime();
    const newEnd = new Date(newStart.getTime() + durMs);
    if (groupMode === 'professional') {
      const staffId = colKey === '__na__' ? null : colKey;
      try {
        await hubAgendaApi.patch(id, {
          clinic_id: clinicId,
          starts_at: newStart.toISOString(),
          ends_at: newEnd.toISOString(),
          hub_staff_member_id: staffId,
        });
        bumpReload();
      } catch (err: unknown) {
        showError((err as Error)?.message || 'Não foi possível mover');
      }
      return;
    }
    if (groupMode === 'resource') {
      const label = colKey === '__none__' ? null : colKey;
      try {
        await hubAgendaApi.patch(id, {
          clinic_id: clinicId,
          starts_at: newStart.toISOString(),
          ends_at: newEnd.toISOString(),
          resource_label: label,
        });
        bumpReload();
      } catch (err: unknown) {
        showError((err as Error)?.message || 'Não foi possível mover');
      }
      return;
    }
    try {
      await hubAgendaApi.patch(id, {
        clinic_id: clinicId,
        starts_at: newStart.toISOString(),
        ends_at: newEnd.toISOString(),
      });
      bumpReload();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Não foi possível mover');
    }
  };

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
      if (!canWrite) return;
      const lane = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - lane.top;
      let minutesFromStart = y / pxPerMin;
      minutesFromStart = Math.max(0, Math.min(minutesFromStart, (END_HOUR - START_HOUR) * 60 - 30));
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
        initial.resource_label = colKey;
      }
      openCreateModal(initial);
    },
    [canWrite, pxPerMin, dayStart, cursorDate, groupMode, openCreateModal],
  );

  const renderDayLane = (colKey: string) => {
    const list = apptsForDayColumn(colKey);
    const lines: React.ReactNode[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      const top = ((h - START_HOUR) * 60) * pxPerMin;
      lines.push(<div key={h} className="hub-agenda-day__hour-line" style={{ top }} />);
    }
    return (
      <div
        className="hub-agenda-day__lane"
        style={{ ['--ag-lane-h' as string]: `${laneH}px` }}
        onDragOver={(e) => {
          if (canWrite) e.preventDefault();
        }}
        onDrop={(e) => void handleDropOnLane(e, colKey)}
        onClick={(e) => handleLaneClick(e, colKey)}
      >
        {lines}
        {nowLineTop !== null ? <div className="hub-agenda-day__now-line" style={{ top: nowLineTop }} /> : null}
        {list.map((a) => {
          const top = minutesSinceDayStart(a.start, dayStart) * pxPerMin;
          const h = Math.max(((a.end.getTime() - a.start.getTime()) / 60_000) * pxPerMin, 22);
          const color = resolveServiceAccentColor(a.agendaColor, a.group);
          const st = STATUS_META[a.status];
          return (
            <button
              key={a.id}
              type="button"
              draggable={canWrite}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/appt-id', a.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              className={`hub-agenda-day__card ${selectedId === a.id ? 'hub-agenda-day__card--selected' : ''} ${a.conflict ? 'hub-agenda-day__card--conflict' : ''}`}
              style={{
                top,
                height: h,
                backgroundColor: `${color}24`,
                borderLeft: `4px solid ${color}`,
                color: '#2d2424',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(a.id);
              }}
            >
              <div className="hub-agenda-day__card-time">
                {formatHm(a.start)} – {formatHm(a.end)}
              </div>
              <div className="hub-agenda-day__card-pet">{a.petName}</div>
              <div className="hub-agenda-day__card-meta">
                {a.serviceName} · {a.guardianName}
              </div>
              <div style={{ marginTop: 2 }}>
                <span className={`hub-agenda__pill ${st.pillClass}`}>{st.label}</span>
              </div>
              {a.conflict ? (
                <div className="hub-agenda-day__card-meta" style={{ color: '#b71c1c', fontWeight: 700 }}>
                  Possível conflito
                </div>
              ) : null}
            </button>
          );
        })}
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
        Carregando…
      </div>
    );
  }

  return (
    <div className="hub-clientes hub-servicos-page hub-agenda-page">
      <div className={`hub-agenda ${selected ? 'hub-agenda--with-panel' : ''}`}>
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

          <div className="hub-agenda__toolbar">
            <div className="hub-agenda__view-switch" role="tablist" aria-label="Tipo de vista">
              {(['day', 'week', 'month'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  className={`hub-agenda__view-btn ${view === v ? 'hub-agenda__view-btn--active' : ''}`}
                  onClick={() => setView(v)}
                >
                  {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>

            <div className="hub-agenda__nav-cluster">
              <button
                type="button"
                className="hub-agenda__icon-btn"
                aria-label={view === 'day' ? 'Dia anterior' : view === 'week' ? 'Semana anterior' : 'Mês anterior'}
                onClick={() => (view === 'day' ? shiftDay(-1) : view === 'week' ? shiftWeek(-1) : shiftMonth(-1))}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="hub-agenda__icon-btn"
                aria-label={view === 'day' ? 'Próximo dia' : view === 'week' ? 'Próxima semana' : 'Próximo mês'}
                onClick={() => (view === 'day' ? shiftDay(1) : view === 'week' ? shiftWeek(1) : shiftMonth(1))}
              >
                <ChevronRight size={18} />
              </button>
              <HubDateField
                id="hub-agenda-date"
                className="hub-agenda__date-field"
                valueIso={toYmd(cursorDate)}
                onChangeIso={(iso) => {
                  if (!iso) return;
                  const d = parseYmd(iso);
                  if (d) setCursorDate(d);
                }}
              />
              <button type="button" className="hub-agenda__now-btn" onClick={goNow}>
                Agora
              </button>
            </div>

            {canWrite && (
              <button
                type="button"
                className="hub-agenda__new-btn"
                onClick={() => openCreateModal({ date: toYmd(cursorDate) })}
              >
                + Novo agendamento
              </button>
            )}

            <div className="hub-agenda__search">
              <label htmlFor="hub-agenda-search" className="hub-agenda__sr-only">
                Busca global
              </label>
              <div style={{ position: 'relative' }}>
                <Search
                  size={16}
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.45 }}
                />
                <input
                  id="hub-agenda-search"
                  placeholder="Pet, tutor, serviço…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  style={{ paddingLeft: 34 }}
                />
              </div>
            </div>
          </div>

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
                  <span className="hub-agenda__view-metrics--warn">
                    {sidebarMetrics.conflicts} conflito{sidebarMetrics.conflicts !== 1 ? 's' : ''}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="hub-agenda__filters">
            <div className="hub-servicos__filter-field hub-agenda__filter-combo">
              <label className="hub-clientes__label" htmlFor="ag-unit">
                Unidade
              </label>
              <HubSearchableCombobox
                id="ag-unit"
                className="hub-combobox--clientes"
                options={unitComboOptions}
                value={unitFilter}
                onChange={setUnitFilter}
                placeholder="Todas"
                searchPlaceholder="Buscar unidade…"
                allowCreate={false}
                clearable={false}
                ariaLabel="Filtrar por unidade"
              />
            </div>
            <div className="hub-servicos__filter-field hub-agenda__filter-combo">
              <label className="hub-clientes__label" htmlFor="ag-prof">
                Profissional
              </label>
              <HubSearchableCombobox
                id="ag-prof"
                className="hub-combobox--clientes"
                options={professionalComboOptions}
                value={professionalFilter}
                onChange={setProfessionalFilter}
                placeholder="Todos"
                searchPlaceholder="Buscar profissional…"
                allowCreate={false}
                clearable={false}
                ariaLabel="Filtrar por profissional"
              />
            </div>
            <div className="hub-servicos__filter-field hub-agenda__filter-combo">
              <label className="hub-clientes__label" htmlFor="ag-group">
                Grupo de serviço
              </label>
              <HubSearchableCombobox
                id="ag-group"
                className="hub-combobox--clientes"
                options={groupComboOptions}
                value={groupFilter}
                onChange={setGroupFilter}
                placeholder="Todos"
                searchPlaceholder="Buscar grupo…"
                allowCreate={false}
                clearable={false}
                ariaLabel="Filtrar por grupo de serviço"
              />
            </div>
            <div className="hub-servicos__filter-field hub-agenda__filter-combo">
              <label className="hub-clientes__label" htmlFor="ag-res">
                Recurso / sala
              </label>
              <HubSearchableCombobox
                id="ag-res"
                className="hub-combobox--clientes"
                options={resourceComboOptions}
                value={resourceFilter}
                onChange={setResourceFilter}
                placeholder="Todos"
                searchPlaceholder="Buscar recurso…"
                allowCreate={false}
                clearable={false}
                ariaLabel="Filtrar por recurso ou sala"
              />
            </div>
            <div className="hub-servicos__filter-field hub-agenda__filter-combo">
              <label className="hub-clientes__label" htmlFor="ag-svc-type">
                Tipo de serviço
              </label>
              <HubSearchableCombobox
                id="ag-svc-type"
                className="hub-combobox--clientes"
                options={serviceTypeComboOptions}
                value={serviceTypeFilter}
                onChange={setServiceTypeFilter}
                placeholder="Todos"
                searchPlaceholder="Buscar tipo de serviço…"
                allowCreate={false}
                clearable={false}
                ariaLabel="Filtrar por tipo de serviço"
              />
            </div>
            <div className="hub-servicos__filter-field hub-agenda__filter-combo">
              <label className="hub-clientes__label" htmlFor="ag-status">
                Status
              </label>
              <HubSearchableCombobox
                id="ag-status"
                className="hub-combobox--clientes"
                options={statusComboOptions}
                value={statusFilter}
                onChange={setStatusFilter}
                placeholder="Todos"
                searchPlaceholder="Buscar status…"
                allowCreate={false}
                clearable={false}
                ariaLabel="Filtrar por status"
              />
            </div>
            <div className="hub-servicos__filter-field hub-agenda__filter-field--toggle">
              <span className="hub-clientes__label">Colunas / linhas</span>
              <div className="hub-agenda__group-toggle" role="group" aria-label="Agrupar por">
                <button
                  type="button"
                  className={groupMode === 'professional' ? 'hub-agenda__group-toggle--on' : ''}
                  onClick={() => setGroupMode('professional')}
                >
                  Profissional
                </button>
                <button
                  type="button"
                  className={groupMode === 'category' ? 'hub-agenda__group-toggle--on' : ''}
                  onClick={() => setGroupMode('category')}
                >
                  Categoria
                </button>
                <button
                  type="button"
                  className={groupMode === 'resource' ? 'hub-agenda__group-toggle--on' : ''}
                  onClick={() => setGroupMode('resource')}
                >
                  Recurso
                </button>
              </div>
            </div>
          </div>

          <div className="hub-agenda__legend">
            <span className="hub-agenda__legend-title">Cores</span>
            {SERVICE_GROUP_OPTIONS.map((g) => {
              const hex = resolveServiceAccentColor(null, g.value);
              return (
                <span key={g.value} className="hub-agenda__legend-item">
                  <span className="hub-agenda__legend-dot" style={{ background: hex }} />
                  {g.label}
                </span>
              );
            })}
          </div>

          <p className="hub-clientes__muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
            <strong style={{ color: 'var(--hc-text, #4a3b3a)' }}>{navLabel}</strong>
            {' · '}
            {filtered.length} atendimento(s) no período filtrado
            {remoteLoading ? ' · Atualizando…' : null}
            {appointmentsError ? ' · Erro ao carregar' : null}
          </p>

          {view === 'day' ? (
            <div
              className="hub-agenda-day"
              style={{ ['--ag-slot-h' as string]: `${SLOT_H}px`, ['--ag-lane-h' as string]: `${laneH}px` }}
            >
              <div className="hub-agenda-day__flex">
                <div className="hub-agenda-day__gutter">
                  <div className="hub-agenda-day__gutter-spacer" style={{ height: HEADER_H }} />
                  {slots.map((t) => (
                    <div key={t.toISOString()} className="hub-agenda-day__gutter-time" style={{ height: SLOT_H }}>
                      {formatHm(t)}
                    </div>
                  ))}
                </div>
                <div className="hub-agenda-day__cols">
                  {dayColumns.map((col) => (
                    <div key={col.key} className="hub-agenda-day__col">
                      <div className="hub-agenda-day__col-head" style={{ height: HEADER_H }}>
                        <span>{col.title}</span>
                        <small>{col.subtitle}</small>
                      </div>
                      {renderDayLane(col.key)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
                          : 'Recurso / sala'}
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
                      <td>
                        <div style={{ fontWeight: 700 }}>{row.title}</div>
                        <div className="hub-clientes__muted" style={{ fontSize: 11 }}>
                          {row.subtitle}
                        </div>
                      </td>
                      {weekDays.map((d) => {
                        const cell = apptsForWeekCell(row.key, d).sort((a, b) => a.start.getTime() - b.start.getTime());
                        const show = cell.slice(0, 3);
                        const more = cell.length - show.length;
                        return (
                          <td key={toYmd(d)}>
                            <div className="hub-agenda-week__cell-stack">
                              {show.map((a) => {
                                const color = resolveServiceAccentColor(a.agendaColor, a.group);
                                const st = STATUS_META[a.status];
                                return (
                                  <button
                                    key={a.id}
                                    type="button"
                                    className={`hub-agenda-week__mini ${selectedId === a.id ? 'hub-agenda-week__mini--selected' : ''}`}
                                    style={{
                                      background: `${color}18`,
                                      borderLeft: `3px solid ${color}`,
                                      textAlign: 'left',
                                    }}
                                    onClick={() => {
                                      setSelectedId(a.id);
                                      setCursorDate(startOfDay(d));
                                      setView('day');
                                    }}
                                  >
                                    <div style={{ fontWeight: 700 }}>{formatHm(a.start)}</div>
                                    <div>{a.petName}</div>
                                    <div className="hub-clientes__muted" style={{ fontSize: 10 }}>
                                      {a.serviceName}
                                    </div>
                                    <span className={`hub-agenda__pill ${st.pillClass}`} style={{ marginTop: 4 }}>
                                      {st.short}
                                    </span>
                                  </button>
                                );
                              })}
                              {more > 0 ? (
                                <button
                                  type="button"
                                  className="hub-agenda-week__more"
                                  onClick={() => {
                                    setCursorDate(startOfDay(d));
                                    setView('day');
                                  }}
                                >
                                  +{more} atendimento{more > 1 ? 's' : ''}
                                </button>
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
                  const busy = list.length >= 8;
                  const isToday = isSameDay(d, new Date());
                  const blk = blockByYmd.get(k);
                  const blockCls =
                    blk?.kind === 'holiday'
                      ? ' hub-agenda-month__day--holiday'
                      : blk
                        ? ' hub-agenda-month__day--blocked'
                        : '';
                  const groupsCount = new Map<string, number>();
                  for (const a of list) {
                    groupsCount.set(a.group, (groupsCount.get(a.group) ?? 0) + 1);
                  }
                  const topGroups = Array.from(groupsCount.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3);
                  return (
                    <div
                      key={k}
                      role="button"
                      tabIndex={0}
                      title={blk?.label}
                      className={`hub-agenda-month__day ${!inMonth ? 'hub-agenda-month__day--muted' : ''} ${busy ? 'hub-agenda-month__day--busy' : ''} ${isToday ? 'hub-agenda-month__day--today' : ''}${blockCls}`}
                      onClick={() => {
                        setCursorDate(startOfDay(d));
                        setView('day');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setCursorDate(startOfDay(d));
                          setView('day');
                        }
                      }}
                    >
                      <div className="hub-agenda-month__day-num">{d.getDate()}</div>
                      <div className="hub-agenda-month__counts">
                        {list.length === 0 ? (
                          blk ? (
                            <div className="hub-agenda-month__block-chip" title={blk.label}>
                              {blk.kind === 'holiday' ? 'Feriado' : blk.label}
                            </div>
                          ) : (
                            '—'
                          )
                        ) : (
                          <>
                            <strong>{list.length}</strong> atend.
                            {topGroups.length > 0 ? (
                              <div>
                                {topGroups.map(([g, n]) => (
                                  <div key={g}>
                                    {n} {serviceGroupLabel(g)}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {blk ? (
                              <div className="hub-agenda-month__block-chip" title={blk.label}>
                                {blk.kind === 'holiday' ? 'Feriado' : blk.label}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {selected ? (
          <AppointmentDetailPanel
            appointment={selected}
            canWrite={canWrite}
            onClose={() => setSelectedId(null)}
            onStatusChange={handleAppointmentStatusChange}
            onDuplicate={duplicateSelectedAppointment}
            onCancel={requestCancelSelected}
            onOpenCheckout={canCreateReceivable ? handleOpenCheckout : undefined}
            onOpenInClinic={canClinicWrite ? handleOpenInClinic : undefined}
            canViewFinancial={canViewFinancial}
          />
        ) : null}
      </div>

      <NewAppointmentModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCreateModalLayout('default');
        }}
        onCreated={handleAppointmentCreated}
        initial={createInitial}
        layoutVariant={createModalLayout}
        staffOptions={fullStaff}
        serviceTypes={fullSvcTypes}
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
            showInfo('Checkout concluído.', 'Financeiro');
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
