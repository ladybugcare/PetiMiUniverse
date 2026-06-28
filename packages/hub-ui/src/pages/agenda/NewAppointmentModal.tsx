import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, GripVertical, AlertCircle, CalendarDays, Calendar, RefreshCw, ChevronDown, ChevronUp, User, Dog, Loader2, Stethoscope, Siren, FolderPlus, Folder, Info, CheckCircle2, CalendarPlus, Clock } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubDateField } from '../../components/HubDateField';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubCheckbox } from '../../components/HubCheckbox';
import {
  hubAgendaApi,
  type CreateHubAppointmentPayload,
  type HubAppointmentStatus,
  type HubAppointmentRecurrenceRule,
} from '../../api/hubAgendaApi';
import { hubGuardiansApi } from '../../api/hubGuardiansApi';
import { hubClinicalCasesApi, type HubClinicalCase } from '../../api/hubClinicalApi';
import { hubClinicSettingsApi } from '../../api/hubClinicSettingsApi';
import type { HubStaffMember } from '../../api/hubStaffApi';
import { hubServiceGroupsApi } from '../../api/hubServiceGroupsApi';
import { hubServiceAddonsApi } from '../../api/hubServiceAddonsApi';
import AppointmentAddonsSection from './AppointmentAddonsSection';
import { validateSelectedAddonVariants } from './appointmentAddonsUtils';
import { isStaffCompatibleWithServiceType, type GroupJobMappings } from '../../utils/staffServiceCompatibility';
import type { HubQuotePricingVariant } from '../../api/hubQuotesApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import {
  comboValueToVariant,
  defaultPricingVariantForMatrix,
  matrixNeedsVariantChoice,
  variantComboboxOptionsForMatrix,
  variantToComboValue,
} from '../../utils/hubPricingVariantUi';
import {
  COAT_TYPE_LABELS,
  PORTE_LABELS,
  PET_BODY_PORTE_VALUES,
  type CoatTypeValue,
  type PetBodyPorteValue,
  type PorteValue,
  coercePricingMatrixFromApi,
} from '../../utils/hubServiceTypesPricingMatrix';
import {
  buildAgendaPricingPreview,
  previewLevaTrazBandPricing,
  unionCoatTypesForServiceSelection,
  unionPorteTiersForServiceSelection,
  validateAppointmentCoatOverride,
  validateAppointmentPorteOverride,
} from './agendaPortePricingPreview';
import { isOperationalClinicalGroup, normalizeServiceGroupSlug, serviceGroupLabel } from '../../utils/serviceTypeSlug';
import { STATUS_META, type AgendaStatus } from './agendaModel';
import './new-appointment-modal.css';

export type CreateHubAppointmentResult = Awaited<ReturnType<typeof hubAgendaApi.create>>;

export type NewAppointmentInitial = {
  date?: string;
  starts_at?: string;
  ends_at?: string;
  hub_staff_member_id?: string | null;
  resource_label?: string | null;
  guardian_id?: string | null;
  guardian_name?: string | null;
  pet_id?: string | null;
  pet_name?: string | null;
  services?: Array<{
    hub_service_type_id: string;
    name?: string | null;
    duration_minutes?: number | null;
    pricing_variant?: HubQuotePricingVariant | null;
  }>;
  title?: string | null;
  notes?: string | null;
  financial_notes?: string | null;
  source_quote_id?: string | null;
};

export type NewAppointmentModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (result: CreateHubAppointmentResult) => void;
  initial?: NewAppointmentInitial | null;
  staffOptions: HubStaffMember[];
  serviceTypes: HubServiceType[];
  /** Fluxo Clínica → «Agendar na agenda»: formulário focado como nos prints de consulta de rotina. */
  layoutVariant?: 'default' | 'clinical_routine';
};

type ServiceChip = {
  hub_service_type_id: string;
  name: string;
  duration_minutes: number;
  pricing_variant?: HubQuotePricingVariant | null;
};

type GuardianPetOption = { id: string; name: string; size_tier: string; coat_type: string | null; birth_date: string | null };

type ExtraBlock = {
  key: string;
  expanded: boolean;
  block_title: string;
  block_description: string;
  block_description_user_edited: boolean;
  /** Filtro de grupo de serviço só para este bloco (`all` ou slug). */
  group_filter: string;
  services: ServiceChip[];
  starts_hm: string;
  ends_hm: string;
  hub_staff_member_id: string;
  resource_label: string;
};

/** Janela L&T: `ends_hm` mantém-se alinhado ao início (+1 h); não há campo «Fim» no formulário. */
type PickupSubBlock = {
  starts_hm: string;
  ends_hm: string;
  hub_staff_member_id: string;
  resource_label: string;
};

const PICKUP_ROUTE_LEG_DURATION_MIN = 60;

type RecurrenceForm = {
  kind: 'daily' | 'weekly' | 'monthly';
  interval_value: number;
  days_of_week: number[];
  end_kind: 'until' | 'occurrences';
  until_date: string;
  occurrences: number;
};

const DEFAULT_RECURRENCE: RecurrenceForm = {
  kind: 'weekly',
  interval_value: 1,
  days_of_week: [],
  end_kind: 'occurrences',
  until_date: '',
  occurrences: 4,
};

const DOW_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function toIsoTs(dateYmd: string, hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  const d = new Date(`${dateYmd}T00:00:00`);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

function addDaysToYmd(dateYmd: string, days: number): string {
  const [y, mo, d] = dateYmd.split('-').map(Number);
  const dt = new Date(y!, (mo ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Fim do intervalo HH:MM; avança um dia quando endHm <= startHm (cruza meia-noite). */
function toEndIsoTs(dateYmd: string, startHm: string, endHm: string): string {
  const endDate = hmToMinutes(endHm) <= hmToMinutes(startHm) ? addDaysToYmd(dateYmd, 1) : dateYmd;
  return toIsoTs(endDate, endHm);
}

/** Primeiro instante em dateYmd+HM que não seja anterior a anchorIso. */
function toIsoTsOnOrAfter(dateYmd: string, hm: string, anchorIso: string): string {
  let candDate = dateYmd;
  let candidate = toIsoTs(candDate, hm);
  const anchorMs = new Date(anchorIso).getTime();
  while (new Date(candidate).getTime() < anchorMs) {
    candDate = addDaysToYmd(candDate, 1);
    candidate = toIsoTs(candDate, hm);
  }
  return candidate;
}

function addMinutes(hm: string, mins: number): string {
  const [h, m] = hm.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minHm(times: string[]): string {
  if (times.length === 0) return '09:00';
  return times.reduce((a, b) => (hmToMinutes(a) <= hmToMinutes(b) ? a : b));
}

function maxHm(times: string[]): string {
  if (times.length === 0) return '10:00';
  return times.reduce((a, b) => (hmToMinutes(a) >= hmToMinutes(b) ? a : b));
}

function minutesToHm(totalMin: number): string {
  const t = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function tsToHm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Texto com bullets a partir das descrições dos tipos de serviço (cadastro). */
function buildServiceDescriptionBullets(types: HubServiceType[], serviceIdsOrdered: string[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const id of serviceIdsOrdered) {
    if (seen.has(id)) continue;
    seen.add(id);
    const st = types.find((t) => t.id === id);
    const d = (st?.description ?? '').trim();
    if (d) lines.push(`- ${d}`);
  }
  return lines.join('\n');
}

export const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({
  open,
  onClose,
  onCreated,
  initial,
  staffOptions,
  serviceTypes,
  layoutVariant = 'default',
}) => {
  const clinicId = getStoredClinicId() ?? '';
  const isClinicalRoutine = layoutVariant === 'clinical_routine';
  const [jobMappings, setJobMappings] = useState<GroupJobMappings>({});

  useEffect(() => {
    if (!open || !clinicId) return;
    let cancelled = false;
    void hubServiceGroupsApi.getJobMappings(clinicId).then((res) => {
      if (!cancelled) setJobMappings(res.mappings ?? {});
    });
    return () => {
      cancelled = true;
    };
  }, [open, clinicId]);

  // ── Core fields ────────────────────────────────────────────────────────────
  const [dateYmd, setDateYmd] = useState(todayYmd());
  const [startsHm, setStartsHm] = useState('09:00');
  const [endsHm, setEndsHm] = useState('10:00');
  const [staffId, setStaffId] = useState('');
  const [resourceLabel, setResourceLabel] = useState('');
  const [status, setStatus] = useState<AgendaStatus>('confirmed');

  // ── Services ───────────────────────────────────────────────────────────────
  const [groupFilter, setGroupFilter] = useState('all');
  const [services, setServices] = useState<ServiceChip[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<ServiceChip[]>([]);
  const [availableAddons, setAvailableAddons] = useState<HubServiceType[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [serviceSearchId, setServiceSearchId] = useState('');

  // ── Pet / Guardian ────────────────────────────────────────────────────────
  const [guardianId, setGuardianId] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [petId, setPetId] = useState('');
  const [petName, setPetName] = useState('');
  const [guardianPets, setGuardianPets] = useState<GuardianPetOption[]>([]);
  const [guardianOptions, setGuardianOptions] = useState<HubComboboxOption[]>([]);
  const [guardiansLoading, setGuardiansLoading] = useState(false);

  const [intakeActiveCases, setIntakeActiveCases] = useState<HubClinicalCase[]>([]);
  const [intakeCasesLoading, setIntakeCasesLoading] = useState(false);
  const [intakeCaseMode, setIntakeCaseMode] = useState<'existing' | 'new'>('new');
  const [intakeSelectedCaseId, setIntakeSelectedCaseId] = useState('');
  const [intakeNewCaseTitle, setIntakeNewCaseTitle] = useState('');

  const [puppyMaxMonths, setPuppyMaxMonths] = useState(8);
  /** Vazio = automático (null no API). */
  const [pricingApptPorteTier, setPricingApptPorteTier] = useState('');
  /** Vazio = automático (pelagem do pet, quando existir). */
  const [pricingApptCoatType, setPricingApptCoatType] = useState('');

  // ── Title / bloco principal ───────────────────────────────────────────────
  const [titleOverridden, setTitleOverridden] = useState(false);
  const [title, setTitle] = useState('');
  const [mainBlockNotes, setMainBlockNotes] = useState('');
  const [mainBlockNotesUserEdited, setMainBlockNotesUserEdited] = useState(false);
  const [mainBlockExpanded, setMainBlockExpanded] = useState(true);
  const [financialNotes, setFinancialNotes] = useState('');

  // ── Recurrence ────────────────────────────────────────────────────────────
  const [withRecurrence, setWithRecurrence] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceForm>({ ...DEFAULT_RECURRENCE });

  // ── L&T ───────────────────────────────────────────────────────────────────
  const [withPickup, setWithPickup] = useState(false);
  const [pickupBefore, setPickupBefore] = useState<PickupSubBlock>({
    starts_hm: '08:00',
    ends_hm: addMinutes('08:00', PICKUP_ROUTE_LEG_DURATION_MIN),
    hub_staff_member_id: '',
    resource_label: '',
  });
  const [pickupAfter, setPickupAfter] = useState<PickupSubBlock>({
    starts_hm: '11:00',
    ends_hm: addMinutes('11:00', PICKUP_ROUTE_LEG_DURATION_MIN),
    hub_staff_member_id: '',
    resource_label: '',
  });
  const [pickupLtServiceTypeId, setPickupLtServiceTypeId] = useState('');
  const [pickupKmTierIndex, setPickupKmTierIndex] = useState(0);

  const ltReturnDriverUnlinkedRef = useRef(false);
  const lastMainBlockServiceSigRef = useRef('');
  const lastExtraBlockServiceSigRef = useRef<Record<string, string>>({});
  const initialPetIdRef = useRef<string | null>(null);

  // ── Extra blocks ──────────────────────────────────────────────────────────
  const [extraBlocks, setExtraBlocks] = useState<ExtraBlock[]>([]);

  /** Primeiro início do dia (principal + extras com serviço) — fim da perna «busca» L&T. */
  const pickupDayFirstStartHm = useMemo(
    () => minHm([startsHm, ...extraBlocks.filter((b) => b.services.length > 0).map((b) => b.starts_hm)]),
    [startsHm, extraBlocks],
  );

  /** Último fim do dia — base para sugerir o início do «retorno». */
  const pickupDayLastEndHm = useMemo(
    () => maxHm([endsHm, ...extraBlocks.filter((b) => b.services.length > 0).map((b) => b.ends_hm)]),
    [endsHm, extraBlocks],
  );

  const mainServiceIdsSignature = useMemo(
    () => services.map((s) => s.hub_service_type_id).join('|'),
    [services],
  );

  const extraBlocksServiceSignature = useMemo(
    () =>
      extraBlocks
        .map((b) => `${b.key}:${b.services.map((s) => s.hub_service_type_id).join(',')}`)
        .join('|'),
    [extraBlocks],
  );

  useEffect(() => {
    if (!open) {
      lastMainBlockServiceSigRef.current = '';
      return;
    }
    const sig = mainServiceIdsSignature;
    if (sig === lastMainBlockServiceSigRef.current) return;
    lastMainBlockServiceSigRef.current = sig;
    const next = buildServiceDescriptionBullets(
      serviceTypes,
      services.map((s) => s.hub_service_type_id),
    );
    if (!mainBlockNotesUserEdited) setMainBlockNotes(next);
    else if (sig !== '' && window.confirm('Atualizar a descrição do bloco com base nos serviços seleccionados?')) {
      setMainBlockNotes(next);
      setMainBlockNotesUserEdited(false);
    }
  }, [open, mainServiceIdsSignature, services, serviceTypes, mainBlockNotesUserEdited]);

  useEffect(() => {
    if (!open) {
      lastExtraBlockServiceSigRef.current = {};
      return;
    }
    setExtraBlocks((prev) => {
      let changed = false;
      const next = prev.map((block) => {
        const sig = block.services.map((s) => s.hub_service_type_id).join('|');
        const lastSig = lastExtraBlockServiceSigRef.current[block.key];
        if (lastSig === sig) return block;
        lastExtraBlockServiceSigRef.current[block.key] = sig;

        const bullets = buildServiceDescriptionBullets(
          serviceTypes,
          block.services.map((s) => s.hub_service_type_id),
        );
        if (!block.block_description_user_edited) {
          changed = true;
          return { ...block, block_description: bullets };
        }
        if (sig !== '' && window.confirm('Atualizar a descrição deste bloco com base nos serviços seleccionados?')) {
          changed = true;
          return { ...block, block_description: bullets, block_description_user_edited: false };
        }
        return block;
      });
      return changed ? next : prev;
    });
  }, [open, extraBlocksServiceSignature, serviceTypes]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Array<{ date: string; reason: string }>>([]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const servicesDurationMin = useMemo(
    () => services.reduce((s, c) => s + c.duration_minutes, 0),
    [services]
  );
  const addonsDurationMin = useMemo(
    () => selectedAddons.reduce((s, c) => s + c.duration_minutes, 0),
    [selectedAddons]
  );
  const totalDurationMin = servicesDurationMin + addonsDurationMin;
  const extraBlocksDurationMin = useMemo(
    () => extraBlocks.reduce((sum, b) => sum + b.services.reduce((s, c) => s + c.duration_minutes, 0), 0),
    [extraBlocks],
  );
  const totalDurationAllBlocks = totalDurationMin + extraBlocksDurationMin;

  const autoTitle = useMemo(() => {
    const svcPart = services.map((s) => s.name).join(' + ') || '';
    const petPart = petName || '';
    if (!svcPart && !petPart) return '';
    if (!petPart) return svcPart;
    if (!svcPart) return petPart;
    return `${svcPart} — ${petPart}`;
  }, [services, petName]);

  useEffect(() => {
    if (!titleOverridden) setTitle(autoTitle);
  }, [autoTitle, titleOverridden]);

  // When services change, recalc ends_hm
  useEffect(() => {
    if (totalDurationMin > 0) {
      setEndsHm(addMinutes(startsHm, totalDurationMin));
    }
  }, [totalDurationMin, startsHm]);

  /** Sem campo «Fim» na busca: o fim da perna acompanha sempre o início do primeiro bloco do dia. */
  useEffect(() => {
    if (!withPickup) return;
    setPickupBefore((b) => ({ ...b, ends_hm: pickupDayFirstStartHm }));
  }, [withPickup, pickupDayFirstStartHm]);

  // Apply initial values when modal opens
  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    setConflicts([]);
    setTitleOverridden(false);
    setPricingApptPorteTier('');
    setPricingApptCoatType('');
    initialPetIdRef.current = initial?.pet_id ?? null;
    if (initial) {
      if (initial.date) setDateYmd(initial.date);
      if (initial.starts_at) setStartsHm(tsToHm(initial.starts_at));
      if (initial.ends_at) setEndsHm(tsToHm(initial.ends_at));
      if (initial.hub_staff_member_id) setStaffId(initial.hub_staff_member_id);
      if (initial.resource_label) setResourceLabel(initial.resource_label);
      if (initial.guardian_id) setGuardianId(initial.guardian_id);
      if (initial.guardian_name) setGuardianName(initial.guardian_name);
      if (initial.pet_id) setPetId(initial.pet_id);
      if (initial.pet_name) setPetName(initial.pet_name);
      if (initial.title) {
        setTitle(initial.title);
        setTitleOverridden(true);
      }
      if (initial.notes) {
        setMainBlockNotes(initial.notes);
        setMainBlockNotesUserEdited(true);
      }
      if (initial.financial_notes) setFinancialNotes(initial.financial_notes);
      if (initial.services?.length) {
        setServices(
          initial.services
            .filter((s) => s.hub_service_type_id)
            .map((s) => {
              const st = serviceTypes.find((t) => t.id === s.hub_service_type_id);
              return {
                hub_service_type_id: s.hub_service_type_id,
                name: s.name || st?.name || 'Serviço',
                duration_minutes: s.duration_minutes || st?.default_duration_minutes || 60,
                pricing_variant: s.pricing_variant ?? null,
              };
            }),
        );
      }
    }
  }, [open, initial, serviceTypes]);

  useEffect(() => {
    if (!open || !clinicId) return;
    hubClinicSettingsApi
      .get(clinicId)
      .then((r) => setPuppyMaxMonths(r.settings.pet_puppy_max_months))
      .catch(() => setPuppyMaxMonths(8));
  }, [open, clinicId]);

  // Load guardians
  useEffect(() => {
    if (!open || !clinicId) return;
    setGuardiansLoading(true);
    hubGuardiansApi
      .list(clinicId, false, { status: 'active' })
      .then(({ guardians }) => {
        setGuardianOptions(
          guardians.map((g) => ({
            value: g.id,
            label: g.full_name,
            icon: <User size={18} strokeWidth={2} aria-hidden />,
          })),
        );
      })
      .catch(() => setGuardianOptions([]))
      .finally(() => setGuardiansLoading(false));
  }, [open, clinicId]);

  // Load pets when guardian changes
  useEffect(() => {
    if (!guardianId || !clinicId) {
      setGuardianPets([]);
      setPetId('');
      setPetName('');
      return;
    }
    hubGuardiansApi.getById(guardianId, clinicId).then(({ pets }) => {
      const mapped: GuardianPetOption[] = pets.map((p) => ({
        id: p.id,
        name: p.name,
        size_tier: p.size_tier || 'medio',
        coat_type: p.coat_type ?? null,
        birth_date: p.birth_date,
      }));
      setGuardianPets(mapped);
      const initialPetId = initialPetIdRef.current;
      const initialPet = initialPetId ? mapped.find((p) => p.id === initialPetId) : null;
      if (initialPet) {
        setPetId(initialPet.id);
        setPetName(initialPet.name);
        initialPetIdRef.current = null;
      } else if (mapped.length === 1) {
        setPetId(mapped[0]!.id);
        setPetName(mapped[0]!.name);
      } else {
        setPetId('');
        setPetName('');
      }
    }).catch(() => setGuardianPets([]));
  }, [guardianId, clinicId]);

  useEffect(() => {
    if (!open || !isClinicalRoutine || !clinicId || !petId) {
      setIntakeActiveCases([]);
      setIntakeCasesLoading(false);
      if (!open) {
        setIntakeCaseMode('new');
        setIntakeSelectedCaseId('');
        setIntakeNewCaseTitle('');
      }
      return;
    }
    setIntakeCasesLoading(true);
    void hubClinicalCasesApi
      .list(clinicId, { petId })
      .then((r) => {
        const rows = r.cases ?? [];
        const combined = rows.filter((c) => c.status === 'active' || c.status === 'monitoring');
        setIntakeActiveCases(combined);
        setIntakeCaseMode(combined.length > 0 ? 'existing' : 'new');
        setIntakeSelectedCaseId(combined.length === 1 ? combined[0]!.id : '');
      })
      .catch(() => setIntakeActiveCases([]))
      .finally(() => setIntakeCasesLoading(false));
  }, [open, isClinicalRoutine, clinicId, petId]);

  useEffect(() => {
    if (!open || !isClinicalRoutine || intakeCaseMode !== 'new') return;
    const parts = dateYmd.split('-');
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (!y || !m || !d) return;
    const suggested = `Consulta de rotina - ${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    setIntakeNewCaseTitle((t) => (t.trim() ? t : suggested));
  }, [open, isClinicalRoutine, intakeCaseMode, dateYmd]);

  // ── Service groups for filter ─────────────────────────────────────────────
  const groups = useMemo(() => {
    const seen = new Set<string>();
    const opts: HubComboboxOption[] = [{ value: 'all', label: 'Todos os grupos' }];
    for (const st of serviceTypes) {
      const slug = normalizeServiceGroupSlug(st.service_group);
      if (!seen.has(slug)) {
        seen.add(slug);
        opts.push({ value: slug, label: serviceGroupLabel(slug) });
      }
    }
    return opts;
  }, [serviceTypes]);

  const filteredServiceTypes = useMemo(
    () =>
      serviceTypes.filter(
        (st) =>
          !st.is_addon &&
          st.allow_scheduling !== false &&
          (groupFilter === 'all' || normalizeServiceGroupSlug(st.service_group) === groupFilter),
      ),
    [serviceTypes, groupFilter],
  );

  const serviceComboOptions = useMemo<HubComboboxOption[]>(
    () => filteredServiceTypes.map((st) => ({ value: st.id, label: `${st.name}${st.default_duration_minutes ? ` (${st.default_duration_minutes}min)` : ''}` })),
    [filteredServiceTypes],
  );

  const clinicalRoutineServiceOptions = useMemo<HubComboboxOption[]>(() => {
    const rows = serviceTypes.filter((st) => {
      if (st.active === false) return false;
      if (st.deleted_at) return false;
      if (st.is_addon) return false;
      if (st.allow_scheduling === false) return false;
      const g = normalizeServiceGroupSlug(st.service_group);
      return isOperationalClinicalGroup(g);
    });
    return rows.map((st) => {
      const g = normalizeServiceGroupSlug(st.service_group);
      return { value: st.id, label: `${st.name} (${serviceGroupLabel(g)})` };
    });
  }, [serviceTypes]);

  const intakeCaseComboOptions = useMemo<HubComboboxOption[]>(
    () => intakeActiveCases.map((c) => ({ value: c.id, label: c.title })),
    [intakeActiveCases],
  );

  const selectedServiceTypes = useMemo(() => {
    const ids = new Set<string>();
    for (const chip of services) ids.add(chip.hub_service_type_id);
    for (const block of extraBlocks) {
      for (const chip of block.services) ids.add(chip.hub_service_type_id);
    }
    return serviceTypes.filter((st) => ids.has(st.id));
  }, [services, extraBlocks, serviceTypes]);

  const suggestedStaffIds = useMemo(() => {
    if (selectedServiceTypes.length === 0) return new Set<string>();
    const eligible = staffOptions.filter((s) => s.active && s.accepts_appointments);
    const compatible = eligible.filter((s) =>
      selectedServiceTypes.every((st) => isStaffCompatibleWithServiceType(s, st, jobMappings)),
    );
    return new Set(compatible.map((s) => s.id));
  }, [selectedServiceTypes, staffOptions, jobMappings]);

  useEffect(() => {
    if (selectedServiceTypes.length === 0) return;
    if (suggestedStaffIds.size === 1) {
      const only = [...suggestedStaffIds][0]!;
      setStaffId((prev) => (prev === only ? prev : only));
      return;
    }
    if (staffId && !suggestedStaffIds.has(staffId) && suggestedStaffIds.size > 0) {
      setStaffId('');
    }
  }, [selectedServiceTypes, suggestedStaffIds, staffId]);

  const staffComboOptions = useMemo<HubComboboxOption[]>(() => {
    const eligible = staffOptions.filter((s) => s.active && s.accepts_appointments);
    const suggested = eligible.filter((s) => suggestedStaffIds.has(s.id));
    const others = eligible.filter((s) => !suggestedStaffIds.has(s.id));
    const mapRow = (s: HubStaffMember, suffix: string): HubComboboxOption => ({
      value: s.id,
      label: `${s.display_name ?? s.full_name}${suffix}`,
    });
    const rows: HubComboboxOption[] = [{ value: '', label: 'Não atribuído' }];
    if (selectedServiceTypes.length > 0 && suggested.length > 0) {
      rows.push(...suggested.map((s) => mapRow(s, ' · sugerido')));
      if (others.length > 0) {
        rows.push(...others.map((s) => mapRow(s, '')));
      }
    } else {
      rows.push(...eligible.map((s) => mapRow(s, '')));
    }
    return rows;
  }, [staffOptions, suggestedStaffIds, selectedServiceTypes.length]);

  const setClinicalRoutinePrimaryService = useCallback(
    (id: string) => {
      const st = serviceTypes.find((t) => t.id === id);
      if (!st) return;
      const rawDur = st.default_duration_minutes;
      const durMin =
        typeof rawDur === 'number' && rawDur > 0 ? Math.min(480, Math.max(15, rawDur)) : 60;
      setServices([
        {
          hub_service_type_id: id,
          name: st.name,
          duration_minutes: durMin,
          pricing_variant: null,
        },
      ]);
    },
    [serviceTypes],
  );

  const levaTrazServiceTypes = useMemo(
    () =>
      serviceTypes.filter(
        (st) => st.allow_scheduling !== false && normalizeServiceGroupSlug(st.service_group) === 'leva_traz',
      ),
    [serviceTypes],
  );

  const ltServiceComboOptions = useMemo<HubComboboxOption[]>(
    () => levaTrazServiceTypes.map((st) => ({ value: st.id, label: st.name })),
    [levaTrazServiceTypes],
  );

  const kmTierComboOptions = useMemo<HubComboboxOption[]>(() => {
    const st = serviceTypes.find((s) => s.id === pickupLtServiceTypeId);
    if (!st) return [];
    const m = coercePricingMatrixFromApi(st.pricing_matrix);
    if (!m || m.kind !== 'km_banda') return [{ value: '0', label: 'Preço base' }];
    return m.tiers.map((t, i) => ({
      value: String(i),
      label: `${t.label || `Faixa ${i + 1}`} — R$ ${Number(t.sale_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    }));
  }, [serviceTypes, pickupLtServiceTypeId]);

  useEffect(() => {
    if (!withPickup) return;
    if (pickupLtServiceTypeId) return;
    if (levaTrazServiceTypes.length === 1) setPickupLtServiceTypeId(levaTrazServiceTypes[0]!.id);
  }, [withPickup, pickupLtServiceTypeId, levaTrazServiceTypes]);

  useEffect(() => {
    const st = serviceTypes.find((s) => s.id === pickupLtServiceTypeId);
    if (!st || !pickupLtServiceTypeId) return;
    const m = coercePricingMatrixFromApi(st.pricing_matrix);
    if (m?.kind === 'km_banda' && pickupKmTierIndex >= m.tiers.length) {
      setPickupKmTierIndex(0);
    }
  }, [pickupLtServiceTypeId, serviceTypes, pickupKmTierIndex]);

  const petComboOptions = useMemo<HubComboboxOption[]>(
    () =>
      guardianPets.map((p) => ({
        value: p.id,
        label: p.name,
        icon: <Dog size={18} strokeWidth={2} aria-hidden />,
      })),
    [guardianPets],
  );

  const selectedPet = useMemo(() => guardianPets.find((p) => p.id === petId) ?? null, [guardianPets, petId]);

  const serviceIdsForPorteUnion = useMemo(() => {
    const ids = services.map((s) => s.hub_service_type_id);
    for (const b of extraBlocks) {
      for (const s of b.services) ids.push(s.hub_service_type_id);
    }
    return ids;
  }, [services, extraBlocks]);

  const unionPricingTiers = useMemo(
    () => unionPorteTiersForServiceSelection(serviceIdsForPorteUnion, serviceTypes),
    [serviceIdsForPorteUnion, serviceTypes],
  );

  const unionPricingCoatTypes = useMemo(
    () => unionCoatTypesForServiceSelection(serviceIdsForPorteUnion, serviceTypes),
    [serviceIdsForPorteUnion, serviceTypes],
  );

  useEffect(() => {
    if (!pricingApptPorteTier) return;
    if (!unionPricingTiers.some((x) => x === pricingApptPorteTier)) {
      setPricingApptPorteTier('');
    }
  }, [unionPricingTiers, pricingApptPorteTier]);

  useEffect(() => {
    if (!pricingApptCoatType) return;
    if (!unionPricingCoatTypes.some((x) => x === pricingApptCoatType)) {
      setPricingApptCoatType('');
    }
  }, [unionPricingCoatTypes, pricingApptCoatType]);

  const petBodyTierForPricing = useMemo(() => {
    const st = selectedPet?.size_tier;
    if (st && PET_BODY_PORTE_VALUES.includes(st as PetBodyPorteValue)) return st;
    return 'medio';
  }, [selectedPet]);

  /** Adicionais não vêm em `serviceTypes` (lista exclui `is_addon`); incluir para precificar o resumo. */
  const serviceTypesForPricing = useMemo(() => {
    const merged = new Map(serviceTypes.map((st) => [st.id, st]));
    for (const addon of availableAddons) merged.set(addon.id, addon);
    return [...merged.values()];
  }, [serviceTypes, availableAddons]);

  const pricingPreview = useMemo(
    () =>
      buildAgendaPricingPreview({
        mainServices: [
          ...services.map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            name: s.name,
            pricing_variant: s.pricing_variant,
            isAddon: false as const,
          })),
          ...selectedAddons.map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            name: s.name,
            pricing_variant: s.pricing_variant,
            isAddon: true as const,
          })),
        ],
        extraServices: extraBlocks.flatMap((b) =>
          b.services.map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            name: s.name,
            pricing_variant: s.pricing_variant,
          })),
        ),
        serviceTypes: serviceTypesForPricing,
        petSizeTier: petBodyTierForPricing,
        petBirthDate: selectedPet?.birth_date ?? null,
        petCoatType: selectedPet?.coat_type ?? null,
        appointmentDateYmd: dateYmd,
        puppyMaxMonths,
        appointmentOverrideTier: pricingApptPorteTier.trim() || null,
        appointmentOverrideCoatType: pricingApptCoatType.trim() || null,
      }),
    [
      services,
      selectedAddons,
      extraBlocks,
      serviceTypesForPricing,
      petBodyTierForPricing,
      selectedPet?.birth_date,
      selectedPet?.coat_type,
      dateYmd,
      puppyMaxMonths,
      pricingApptPorteTier,
      pricingApptCoatType,
    ],
  );

  const pickupPricingPreview = useMemo(() => {
    if (!withPickup || !pickupLtServiceTypeId.trim()) return null;
    const st = serviceTypes.find((s) => s.id === pickupLtServiceTypeId.trim());
    if (!st) return null;
    const band = previewLevaTrazBandPricing(st, pickupKmTierIndex);
    return { band, saleRoundTrip: band.saleRoundTrip, costRoundTrip: band.costRoundTrip };
  }, [withPickup, pickupLtServiceTypeId, pickupKmTierIndex, serviceTypes]);

  const pricingTierComboOptions = useMemo<HubComboboxOption[]>(() => {
    const auto: HubComboboxOption = { value: '', label: 'Automático (idade + porte do pet)' };
    return [auto, ...unionPricingTiers.map((t) => ({ value: t, label: PORTE_LABELS[t] }))];
  }, [unionPricingTiers]);

  const pricingCoatComboOptions = useMemo<HubComboboxOption[]>(() => {
    const auto: HubComboboxOption = { value: '', label: 'Automático (pelagem do pet)' };
    return [auto, ...unionPricingCoatTypes.map((t) => ({ value: t, label: COAT_TYPE_LABELS[t] }))];
  }, [unionPricingCoatTypes]);

  const needsManualCoatType = pricingPreview.lines.some((ln) => ln.needsCoatType);

  const showPricingOverrides = unionPricingTiers.length > 0 || unionPricingCoatTypes.length > 0;

  const appointmentPricingFields = showPricingOverrides ? (
    <div className="nam-section nam-section--pricing-overrides">
      <div className="nam-row nam-row--cols2">
        {unionPricingTiers.length > 0 ? (
          <div className="nam-field">
            <label className="nam-label">Preço por porte (este agendamento)</label>
            <HubSearchableCombobox
              id="nam-pricing-porte"
              options={pricingTierComboOptions}
              value={pricingApptPorteTier}
              onChange={setPricingApptPorteTier}
              placeholder="Automático"
              clearable={false}
            />
            <p className="nam-muted" style={{ marginTop: 6, fontSize: 12 }}>
              Limite de idade para filhote nesta clínica: {puppyMaxMonths} meses (face à data do agendamento).
            </p>
          </div>
        ) : null}
        {unionPricingCoatTypes.length > 0 ? (
          <div className="nam-field">
            <label className="nam-label">Preço por pelagem (este agendamento)</label>
            <HubSearchableCombobox
              id="nam-pricing-coat"
              options={pricingCoatComboOptions}
              value={pricingApptCoatType}
              onChange={setPricingApptCoatType}
              placeholder="Automático"
              clearable={false}
            />
            {needsManualCoatType ? (
              <p className="nam-footer-error" style={{ marginTop: 6 }}>
                <AlertCircle size={14} /> Pelagem obrigatória para os serviços selecionados.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  const statusComboOptions = useMemo<HubComboboxOption[]>(
    () =>
      Object.entries(STATUS_META).map(([v, m]) => ({ value: v, label: m.label })),
    [],
  );

  // ── Service chips ─────────────────────────────────────────────────────────
  const addService = useCallback(
    (id: string) => {
      if (!id) return;
      const st = serviceTypes.find((s) => s.id === id);
      if (!st) return;
      if (services.some((s) => s.hub_service_type_id === id)) {
        setServiceSearchId('');
        return;
      }
      const matrix = coercePricingMatrixFromApi(st.pricing_matrix);
      const pricing_variant =
        matrix && matrixNeedsVariantChoice(matrix) ? defaultPricingVariantForMatrix(matrix) : null;
      setServices((prev) => [
        ...prev,
        {
          hub_service_type_id: id,
          name: st.name,
          duration_minutes: st.default_duration_minutes ?? 60,
          pricing_variant,
        },
      ]);
      setServiceSearchId('');
    },
    [serviceTypes, services],
  );

  const removeService = (idx: number) => setServices((prev) => prev.filter((_, i) => i !== idx));
  const updateServiceDuration = (idx: number, dur: number) =>
    setServices((prev) => prev.map((s, i) => (i === idx ? { ...s, duration_minutes: dur } : s)));

  const updateServicePricingVariant = (idx: number, variant: HubQuotePricingVariant | null) =>
    setServices((prev) => prev.map((s, i) => (i === idx ? { ...s, pricing_variant: variant } : s)));

  useEffect(() => {
    if (!open || !clinicId || !mainServiceIdsSignature) {
      setAvailableAddons([]);
      return;
    }
    let cancelled = false;
    const serviceIds = mainServiceIdsSignature.split('|').filter(Boolean);
    const timer = window.setTimeout(() => {
      setAddonsLoading(true);
      void (async () => {
        try {
          const results = await Promise.all(
            serviceIds.map((id) => hubServiceAddonsApi.getAvailableAddons(id, clinicId)),
          );
          const byId = new Map<string, HubServiceType>();
          for (const res of results) {
            for (const a of res.addons ?? []) {
              if (!byId.has(a.id)) byId.set(a.id, a);
            }
          }
          if (!cancelled) setAvailableAddons([...byId.values()]);
        } catch {
          if (!cancelled) setAvailableAddons([]);
        } finally {
          if (!cancelled) setAddonsLoading(false);
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, clinicId, mainServiceIdsSignature]);

  useEffect(() => {
    const allowed = new Set(availableAddons.map((a) => a.id));
    setSelectedAddons((prev) => prev.filter((s) => allowed.has(s.hub_service_type_id)));
  }, [availableAddons]);

  const toggleAddon = useCallback(
    (addon: HubServiceType) => {
      setSelectedAddons((prev) => {
        if (prev.some((s) => s.hub_service_type_id === addon.id)) {
          return prev.filter((s) => s.hub_service_type_id !== addon.id);
        }
        const matrix = coercePricingMatrixFromApi(addon.pricing_matrix);
        const pricing_variant =
          matrix && matrixNeedsVariantChoice(matrix) ? defaultPricingVariantForMatrix(matrix) : null;
        return [
          ...prev,
          {
            hub_service_type_id: addon.id,
            name: addon.name,
            duration_minutes: addon.default_duration_minutes ?? 15,
            pricing_variant,
          },
        ];
      });
    },
    []
  );

  const updateAddonPricingVariant = (addonId: string, variant: HubQuotePricingVariant | null) =>
    setSelectedAddons((prev) =>
      prev.map((s) => (s.hub_service_type_id === addonId ? { ...s, pricing_variant: variant } : s))
    );

  const servicesNeedingVariant = useMemo(() => {
    return services
      .map((s, idx) => {
        const st = serviceTypes.find((x) => x.id === s.hub_service_type_id);
        const matrix = st ? coercePricingMatrixFromApi(st.pricing_matrix) : null;
        if (!matrix || !matrixNeedsVariantChoice(matrix)) return null;
        return { idx, service: s, st, matrix };
      })
      .filter(Boolean) as Array<{
      idx: number;
      service: ServiceChip;
      st: HubServiceType;
      matrix: NonNullable<ReturnType<typeof coercePricingMatrixFromApi>>;
    }>;
  }, [services, serviceTypes]);

  // ── Extra blocks ──────────────────────────────────────────────────────────
  const addExtraBlock = () =>
    setExtraBlocks((prev) => {
      const collapsed = prev.map((b) => ({ ...b, expanded: false }));
      return [
        ...collapsed,
        {
          key: String(Date.now()),
          expanded: true,
          block_title: '',
          block_description: '',
          block_description_user_edited: false,
          group_filter: groupFilter,
          services: [],
          starts_hm: endsHm,
          ends_hm: addMinutes(endsHm, 60),
          hub_staff_member_id: staffId,
          resource_label: resourceLabel,
        },
      ];
    });
  const removeExtraBlock = (key: string) => setExtraBlocks((prev) => prev.filter((b) => b.key !== key));

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!clinicId) return;
    if (services.length === 0) {
      setSaveError('Selecione pelo menos um serviço.');
      return;
    }
    if (!dateYmd) {
      setSaveError('Informe a data do agendamento.');
      return;
    }
    if (!guardianId) {
      setSaveError('Selecione o tutor.');
      return;
    }
    if (!petId) {
      setSaveError('Selecione o pet.');
      return;
    }
    if (isClinicalRoutine) {
      if (mainBlockNotes.length > 1000) {
        setSaveError('Queixa principal: no máximo 1000 caracteres.');
        return;
      }
      if (intakeCaseMode === 'existing' && intakeActiveCases.length > 0 && !intakeSelectedCaseId) {
        setSaveError('Selecione o caso clínico.');
        return;
      }
    }

    const tierErr = validateAppointmentPorteOverride(
      pricingApptPorteTier.trim() || null,
      serviceIdsForPorteUnion,
      serviceTypes,
    );
    if (tierErr) {
      setSaveError(tierErr);
      return;
    }
    const coatErr = validateAppointmentCoatOverride(
      pricingApptCoatType.trim() || null,
      serviceIdsForPorteUnion,
      serviceTypes,
    );
    if (coatErr) {
      setSaveError(coatErr);
      return;
    }
    if (needsManualCoatType) {
      setSaveError('Selecione a pelagem para precificar os serviços escolhidos.');
      return;
    }
    const addonVariantErr = validateSelectedAddonVariants(selectedAddons, availableAddons, serviceTypes);
    if (!isClinicalRoutine && addonVariantErr) {
      setSaveError(addonVariantErr);
      return;
    }
    if (!isClinicalRoutine && withPickup) {
      if (!pickupLtServiceTypeId.trim()) {
        setSaveError('Leva e Traz: selecione o tipo de serviço de transporte.');
        return;
      }
      if (levaTrazServiceTypes.length === 0) {
        setSaveError('Não há tipos de serviço «Leva e Traz» configurados na clínica.');
        return;
      }
    }

    setSaving(true);
    setSaveError(null);
    setConflicts([]);

    try {
      const startsAt = toIsoTs(dateYmd, startsHm);
      const endsAt = toEndIsoTs(dateYmd, startsHm, endsHm);

      let lastServiceEndAt = endsAt;
      const resolvedExtraBlocks = extraBlocks
        .filter((b) => b.services.length > 0)
        .map((b) => {
          const blockStart = toIsoTsOnOrAfter(dateYmd, b.starts_hm, lastServiceEndAt);
          const blockEnd = toEndIsoTs(blockStart.slice(0, 10), b.starts_hm, b.ends_hm);
          lastServiceEndAt = blockEnd;
          return { block: b, blockStart, blockEnd };
        });

      const payload: CreateHubAppointmentPayload = {
        clinic_id: clinicId,
        hub_service_type_id: services[0]!.hub_service_type_id,
        starts_at: startsAt,
        ends_at: endsAt,
        status: status as HubAppointmentStatus,
        hub_staff_member_id: staffId || null,
        pet_id: petId || null,
        guardian_id: guardianId || null,
        resource_label: resourceLabel || null,
        title: title || null,
        description: null,
        notes: mainBlockNotes.trim() || null,
        financial_notes: financialNotes.trim() || null,
        pricing_porte_tier: pricingApptPorteTier.trim() || null,
        pricing_coat_type: pricingApptCoatType.trim() || null,
        services: [...services, ...selectedAddons].map((s) => ({
          hub_service_type_id: s.hub_service_type_id,
          duration_minutes: s.duration_minutes,
          pricing_variant: s.pricing_variant ?? undefined,
        })),
      };

      if (isClinicalRoutine) {
        if (intakeCaseMode === 'existing' && intakeSelectedCaseId) {
          payload.intake_hub_case_id = intakeSelectedCaseId;
        } else if (intakeCaseMode === 'new') {
          payload.intake_create_new_case = true;
          const nt = intakeNewCaseTitle.trim();
          if (nt) payload.intake_new_case_title = nt;
        }
      }

      if (withPickup) {
        payload.with_pickup_route_before = {
          starts_at: toIsoTs(dateYmd, pickupBefore.starts_hm),
          ends_at: toEndIsoTs(dateYmd, pickupBefore.starts_hm, pickupBefore.ends_hm),
          hub_staff_member_id: pickupBefore.hub_staff_member_id || null,
          resource_label: pickupBefore.resource_label || null,
        };
        const pickupAfterStart = toIsoTsOnOrAfter(dateYmd, pickupAfter.starts_hm, lastServiceEndAt);
        payload.with_pickup_route_after = {
          starts_at: pickupAfterStart,
          ends_at: toEndIsoTs(pickupAfterStart.slice(0, 10), pickupAfter.starts_hm, pickupAfter.ends_hm),
          hub_staff_member_id: pickupAfter.hub_staff_member_id || null,
          resource_label: pickupAfter.resource_label || null,
        };
        payload.pickup_route_pricing = {
          hub_service_type_id: pickupLtServiceTypeId.trim(),
          pricing_variant: { km_tier_index: pickupKmTierIndex },
        };
      }

      if (resolvedExtraBlocks.length > 0) {
        payload.extra_blocks = resolvedExtraBlocks.map(({ block: b, blockStart, blockEnd }) => ({
          starts_at: blockStart,
          ends_at: blockEnd,
          services: b.services.map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            duration_minutes: s.duration_minutes,
            pricing_variant: s.pricing_variant ?? undefined,
          })),
          hub_staff_member_id: b.hub_staff_member_id || null,
          resource_label: b.resource_label || null,
          title: b.block_title.trim() || null,
          notes: b.block_description.trim() || null,
        }));
      }

      if (withRecurrence) {
        const rule: HubAppointmentRecurrenceRule = {
          kind: recurrence.kind,
          interval_value: recurrence.interval_value,
          days_of_week: recurrence.kind === 'weekly' && recurrence.days_of_week.length > 0 ? recurrence.days_of_week : undefined,
          day_of_month: recurrence.kind === 'monthly' ? new Date(startsAt).getDate() : undefined,
        };
        if (recurrence.end_kind === 'until' && recurrence.until_date) {
          rule.until_date = recurrence.until_date;
        } else {
          rule.occurrences = recurrence.occurrences;
        }
        payload.recurrence = rule;
      }

      const result = await hubAgendaApi.create(payload);

      if (result.conflicts && result.conflicts.length > 0) {
        setConflicts(result.conflicts);
      }

      resetForm();
      onClose();
      onCreated(result);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? 'Erro ao criar agendamento';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setServices([]);
    setGuardianId('');
    setPetId('');
    setPetName('');
    setTitle('');
    setMainBlockNotes('');
    setMainBlockNotesUserEdited(false);
    setMainBlockExpanded(true);
    setFinancialNotes('');
    setTitleOverridden(false);
    setWithRecurrence(false);
    setRecurrence({ ...DEFAULT_RECURRENCE });
    setWithPickup(false);
    setPickupLtServiceTypeId('');
    setPickupKmTierIndex(0);
    ltReturnDriverUnlinkedRef.current = false;
    lastMainBlockServiceSigRef.current = '';
    lastExtraBlockServiceSigRef.current = {};
    setPickupBefore({
      starts_hm: '08:00',
      ends_hm: addMinutes('08:00', PICKUP_ROUTE_LEG_DURATION_MIN),
      hub_staff_member_id: '',
      resource_label: '',
    });
    setPickupAfter({
      starts_hm: '11:00',
      ends_hm: addMinutes('11:00', PICKUP_ROUTE_LEG_DURATION_MIN),
      hub_staff_member_id: '',
      resource_label: '',
    });
    setExtraBlocks([]);
    setSaveError(null);
    setConflicts([]);
    setResourceLabel('');
    setStatus('confirmed');
    setPricingApptPorteTier('');
    setPricingApptCoatType('');
    setSelectedAddons([]);
    setAvailableAddons([]);
    setAddonsLoading(false);
    setIntakeActiveCases([]);
    setIntakeCasesLoading(false);
    setIntakeCaseMode('new');
    setIntakeSelectedCaseId('');
    setIntakeNewCaseTitle('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const clinicalRoutinePrimaryId = services[0]?.hub_service_type_id ?? '';
  const canSaveDefault =
    Boolean(clinicId) &&
    services.length > 0 &&
    Boolean(guardianId) &&
    Boolean(petId) &&
    Boolean(dateYmd);
  const canSaveClinicalRoutine =
    canSaveDefault &&
    Boolean(staffId) &&
    !intakeCasesLoading &&
    !(intakeCaseMode === 'existing' && intakeActiveCases.length > 0 && !intakeSelectedCaseId);

  // ── Aside summary ─────────────────────────────────────────────────────────
  const asideContent = (
    <div className="nam-aside">
      <p className="nam-aside__label">Resumo</p>

      {(services.length > 0 || extraBlocks.some((b) => b.services.length > 0)) && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Blocos no dia</p>
          {services.length > 0 ? (
            <p className="nam-aside__item">
              {(() => {
                const pt = title.trim() || autoTitle || '—';
                return `Principal: ${pt.length > 48 ? `${pt.slice(0, 48)}…` : pt} · ${startsHm}–${endsHm} · ${totalDurationMin}min`;
              })()}
            </p>
          ) : null}
          {extraBlocks
            .filter((b) => b.services.length > 0)
            .map((b, i) => (
              <p key={b.key} className="nam-aside__item">
                Bloco {i + 2}: {(b.block_title || 'Sem título').slice(0, 40)} · {b.starts_hm}–{b.ends_hm} ·{' '}
                {b.services.reduce((s, c) => s + c.duration_minutes, 0)}min
              </p>
            ))}
          <div className="nam-aside__total">
            <span>Total duração</span>
            <strong>{totalDurationAllBlocks}min</strong>
          </div>
        </div>
      )}

      <div className="nam-aside__section">
        <p className="nam-aside__section-title">Notas para o financeiro</p>
        <textarea
          className="nam-aside__textarea"
          rows={4}
          maxLength={4000}
          placeholder="Ex.: desconto combinado com o tutor, ajustar valor manualmente na nota."
          value={financialNotes}
          onChange={(e) => setFinancialNotes(e.target.value)}
        />
      </div>

      {petName && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Pet</p>
          <p className="nam-aside__item">{petName}</p>
          {selectedPet ? (
            <>
              <p className="nam-aside__muted">
                Porte (cadastro): {PORTE_LABELS[petBodyTierForPricing as PetBodyPorteValue]}
              </p>
              <p className="nam-aside__muted">
                Pelagem:{' '}
                {selectedPet.coat_type && COAT_TYPE_LABELS[selectedPet.coat_type as CoatTypeValue]
                  ? COAT_TYPE_LABELS[selectedPet.coat_type as CoatTypeValue]
                  : 'não informada'}
              </p>
            </>
          ) : null}
          {guardianName ? <p className="nam-aside__muted">{guardianName}</p> : null}
        </div>
      )}

      {(pricingPreview.lines.length > 0 || pickupPricingPreview) && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Preços (estimativa)</p>
          <p className="nam-aside__muted" style={{ fontSize: 12, marginBottom: 6 }}>
            {pricingApptPorteTier.trim()
              ? `Override: ${PORTE_LABELS[pricingApptPorteTier.trim() as PorteValue] ?? pricingApptPorteTier}`
              : 'Automático (idade + porte)'}
            {pricingApptCoatType.trim()
              ? ` · Pelagem: ${COAT_TYPE_LABELS[pricingApptCoatType.trim() as CoatTypeValue] ?? pricingApptCoatType}`
              : ''}
          </p>
          {pricingPreview.lines.map((ln, i) => (
            <div
              key={`${ln.hub_service_type_id}-${ln.name}-${i}`}
              className={ln.isAddon ? 'nam-aside__row nam-aside__row--addon' : 'nam-aside__row'}
            >
              <span className="nam-aside__item">{ln.isAddon ? `Adicional: ${ln.name}` : ln.name}</span>
              <span className="nam-aside__muted">
                {ln.isAddon
                  ? ln.sale.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                  : (
                      <>
                        {ln.tierApplied ? PORTE_LABELS[ln.tierApplied as PorteValue] ?? ln.tierApplied : '—'}
                        {ln.coatTypeApplied
                          ? ` / ${COAT_TYPE_LABELS[ln.coatTypeApplied as CoatTypeValue] ?? ln.coatTypeApplied}`
                          : ''}
                        {ln.needsCoatType ? ' / selecione pelagem' : ''} ·{' '}
                        {ln.sale.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </>
                    )}
              </span>
            </div>
          ))}
          {pickupPricingPreview ? (
            <div className="nam-aside__row">
              <span className="nam-aside__item">Leva e Traz total ({pickupPricingPreview.band.bandLabel})</span>
              <span className="nam-aside__muted">
                {pickupPricingPreview.saleRoundTrip.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          ) : null}
          <div className="nam-aside__total">
            <span>Total venda</span>
            <strong>
              {(pricingPreview.totalSale + (pickupPricingPreview?.saleRoundTrip ?? 0)).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </strong>
          </div>
        </div>
      )}

      {dateYmd && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Horário</p>
          <p className="nam-aside__item">{dateYmd.split('-').reverse().join('/')}</p>
          <p className="nam-aside__muted">{startsHm} – {endsHm}</p>
        </div>
      )}

      {withRecurrence && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Repetição</p>
          <p className="nam-aside__item">
            {recurrence.kind === 'daily' ? 'Diária' : recurrence.kind === 'weekly' ? 'Semanal' : 'Mensal'}
            {recurrence.interval_value > 1 ? ` a cada ${recurrence.interval_value}` : ''}
          </p>
          {recurrence.end_kind === 'occurrences'
            ? <p className="nam-aside__muted">{recurrence.occurrences} ocorrências</p>
            : <p className="nam-aside__muted">até {recurrence.until_date}</p>}
        </div>
      )}

      {withPickup && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Leva e Traz</p>
          {pickupPricingPreview ? (
            <p className="nam-aside__muted">{pickupPricingPreview.band.bandLabel}</p>
          ) : null}
          <p className="nam-aside__item">Busca {pickupBefore.starts_hm} – {pickupBefore.ends_hm}</p>
          <p className="nam-aside__item">Retorno {pickupAfter.starts_hm} – {pickupAfter.ends_hm}</p>
        </div>
      )}

    </div>
  );

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = (
    <>
      {saveError && (
        <span className="nam-footer-error">
          <AlertCircle size={14} /> {saveError}
        </span>
      )}
      <HubCancelButton onClick={handleClose} disabled={saving} />
      <button className="hub-btn hub-btn--primary" type="button" onClick={handleSave} disabled={saving || !canSaveDefault}>
        {saving ? 'Salvando…' : withRecurrence ? 'Criar série' : 'Criar agendamento'}
      </button>
    </>
  );

  if (isClinicalRoutine) {
    return (
      <HubSidePanel
        open={open}
        onClose={handleClose}
        title="Agendar consulta de rotina"
        titleIcon={<Stethoscope size={22} strokeWidth={2} aria-hidden />}
        subtitle="Consulta planejada e não urgente."
        footer={
          <>
            {saveError ? (
              <span className="nam-footer-error">
                <AlertCircle size={14} /> {saveError}
              </span>
            ) : null}
            <HubCancelButton onClick={handleClose} disabled={saving} />
            <button
              className="hub-btn hub-btn--primary nam-intake-footer-primary"
              type="button"
              onClick={handleSave}
              disabled={saving || !canSaveClinicalRoutine}
            >
              {saving ? (
                'Salvando…'
              ) : (
                <>
                  <CalendarPlus size={18} strokeWidth={2} aria-hidden />
                  Agendar consulta
                </>
              )}
            </button>
          </>
        }
      >
        <div className="nam-form">
          <div className="nam-section nam-section--quick">
            <div className="nam-quick-card">
              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <label className="nam-label" htmlFor="nam-cr-guardian">
                    Tutor
                  </label>
                  {guardiansLoading ? (
                    <div className="nam-field-shell nam-field-shell--waiting" aria-busy="true">
                      <span className="nam-field-shell__icon">
                        <Loader2 size={18} strokeWidth={2} className="nam-field-shell__spin" aria-hidden />
                      </span>
                      <span className="nam-field-shell__text">Carregando tutores…</span>
                    </div>
                  ) : (
                    <HubSearchableCombobox
                      id="nam-cr-guardian"
                      options={guardianOptions}
                      value={guardianId}
                      onChange={(v) => {
                        setGuardianId(v);
                        setGuardianName(guardianOptions.find((o) => o.value === v)?.label ?? '');
                      }}
                      placeholder="Buscar tutor…"
                      triggerIcon={<User size={18} strokeWidth={2} aria-hidden />}
                      ariaLabel="Selecionar tutor"
                    />
                  )}
                </div>
                <div className="nam-field">
                  <label className="nam-label" htmlFor={guardianId ? 'nam-cr-pet' : undefined}>
                    Pet
                  </label>
                  {guardianId ? (
                    petComboOptions.length > 0 ? (
                      <HubSearchableCombobox
                        id="nam-cr-pet"
                        options={petComboOptions}
                        value={petId}
                        onChange={(v) => {
                          setPetId(v);
                          const p = guardianPets.find((x) => x.id === v);
                          setPetName(p?.name ?? '');
                        }}
                        placeholder="Selecionar pet…"
                        triggerIcon={<Dog size={18} strokeWidth={2} aria-hidden />}
                        ariaLabel="Selecionar pet"
                      />
                    ) : (
                      <div className="nam-field-shell nam-field-shell--empty" role="status">
                        <span className="nam-field-shell__icon" aria-hidden>
                          <Dog size={18} strokeWidth={2} />
                        </span>
                        <span className="nam-field-shell__text">Nenhum pet cadastrado</span>
                      </div>
                    )
                  ) : (
                    <div className="nam-field-shell nam-field-shell--blocked" role="status">
                      <span className="nam-field-shell__icon" aria-hidden>
                        <Dog size={18} strokeWidth={2} />
                      </span>
                      <span className="nam-field-shell__text">Selecione um tutor primeiro</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <HubDateField
                    id="nam-cr-date"
                    label="Data da consulta"
                    valueIso={dateYmd}
                    onChangeIso={setDateYmd}
                    showTodayButton
                  />
                </div>
                <div className="nam-field">
                  <label className="nam-label" htmlFor="nam-cr-time">
                    Horário
                  </label>
                  <div className="nam-intake-time-row">
                    <span className="nam-intake-time-row__icon" aria-hidden>
                      <Clock size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="nam-cr-time"
                      className="nam-input nam-intake-time-row__input"
                      type="time"
                      value={startsHm}
                      onChange={(e) => setStartsHm(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <label className="nam-label" htmlFor="nam-cr-svc">
                    Serviço (Clínica, Internação ou Cirurgia)
                  </label>
                  {clinicalRoutineServiceOptions.length === 0 ? (
                    <p className="nam-muted">
                      Nenhum tipo de serviço ativo nessas áreas. Configure em Serviços (grupos Clínica, Internação ou
                      Cirurgia).
                    </p>
                  ) : (
                    <HubSearchableCombobox
                      id="nam-cr-svc"
                      className="hub-combobox--clientes"
                      options={clinicalRoutineServiceOptions}
                      value={clinicalRoutinePrimaryId}
                      onChange={(v) => setClinicalRoutinePrimaryService(v)}
                      placeholder="Selecionar serviço…"
                      triggerIcon={<Stethoscope size={18} strokeWidth={2} aria-hidden />}
                      ariaLabel="Selecionar serviço clínico"
                      clearable={false}
                    />
                  )}
                </div>
                <div className="nam-field">
                  <label className="nam-label" htmlFor="nam-cr-staff">
                    Profissional
                  </label>
                  <HubSearchableCombobox
                    id="nam-cr-staff"
                    className="hub-combobox--clientes"
                    options={staffComboOptions.filter((o) => o.value !== '')}
                    value={staffId}
                    onChange={setStaffId}
                    placeholder="Selecionar…"
                    triggerIcon={<User size={18} strokeWidth={2} aria-hidden />}
                    ariaLabel="Selecionar profissional"
                    clearable={false}
                  />
                </div>
              </div>

              <div className="nam-field">
                <label className="nam-label" htmlFor="nam-cr-complaint">
                  Queixa principal
                </label>
                <textarea
                  id="nam-cr-complaint"
                  className="nam-textarea"
                  rows={4}
                  maxLength={1000}
                  value={mainBlockNotes}
                  onChange={(e) => {
                    setMainBlockNotes(e.target.value);
                    setMainBlockNotesUserEdited(true);
                  }}
                  placeholder="Descreva brevemente o motivo da consulta…"
                />
                <p className="nam-char-count">{mainBlockNotes.length}/1000</p>
                <p className="nam-muted" style={{ marginTop: 6 }}>
                  Descreva brevemente o motivo da consulta.
                </p>
              </div>

              {petId ? (
                <div className="nam-intake-case-box">
                  <div className="nam-intake-callout nam-intake-callout--info">
                    <Info size={18} strokeWidth={2} className="nam-intake-callout__icon" aria-hidden />
                    <p>
                      Para consultas de rotina, você pode criar um novo caso ou vincular a um caso já existente.
                    </p>
                  </div>
                  <p className="nam-label nam-intake-case-box__heading">Caso clínico</p>
                  {intakeCasesLoading ? (
                    <p className="nam-muted">Verificando casos ativos…</p>
                  ) : (
                    <>
                      <div className="nam-intake-choice-grid">
                        <button
                          type="button"
                          className={`nam-intake-choice-card${intakeCaseMode === 'new' ? ' nam-intake-choice-card--selected' : ''}`}
                          onClick={() => setIntakeCaseMode('new')}
                        >
                          <span className="nam-intake-choice-card__radio" aria-hidden />
                          <FolderPlus size={22} strokeWidth={2} className="nam-intake-choice-card__glyph" aria-hidden />
                          <span className="nam-intake-choice-card__text">
                            <span className="nam-intake-choice-card__title">Criar novo caso</span>
                            <span className="nam-intake-choice-card__desc">
                              Iniciar um novo episódio de cuidado para esta consulta de rotina.
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`nam-intake-choice-card${intakeCaseMode === 'existing' ? ' nam-intake-choice-card--selected' : ''}`}
                          onClick={() => setIntakeCaseMode('existing')}
                          disabled={intakeActiveCases.length === 0}
                        >
                          <span className="nam-intake-choice-card__radio" aria-hidden />
                          <Folder size={22} strokeWidth={2} className="nam-intake-choice-card__glyph" aria-hidden />
                          <span className="nam-intake-choice-card__text">
                            <span className="nam-intake-choice-card__title">Associar a caso existente</span>
                            <span className="nam-intake-choice-card__desc">
                              Vincular esta consulta a um caso clínico já aberto.
                            </span>
                          </span>
                        </button>
                      </div>

                      {intakeCaseMode === 'new' ? (
                        <div className="nam-intake-new-case-panel">
                          <div className="nam-intake-new-case-badge">
                            <CheckCircle2 size={16} strokeWidth={2} aria-hidden />
                            Novo caso será criado
                          </div>
                          <div className="nam-field" style={{ marginTop: 12 }}>
                            <label className="nam-label" htmlFor="nam-cr-case-title">
                              Título do caso
                            </label>
                            <input
                              id="nam-cr-case-title"
                              className="nam-input"
                              type="text"
                              value={intakeNewCaseTitle}
                              onChange={(e) => setIntakeNewCaseTitle(e.target.value)}
                              maxLength={240}
                              placeholder="Ex.: Consulta de rotina — pet"
                            />
                            <p className="nam-muted" style={{ marginTop: 6 }}>
                              Sugestão baseada na data e tipo de atendimento. Você poderá editar depois.
                            </p>
                          </div>
                        </div>
                      ) : null}

                      {intakeCaseMode === 'existing' && intakeActiveCases.length > 0 ? (
                        <div className="nam-field" style={{ marginTop: 12 }}>
                          <label className="nam-label" htmlFor="nam-cr-case-pick">
                            Selecione o caso
                          </label>
                          <HubSearchableCombobox
                            id="nam-cr-case-pick"
                            className="hub-combobox--clientes"
                            options={intakeCaseComboOptions}
                            value={intakeSelectedCaseId}
                            onChange={setIntakeSelectedCaseId}
                            placeholder="Selecionar caso…"
                            ariaLabel="Selecionar caso clínico"
                            clearable={false}
                          />
                          <p className="nam-muted" style={{ marginTop: 6 }}>
                            Caso selecionado em status <strong>ativo</strong>.
                          </p>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </HubSidePanel>
    );
  }

  return (
    <HubSidePanel
      open={open}
      onClose={handleClose}
      title="Novo agendamento"
      titleIcon={<Calendar size={22} strokeWidth={2} aria-hidden />}
      subtitle={title || autoTitle || undefined}
      footer={footer}
      aside={asideContent}
    >
      <div className="nam-form">
        <div className="nam-section nam-section--quick">
          <div className="nam-quick-card">
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <HubDateField id="nam-date" label="Data" valueIso={dateYmd} onChangeIso={setDateYmd} />
              </div>
              <div className="nam-field">
                <label className="nam-label" htmlFor="nam-status">
                  Situação
                </label>
                <HubSearchableCombobox
                  id="nam-status"
                  options={statusComboOptions}
                  value={status}
                  onChange={(v) => setStatus(v as AgendaStatus)}
                  clearable={false}
                />
              </div>
            </div>
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <label className="nam-label" htmlFor="nam-guardian">
                  Tutor
                </label>
                {guardiansLoading ? (
                  <div className="nam-field-shell nam-field-shell--waiting" aria-busy="true">
                    <span className="nam-field-shell__icon">
                      <Loader2 size={18} strokeWidth={2} className="nam-field-shell__spin" aria-hidden />
                    </span>
                    <span className="nam-field-shell__text">Carregando tutores…</span>
                  </div>
                ) : (
                  <HubSearchableCombobox
                    id="nam-guardian"
                    options={guardianOptions}
                    value={guardianId}
                    onChange={(v) => {
                      setGuardianId(v);
                      setGuardianName(guardianOptions.find((o) => o.value === v)?.label ?? '');
                    }}
                    placeholder="Buscar tutor…"
                    triggerIcon={<User size={18} strokeWidth={2} aria-hidden />}
                    ariaLabel="Selecionar tutor"
                  />
                )}
              </div>
              <div className="nam-field">
                <label className="nam-label" htmlFor={guardianId ? 'nam-pet' : undefined}>
                  Pet
                </label>
                {guardianId ? (
                  petComboOptions.length > 0 ? (
                    <HubSearchableCombobox
                      id="nam-pet"
                      options={petComboOptions}
                      value={petId}
                      onChange={(v) => {
                        setPetId(v);
                        const p = guardianPets.find((x) => x.id === v);
                        setPetName(p?.name ?? '');
                      }}
                      placeholder="Selecionar pet…"
                      triggerIcon={<Dog size={18} strokeWidth={2} aria-hidden />}
                      ariaLabel="Selecionar pet"
                    />
                  ) : (
                    <div className="nam-field-shell nam-field-shell--empty" role="status">
                      <span className="nam-field-shell__icon" aria-hidden>
                        <Dog size={18} strokeWidth={2} />
                      </span>
                      <span className="nam-field-shell__text">Nenhum pet cadastrado</span>
                      <ChevronDown size={18} strokeWidth={2} className="nam-field-shell__chevron" aria-hidden />
                    </div>
                  )
                ) : (
                  <div className="nam-field-shell nam-field-shell--blocked" role="status">
                    <span className="nam-field-shell__icon" aria-hidden>
                      <Dog size={18} strokeWidth={2} />
                    </span>
                    <span className="nam-field-shell__text">Selecione um tutor primeiro</span>
                    <ChevronDown size={18} strokeWidth={2} className="nam-field-shell__chevron" aria-hidden />
                  </div>
                )}
              </div>
            </div>
            {petId && selectedPet ? (
              <div className="nam-quick-card__pet-info">
                <label className="nam-label">Dados do pet (cadastro)</label>
                <p className="nam-muted nam-quick-card__pet-line">
                  Porte: {PORTE_LABELS[petBodyTierForPricing as PetBodyPorteValue]}
                </p>
                <p className="nam-muted nam-quick-card__pet-line">
                  Pelagem:{' '}
                  {selectedPet.coat_type && COAT_TYPE_LABELS[selectedPet.coat_type as CoatTypeValue]
                    ? COAT_TYPE_LABELS[selectedPet.coat_type as CoatTypeValue]
                    : 'não informada'}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="nam-section nam-block-card">
          <BlockCardHeader
            blockNumber={1}
            title="Bloco principal"
            expanded={mainBlockExpanded}
            onToggle={() => setMainBlockExpanded((e) => !e)}
          />
          {mainBlockExpanded && (
            <div className="nam-block-card__body">
        {/* ── Grupo + Serviços ─────────────────────────────────────────── */}
        <div className="nam-section">
          <div className="nam-row nam-row--cols2">
            <div className="nam-field">
              <label className="nam-label">Grupo de serviço</label>
              <HubSearchableCombobox
                id="nam-group"
                options={groups}
                value={groupFilter}
                onChange={setGroupFilter}
                clearable={false}
                placeholder="Todos os grupos"
              />
            </div>
            <div className="nam-field">
              <label className="nam-label">Serviços</label>
              <HubSearchableCombobox
                id="nam-service-search"
                options={serviceComboOptions}
                value={serviceSearchId}
                onChange={addService}
                placeholder="Buscar e adicionar serviço…"
                clearable={false}
              />
            </div>
          </div>
          {services.length > 0 && (
            <div className="nam-chips">
              {services.map((chip, idx) => (
                <div key={chip.hub_service_type_id} className="nam-chip">
                  <GripVertical size={14} className="nam-chip__drag" />
                  <span className="nam-chip__name">{chip.name}</span>
                  <input
                    className="nam-chip__dur"
                    type="number"
                    min={1}
                    max={480}
                    value={chip.duration_minutes}
                    onChange={(e) => updateServiceDuration(idx, Number(e.target.value))}
                    aria-label="Duração em minutos"
                  />
                  <span className="nam-chip__unit">min</span>
                  <button className="nam-chip__remove" type="button" onClick={() => removeService(idx)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div className="nam-chips__duration-breakdown">
                Serviços: <strong>{servicesDurationMin} min</strong>
                {addonsDurationMin > 0 ? (
                  <>
                    {' '}
                    · Adicionais: <strong>{addonsDurationMin} min</strong>
                  </>
                ) : null}
                {' '}
                · Total: <strong>{totalDurationMin} min</strong>
              </div>
            </div>
          )}
          <AppointmentAddonsSection
            hasMainServices={services.length > 0}
            addonsLoading={addonsLoading}
            availableAddons={availableAddons}
            selectedAddons={selectedAddons}
            onToggle={toggleAddon}
            onVariantChange={updateAddonPricingVariant}
          />
          {servicesNeedingVariant.length > 0 && (
            <div className="nam-section nam-section--pricing-variants" style={{ marginTop: 12 }}>
              <p className="nam-label">Opção de preço por serviço</p>
              {servicesNeedingVariant.map(({ idx, service, matrix }) => (
                <div key={`${service.hub_service_type_id}-variant`} className="nam-field" style={{ marginTop: 8 }}>
                  <label className="nam-muted" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                    {service.name}
                  </label>
                  <HubSearchableCombobox
                    id={`nam-svc-variant-${idx}`}
                    options={variantComboboxOptionsForMatrix(matrix)}
                    value={variantToComboValue(matrix, service.pricing_variant ?? null)}
                    onChange={(raw) => {
                      const v = comboValueToVariant(matrix, raw);
                      updateServicePricingVariant(idx, v);
                    }}
                    clearable={false}
                    placeholder="Selecione a opção"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {appointmentPricingFields}

        <div className="nam-section">
          <label className="nam-label">Título do bloco</label>
          <div className="nam-title-row">
            <input
              className="nam-input"
              type="text"
              maxLength={200}
              placeholder={autoTitle || 'Título do agendamento…'}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleOverridden(true);
              }}
            />
            {titleOverridden && (
              <button
                className="nam-btn-icon"
                type="button"
                title="Restaurar sugestão automática"
                onClick={() => {
                  setTitleOverridden(false);
                  setTitle(autoTitle);
                }}
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="nam-section">
          <label className="nam-label">Descrição do bloco</label>
          <textarea
            className="nam-textarea"
            rows={3}
            maxLength={8000}
            placeholder="Preenchida automaticamente com as descrições dos serviços deste bloco; pode editar."
            value={mainBlockNotes}
            onChange={(e) => {
              setMainBlockNotes(e.target.value);
              setMainBlockNotesUserEdited(true);
            }}
          />
          <p className="nam-char-count">{mainBlockNotes.length}/8000</p>
        </div>

        {/* ── Horário do bloco principal ─────────────────────────────────── */}
        <div className="nam-section">
          <div className="nam-row nam-row--cols2">
            <div className="nam-field">
              <label className="nam-label">Início</label>
              <input
                className="nam-input"
                type="time"
                value={startsHm}
                onChange={(e) => setStartsHm(e.target.value)}
              />
            </div>
            <div className="nam-field">
              <label className="nam-label">Fim previsto</label>
              <input
                className="nam-input"
                type="time"
                value={endsHm}
                onChange={(e) => setEndsHm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ── 3 + 4. Profissional / Recurso ────────────────────────────── */}
        <div className="nam-section">
          <div className="nam-row nam-row--cols2">
            <div className="nam-field">
              <label className="nam-label">Profissional</label>
              <HubSearchableCombobox
                id="nam-staff"
                options={staffComboOptions}
                value={staffId}
                onChange={setStaffId}
                placeholder="Não atribuído"
                clearable={false}
              />
            </div>
            <div className="nam-field">
              <label className="nam-label">Recurso / Sala</label>
              <input
                className="nam-input"
                type="text"
                placeholder="Ex.: Mesa 1, Van…"
                value={resourceLabel}
                onChange={(e) => setResourceLabel(e.target.value)}
              />
            </div>
          </div>
        </div>
            </div>
          )}
        </div>

        {extraBlocks.length > 0 ? (
          <div className="nam-section nam-extra-blocks">
            {extraBlocks.map((block, bIdx) => (
              <ExtraBlockCard
                key={block.key}
                block={block}
                index={bIdx}
                groups={groups}
                staffComboOptions={staffComboOptions}
                serviceTypes={serviceTypes}
                onRemove={() => removeExtraBlock(block.key)}
                onChange={(updated) =>
                  setExtraBlocks((prev) => prev.map((b) => (b.key === block.key ? updated : b)))
                }
                onToggleExpand={() =>
                  setExtraBlocks((prev) =>
                    prev.map((b) => (b.key === block.key ? { ...b, expanded: !b.expanded } : b)),
                  )
                }
              />
            ))}
          </div>
        ) : null}

        <div className="nam-section">
          <button className="nam-btn-add-block" type="button" onClick={addExtraBlock}>
            <Plus size={14} /> Adicionar outro bloco no dia
          </button>
        </div>

        {/* ── 9. Repetição ─────────────────────────────────────────────── */}
        <div className="nam-section">
          <HubCheckbox
            className="nam-checkbox-label"
            checked={withRecurrence}
            onChange={setWithRecurrence}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <CalendarDays size={15} aria-hidden />
              Repetir agendamento
            </span>
          </HubCheckbox>

          {withRecurrence && (
            <div className="nam-recurrence">
              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <label className="nam-label">Frequência</label>
                  <select
                    className="nam-select"
                    value={recurrence.kind}
                    onChange={(e) =>
                      setRecurrence((r) => ({ ...r, kind: e.target.value as RecurrenceForm['kind'] }))
                    }
                  >
                    <option value="daily">Diária</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                </div>
                <div className="nam-field">
                  <label className="nam-label">A cada</label>
                  <input
                    className="nam-input"
                    type="number"
                    min={1}
                    max={12}
                    value={recurrence.interval_value}
                    onChange={(e) => setRecurrence((r) => ({ ...r, interval_value: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {recurrence.kind === 'weekly' && (
                <div className="nam-dow-chips">
                  {DOW_LABELS.map((label, i) => {
                    const dow = i + 1;
                    const active = recurrence.days_of_week.includes(dow);
                    return (
                      <button
                        key={dow}
                        type="button"
                        className={`nam-dow-chip${active ? ' nam-dow-chip--active' : ''}`}
                        onClick={() =>
                          setRecurrence((r) => ({
                            ...r,
                            days_of_week: active
                              ? r.days_of_week.filter((d) => d !== dow)
                              : [...r.days_of_week, dow],
                          }))
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <label className="nam-label">Termina</label>
                  <select
                    className="nam-select"
                    value={recurrence.end_kind}
                    onChange={(e) =>
                      setRecurrence((r) => ({ ...r, end_kind: e.target.value as 'until' | 'occurrences' }))
                    }
                  >
                    <option value="occurrences">Após N ocorrências</option>
                    <option value="until">Até data</option>
                  </select>
                </div>
                <div className="nam-field">
                  {recurrence.end_kind === 'occurrences' ? (
                    <>
                      <label className="nam-label">Ocorrências</label>
                      <input
                        className="nam-input"
                        type="number"
                        min={1}
                        max={52}
                        value={recurrence.occurrences}
                        onChange={(e) => setRecurrence((r) => ({ ...r, occurrences: Number(e.target.value) }))}
                      />
                    </>
                  ) : (
                    <HubDateField
                      id="nam-recur-until"
                      label="Até"
                      valueIso={recurrence.until_date}
                      onChangeIso={(v) => setRecurrence((r) => ({ ...r, until_date: v }))}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 10. L&T ──────────────────────────────────────────────────── */}
        <div className="nam-section">
          <HubCheckbox
            className="nam-checkbox-label"
            checked={withPickup}
            onChange={(v) => {
              setWithPickup(v);
              if (v) {
                const firstStart = pickupDayFirstStartHm;
                const lastEnd = pickupDayLastEndHm;
                const buscaEndMin = hmToMinutes(firstStart);
                const buscaStartMin = Math.max(0, buscaEndMin - PICKUP_ROUTE_LEG_DURATION_MIN);
                const voltaStartMin = hmToMinutes(lastEnd);
                const voltaEndMin = Math.min(24 * 60 - 1, voltaStartMin + PICKUP_ROUTE_LEG_DURATION_MIN);
                setPickupBefore((pb) => ({
                  ...pb,
                  starts_hm: minutesToHm(buscaStartMin),
                  ends_hm: minutesToHm(buscaEndMin),
                }));
                setPickupAfter((pa) => ({
                  ...pa,
                  starts_hm: minutesToHm(voltaStartMin),
                  ends_hm: minutesToHm(voltaEndMin),
                }));
              }
            }}
          >
            Incluir Leva e Traz
          </HubCheckbox>

          {withPickup && (
            <div className="nam-pickup">
              <p className="nam-aside__muted" style={{ marginBottom: 10, fontSize: 13 }}>
                A busca termina no início do primeiro bloco do dia; o retorno dura 1 h a partir do início
                indicado. Os horários sugeridos ao activar L&T seguem estes critérios.
              </p>
              <div className="nam-row nam-row--cols2" style={{ marginBottom: 12 }}>
                <div className="nam-field">
                  <label className="nam-label">Serviço de transporte</label>
                  <HubSearchableCombobox
                    id="nam-pickup-lt-svc"
                    options={ltServiceComboOptions}
                    value={pickupLtServiceTypeId}
                    onChange={(v) => {
                      setPickupLtServiceTypeId(v);
                      setPickupKmTierIndex(0);
                    }}
                    placeholder={levaTrazServiceTypes.length ? 'Selecionar…' : 'Sem serviços L&T'}
                    clearable={false}
                  />
                </div>
                <div className="nam-field">
                  <label className="nam-label">Faixa de quilometragem</label>
                  <HubSearchableCombobox
                    id="nam-pickup-km-tier"
                    options={kmTierComboOptions}
                    value={String(pickupKmTierIndex)}
                    onChange={(v) => setPickupKmTierIndex(Number(v) || 0)}
                    placeholder="Faixa"
                    clearable={false}
                  />
                </div>
              </div>
              <p className="nam-pickup__title">Busca (antes do atendimento)</p>
              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <label className="nam-label">Início</label>
                  <input
                    className="nam-input"
                    type="time"
                    value={pickupBefore.starts_hm}
                    onChange={(e) => setPickupBefore((b) => ({ ...b, starts_hm: e.target.value }))}
                  />
                </div>
                <div className="nam-field">
                  <label className="nam-label">Motorista</label>
                  <HubSearchableCombobox
                    id="nam-pickup-before-staff"
                    options={staffComboOptions}
                    value={pickupBefore.hub_staff_member_id}
                    onChange={(v) => {
                      setPickupBefore((b) => ({ ...b, hub_staff_member_id: v }));
                      if (!ltReturnDriverUnlinkedRef.current) {
                        setPickupAfter((pa) => ({ ...pa, hub_staff_member_id: v }));
                      } else if (
                        window.confirm('Atualizar o motorista do retorno para o mesmo da busca?')
                      ) {
                        ltReturnDriverUnlinkedRef.current = false;
                        setPickupAfter((pa) => ({ ...pa, hub_staff_member_id: v }));
                      }
                    }}
                    placeholder="Não atribuído"
                    clearable={false}
                  />
                </div>
              </div>

              <p className="nam-pickup__title" style={{ marginTop: 12 }}>Retorno (após atendimento)</p>
              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <label className="nam-label">Início</label>
                  <input
                    className="nam-input"
                    type="time"
                    value={pickupAfter.starts_hm}
                    onChange={(e) => {
                      const starts_hm = e.target.value;
                      setPickupAfter((b) => ({
                        ...b,
                        starts_hm,
                        ends_hm: addMinutes(starts_hm, PICKUP_ROUTE_LEG_DURATION_MIN),
                      }));
                    }}
                  />
                </div>
                <div className="nam-field">
                  <label className="nam-label">Motorista</label>
                  <HubSearchableCombobox
                    id="nam-pickup-after-staff"
                    options={staffComboOptions}
                    value={pickupAfter.hub_staff_member_id}
                    onChange={(v) => {
                      ltReturnDriverUnlinkedRef.current = v !== pickupBefore.hub_staff_member_id;
                      setPickupAfter((b) => ({ ...b, hub_staff_member_id: v }));
                    }}
                    placeholder="Não atribuído"
                    clearable={false}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Conflict feedback ─────────────────────────────────────────── */}
        {conflicts.length > 0 && (
          <div className="nam-conflicts">
            <AlertCircle size={15} />
            <div>
              <p><strong>Algumas datas entraram em conflito:</strong></p>
              {conflicts.map((c, i) => (
                <p key={i} className="nam-conflict-row">
                  {c.date}: {c.reason}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </HubSidePanel>
  );
};

// ── BlockCardHeader sub-component ──────────────────────────────────────────────

type BlockCardHeaderProps = {
  blockNumber: number;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  onRemove?: () => void;
};

const BlockCardHeader: React.FC<BlockCardHeaderProps> = ({
  blockNumber, title, expanded, onToggle, onRemove,
}) => (
  <div className={`nam-block-card__header-row${expanded ? '' : ' nam-block-card__header-row--collapsed'}`}>
    <button type="button" className="nam-block-card__header" onClick={onToggle}>
      <span className="nam-block-card__header-left">
        <span className="nam-block-card__badge" aria-hidden>{blockNumber}</span>
        <span className="nam-block-card__title">{title}</span>
      </span>
      <span className="nam-block-card__toggle">
        {expanded ? 'Recolher' : 'Expandir'}
        {expanded ? <ChevronUp size={16} strokeWidth={2.5} /> : <ChevronDown size={16} strokeWidth={2.5} />}
      </span>
    </button>
    {onRemove ? (
      <button
        type="button"
        className="nam-block-card__remove"
        onClick={onRemove}
        aria-label="Remover bloco"
      >
        <Trash2 size={14} />
      </button>
    ) : null}
  </div>
);

// ── ExtraBlockCard sub-component ─────────────────────────────────────────────

type ExtraBlockCardProps = {
  block: ExtraBlock;
  index: number;
  groups: HubComboboxOption[];
  staffComboOptions: HubComboboxOption[];
  serviceTypes: HubServiceType[];
  onRemove: () => void;
  onChange: (updated: ExtraBlock) => void;
  onToggleExpand: () => void;
};

const ExtraBlockCard: React.FC<ExtraBlockCardProps> = ({
  block, index, groups, staffComboOptions, serviceTypes, onRemove, onChange, onToggleExpand,
}) => {
  const [svcSearchId, setSvcSearchId] = useState('');

  const blockServiceComboOptions = useMemo<HubComboboxOption[]>(() => {
    const filtered = serviceTypes.filter(
      (st) =>
        st.allow_scheduling !== false &&
        (block.group_filter === 'all' || normalizeServiceGroupSlug(st.service_group) === block.group_filter),
    );
    return filtered.map((st) => ({
      value: st.id,
      label: `${st.name}${st.default_duration_minutes ? ` (${st.default_duration_minutes}min)` : ''}`,
    }));
  }, [serviceTypes, block.group_filter]);

  const addSvc = (id: string) => {
    if (!id) return;
    if (block.services.some((s) => s.hub_service_type_id === id)) { setSvcSearchId(''); return; }
    const st = serviceTypes.find((s) => s.id === id);
    if (!st) return;
    const matrix = coercePricingMatrixFromApi(st.pricing_matrix);
    const pricing_variant =
      matrix && matrixNeedsVariantChoice(matrix) ? defaultPricingVariantForMatrix(matrix) : null;
    onChange({
      ...block,
      services: [
        ...block.services,
        {
          hub_service_type_id: id,
          name: st.name,
          duration_minutes: st.default_duration_minutes ?? 60,
          pricing_variant,
        },
      ],
    });
    setSvcSearchId('');
  };

  const removeSvc = (svcId: string) =>
    onChange({ ...block, services: block.services.filter((s) => s.hub_service_type_id !== svcId) });

  const updateSvcDuration = (idx: number, dur: number) =>
    onChange({
      ...block,
      services: block.services.map((s, i) => (i === idx ? { ...s, duration_minutes: dur } : s)),
    });

  const blockDurationMin = useMemo(
    () => block.services.reduce((sum, s) => sum + s.duration_minutes, 0),
    [block.services],
  );

  return (
    <div className="nam-section nam-block-card nam-extra-block">
      <BlockCardHeader
        blockNumber={index + 2}
        title={block.block_title.trim() || `Bloco ${index + 2}`}
        expanded={block.expanded}
        onToggle={onToggleExpand}
        onRemove={onRemove}
      />

      {block.expanded && (
        <div className="nam-block-card__body">
          <div className="nam-section">
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <label className="nam-label">Grupo de serviço</label>
                <HubSearchableCombobox
                  id={`nam-eb-group-${block.key}`}
                  options={groups}
                  value={block.group_filter}
                  onChange={(v) => onChange({ ...block, group_filter: v })}
                  clearable={false}
                  placeholder="Todos os grupos"
                />
              </div>
              <div className="nam-field">
                <label className="nam-label">Serviços</label>
                <HubSearchableCombobox
                  id={`nam-eb-svc-${block.key}`}
                  options={blockServiceComboOptions}
                  value={svcSearchId}
                  onChange={addSvc}
                  placeholder="Buscar e adicionar serviço…"
                  clearable={false}
                />
              </div>
            </div>
            {block.services.length > 0 && (
              <div className="nam-chips">
                {block.services.map((chip, idx) => (
                  <div key={chip.hub_service_type_id} className="nam-chip">
                    <GripVertical size={14} className="nam-chip__drag" />
                    <span className="nam-chip__name">{chip.name}</span>
                    <input
                      className="nam-chip__dur"
                      type="number"
                      min={1}
                      max={480}
                      value={chip.duration_minutes}
                      onChange={(e) => updateSvcDuration(idx, Number(e.target.value))}
                      aria-label="Duração em minutos"
                    />
                    <span className="nam-chip__unit">min</span>
                    <button
                      className="nam-chip__remove"
                      type="button"
                      onClick={() => removeSvc(chip.hub_service_type_id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <div className="nam-chips__total">
                  Total: <strong>{blockDurationMin} min</strong>
                </div>
              </div>
            )}
          </div>

          <div className="nam-section">
            <label className="nam-label">Título do bloco</label>
            <div className="nam-title-row">
              <input
                className="nam-input"
                type="text"
                maxLength={200}
                placeholder={`Bloco ${index + 2}`}
                value={block.block_title}
                onChange={(e) => onChange({ ...block, block_title: e.target.value })}
              />
            </div>
          </div>

          <div className="nam-section">
            <label className="nam-label">Descrição do bloco</label>
            <textarea
              className="nam-textarea"
              rows={3}
              maxLength={8000}
              placeholder="Preenchida automaticamente com as descrições dos serviços deste bloco; pode editar."
              value={block.block_description}
              onChange={(e) =>
                onChange({ ...block, block_description: e.target.value, block_description_user_edited: true })
              }
            />
            <p className="nam-char-count">{block.block_description.length}/8000</p>
          </div>

          <div className="nam-section">
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <label className="nam-label">Início</label>
                <input
                  className="nam-input"
                  type="time"
                  value={block.starts_hm}
                  onChange={(e) => onChange({ ...block, starts_hm: e.target.value })}
                />
              </div>
              <div className="nam-field">
                <label className="nam-label">Fim previsto</label>
                <input
                  className="nam-input"
                  type="time"
                  value={block.ends_hm}
                  onChange={(e) => onChange({ ...block, ends_hm: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="nam-section">
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <label className="nam-label">Profissional</label>
                <HubSearchableCombobox
                  id={`nam-eb-staff-${block.key}`}
                  options={staffComboOptions}
                  value={block.hub_staff_member_id}
                  onChange={(v) => onChange({ ...block, hub_staff_member_id: v })}
                  placeholder="Não atribuído"
                  clearable={false}
                />
              </div>
              <div className="nam-field">
                <label className="nam-label">Recurso / Sala</label>
                <input
                  className="nam-input"
                  type="text"
                  placeholder="Ex.: Mesa 1, Van…"
                  value={block.resource_label}
                  onChange={(e) => onChange({ ...block, resource_label: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
