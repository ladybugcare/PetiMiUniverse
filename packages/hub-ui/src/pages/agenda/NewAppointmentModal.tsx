import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, AlertCircle, CalendarDays, Calendar, RefreshCw, ChevronDown, ChevronUp, User, Dog, Loader2, Stethoscope, Siren, FolderPlus, Folder, Info, CheckCircle2, CalendarPlus, Clock, Zap } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubDateField } from '../../components/HubDateField';
import { HubTimeField } from '../../components/HubTimeField';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubCheckbox } from '../../components/HubCheckbox';
import {
  CareLocationFields,
  type CareLocationValue,
} from '../../components/CareLocationFields';
import { getSelectedUnitId } from '../../utils/useSelectedUnitId';
import {
  hubAgendaApi,
  type CreateHubAppointmentPayload,
  type CreateHubAppointmentBatchPetEntry,
  type HubAppointment,
  type HubAppointmentStatus,
  type HubAppointmentRecurrenceRule,
} from '../../api/hubAgendaApi';
import { hubGuardiansApi } from '../../api/hubGuardiansApi';
import type { HubGuardian } from '../../api/hubGuardiansApi';
import { hubClinicalCasesApi, type HubClinicalCase } from '../../api/hubClinicalApi';
import { hubClinicSettingsApi } from '../../api/hubClinicSettingsApi';
import { hubSpecialPricesApi } from '../../api/hubSpecialPricesApi';
import type { HubStaffMember } from '../../api/hubStaffApi';
import { hubServiceGroupsApi } from '../../api/hubServiceGroupsApi';
import { hubServiceAddonsApi } from '../../api/hubServiceAddonsApi';
import AppointmentPetSelector from './AppointmentPetSelector';
import PetVisitBlock, {
  clonePetVisitConfig,
  emptyPetVisitConfig,
  type PetVisitConfig,
} from './PetVisitBlock';
import { BlockCardHeader } from './BlockCardHeader';
import { ExtraBlockCard } from './ExtraBlockCard';
import {
  addMinutes,
  buildBlockHeaderSubtitle,
  buildBlockTitleFromServices,
  buildExtraBlocksApiPayload,
  buildServiceDescriptionBullets,
  computePetVisitTimings,
  createEmptyExtraBlock,
  hmToMinutes,
  maxHm,
  minHm,
  minutesToHm,
  petExtraBlocksDurationMin,
  todayYmd,
  toEndIsoTs,
  toIsoTs,
  toIsoTsOnOrAfter,
  toIsoTsForPickupReturn,
  tsToHm,
  visitEndHmFromTimings,
  visitTotalDurationMin,
  type ExtraBlock,
} from './appointmentSchedulingUtils';
import {
  AppointmentServiceCard,
  allUniqueAddons,
  mergeAddonsByParent,
  serviceNeedsVariantMatrix,
  useServiceCardExpansion,
} from './AppointmentServiceCard';
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
import {
  normalizePickupPriceScope,
  pickupModeLegCount,
  resolvePickupLegAmounts,
} from '../../utils/hubPickupPricing';
import { isOperationalClinicalGroup, normalizeServiceGroupSlug, serviceGroupLabel } from '../../utils/serviceTypeSlug';
import { STATUS_META, type AgendaAppointment, type AgendaStatus } from './agendaModel';
import { ReceptionQuickRegisterPanel, type QuickRegisterSaveResult } from './ReceptionQuickRegisterPanel';
import { resolveWalkInAppointmentKind } from './walkInUtils';
import {
  SCHEDULE_OVERLAP_CANCEL_TEXT,
  SCHEDULE_OVERLAP_CONFIRM_TEXT,
  SCHEDULE_OVERLAP_CONFIRM_TITLE,
  agendaAppointmentToConflictSlot,
  buildScheduleOverlapConfirmMessage,
  findLocalScheduleConflict,
  isScheduleConflictMessage,
  type LocalScheduleWindow,
} from './scheduleConflict';
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
  addon_services?: Array<{
    hub_service_type_id: string;
    name?: string | null;
    duration_minutes?: number | null;
    pricing_variant?: HubQuotePricingVariant | null;
  }>;
  title?: string | null;
  notes?: string | null;
  financial_notes?: string | null;
  status?: AgendaStatus;
  pricing_porte_tier?: string | null;
  pricing_coat_type?: string | null;
  source_quote_id?: string | null;
  /** Pré-marca urgência no modo encaixe (fluxo operacional → agenda). */
  walk_in_emergency?: boolean;
  /** Pré-ativa recorrência (ex.: agendar saldo de pacote). */
  suggest_recurrence?: {
    occurrences: number;
    kind?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    interval_value?: number;
  } | null;
  package_balance_hint?: string | null;
  extra_blocks?: Array<{
    appointment_id?: string;
    starts_at?: string;
    ends_at?: string;
    hub_staff_member_id?: string | null;
    resource_label?: string | null;
    title?: string | null;
    notes?: string | null;
    services: Array<{
      hub_service_type_id: string;
      name?: string | null;
      duration_minutes?: number | null;
      pricing_variant?: HubQuotePricingVariant | null;
    }>;
  }>;
};

export type NewAppointmentModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (result: CreateHubAppointmentResult) => void;
  initial?: NewAppointmentInitial | null;
  staffOptions: HubStaffMember[];
  serviceTypes: HubServiceType[];
  /** Fluxo Clínica → «Agendar na agenda»: formulário focado como nos prints de consulta de rotina. */
  layoutVariant?: 'default' | 'clinical_routine' | 'walk_in';
  mode?: 'create' | 'edit';
  appointmentId?: string | null;
  seriesId?: string | null;
  onUpdated?: (appointment: HubAppointment) => void;
  /** Agendamentos já carregados na agenda — usados para avisar conflito antes de salvar. */
  existingAppointments?: AgendaAppointment[];
};

type ServiceChip = {
  hub_service_type_id: string;
  name: string;
  duration_minutes: number;
  pricing_variant?: HubQuotePricingVariant | null;
};

type GuardianPetOption = { id: string; name: string; size_tier: string; coat_type: string | null; birth_date: string | null };

/** Janela L&T: `ends_hm` mantém-se alinhado ao início (+1 h); não há campo «Fim» no formulário. */
type PickupSubBlock = {
  starts_hm: string;
  ends_hm: string;
  hub_staff_member_id: string;
  resource_label: string;
};

const PICKUP_ROUTE_LEG_DURATION_MIN = 60;

/** «Quinzenal» é apenas a forma de escolher semanal a cada 2 semanas. */
type RecurrenceKind = 'daily' | 'weekly' | 'biweekly' | 'monthly';

const RECURRENCE_LABELS: Record<RecurrenceKind, string> = {
  daily: 'Diária',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
};

/** Persistência/API só conhecem daily/weekly/monthly + intervalo. */
function toRecurrenceApiKind(kind: RecurrenceKind): 'daily' | 'weekly' | 'monthly' {
  return kind === 'biweekly' ? 'weekly' : kind;
}

function fromRecurrenceApiKind(
  kind: RecurrenceKind | undefined,
  intervalValue: number | undefined,
): RecurrenceKind {
  if (kind === 'biweekly') return 'biweekly';
  if (kind === 'weekly' && intervalValue === 2) return 'biweekly';
  return kind ?? 'weekly';
}

function recurrenceIntervalFor(kind: RecurrenceKind, intervalValue: number | undefined): number {
  if (kind === 'biweekly') return 2;
  return Math.max(1, Math.floor(intervalValue ?? 1) || 1);
}

type RecurrenceForm = {
  kind: RecurrenceKind;
  interval_value: number;
  days_of_week: number[];
  end_kind: 'until' | 'occurrences';
  until_date: string;
  occurrences: number;
  billing_mode: 'per_occurrence' | 'periodic_invoice';
  invoice_issue_rule: 'fixed_day' | 'first_business_day';
  invoice_issue_day: number;
  invoice_due_rule: 'same_day' | 'plus_days' | 'fixed_day';
  invoice_due_day: number;
  invoice_due_plus_days: number;
};

const DEFAULT_RECURRENCE: RecurrenceForm = {
  kind: 'weekly',
  interval_value: 1,
  days_of_week: [],
  end_kind: 'occurrences',
  until_date: '',
  occurrences: 4,
  billing_mode: 'per_occurrence',
  invoice_issue_rule: 'first_business_day',
  invoice_issue_day: 1,
  invoice_due_rule: 'same_day',
  invoice_due_day: 1,
  invoice_due_plus_days: 0,
};

const DOW_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const GUARDIAN_SEARCH_PLACEHOLDER = 'Buscar por nome, CPF ou telefone…';

function guardianComboboxOption(g: HubGuardian): HubComboboxOption {
  const phone = (g.phone ?? '').trim();
  const taxId = (g.tax_id ?? '').trim();
  const searchParts = [phone, phone.replace(/\D/g, ''), taxId, taxId.replace(/\D/g, '')].filter(Boolean);
  return {
    value: g.id,
    label: g.full_name,
    icon: <User size={18} strokeWidth={2} aria-hidden />,
    searchText: searchParts.length > 0 ? searchParts.join(' ') : undefined,
  };
}

function mapInitialExtraBlocks(
  blocks: NonNullable<NewAppointmentInitial['extra_blocks']>,
  serviceTypes: HubServiceType[],
  fallbackEndsHm: string,
): ExtraBlock[] {
  return blocks.map((eb, idx) => ({
    key: eb.appointment_id ?? `extra-${idx}-${Date.now()}`,
    appointment_id: eb.appointment_id,
    expanded: idx === blocks.length - 1,
    block_title: eb.title?.trim() ?? '',
    block_title_user_edited: Boolean(eb.title?.trim()),
    block_description: eb.notes?.trim() ?? '',
    block_description_user_edited: Boolean(eb.notes?.trim()),
    group_filter: 'all',
    services: eb.services
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
    starts_hm: eb.starts_at ? tsToHm(eb.starts_at) : fallbackEndsHm,
    ends_hm: eb.ends_at ? tsToHm(eb.ends_at) : addMinutes(fallbackEndsHm, 60),
    hub_staff_member_id: eb.hub_staff_member_id ?? '',
    resource_label: eb.resource_label ?? '',
  }));
}

function windowFromHm(
  dateYmd: string,
  startsHm: string,
  endsHm: string,
  staffId: string | null,
  resourceLabel: string | null,
): LocalScheduleWindow {
  return {
    staffId: staffId || null,
    resourceLabel: resourceLabel || null,
    startMs: new Date(toIsoTs(dateYmd, startsHm)).getTime(),
    endMs: new Date(toEndIsoTs(dateYmd, startsHm, endsHm)).getTime(),
  };
}

export const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({
  open,
  onClose,
  onCreated,
  initial,
  staffOptions,
  serviceTypes,
  layoutVariant = 'default',
  mode = 'create',
  appointmentId = null,
  seriesId = null,
  onUpdated,
  existingAppointments = [],
}) => {
  const clinicId = getStoredClinicId() ?? '';
  const { showAlert } = useAlert();
  const isEditMode = mode === 'edit';
  const isClinicalRoutine = !isEditMode && layoutVariant === 'clinical_routine';
  const isWalkIn = !isEditMode && layoutVariant === 'walk_in';
  const multiPetEnabled = !isEditMode && !isClinicalRoutine && !isWalkIn;
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
  const [careLocation, setCareLocation] = useState<CareLocationValue>({
    care_location_kind: 'own_unit',
    hub_partner_clinic_id: null,
  });

  // ── Services ───────────────────────────────────────────────────────────────
  const [groupFilter, setGroupFilter] = useState('all');
  const [services, setServices] = useState<ServiceChip[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<ServiceChip[]>([]);
  const [addonsByParent, setAddonsByParent] = useState<Map<string, HubServiceType[]>>(new Map());
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [serviceSearchId, setServiceSearchId] = useState('');

  // ── Pet / Guardian ────────────────────────────────────────────────────────
  const [guardianId, setGuardianId] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [petId, setPetId] = useState('');
  const [petName, setPetName] = useState('');
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [petVisitConfigs, setPetVisitConfigs] = useState<PetVisitConfig[]>([]);
  const [syncSameServicesForAll, setSyncSameServicesForAll] = useState(false);
  const [syncSameStaffForAll, setSyncSameStaffForAll] = useState(true);
  const [guardianPets, setGuardianPets] = useState<GuardianPetOption[]>([]);
  const [guardianPetsLoading, setGuardianPetsLoading] = useState(false);
  const [guardianOptions, setGuardianOptions] = useState<HubComboboxOption[]>([]);
  const [guardiansLoading, setGuardiansLoading] = useState(false);
  const [quickRegisterOpen, setQuickRegisterOpen] = useState(false);
  const [quickRegisterPetsOnly, setQuickRegisterPetsOnly] = useState(false);
  const [walkInEmergency, setWalkInEmergency] = useState(false);

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
  const [mainBlockDetailsOpen, setMainBlockDetailsOpen] = useState(false);
  const [financialNotes, setFinancialNotes] = useState('');

  // ── Recurrence ────────────────────────────────────────────────────────────
  const [withRecurrence, setWithRecurrence] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceForm>({ ...DEFAULT_RECURRENCE });

  // ── L&T ───────────────────────────────────────────────────────────────────
  const [withPickup, setWithPickup] = useState(false);
  const [pickupMode, setPickupMode] = useState<'round_trip' | 'pickup_only' | 'delivery_only'>('round_trip');
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
  const initialPetIdRef = useRef<string | null>(null);

  // ── Extra blocks ──────────────────────────────────────────────────────────
  const [extraBlocks, setExtraBlocks] = useState<ExtraBlock[]>([]);

  const mainServiceIdsSignature = useMemo(
    () => services.map((s) => s.hub_service_type_id).join('|'),
    [services],
  );

  const effectiveSelectedPetIds = useMemo(() => {
    if (!multiPetEnabled) return petId ? [petId] : [];
    return selectedPetIds;
  }, [multiPetEnabled, petId, selectedPetIds]);

  const isMultiPetSelection = multiPetEnabled && effectiveSelectedPetIds.length >= 2;

  const selectedPetNamesLabel = useMemo(
    () =>
      effectiveSelectedPetIds
        .map((id) => guardianPets.find((p) => p.id === id)?.name)
        .filter(Boolean)
        .join(' · '),
    [effectiveSelectedPetIds, guardianPets],
  );

  const allPetServiceIdsSignature = useMemo(() => {
    if (!isMultiPetSelection) return mainServiceIdsSignature;
    return petVisitConfigs
      .flatMap((c) => c.services.map((s) => s.hub_service_type_id))
      .join('|');
  }, [isMultiPetSelection, mainServiceIdsSignature, petVisitConfigs]);

  const availableAddons = useMemo(() => allUniqueAddons(addonsByParent), [addonsByParent]);

  const mainServiceCardExpansion = useServiceCardExpansion(services.map((s) => s.hub_service_type_id));

  useEffect(() => {
    if (!open) {
      lastMainBlockServiceSigRef.current = '';
      return;
    }
    const sig = isMultiPetSelection ? allPetServiceIdsSignature : mainServiceIdsSignature;
    if (sig === lastMainBlockServiceSigRef.current) return;
    lastMainBlockServiceSigRef.current = sig;
    if (mainBlockNotesUserEdited) return;
    const ids = isMultiPetSelection
      ? petVisitConfigs.flatMap((c) => c.services.map((s) => s.hub_service_type_id))
      : services.map((s) => s.hub_service_type_id);
    setMainBlockNotes(buildServiceDescriptionBullets(serviceTypes, ids));
  }, [
    open,
    mainServiceIdsSignature,
    allPetServiceIdsSignature,
    isMultiPetSelection,
    services,
    petVisitConfigs,
    serviceTypes,
    mainBlockNotesUserEdited,
  ]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Array<{ date: string; reason: string }>>([]);
  const [seriesScopePickerOpen, setSeriesScopePickerOpen] = useState(false);
  const pendingPatchPayloadRef = useRef<Parameters<typeof hubAgendaApi.patch>[1] | null>(null);
  const confirmedOverlapRef = useRef(false);
  const handleSaveRef = useRef<() => Promise<void>>(async () => undefined);

  // ── Derived ───────────────────────────────────────────────────────────────
  const servicesDurationMin = useMemo(
    () => services.reduce((s, c) => s + c.duration_minutes, 0),
    [services]
  );
  const addonsDurationMin = useMemo(
    () => selectedAddons.reduce((s, c) => s + c.duration_minutes, 0),
    [selectedAddons]
  );
  const totalDurationMin = useMemo(() => {
    if (isMultiPetSelection) {
      return visitTotalDurationMin(petVisitConfigs, syncSameStaffForAll);
    }
    return servicesDurationMin + addonsDurationMin;
  }, [isMultiPetSelection, petVisitConfigs, syncSameStaffForAll, servicesDurationMin, addonsDurationMin]);

  const petVisitTimings = useMemo(() => {
    if (!isMultiPetSelection) return new Map<string, { startsHm: string; endsHm: string }>();
    return computePetVisitTimings(petVisitConfigs, startsHm, syncSameStaffForAll);
  }, [isMultiPetSelection, petVisitConfigs, startsHm, syncSameStaffForAll]);

  const multiPetVisitEndHm = useMemo(() => {
    if (!isMultiPetSelection) return endsHm;
    return visitEndHmFromTimings(petVisitConfigs, petVisitTimings, syncSameStaffForAll);
  }, [isMultiPetSelection, petVisitConfigs, petVisitTimings, syncSameStaffForAll, endsHm]);

  /** Primeiro início do dia (principal + extras com serviço) — fim da perna «busca» L&T. */
  const pickupDayFirstStartHm = useMemo(() => {
    if (isMultiPetSelection) {
      const petStarts = [...petVisitTimings.values()].map((t) => t.startsHm);
      const extraStarts = petVisitConfigs.flatMap((cfg) =>
        cfg.extraBlocks.filter((b) => b.services.length > 0).map((b) => b.starts_hm),
      );
      return minHm([startsHm, ...petStarts, ...extraStarts]);
    }
    return minHm([startsHm, ...extraBlocks.filter((b) => b.services.length > 0).map((b) => b.starts_hm)]);
  }, [isMultiPetSelection, startsHm, extraBlocks, petVisitConfigs, petVisitTimings]);

  /** Último fim do dia — base para sugerir o início do «retorno». */
  const pickupDayLastEndHm = useMemo(() => {
    if (isMultiPetSelection) {
      const extraEnds = petVisitConfigs.flatMap((cfg) =>
        cfg.extraBlocks.filter((b) => b.services.length > 0).map((b) => b.ends_hm),
      );
      return maxHm([multiPetVisitEndHm, ...extraEnds]);
    }
    return maxHm([endsHm, ...extraBlocks.filter((b) => b.services.length > 0).map((b) => b.ends_hm)]);
  }, [isMultiPetSelection, multiPetVisitEndHm, endsHm, extraBlocks, petVisitConfigs]);

  const extraBlocksDurationMin = useMemo(() => {
    if (isMultiPetSelection) {
      return petVisitConfigs.reduce((sum, cfg) => sum + petExtraBlocksDurationMin(cfg.extraBlocks), 0);
    }
    return extraBlocks.reduce((sum, b) => sum + b.services.reduce((s, c) => s + c.duration_minutes, 0), 0);
  }, [isMultiPetSelection, petVisitConfigs, extraBlocks]);
  const totalDurationAllBlocks = totalDurationMin + extraBlocksDurationMin;

  const autoTitle = useMemo(() => {
    const svcPart = isMultiPetSelection
      ? [...new Set(petVisitConfigs.flatMap((c) => c.services.map((s) => s.name)))].join(' + ')
      : services.map((s) => s.name).join(' + ') || '';
    const petPart =
      multiPetEnabled && selectedPetIds.length > 0
        ? selectedPetIds
            .map((id) => guardianPets.find((p) => p.id === id)?.name)
            .filter(Boolean)
            .join(' · ')
        : petName || '';
    if (!svcPart && !petPart) return '';
    if (!petPart) return svcPart;
    if (!svcPart) return petPart;
    return `${svcPart} — ${petPart}`;
  }, [services, petName, multiPetEnabled, selectedPetIds, guardianPets, isMultiPetSelection, petVisitConfigs]);

  useEffect(() => {
    if (!titleOverridden) setTitle(autoTitle);
  }, [autoTitle, titleOverridden]);

  // When services change, recalc ends_hm
  useEffect(() => {
    if (isMultiPetSelection) {
      if (petVisitConfigs.some((c) => c.services.length > 0)) {
        setEndsHm(multiPetVisitEndHm);
      }
      return;
    }
    if (totalDurationMin > 0) {
      setEndsHm(addMinutes(startsHm, totalDurationMin));
    }
  }, [totalDurationMin, startsHm, isMultiPetSelection, multiPetVisitEndHm, petVisitConfigs]);

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
    setWalkInEmergency(false);
    setQuickRegisterOpen(false);
    setQuickRegisterPetsOnly(false);
    setCareLocation({ care_location_kind: 'own_unit', hub_partner_clinic_id: null });
    initialPetIdRef.current = initial?.pet_id ?? null;
    if (isWalkIn) {
      const now = new Date();
      setDateYmd(todayYmd());
      const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setStartsHm(hm);
      setEndsHm(addMinutes(hm, 60));
      setStatus('checked_in');
      setWalkInEmergency(initial?.walk_in_emergency === true);
      setWithRecurrence(false);
      setWithPickup(false);
      setExtraBlocks([]);
    }
    if (initial) {
      if (initial.date) setDateYmd(initial.date);
      if (initial.starts_at) setStartsHm(tsToHm(initial.starts_at));
      if (initial.ends_at) setEndsHm(tsToHm(initial.ends_at));
      if (initial.hub_staff_member_id) setStaffId(initial.hub_staff_member_id);
      else if (isEditMode) setStaffId('');
      if (initial.resource_label) setResourceLabel(initial.resource_label);
      else if (isEditMode) setResourceLabel('');
      if (initial.guardian_id) setGuardianId(initial.guardian_id);
      if (initial.guardian_name) setGuardianName(initial.guardian_name);
      if (initial.pet_id) setPetId(initial.pet_id);
      if (initial.pet_name) setPetName(initial.pet_name);
      if (initial.status) setStatus(initial.status);
      if (initial.pricing_porte_tier) setPricingApptPorteTier(initial.pricing_porte_tier);
      if (initial.pricing_coat_type) setPricingApptCoatType(initial.pricing_coat_type);
      if (initial.title) {
        setTitle(initial.title);
        setTitleOverridden(true);
      }
      if (initial.notes) {
        setMainBlockNotes(initial.notes);
        setMainBlockNotesUserEdited(true);
      }
      if (initial.financial_notes) setFinancialNotes(initial.financial_notes);
      if (!isWalkIn && initial.suggest_recurrence && initial.suggest_recurrence.occurrences >= 2) {
        const suggestedKind = fromRecurrenceApiKind(
          initial.suggest_recurrence.kind,
          initial.suggest_recurrence.interval_value,
        );
        setWithRecurrence(true);
        setRecurrence({
          ...DEFAULT_RECURRENCE,
          kind: suggestedKind,
          interval_value: recurrenceIntervalFor(suggestedKind, initial.suggest_recurrence.interval_value),
          end_kind: 'occurrences',
          occurrences: Math.min(52, Math.max(2, Math.floor(initial.suggest_recurrence.occurrences))),
        });
      }
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
      } else if (isEditMode) {
        setServices([]);
      }
      if (initial.addon_services?.length) {
        setSelectedAddons(
          initial.addon_services
            .filter((s) => s.hub_service_type_id)
            .map((s) => {
              const st = serviceTypes.find((t) => t.id === s.hub_service_type_id);
              return {
                hub_service_type_id: s.hub_service_type_id,
                name: s.name || st?.name || 'Adicional',
                duration_minutes: s.duration_minutes || st?.default_duration_minutes || 30,
                pricing_variant: s.pricing_variant ?? null,
              };
            }),
        );
      } else if (isEditMode) {
        setSelectedAddons([]);
      }
      if (!isWalkIn) {
        if (isEditMode) {
          const fallbackEnd = initial.ends_at ? tsToHm(initial.ends_at) : '10:00';
          if (initial.extra_blocks?.length) {
            setExtraBlocks(mapInitialExtraBlocks(initial.extra_blocks, serviceTypes, fallbackEnd));
          } else {
            setExtraBlocks([]);
          }
        } else {
          setExtraBlocks([]);
        }
      }
    } else if (!isWalkIn && !isEditMode) {
      setExtraBlocks([]);
    }
  }, [open, initial, serviceTypes, isEditMode, isWalkIn]);

  const reloadGuardianOptions = useCallback(async () => {
    if (!clinicId) return;
    setGuardiansLoading(true);
    try {
      const { guardians } = await hubGuardiansApi.list(clinicId, false, { status: 'active' });
      setGuardianOptions(guardians.map(guardianComboboxOption));
    } catch {
      setGuardianOptions([]);
    } finally {
      setGuardiansLoading(false);
    }
  }, [clinicId]);

  const applyQuickRegisterResult = useCallback(
    async (result: QuickRegisterSaveResult) => {
      await reloadGuardianOptions();
      setGuardianName(result.guardian.full_name);

      const mapPets = (pets: Awaited<ReturnType<typeof hubGuardiansApi.getById>>['pets']): GuardianPetOption[] =>
        pets.map((p) => ({
          id: p.id,
          name: p.name,
          size_tier: p.size_tier || 'medio',
          coat_type: p.coat_type ?? null,
          birth_date: p.birth_date,
        }));

      const applyPetsSelection = (mapped: GuardianPetOption[]) => {
        setGuardianPets(mapped);
        const newIds = result.pets
          .map((p) => p.id)
          .filter((id) => mapped.some((m) => m.id === id));
        if (newIds.length === 0) {
          setPetId('');
          setPetName('');
          setSelectedPetIds([]);
          return;
        }
        // Tutor já selecionado: seleciona o(s) pet(s) recém-criado(s),
        // preservando os que já estavam marcados no multi-pet.
        if (multiPetEnabled) {
          setSelectedPetIds((prev) => {
            const merged = [...prev];
            for (const id of newIds) {
              if (!merged.includes(id)) merged.push(id);
            }
            return merged;
          });
        }
        const focusId = newIds[newIds.length - 1]!;
        const target = mapped.find((p) => p.id === focusId);
        if (target) {
          setPetId(target.id);
          setPetName(target.name);
        }
      };

      if (!clinicId) {
        if (result.guardian.id !== guardianId) setGuardianId(result.guardian.id);
        return;
      }

      if (result.guardian.id === guardianId) {
        const { pets } = await hubGuardiansApi.getById(result.guardian.id, clinicId);
        applyPetsSelection(mapPets(pets));
        return;
      }

      initialPetIdRef.current = result.pets.length === 1 ? result.pets[0]!.id : null;
      setGuardianId(result.guardian.id);
    },
    [clinicId, guardianId, reloadGuardianOptions, multiPetEnabled],
  );

  const openQuickRegisterFull = useCallback(() => {
    setQuickRegisterPetsOnly(false);
    setQuickRegisterOpen(true);
  }, []);

  const openQuickRegisterPetsOnly = useCallback(() => {
    setQuickRegisterPetsOnly(true);
    setQuickRegisterOpen(true);
  }, []);

  const walkInIsClinical = useMemo(() => {
    if (!isWalkIn || services.length === 0) return false;
    return services.some((s) => {
      const st = serviceTypes.find((t) => t.id === s.hub_service_type_id);
      return isOperationalClinicalGroup(normalizeServiceGroupSlug(st?.service_group));
    });
  }, [isWalkIn, services, serviceTypes]);

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
        setGuardianOptions(guardians.map(guardianComboboxOption));
      })
      .catch(() => setGuardianOptions([]))
      .finally(() => setGuardiansLoading(false));
  }, [open, clinicId]);

  // Load pets when guardian changes
  useEffect(() => {
    if (!guardianId || !clinicId) {
      setGuardianPets([]);
      setGuardianPetsLoading(false);
      setPetId('');
      setPetName('');
      return;
    }
    let cancelled = false;
    setGuardianPets([]);
    setGuardianPetsLoading(true);
    hubGuardiansApi
      .getById(guardianId, clinicId)
      .then(({ pets }) => {
        if (cancelled) return;
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
          setSelectedPetIds(multiPetEnabled ? [initialPet.id] : []);
          initialPetIdRef.current = null;
        } else if (mapped.length === 1) {
          setPetId(mapped[0]!.id);
          setPetName(mapped[0]!.name);
          setSelectedPetIds(multiPetEnabled ? [mapped[0]!.id] : []);
        } else {
          setPetId('');
          setPetName('');
          setSelectedPetIds([]);
        }
      })
      .catch(() => {
        if (!cancelled) setGuardianPets([]);
      })
      .finally(() => {
        if (!cancelled) setGuardianPetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guardianId, clinicId, multiPetEnabled]);

  useEffect(() => {
    if (!multiPetEnabled) return;
    if (selectedPetIds.length === 1) {
      const pid = selectedPetIds[0]!;
      const p = guardianPets.find((x) => x.id === pid);
      setPetId(pid);
      setPetName(p?.name ?? '');
    } else if (selectedPetIds.length === 0) {
      setPetId('');
      setPetName('');
    }
  }, [multiPetEnabled, selectedPetIds, guardianPets]);

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

  const addedMainServiceIds = useMemo(
    () => services.map((s) => s.hub_service_type_id),
    [services],
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
    // Em edição, nunca troca/zera o profissional automaticamente.
    if (isEditMode) return;
    if (suggestedStaffIds.size === 1) {
      const only = [...suggestedStaffIds][0]!;
      setStaffId((prev) => (prev === only ? prev : only));
    }
  }, [selectedServiceTypes, suggestedStaffIds, isEditMode]);

  const staffIncompatibleWithServices = useMemo(() => {
    if (!staffId || selectedServiceTypes.length === 0 || suggestedStaffIds.size === 0) return false;
    return !suggestedStaffIds.has(staffId);
  }, [staffId, selectedServiceTypes.length, suggestedStaffIds]);

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
        rows.push(...others.map((s) => mapRow(s, staffId === s.id ? ' · atual' : '')));
      }
    } else {
      rows.push(...eligible.map((s) => mapRow(s, '')));
    }
    return rows;
  }, [staffOptions, suggestedStaffIds, selectedServiceTypes.length, staffId]);

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

  /** Serviço principal é L&T avulso (parada operacional), não atendimento + checkbox L&T. */
  const isPrimaryLevaTraz = useMemo(() => {
    const ids = isMultiPetSelection
      ? petVisitConfigs.flatMap((c) => c.services.map((s) => s.hub_service_type_id))
      : services.map((s) => s.hub_service_type_id);
    if (ids.length === 0) return false;
    return ids.every((id) => {
      const st = serviceTypes.find((t) => t.id === id);
      return normalizeServiceGroupSlug(st?.service_group) === 'leva_traz';
    });
  }, [isMultiPetSelection, petVisitConfigs, services, serviceTypes]);

  useEffect(() => {
    if (!isPrimaryLevaTraz) return;
    if (withPickup) setWithPickup(false);
  }, [isPrimaryLevaTraz, withPickup]);

  useEffect(() => {
    if (!isPrimaryLevaTraz || pickupMode !== 'round_trip') return;
    setPickupAfter((pa) => {
      const startMin = hmToMinutes(endsHm);
      const suggestedStart = minutesToHm(startMin);
      const suggestedEnd = minutesToHm(Math.min(24 * 60 - 1, startMin + PICKUP_ROUTE_LEG_DURATION_MIN));
      if (pa.starts_hm && hmToMinutes(pa.starts_hm) >= startMin) return pa;
      return { ...pa, starts_hm: suggestedStart, ends_hm: suggestedEnd };
    });
  }, [isPrimaryLevaTraz, pickupMode, endsHm]);

  const ltServiceComboOptions = useMemo<HubComboboxOption[]>(
    () => levaTrazServiceTypes.map((st) => ({ value: st.id, label: st.name })),
    [levaTrazServiceTypes],
  );

  const kmTierComboOptions = useMemo<HubComboboxOption[]>(() => {
    const st = serviceTypes.find((s) => s.id === pickupLtServiceTypeId);
    if (!st) return [];
    const m = coercePricingMatrixFromApi(st.pricing_matrix);
    if (!m || (m.kind !== 'km_banda' && m.kind !== 'personalizado')) return [];
    return m.tiers.map((t, i) => ({
      value: String(i),
      label: `${t.label || `Opção ${i + 1}`} — R$ ${Number(t.sale_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    }));
  }, [serviceTypes, pickupLtServiceTypeId]);

  const pickupLtPricingKind = useMemo<'km_banda' | 'personalizado' | 'simple'>(() => {
    const st = serviceTypes.find((s) => s.id === pickupLtServiceTypeId);
    const m = st ? coercePricingMatrixFromApi(st.pricing_matrix) : null;
    if (m?.kind === 'km_banda') return 'km_banda';
    if (m?.kind === 'personalizado') return 'personalizado';
    return 'simple';
  }, [serviceTypes, pickupLtServiceTypeId]);

  const pickupUsesPriceTiers = kmTierComboOptions.length > 0;

  useEffect(() => {
    if (!withPickup) return;
    if (pickupLtServiceTypeId) return;
    if (levaTrazServiceTypes.length === 1) setPickupLtServiceTypeId(levaTrazServiceTypes[0]!.id);
  }, [withPickup, pickupLtServiceTypeId, levaTrazServiceTypes]);

  useEffect(() => {
    const st = serviceTypes.find((s) => s.id === pickupLtServiceTypeId);
    if (!st || !pickupLtServiceTypeId) return;
    const m = coercePricingMatrixFromApi(st.pricing_matrix);
    if (
      (m?.kind === 'km_banda' || m?.kind === 'personalizado') &&
      pickupKmTierIndex >= m.tiers.length
    ) {
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

  const updatePetVisitConfig = useCallback(
    (petIdToUpdate: string, nextConfig: PetVisitConfig) => {
      setPetVisitConfigs((prev) => {
        let next = prev.map((c) => (c.petId === petIdToUpdate ? nextConfig : c));
        if (syncSameServicesForAll && petIdToUpdate === effectiveSelectedPetIds[0]) {
          const source = next.find((c) => c.petId === petIdToUpdate)!;
          next = next.map((c, idx) =>
            idx === 0
              ? c
              : {
                  ...c,
                  services: source.services.map((s) => ({ ...s })),
                  selectedAddons: source.selectedAddons.map((a) => ({ ...a })),
                  pricingApptPorteTier: source.pricingApptPorteTier,
                  pricingApptCoatType: source.pricingApptCoatType,
                },
          );
        }
        return next;
      });
    },
    [syncSameServicesForAll, effectiveSelectedPetIds],
  );

  useEffect(() => {
    if (!multiPetEnabled || selectedPetIds.length < 2) {
      return;
    }
    setPetVisitConfigs((prev) => {
      const prevById = new Map(prev.map((c) => [c.petId, c]));
      const newlyAddedId = selectedPetIds.find((id) => !prevById.has(id));
      const seedFromSingle = prev.length === 0 && services.length > 0;
      return selectedPetIds.map((id, idx) => {
        const existing = prevById.get(id);
        if (existing) {
          return newlyAddedId === id ? { ...existing, expanded: true } : existing;
        }
        if (seedFromSingle && idx === 0) {
          return {
            petId: id,
            expanded: true,
            services: services.map((s) => ({ ...s })),
            selectedAddons: selectedAddons.map((a) => ({ ...a })),
            pricingApptPorteTier,
            pricingApptCoatType,
            hubStaffMemberId: staffId,
            extraBlocks: [],
          };
        }
        const firstExisting = prevById.get(selectedPetIds[0]!);
        if (syncSameServicesForAll && firstExisting) {
          return {
            ...clonePetVisitConfig(firstExisting),
            petId: id,
            expanded: newlyAddedId === id,
            extraBlocks: [],
          };
        }
        return emptyPetVisitConfig(id, newlyAddedId === id, staffId);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sincroniza só quando a lista de pets muda
  }, [multiPetEnabled, selectedPetIds.join('|')]);

  useEffect(() => {
    if (!multiPetEnabled || selectedPetIds.length >= 2) return;
    setPetVisitConfigs([]);
    setSyncSameServicesForAll(false);
    setSyncSameStaffForAll(true);
  }, [multiPetEnabled, selectedPetIds.length]);

  const serviceIdsForPorteUnion = useMemo(() => {
    const ids = isMultiPetSelection
      ? petVisitConfigs.flatMap((c) => [
          ...c.services.map((s) => s.hub_service_type_id),
          ...c.extraBlocks.flatMap((b) => b.services.map((s) => s.hub_service_type_id)),
        ])
      : services.map((s) => s.hub_service_type_id);
    if (!isMultiPetSelection) {
      for (const b of extraBlocks) {
        for (const s of b.services) ids.push(s.hub_service_type_id);
      }
    }
    return ids;
  }, [isMultiPetSelection, petVisitConfigs, services, extraBlocks]);

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

  const multiPetPricingSummaries = useMemo(() => {
    if (!isMultiPetSelection || petVisitConfigs.length < 2) return null;
    return petVisitConfigs.map((cfg) => {
      const pet = guardianPets.find((p) => p.id === cfg.petId);
      const bodyTier =
        pet?.size_tier && PET_BODY_PORTE_VALUES.includes(pet.size_tier as PetBodyPorteValue)
          ? pet.size_tier
          : 'medio';
      const preview = buildAgendaPricingPreview({
        mainServices: [
          ...cfg.services.map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            name: s.name,
            pricing_variant: s.pricing_variant,
            sale_amount_override: s.sale_amount_override,
            isAddon: false as const,
          })),
          ...cfg.selectedAddons.map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            name: s.name,
            pricing_variant: s.pricing_variant,
            sale_amount_override: s.sale_amount_override,
            isAddon: true as const,
          })),
        ],
        extraServices: [],
        serviceTypes: serviceTypesForPricing,
        petSizeTier: bodyTier,
        petBirthDate: pet?.birth_date ?? null,
        petCoatType: pet?.coat_type ?? null,
        appointmentDateYmd: dateYmd,
        puppyMaxMonths,
        appointmentOverrideTier: cfg.pricingApptPorteTier.trim() || null,
        appointmentOverrideCoatType: cfg.pricingApptCoatType.trim() || null,
      });
      return {
        petId: cfg.petId,
        petName: pet?.name ?? 'Pet',
        total: preview.totalSale,
        needsCoatType: preview.lines.some((l) => l.needsCoatType),
        serviceNames: cfg.services.map((s) => s.name).join(' + ') || '—',
      };
    });
  }, [
    isMultiPetSelection,
    petVisitConfigs,
    guardianPets,
    serviceTypesForPricing,
    dateYmd,
    puppyMaxMonths,
  ]);

  const pricingPreview = useMemo(
    () =>
      buildAgendaPricingPreview({
        mainServices: [
          ...services.map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            name: s.name,
            pricing_variant: s.pricing_variant,
            sale_amount_override: s.sale_amount_override,
            isAddon: false as const,
          })),
          ...selectedAddons.map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            name: s.name,
            pricing_variant: s.pricing_variant,
            sale_amount_override: s.sale_amount_override,
            isAddon: true as const,
          })),
        ],
        extraServices: extraBlocks.flatMap((b) =>
          b.services.map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            name: s.name,
            pricing_variant: s.pricing_variant,
            sale_amount_override: s.sale_amount_override,
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

  const pricingLineByServiceId = useMemo(() => {
    const map = new Map<string, (typeof pricingPreview.lines)[0]>();
    for (const ln of pricingPreview.lines) {
      if (!ln.isAddon) map.set(ln.hub_service_type_id, ln);
    }
    return map;
  }, [pricingPreview.lines]);

  const pickupPricingPreview = useMemo(() => {
    const mode = pickupMode;
    const legCount = pickupModeLegCount(mode);

    if (isPrimaryLevaTraz) {
      const primaryId = isMultiPetSelection
        ? petVisitConfigs[0]?.services[0]?.hub_service_type_id
        : services[0]?.hub_service_type_id;
      if (!primaryId) return null;
      const st = serviceTypes.find((s) => s.id === primaryId);
      if (!st) return null;
      const tierIdx =
        services[0]?.pricing_variant && 'km_tier_index' in (services[0].pricing_variant ?? {})
          ? Number((services[0].pricing_variant as { km_tier_index?: number }).km_tier_index) || 0
          : services[0]?.pricing_variant && 'custom_tier_index' in (services[0].pricing_variant ?? {})
            ? Number((services[0].pricing_variant as { custom_tier_index?: number }).custom_tier_index) || 0
            : 0;
      const band = previewLevaTrazBandPricing(st, tierIdx);
      const scope = normalizePickupPriceScope(st.pickup_price_scope);
      const amounts = resolvePickupLegAmounts(band.catalogSale, band.catalogCost, scope, legCount);
      return {
        bandLabel: band.bandLabel,
        scope,
        mode,
        catalogSale: band.catalogSale,
        totalSale: amounts.totalSale,
        totalCost: amounts.totalCost,
        source: 'standalone' as const,
      };
    }

    if (!withPickup || !pickupLtServiceTypeId.trim()) return null;
    const st = serviceTypes.find((s) => s.id === pickupLtServiceTypeId.trim());
    if (!st) return null;
    const band = previewLevaTrazBandPricing(st, pickupKmTierIndex);
    const scope = normalizePickupPriceScope(st.pickup_price_scope);
    const amounts = resolvePickupLegAmounts(band.catalogSale, band.catalogCost, scope, legCount);
    return {
      bandLabel: band.bandLabel,
      scope,
      mode,
      catalogSale: band.catalogSale,
      totalSale: amounts.totalSale,
      totalCost: amounts.totalCost,
      source: 'attached' as const,
    };
  }, [
    isPrimaryLevaTraz,
    isMultiPetSelection,
    petVisitConfigs,
    services,
    withPickup,
    pickupLtServiceTypeId,
    pickupKmTierIndex,
    pickupMode,
    serviceTypes,
  ]);

  const pricingTierComboOptions = useMemo<HubComboboxOption[]>(() => {
    const auto: HubComboboxOption = { value: '', label: 'Automático' };
    return [auto, ...unionPricingTiers.map((t) => ({ value: t, label: PORTE_LABELS[t] }))];
  }, [unionPricingTiers]);

  const pricingCoatComboOptions = useMemo<HubComboboxOption[]>(() => {
    const auto: HubComboboxOption = { value: '', label: 'Automático' };
    return [auto, ...unionPricingCoatTypes.map((t) => ({ value: t, label: COAT_TYPE_LABELS[t] }))];
  }, [unionPricingCoatTypes]);

  const needsManualCoatType = pricingPreview.lines.some((ln) => ln.needsCoatType);

  const serviceTableOverride =
    unionPricingTiers.length > 0 || unionPricingCoatTypes.length > 0
      ? {
          porteOptions: unionPricingTiers.length > 0 ? pricingTierComboOptions : undefined,
          porteValue: pricingApptPorteTier,
          onPorteChange: setPricingApptPorteTier,
          coatOptions: unionPricingCoatTypes.length > 0 ? pricingCoatComboOptions : undefined,
          coatValue: pricingApptCoatType,
          onCoatChange: setPricingApptCoatType,
          puppyMaxMonths,
          coatRequired: needsManualCoatType,
          coatRequiredHint: 'Selecione a pelagem para precificar este serviço.',
        }
      : undefined;

  const statusComboOptions = useMemo<HubComboboxOption[]>(() => {
    const statusIcon = <CheckCircle2 size={18} strokeWidth={2} aria-hidden />;
    return Object.entries(STATUS_META).map(([v, m]) => ({
      value: v,
      label: m.label,
      icon: statusIcon,
    }));
  }, []);

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

  const updateServiceSaleAmount = (idx: number, amount: number | null) =>
    setServices((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, sale_amount_override: amount } : s)),
    );

  const updateServicePersistSpecial = (idx: number, persist: boolean, scope: 'pet' | 'guardian') =>
    setServices((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, persist_special_price: persist, persist_special_scope: scope } : s,
      ),
    );

  /** Aplica preços especiais ativos do pet/tutor nos chips (default = especial). */
  useEffect(() => {
    if (!open || !clinicId || !petId || services.length === 0) return;
    let cancelled = false;
    const svcIds = services.map((s) => s.hub_service_type_id);
    void (async () => {
      try {
        const results = await Promise.all(
          svcIds.map(async (sid) => {
            const res = await hubSpecialPricesApi.resolve({
              clinic_id: clinicId,
              hub_service_type_id: sid,
              pet_id: petId,
              guardian_id: guardianId || undefined,
              on_date: dateYmd || undefined,
            });
            return { sid, res };
          }),
        );
        if (cancelled) return;
        setServices((prev) =>
          prev.map((chip) => {
            const hit = results.find((r) => r.sid === chip.hub_service_type_id);
            const sp = hit?.res.special_price ?? null;
            const catalog = hit?.res.catalog_sale ?? null;
            if (!sp) {
              return { ...chip, special_price_hint: null };
            }
            const alreadyManual =
              chip.sale_amount_override != null &&
              chip.persist_special_price !== true &&
              Math.abs(Number(chip.sale_amount_override) - sp.sale_amount) > 0.009;
            return {
              ...chip,
              sale_amount_override: alreadyManual ? chip.sale_amount_override : sp.sale_amount,
              special_price_hint: {
                catalog_sale: catalog ?? sp.catalog_sale ?? sp.sale_amount,
                special_sale: sp.sale_amount,
                scope: sp.scope,
                family_total: sp.family_total,
                family_pet_count: sp.family_pet_count,
              },
            };
          }),
        );
      } catch {
        /* silencioso — agenda continua com catálogo */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a pet/serviços/data
  }, [open, clinicId, petId, guardianId, dateYmd, services.map((s) => s.hub_service_type_id).join('|')]);

  useEffect(() => {
    if (!open || !clinicId || !allPetServiceIdsSignature) {
      setAddonsByParent(new Map());
      return;
    }
    let cancelled = false;
    const serviceIds = allPetServiceIdsSignature.split('|').filter(Boolean);
    const timer = window.setTimeout(() => {
      setAddonsLoading(true);
      void (async () => {
        try {
          const results = await Promise.all(
            serviceIds.map(async (id) => {
              const res = await hubServiceAddonsApi.getAvailableAddons(id, clinicId);
              return { parentId: id, addons: res.addons ?? [] };
            }),
          );
          if (!cancelled) setAddonsByParent(mergeAddonsByParent(results));
        } catch {
          if (!cancelled) setAddonsByParent(new Map());
        } finally {
          if (!cancelled) setAddonsLoading(false);
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, clinicId, allPetServiceIdsSignature]);

  useEffect(() => {
    const allowed = new Set(availableAddons.map((a) => a.id));
    if (isMultiPetSelection) {
      setPetVisitConfigs((prev) =>
        prev.map((c) => ({
          ...c,
          selectedAddons: c.selectedAddons.filter((s) => allowed.has(s.hub_service_type_id)),
        })),
      );
      return;
    }
    setSelectedAddons((prev) => prev.filter((s) => allowed.has(s.hub_service_type_id)));
  }, [availableAddons, isMultiPetSelection]);

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

  // ── Extra blocks ──────────────────────────────────────────────────────────
  const addExtraBlock = () =>
    setExtraBlocks((prev) => {
      const collapsed = prev.map((b) => ({ ...b, expanded: false }));
      return [
        ...collapsed,
        createEmptyExtraBlock({
          groupFilter: groupFilter,
          startsHm: endsHm,
          staffId: staffId,
          resourceLabel: resourceLabel,
        }),
      ];
    });
  const removeExtraBlock = (key: string) => setExtraBlocks((prev) => prev.filter((b) => b.key !== key));

  const askOverlapConfirm = (detail: string | undefined, reason: string | undefined, onConfirm: () => void) => {
    setSaving(false);
    showAlert({
      type: 'warning',
      title: SCHEDULE_OVERLAP_CONFIRM_TITLE,
      message: buildScheduleOverlapConfirmMessage({
        detail,
        reason,
        isSeries: Boolean(withRecurrence && !isEditMode) || Boolean(isEditMode && seriesId),
      }),
      showCancel: true,
      confirmText: SCHEDULE_OVERLAP_CONFIRM_TEXT,
      cancelText: SCHEDULE_OVERLAP_CANCEL_TEXT,
      onConfirm: () => {
        confirmedOverlapRef.current = true;
        onConfirm();
      },
    });
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const submitPatch = async (scope: 'this' | 'future' | 'all') => {
    if (!clinicId || !appointmentId) return;
    const payload = pendingPatchPayloadRef.current;
    if (!payload) return;
    setSaving(true);
    setSaveError(null);
    try {
      const scopedPayload = {
        ...payload,
        allow_schedule_overlap: confirmedOverlapRef.current ? true : payload.allow_schedule_overlap,
      };
      if (scope !== 'this') {
        delete scopedPayload.extra_blocks;
      }
      const result = await hubAgendaApi.patch(appointmentId, scopedPayload, { scope });
      pendingPatchPayloadRef.current = null;
      confirmedOverlapRef.current = false;
      setSeriesScopePickerOpen(false);
      resetForm();
      onClose();
      onUpdated?.(result.appointment);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? 'Erro ao salvar agendamento';
      if (!confirmedOverlapRef.current && isScheduleConflictMessage(msg)) {
        askOverlapConfirm(undefined, msg, () => void submitPatch(scope));
        return;
      }
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!clinicId) return;
    if (isMultiPetSelection) {
      const emptyPet = petVisitConfigs.find((c) => c.services.length === 0);
      if (emptyPet) {
        const name = guardianPets.find((p) => p.id === emptyPet.petId)?.name ?? 'um dos pets';
        setSaveError(`Selecione pelo menos um serviço para ${name}.`);
        return;
      }
    } else if (services.length === 0) {
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
    if (effectiveSelectedPetIds.length === 0) {
      setSaveError('Selecione pelo menos um pet.');
      return;
    }
    if (isMultiPetSelection) {
      for (const cfg of petVisitConfigs) {
        const emptyEb = cfg.extraBlocks.filter((b) => b.services.length === 0);
        if (emptyEb.length > 0) {
          const name = guardianPets.find((p) => p.id === cfg.petId)?.name ?? 'pet';
          setSaveError(`Cada bloco adicional de ${name} precisa ter pelo menos um serviço.`);
          return;
        }
      }
    } else {
      const emptyExtraBlocks = extraBlocks.filter((b) => b.services.length === 0);
      if (emptyExtraBlocks.length > 0) {
        setSaveError('Cada bloco adicional precisa ter pelo menos um serviço.');
        return;
      }
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
    if (
      (isClinicalRoutine || isWalkIn) &&
      careLocation.care_location_kind === 'partner_clinic' &&
      !careLocation.hub_partner_clinic_id
    ) {
      setSaveError('Selecione a clínica parceira.');
      return;
    }

    const tierErr = validateAppointmentPorteOverride(
      pricingApptPorteTier.trim() || null,
      serviceIdsForPorteUnion,
      serviceTypes,
    );
    if (!isMultiPetSelection && tierErr) {
      setSaveError(tierErr);
      return;
    }
    if (isMultiPetSelection) {
      for (const cfg of petVisitConfigs) {
        const ids = cfg.services.map((s) => s.hub_service_type_id);
        const te = validateAppointmentPorteOverride(cfg.pricingApptPorteTier.trim() || null, ids, serviceTypes);
        if (te) {
          const name = guardianPets.find((p) => p.id === cfg.petId)?.name ?? 'pet';
          setSaveError(`${name}: ${te}`);
          return;
        }
        const ce = validateAppointmentCoatOverride(cfg.pricingApptCoatType.trim() || null, ids, serviceTypes);
        if (ce) {
          const name = guardianPets.find((p) => p.id === cfg.petId)?.name ?? 'pet';
          setSaveError(`${name}: ${ce}`);
          return;
        }
      }
    }
    const coatErr = validateAppointmentCoatOverride(
      pricingApptCoatType.trim() || null,
      serviceIdsForPorteUnion,
      serviceTypes,
    );
    if (!isMultiPetSelection && coatErr) {
      setSaveError(coatErr);
      return;
    }
    if (needsManualCoatType && effectiveSelectedPetIds.length <= 1) {
      setSaveError('Selecione a pelagem para precificar os serviços escolhidos.');
      return;
    }
    if (multiPetPricingSummaries?.some((s) => s.needsCoatType)) {
      const bad = multiPetPricingSummaries.find((s) => s.needsCoatType);
      setSaveError(`Selecione a pelagem para precificar os serviços de ${bad?.petName ?? 'um dos pets'}.`);
      return;
    }
    if (isMultiPetSelection) {
      for (const cfg of petVisitConfigs) {
        const petAddons = cfg.selectedAddons;
        const err = validateSelectedAddonVariants(petAddons, availableAddons, serviceTypes);
        if (!isClinicalRoutine && err) {
          const name = guardianPets.find((p) => p.id === cfg.petId)?.name ?? 'pet';
          setSaveError(`${name}: ${err}`);
          return;
        }
      }
    } else {
      const addonVariantErr = validateSelectedAddonVariants(selectedAddons, availableAddons, serviceTypes);
      if (!isClinicalRoutine && addonVariantErr) {
        setSaveError(addonVariantErr);
        return;
      }
    }
    if (!isClinicalRoutine && !isWalkIn && withPickup && !isPrimaryLevaTraz) {
      if (!pickupLtServiceTypeId.trim()) {
        setSaveError('Leva e Traz: selecione o tipo de serviço de transporte.');
        return;
      }
      if (levaTrazServiceTypes.length === 0) {
        setSaveError('Não há tipos de serviço «Leva e Traz» configurados na clínica.');
        return;
      }
    }

    if (!isWalkIn && !confirmedOverlapRef.current && existingAppointments.length > 0) {
      const windows: LocalScheduleWindow[] = [];
      if (isMultiPetSelection) {
        for (const cfg of petVisitConfigs) {
          const t = petVisitTimings.get(cfg.petId);
          if (!t) continue;
          const sid = syncSameStaffForAll ? staffId : cfg.hubStaffMemberId || staffId;
          windows.push(windowFromHm(dateYmd, t.startsHm, t.endsHm, sid, resourceLabel));
          for (const block of cfg.extraBlocks) {
            windows.push(
              windowFromHm(
                dateYmd,
                block.starts_hm,
                block.ends_hm,
                block.hub_staff_member_id || sid,
                block.resource_label || resourceLabel,
              ),
            );
          }
        }
      } else {
        windows.push(windowFromHm(dateYmd, startsHm, endsHm, staffId, resourceLabel));
        for (const block of extraBlocks) {
          windows.push(
            windowFromHm(
              dateYmd,
              block.starts_hm,
              block.ends_hm,
              block.hub_staff_member_id || staffId,
              block.resource_label || resourceLabel,
            ),
          );
        }
        if (withPickup && !isPrimaryLevaTraz) {
          if (pickupMode !== 'delivery_only') {
            windows.push(
              windowFromHm(
                dateYmd,
                pickupBefore.starts_hm,
                pickupBefore.ends_hm,
                pickupBefore.hub_staff_member_id,
                pickupBefore.resource_label,
              ),
            );
          }
          if (pickupMode !== 'pickup_only') {
            windows.push(
              windowFromHm(
                dateYmd,
                pickupAfter.starts_hm,
                pickupAfter.ends_hm,
                pickupAfter.hub_staff_member_id,
                pickupAfter.resource_label,
              ),
            );
          }
        } else if (isPrimaryLevaTraz && pickupMode === 'round_trip') {
          windows.push(
            windowFromHm(
              dateYmd,
              pickupAfter.starts_hm,
              pickupAfter.ends_hm,
              pickupAfter.hub_staff_member_id || staffId,
              pickupAfter.resource_label,
            ),
          );
        }
      }
      const exclude = new Set<string>();
      if (appointmentId) exclude.add(appointmentId);
      for (const a of existingAppointments) {
        if (appointmentId && a.parent_appointment_id === appointmentId) exclude.add(a.id);
      }
      for (const block of extraBlocks) {
        if (block.appointment_id) exclude.add(block.appointment_id);
      }
      const found = findLocalScheduleConflict(
        windows,
        existingAppointments.map(agendaAppointmentToConflictSlot),
        exclude,
      );
      if (found) {
        askOverlapConfirm(found.label, found.reason, () => void handleSaveRef.current());
        return;
      }
    }

    setSaving(true);
    setSaveError(null);
    setConflicts([]);

    try {
      let startsAt = toIsoTs(dateYmd, startsHm);
      let endsAt = toEndIsoTs(dateYmd, startsHm, isMultiPetSelection ? multiPetVisitEndHm : endsHm);

      if (isWalkIn) {
        const now = new Date();
        startsAt = now.toISOString();
        const durationMs = Math.max(totalDurationMin, 30) * 60_000;
        endsAt = new Date(now.getTime() + durationMs).toISOString();
      }

      if (isEditMode) {
        const extraBlocksPayload = buildExtraBlocksApiPayload(extraBlocks, dateYmd, endsAt);
        const patchPayload = {
          clinic_id: clinicId,
          hub_staff_member_id: staffId || null,
          pet_id: petId || null,
          guardian_id: guardianId || null,
          starts_at: startsAt,
          ends_at: endsAt,
          status: status as HubAppointmentStatus,
          resource_label: resourceLabel || null,
          title: title || null,
          notes: mainBlockNotes.trim() || null,
          financial_notes: financialNotes.trim() || null,
          pricing_porte_tier: pricingApptPorteTier.trim() || null,
          pricing_coat_type: pricingApptCoatType.trim() || null,
          services: [...services, ...selectedAddons].map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            duration_minutes: s.duration_minutes,
            pricing_variant: s.pricing_variant ?? undefined,
          })),
          extra_blocks: extraBlocksPayload,
          allow_schedule_overlap: confirmedOverlapRef.current || undefined,
        };
        pendingPatchPayloadRef.current = patchPayload;
        if (seriesId) {
          setSaving(false);
          setSeriesScopePickerOpen(true);
          return;
        }
        await submitPatch('this');
        return;
      }

      let lastServiceEndAt = endsAt;
      const resolvedExtraBlocksPayload = isWalkIn
        ? undefined
        : buildExtraBlocksApiPayload(extraBlocks, dateYmd, lastServiceEndAt);

      const primaryCfg = isMultiPetSelection ? petVisitConfigs[0] : null;
      const primaryServices = primaryCfg?.services ?? services;
      const primaryAddons = primaryCfg?.selectedAddons ?? selectedAddons;

      const payload: CreateHubAppointmentPayload = {
        clinic_id: clinicId,
        hub_service_type_id: primaryServices[0]!.hub_service_type_id,
        starts_at: startsAt,
        ends_at: endsAt,
        status: (isWalkIn ? 'checked_in' : status) as HubAppointmentStatus,
        hub_staff_member_id: staffId || null,
        pet_id: petId || null,
        guardian_id: guardianId || null,
        resource_label: resourceLabel || null,
        title: title || null,
        description: null,
        notes: mainBlockNotes.trim() || null,
        financial_notes: financialNotes.trim() || null,
        pricing_porte_tier: (primaryCfg?.pricingApptPorteTier ?? pricingApptPorteTier).trim() || null,
        pricing_coat_type: (primaryCfg?.pricingApptCoatType ?? pricingApptCoatType).trim() || null,
        services: [...primaryServices, ...(isWalkIn ? [] : primaryAddons)].map((s) => ({
          hub_service_type_id: s.hub_service_type_id,
          duration_minutes: s.duration_minutes,
          pricing_variant: s.pricing_variant ?? undefined,
          sale_amount_override: s.sale_amount_override ?? undefined,
          persist_special_price: s.persist_special_price === true ? true : undefined,
          persist_special_scope: s.persist_special_price ? s.persist_special_scope ?? 'pet' : undefined,
        })),
        allow_schedule_overlap: confirmedOverlapRef.current || undefined,
      };

      if (isWalkIn) {
        payload.appointment_kind = resolveWalkInAppointmentKind(
          serviceTypes,
          services.map((s) => s.hub_service_type_id),
          walkInEmergency,
        );
      } else if (isPrimaryLevaTraz) {
        // Parada operacional — o backend também infere, mas deixamos explícito no payload.
        payload.appointment_kind = 'pickup_route';
        payload.standalone_pickup_mode = pickupMode;
        if (pickupMode === 'round_trip') {
          const returnStart = toIsoTs(dateYmd, pickupAfter.starts_hm);
          const returnLegDurationMin = Math.max(
            30,
            hmToMinutes(pickupAfter.ends_hm) - hmToMinutes(pickupAfter.starts_hm),
          );
          payload.standalone_pickup_return = {
            starts_at: returnStart,
            ends_at: new Date(
              new Date(returnStart).getTime() + returnLegDurationMin * 60 * 1000,
            ).toISOString(),
            hub_staff_member_id: pickupAfter.hub_staff_member_id || staffId || null,
            resource_label: pickupAfter.resource_label || null,
          };
        }
      }

      if (isClinicalRoutine) {
        if (intakeCaseMode === 'existing' && intakeSelectedCaseId) {
          payload.intake_hub_case_id = intakeSelectedCaseId;
        } else if (intakeCaseMode === 'new') {
          payload.intake_create_new_case = true;
          const nt = intakeNewCaseTitle.trim();
          if (nt) payload.intake_new_case_title = nt;
        }
      }

      if (isClinicalRoutine || isWalkIn) {
        payload.unit_id = getSelectedUnitId();
        payload.care_location_kind = careLocation.care_location_kind;
        payload.hub_partner_clinic_id =
          careLocation.care_location_kind === 'partner_clinic'
            ? careLocation.hub_partner_clinic_id
            : null;
      }

      if (!isWalkIn && withPickup && !isPrimaryLevaTraz) {
        if (pickupMode !== 'delivery_only') {
          payload.with_pickup_route_before = {
            starts_at: toIsoTs(dateYmd, pickupBefore.starts_hm),
            ends_at: toEndIsoTs(dateYmd, pickupBefore.starts_hm, pickupBefore.ends_hm),
            hub_staff_member_id: pickupBefore.hub_staff_member_id || null,
            resource_label: pickupBefore.resource_label || null,
          };
        }
        if (pickupMode !== 'pickup_only') {
          // Usar toIsoTsForPickupReturn para garantir mesmo dia.
          // Se o horário escolhido for anterior ao fim do serviço, o início real será o fim do serviço.
          const pickupAfterStart = toIsoTsForPickupReturn(dateYmd, pickupAfter.starts_hm, lastServiceEndAt);
          // Preservar a duração da perna (diferença ends_hm - starts_hm) relativa ao início real.
          const returnLegDurationMin =
            hmToMinutes(pickupAfter.ends_hm) - hmToMinutes(pickupAfter.starts_hm);
          const returnLegEndMs =
            new Date(pickupAfterStart).getTime() + Math.max(returnLegDurationMin, 30) * 60 * 1000;
          payload.with_pickup_route_after = {
            starts_at: pickupAfterStart,
            ends_at: new Date(returnLegEndMs).toISOString(),
            hub_staff_member_id: pickupAfter.hub_staff_member_id || null,
            resource_label: pickupAfter.resource_label || null,
          };
        }
        payload.pickup_route_pricing = {
          hub_service_type_id: pickupLtServiceTypeId.trim(),
          pricing_variant:
            pickupLtPricingKind === 'personalizado'
              ? { custom_tier_index: pickupKmTierIndex }
              : pickupLtPricingKind === 'km_banda'
                ? { km_tier_index: pickupKmTierIndex }
                : {},
        };
      }

      if (resolvedExtraBlocksPayload && resolvedExtraBlocksPayload.length > 0) {
        payload.extra_blocks = resolvedExtraBlocksPayload;
      }

      if (!isWalkIn && withRecurrence) {
        const apiKind = toRecurrenceApiKind(recurrence.kind);
        const rule: HubAppointmentRecurrenceRule = {
          kind: apiKind,
          interval_value: recurrenceIntervalFor(recurrence.kind, recurrence.interval_value),
          days_of_week:
            apiKind === 'weekly' && recurrence.days_of_week.length > 0
              ? [...recurrence.days_of_week].sort((a, b) => a - b)
              : undefined,
          day_of_month: recurrence.kind === 'monthly' ? new Date(startsAt).getDate() : undefined,
          billing_mode: recurrence.billing_mode,
        };
        if (recurrence.billing_mode === 'periodic_invoice') {
          rule.invoice_issue_rule = recurrence.invoice_issue_rule;
          rule.invoice_issue_day =
            recurrence.invoice_issue_rule === 'fixed_day' ? recurrence.invoice_issue_day : null;
          rule.invoice_due_rule = recurrence.invoice_due_rule;
          rule.invoice_due_day =
            recurrence.invoice_due_rule === 'fixed_day' ? recurrence.invoice_due_day : null;
          rule.invoice_due_plus_days =
            recurrence.invoice_due_rule === 'plus_days' ? recurrence.invoice_due_plus_days : null;
        }
        if (recurrence.end_kind === 'until' && recurrence.until_date) {
          rule.until_date = recurrence.until_date;
        } else {
          rule.occurrences = recurrence.occurrences;
        }
        payload.recurrence = rule;
      }

      if (isMultiPetSelection) {
        const pets: CreateHubAppointmentBatchPetEntry[] = petVisitConfigs.map((cfg) => {
          const t = petVisitTimings.get(cfg.petId)!;
          const petStartsAt = toIsoTs(dateYmd, t.startsHm);
          const petEndsAt = toEndIsoTs(dateYmd, t.startsHm, t.endsHm);
          const entry: CreateHubAppointmentBatchPetEntry = {
            pet_id: cfg.petId,
            services: [...cfg.services, ...cfg.selectedAddons].map((s) => ({
              hub_service_type_id: s.hub_service_type_id,
              duration_minutes: s.duration_minutes,
              pricing_variant: s.pricing_variant ?? undefined,
              sale_amount_override: s.sale_amount_override ?? undefined,
              persist_special_price: s.persist_special_price === true ? true : undefined,
              persist_special_scope: s.persist_special_price
                ? s.persist_special_scope ?? 'pet'
                : undefined,
            })),
            pricing_porte_tier: cfg.pricingApptPorteTier.trim() || null,
            pricing_coat_type: cfg.pricingApptCoatType.trim() || null,
            starts_at: petStartsAt,
            ends_at: petEndsAt,
            extra_blocks: buildExtraBlocksApiPayload(cfg.extraBlocks, dateYmd, petEndsAt),
          };
          if (!syncSameStaffForAll) {
            entry.hub_staff_member_id = cfg.hubStaffMemberId || null;
          }
          return entry;
        });
        const batchResult = await hubAgendaApi.createBatch({
          clinic_id: clinicId,
          shared: { ...payload, pet_id: petVisitConfigs[0]?.petId ?? null },
          pets,
        });
        confirmedOverlapRef.current = false;
        resetForm();
        onClose();
        onCreated({
          appointment: batchResult.appointments[0]!,
          created_count: batchResult.created_count,
          conflict_count: 0,
        });
        return;
      }

      const result = await hubAgendaApi.create(payload);

      if (result.conflicts && result.conflicts.length > 0) {
        setConflicts(result.conflicts);
      }

      confirmedOverlapRef.current = false;
      resetForm();
      onClose();
      onCreated(result);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? 'Erro ao criar agendamento';
      if (!confirmedOverlapRef.current && isScheduleConflictMessage(msg)) {
        askOverlapConfirm(undefined, msg, () => void handleSaveRef.current());
        return;
      }
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };
  handleSaveRef.current = handleSave;

  const resetForm = () => {
    confirmedOverlapRef.current = false;
    setServices([]);
    setGuardianId('');
    setPetId('');
    setPetName('');
    setTitle('');
    setMainBlockNotes('');
    setMainBlockNotesUserEdited(false);
    setMainBlockExpanded(true);
    setMainBlockDetailsOpen(false);
    setFinancialNotes('');
    setTitleOverridden(false);
    setWithRecurrence(false);
    setRecurrence({ ...DEFAULT_RECURRENCE });
    setWithPickup(false);
    setPickupLtServiceTypeId('');
    setPickupKmTierIndex(0);
    ltReturnDriverUnlinkedRef.current = false;
    lastMainBlockServiceSigRef.current = '';
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
    setWalkInEmergency(false);
    setQuickRegisterOpen(false);
    setQuickRegisterPetsOnly(false);
    setStatus('confirmed');
    setPricingApptPorteTier('');
    setPricingApptCoatType('');
    setSelectedAddons([]);
    setAddonsByParent(new Map());
    setAddonsLoading(false);
    setSelectedPetIds([]);
    setPetVisitConfigs([]);
    setSyncSameServicesForAll(false);
    setSyncSameStaffForAll(true);
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
    (isMultiPetSelection
      ? petVisitConfigs.length >= 2 && petVisitConfigs.every((c) => c.services.length > 0)
      : services.length > 0) &&
    Boolean(guardianId) &&
    effectiveSelectedPetIds.length > 0 &&
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

      {(isMultiPetSelection
        ? petVisitConfigs.some(
            (c) => c.services.length > 0 || c.extraBlocks.some((b) => b.services.length > 0),
          )
        : services.length > 0) || (!isMultiPetSelection && extraBlocks.some((b) => b.services.length > 0)) ? (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Blocos no dia</p>
          <div className="nam-aside__blocks-timeline">
          {isMultiPetSelection
            ? petVisitConfigs
                .filter((c) => c.services.length > 0)
                .map((cfg) => {
                  const pet = guardianPets.find((p) => p.id === cfg.petId);
                  const t = petVisitTimings.get(cfg.petId);
                  const svcPart = cfg.services.map((s) => s.name).join(' + ') || '—';
                  const mainDur =
                    cfg.services.reduce((s, c) => s + c.duration_minutes, 0) +
                    cfg.selectedAddons.reduce((s, c) => s + c.duration_minutes, 0);
                  return (
                    <p key={cfg.petId} className="nam-aside__item nam-aside__block-line">
                      1 · {pet?.name ?? 'Pet'}: {svcPart} · {t?.startsHm ?? startsHm}–{t?.endsHm ?? endsHm} ·{' '}
                      {mainDur} min
                    </p>
                  );
                })
            : services.length > 0 ? (
            <p className="nam-aside__item nam-aside__block-line">
              {(() => {
                const svcPart = services.map((s) => s.name).join(' + ') || '—';
                const petPart = selectedPetNamesLabel || petName || '';
                const pt =
                  title.trim() ||
                  buildBlockTitleFromServices(
                    services.map((s) => s.name),
                    petPart || null,
                  ) ||
                  svcPart;
                const timeLabel = isWalkIn ? 'agora' : `${startsHm}–${endsHm}`;
                const label = `${pt} · ${timeLabel} · ${totalDurationMin} min`;
                return `1 · ${label.length > 64 ? `${label.slice(0, 64)}…` : label}`;
              })()}
            </p>
          ) : null}
          {isMultiPetSelection
            ? petVisitConfigs.flatMap((cfg) =>
                cfg.extraBlocks
                  .filter((b) => b.services.length > 0)
                  .map((b, i) => {
                    const pet = guardianPets.find((p) => p.id === cfg.petId);
                    const fallbackTitle = buildBlockTitleFromServices(
                      b.services.map((s) => s.name),
                      pet?.name ?? null,
                    );
                    const label = (b.block_title.trim() || fallbackTitle || b.services.map((s) => s.name).join(' + ')).slice(0, 40);
                    return (
                      <p key={`${cfg.petId}-${b.key}`} className="nam-aside__item nam-aside__block-line">
                        {i + 2} · {pet?.name ?? 'Pet'} — {label} · {b.starts_hm}–{b.ends_hm} ·{' '}
                        {b.services.reduce((s, c) => s + c.duration_minutes, 0)} min
                      </p>
                    );
                  }),
              )
            : extraBlocks
                .filter((b) => b.services.length > 0)
                .map((b, i) => {
                  const fallbackTitle = buildBlockTitleFromServices(
                    b.services.map((s) => s.name),
                    petName || selectedPetNamesLabel || null,
                  );
                  const label = (
                    b.block_title.trim() ||
                    fallbackTitle ||
                    b.services.map((s) => s.name).join(' + ')
                  ).slice(0, 48);
                  return (
                    <p key={b.key} className="nam-aside__item nam-aside__block-line">
                      {i + 2} · {label} · {b.starts_hm}–{b.ends_hm} ·{' '}
                      {b.services.reduce((s, c) => s + c.duration_minutes, 0)} min
                    </p>
                  );
                })}
          </div>
          <div className="nam-aside__total">
            <span>Total duração</span>
            <strong>{totalDurationAllBlocks}min</strong>
          </div>
          {isMultiPetSelection ? (
            <p className="nam-aside__muted" style={{ marginTop: 6, fontSize: 12 }}>
              Visita: {startsHm}–{multiPetVisitEndHm}
              {syncSameStaffForAll ? ' · sequencial (mesmo profissional)' : ' · paralelo'}
            </p>
          ) : null}
        </div>
      ) : null}

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

      {isMultiPetSelection ? (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Pets ({effectiveSelectedPetIds.length})</p>
          <p className="nam-aside__item">{selectedPetNamesLabel}</p>
          {guardianName ? <p className="nam-aside__muted">{guardianName}</p> : null}
        </div>
      ) : petName ? (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Pet</p>
          <p className="nam-aside__item">{petName}</p>
          {guardianName ? <p className="nam-aside__muted">{guardianName}</p> : null}
        </div>
      ) : null}

      {(pricingPreview.lines.length > 0 || pickupPricingPreview || multiPetPricingSummaries) && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Preços (estimativa)</p>
          {!isMultiPetSelection && pickupPricingPreview?.source !== 'standalone' ? (
            <>
              <p className="nam-aside__muted" style={{ fontSize: 12, marginBottom: 6 }}>
                {pricingApptPorteTier.trim()
                  ? `Override: ${PORTE_LABELS[pricingApptPorteTier.trim() as PorteValue] ?? pricingApptPorteTier}`
                  : 'Automático (idade + porte)'}
                {pricingApptCoatType.trim()
                  ? ` · Pelagem: ${COAT_TYPE_LABELS[pricingApptCoatType.trim() as CoatTypeValue] ?? pricingApptCoatType}`
                  : ''}
              </p>
              {pricingPreview.lines.map((ln, i) => {
                const chip = services.find((s) => s.hub_service_type_id === ln.hub_service_type_id);
                const sale = ln.effectiveSale;
                const specialHint = chip?.special_price_hint;
                const showSpecial = ln.hasSpecialOverride || Boolean(specialHint);
                const catalogSale = specialHint?.catalog_sale ?? ln.sale;
                return (
                <div
                  key={`${ln.hub_service_type_id}-${ln.name}-${i}`}
                  className={ln.isAddon ? 'nam-aside__row nam-aside__row--addon' : 'nam-aside__row'}
                >
                  <span className="nam-aside__item">{ln.isAddon ? `Adicional: ${ln.name}` : ln.name}</span>
                  <span className="nam-aside__muted">
                    {ln.isAddon
                      ? sale.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : (
                          <>
                            {ln.tierApplied ? PORTE_LABELS[ln.tierApplied as PorteValue] ?? ln.tierApplied : '—'}
                            {ln.coatTypeApplied
                              ? ` / ${COAT_TYPE_LABELS[ln.coatTypeApplied as CoatTypeValue] ?? ln.coatTypeApplied}`
                              : ''}
                            {ln.needsCoatType ? ' / selecione pelagem' : ''} ·{' '}
                            {sale.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            {showSpecial ? (
                              <span className="nam-aside__special-note">
                                especial
                                {Math.abs(catalogSale - sale) > 0.009
                                  ? ` · catálogo ${catalogSale.toLocaleString('pt-BR', {
                                      style: 'currency',
                                      currency: 'BRL',
                                    })}`
                                  : ''}
                              </span>
                            ) : null}
                          </>
                        )}
                  </span>
                </div>
              );
              })}
            </>
          ) : null}
          {pickupPricingPreview && pickupPricingPreview.source === 'attached' ? (
            <div className="nam-aside__row">
              <span className="nam-aside__item">
                Leva e Traz ({pickupPricingPreview.bandLabel}
                {pickupPricingPreview.mode === 'round_trip'
                  ? ' · ida e volta'
                  : pickupPricingPreview.mode === 'pickup_only'
                    ? ' · só busca'
                    : ' · só retorno'}
                )
              </span>
              <span className="nam-aside__muted">
                {pickupPricingPreview.totalSale.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          ) : null}
          {pickupPricingPreview && pickupPricingPreview.source === 'standalone' ? (
            <div className="nam-aside__row">
              <span className="nam-aside__item">
                Leva e Traz ({pickupPricingPreview.bandLabel}
                {pickupPricingPreview.mode === 'round_trip'
                  ? ' · ida e volta'
                  : pickupPricingPreview.mode === 'pickup_only'
                    ? ' · só busca'
                    : ' · só retorno'}
                {pickupPricingPreview.scope === 'per_leg' ? ' · por perna' : ''}
                )
              </span>
              <span className="nam-aside__muted">
                {pickupPricingPreview.totalSale.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          ) : null}
          {multiPetPricingSummaries && multiPetPricingSummaries.length > 1 ? (
            <ul className="nam-pet-preview-list" style={{ marginTop: 10, marginBottom: 10 }}>
              {multiPetPricingSummaries.map((row) => (
                <li key={row.petId}>
                  <span>
                    {row.petName}
                    <span className="nam-aside__muted" style={{ display: 'block', fontSize: 11 }}>
                      {row.serviceNames}
                    </span>
                  </span>
                  <strong>{row.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                </li>
              ))}
              <li style={{ borderTop: '1px solid #e8e4e0', paddingTop: 6, marginTop: 4 }}>
                <span>Total ({multiPetPricingSummaries.length} pets)</span>
                <strong>
                  {multiPetPricingSummaries
                    .reduce((s, r) => s + r.total, 0)
                    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </strong>
              </li>
            </ul>
          ) : null}
          <div className="nam-aside__total">
            <span>Total venda</span>
            <strong>
              {(isMultiPetSelection && multiPetPricingSummaries
                ? multiPetPricingSummaries.reduce((s, r) => s + r.total, 0) +
                  (pickupPricingPreview?.source === 'attached' ? pickupPricingPreview.totalSale : 0)
                : pickupPricingPreview?.source === 'standalone'
                  ? pickupPricingPreview.totalSale
                  : pricingPreview.totalSale +
                    (pickupPricingPreview?.source === 'attached' ? pickupPricingPreview.totalSale : 0)
              ).toLocaleString('pt-BR', {
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

      {!isEditMode && withPickup && !isPrimaryLevaTraz && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Leva e Traz</p>
            {pickupPricingPreview ? (
            <p className="nam-aside__muted">{pickupPricingPreview.bandLabel}</p>
          ) : null}
          <p className="nam-aside__item">Busca {pickupBefore.starts_hm} – {pickupBefore.ends_hm}</p>
          <p className="nam-aside__item">Retorno {pickupAfter.starts_hm} – {pickupAfter.ends_hm}</p>
        </div>
      )}
      {!isEditMode && isPrimaryLevaTraz && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Leva e Traz</p>
          <p className="nam-aside__muted">
            {pickupMode === 'round_trip'
              ? 'Ida e volta — 2 paradas no board do dia'
              : pickupMode === 'pickup_only'
                ? 'Só busca — 1 parada operacional'
                : 'Só retorno — 1 parada operacional'}
          </p>
          {pickupMode === 'round_trip' ? (
            <>
              <p className="nam-aside__item">Busca {startsHm} – {endsHm}</p>
              <p className="nam-aside__item">Retorno {pickupAfter.starts_hm} – {pickupAfter.ends_hm}</p>
            </>
          ) : null}
        </div>
      )}

      {!isEditMode && withRecurrence && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Repetição</p>
          <p className="nam-aside__item">
            {RECURRENCE_LABELS[recurrence.kind]}
            {recurrence.kind !== 'biweekly' && recurrence.interval_value > 1
              ? ` a cada ${recurrence.interval_value}`
              : ''}
          </p>
          {recurrence.end_kind === 'occurrences'
            ? <p className="nam-aside__muted">{recurrence.occurrences} ocorrências</p>
            : <p className="nam-aside__muted">até {recurrence.until_date}</p>}
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
      <button
        className="hub-btn hub-btn--primary"
        type="button"
        onClick={handleSave}
        disabled={saving || !canSaveDefault}
      >
        {saving
          ? 'Salvando…'
          : isEditMode
            ? 'Salvar alterações'
            : isWalkIn
              ? 'Registrar encaixe'
              : withRecurrence
                ? 'Criar série'
                : 'Criar agendamento'}
      </button>
    </>
  );

  const seriesScopeOverlay = seriesScopePickerOpen
    ? createPortal(
        <div className="hub-agenda-series-scope" role="dialog" aria-modal="true" aria-label="Escopo da série">
          <div className="hub-agenda-series-scope__card">
            <h3 className="hub-agenda-series-scope__title">Aplicar alterações em</h3>
            <p className="hub-agenda-series-scope__hint">Este agendamento faz parte de uma série recorrente.</p>
            {extraBlocks.length > 0 ? (
              <p className="hub-agenda-series-scope__hint">
                Blocos adicionais só serão salvos se escolher «Só este agendamento».
              </p>
            ) : null}
            <div className="hub-agenda-series-scope__actions">
              <button type="button" className="hub-btn hub-btn--secondary" onClick={() => void submitPatch('this')} disabled={saving}>
                Só este agendamento
              </button>
              <button type="button" className="hub-btn hub-btn--secondary" onClick={() => void submitPatch('future')} disabled={saving}>
                Este e os futuros
              </button>
              <button type="button" className="hub-btn hub-btn--primary" onClick={() => void submitPatch('all')} disabled={saving}>
                Toda a série
              </button>
            </div>
            <button
              type="button"
              className="hub-agenda-series-scope__cancel"
              onClick={() => {
                setSeriesScopePickerOpen(false);
                pendingPatchPayloadRef.current = null;
              }}
            >
              Voltar
            </button>
          </div>
        </div>,
        document.body,
      )
    : null;

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
                      placeholder={GUARDIAN_SEARCH_PLACEHOLDER}
                      searchPlaceholder={GUARDIAN_SEARCH_PLACEHOLDER}
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
                    guardianPetsLoading ? (
                      <div className="nam-field-shell nam-field-shell--waiting" aria-busy="true">
                        <span className="nam-field-shell__icon">
                          <Loader2 size={18} strokeWidth={2} className="nam-field-shell__spin" aria-hidden />
                        </span>
                        <span className="nam-field-shell__text">Carregando pets…</span>
                      </div>
                    ) : petComboOptions.length > 0 ? (
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
                      <div className="nam-field-shell nam-field-shell--blocked" role="status">
                        <span className="nam-field-shell__icon" aria-hidden>
                          <Dog size={18} strokeWidth={2} />
                        </span>
                        <span className="nam-field-shell__text">Nenhum pet neste tutor</span>
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

              <div className="nam-row">
                <button
                  type="button"
                  className="nam-quick-register-btn"
                  onClick={guardianId ? openQuickRegisterPetsOnly : openQuickRegisterFull}
                >
                  <Plus size={16} strokeWidth={2} aria-hidden />
                  {guardianId ? 'Cadastrar outros pets' : 'Cadastrar tutor e pets'}
                </button>
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
                  <HubTimeField
                    id="nam-cr-time"
                    label="Horário"
                    valueHm={startsHm}
                    onChangeHm={setStartsHm}
                  />
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

              {clinicId ? (
                <CareLocationFields
                  clinicId={clinicId}
                  value={careLocation}
                  onChange={setCareLocation}
                  idPrefix="nam-cr-care"
                />
              ) : null}

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
    <>
    <HubSidePanel
      open={open}
      onClose={handleClose}
      title={isEditMode ? 'Editar agendamento' : isWalkIn ? 'Encaixe / walk-in' : 'Novo agendamento'}
      titleIcon={isWalkIn ? <Zap size={22} strokeWidth={2} aria-hidden /> : <Calendar size={22} strokeWidth={2} aria-hidden />}
      subtitle={isWalkIn ? 'Check-in imediato com horário atual.' : title || autoTitle || undefined}
      footer={footer}
      aside={asideContent}
    >
      <div className="nam-form">
        <div className="nam-section nam-section--quick">
          <div className="nam-quick-card">
            {isWalkIn ? (
              <div className="nam-row">
                <div className="nam-field">
                  <label className="nam-label">Horário</label>
                  <div className="nam-field-shell" role="status">
                    <span className="nam-field-shell__icon" aria-hidden>
                      <Clock size={18} strokeWidth={2} />
                    </span>
                    <span className="nam-field-shell__text">
                      Agora, {startsHm} — check-in imediato
                    </span>
                  </div>
                </div>
              </div>
            ) : (
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
                  triggerIcon={<CheckCircle2 size={18} strokeWidth={2} aria-hidden />}
                  ariaLabel="Selecionar situação"
                />
              </div>
            </div>
            )}
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
                      setSelectedPetIds([]);
                      setPetId('');
                      setPetName('');
                    }}
                    placeholder={GUARDIAN_SEARCH_PLACEHOLDER}
                    searchPlaceholder={GUARDIAN_SEARCH_PLACEHOLDER}
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
                  guardianPetsLoading ? (
                    <div className="nam-field-shell nam-field-shell--waiting" aria-busy="true">
                      <span className="nam-field-shell__icon">
                        <Loader2 size={18} strokeWidth={2} className="nam-field-shell__spin" aria-hidden />
                      </span>
                      <span className="nam-field-shell__text">Carregando pets…</span>
                    </div>
                  ) : petComboOptions.length > 0 ? (
                    multiPetEnabled ? (
                      <AppointmentPetSelector
                        id="nam-pet"
                        pets={guardianPets}
                        selectedPetIds={selectedPetIds}
                        onChange={setSelectedPetIds}
                      />
                    ) : (
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
                    )
                  ) : (
                    <div className="nam-field-shell nam-field-shell--blocked" role="status">
                      <span className="nam-field-shell__icon" aria-hidden>
                        <Dog size={18} strokeWidth={2} />
                      </span>
                      <span className="nam-field-shell__text">Nenhum pet neste tutor</span>
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
            <div className="nam-row">
              <button
                type="button"
                className="nam-quick-register-btn"
                onClick={guardianId ? openQuickRegisterPetsOnly : openQuickRegisterFull}
              >
                <Plus size={16} strokeWidth={2} aria-hidden />
                {guardianId ? 'Cadastrar outros pets' : 'Cadastrar tutor e pets'}
              </button>
            </div>
            {isWalkIn && walkInIsClinical ? (
              <div className="nam-row" style={{ marginTop: 8 }}>
                <HubCheckbox checked={walkInEmergency} onChange={setWalkInEmergency}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Siren size={15} aria-hidden />
                    Urgência / emergência
                  </span>
                </HubCheckbox>
              </div>
            ) : null}
            {isWalkIn && clinicId ? (
              <CareLocationFields
                clinicId={clinicId}
                value={careLocation}
                onChange={setCareLocation}
                idPrefix="nam-wi-care"
              />
            ) : null}
          </div>
        </div>

        {isEditMode ? (
          <div className="nam-section nam-edit-staff-priority">
            <h3 className="nam-section-title">Equipe</h3>
            <div className="nam-quick-card">
              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <label className="nam-label" htmlFor="nam-staff-edit-top">
                    Profissional
                  </label>
                  <HubSearchableCombobox
                    id="nam-staff-edit-top"
                    options={staffComboOptions}
                    value={staffId}
                    onChange={setStaffId}
                    placeholder="Não atribuído"
                    clearable={false}
                    triggerIcon={<Stethoscope size={18} strokeWidth={2} aria-hidden />}
                    ariaLabel="Selecionar profissional"
                  />
                  {staffIncompatibleWithServices ? (
                    <p className="nam-staff-compat-warn" role="status">
                      <AlertCircle size={14} aria-hidden />
                      Este profissional não está no mapeamento dos serviços atuais. Você pode manter ou
                      trocar conscientemente.
                    </p>
                  ) : null}
                  {seriesId ? (
                    <p className="nam-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                      Série recorrente: ao salvar, escolha se a troca vale só neste, nos futuros ou em toda a
                      série.
                    </p>
                  ) : null}
                </div>
                <div className="nam-field">
                  <label className="nam-label" htmlFor="nam-resource-edit-top">
                    Recurso / Sala
                  </label>
                  <input
                    id="nam-resource-edit-top"
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
        ) : null}

        {isMultiPetSelection ? (
          <div className="nam-section nam-multi-pet-visits">
            <div className="nam-multi-pet-visits__toolbar">
              <HubCheckbox
                checked={syncSameServicesForAll}
                onChange={(checked) => {
                  setSyncSameServicesForAll(checked);
                  if (checked && petVisitConfigs[0]) {
                    const first = petVisitConfigs[0];
                    setPetVisitConfigs((prev) =>
                      prev.map((c, idx) =>
                        idx === 0
                          ? c
                          : {
                              ...c,
                              services: first.services.map((s) => ({ ...s })),
                              selectedAddons: first.selectedAddons.map((a) => ({ ...a })),
                              pricingApptPorteTier: first.pricingApptPorteTier,
                              pricingApptCoatType: first.pricingApptCoatType,
                            },
                      ),
                    );
                  }
                }}
              >
                Mesmos serviços para todos
              </HubCheckbox>
              <HubCheckbox
                checked={syncSameStaffForAll}
                onChange={(checked) => {
                  setSyncSameStaffForAll(checked);
                  if (checked) {
                    setPetVisitConfigs((prev) =>
                      prev.map((c) => ({
                        ...c,
                        hubStaffMemberId: staffId,
                        startsHmOverride: undefined,
                        endsHmOverride: undefined,
                      })),
                    );
                  }
                }}
              >
                Mesmo profissional para todos
              </HubCheckbox>
            </div>
            {petVisitConfigs.map((cfg, idx) => {
              const pet = guardianPets.find((p) => p.id === cfg.petId);
              const timing = petVisitTimings.get(cfg.petId);
              return (
                <PetVisitBlock
                  key={cfg.petId}
                  blockNumber={idx + 1}
                  petName={pet?.name ?? 'Pet'}
                  petSizeTier={pet?.size_tier ?? 'medio'}
                  petCoatType={pet?.coat_type ?? null}
                  petBirthDate={pet?.birth_date ?? null}
                  config={cfg}
                  onChange={(next) => updatePetVisitConfig(cfg.petId, next)}
                  groups={groups}
                  groupFilter={groupFilter}
                  onGroupFilterChange={setGroupFilter}
                  serviceTypes={serviceTypes}
                  addonsByParent={addonsByParent}
                  addonsLoading={addonsLoading}
                  dateYmd={dateYmd}
                  puppyMaxMonths={puppyMaxMonths}
                  showStaffField={!syncSameStaffForAll}
                  showTimeFields={!syncSameStaffForAll}
                  staffComboOptions={staffComboOptions}
                  computedStartHm={timing?.startsHm ?? startsHm}
                  computedEndHm={timing?.endsHm ?? endsHm}
                  defaultResourceLabel={resourceLabel}
                />
              );
            })}
          </div>
        ) : null}

        <div className="nam-section nam-block-card">
          <BlockCardHeader
            blockNumber={1}
            title={
              isMultiPetSelection
                ? 'Horário e detalhes da visita'
                : title.trim() || autoTitle || 'Bloco principal'
            }
            subtitle={
              isMultiPetSelection
                ? buildBlockHeaderSubtitle({
                    startsHm,
                    endsHm: multiPetVisitEndHm,
                    durationMin: totalDurationMin,
                    serviceNames: [
                      ...new Set(petVisitConfigs.flatMap((c) => c.services.map((s) => s.name))),
                    ],
                  })
                : buildBlockHeaderSubtitle({
                    startsHm: isWalkIn ? 'agora' : startsHm,
                    endsHm: isWalkIn ? '' : endsHm,
                    durationMin: totalDurationMin,
                    serviceNames: services.map((s) => s.name),
                  }) || undefined
            }
            expanded={mainBlockExpanded}
            onToggle={() => setMainBlockExpanded((e) => !e)}
          />
          {mainBlockExpanded && (
            <div className="nam-block-card__body">
        {!isMultiPetSelection ? (
        <>
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
                markedValues={addedMainServiceIds}
              />
            </div>
          </div>
          {services.length > 0 && (
            <div className="nam-service-cards">
              {services.map((chip, idx) => (
                <AppointmentServiceCard
                  key={chip.hub_service_type_id}
                  idPrefix="nam-main"
                  chip={chip}
                  serviceIndex={idx}
                  serviceType={serviceTypes.find((st) => st.id === chip.hub_service_type_id)}
                  expanded={mainServiceCardExpansion.isExpanded(chip.hub_service_type_id)}
                  onToggleExpand={() => mainServiceCardExpansion.toggle(chip.hub_service_type_id)}
                  onRemove={() => removeService(idx)}
                  onDurationChange={(dur) => updateServiceDuration(idx, dur)}
                  parentAddons={addonsByParent.get(chip.hub_service_type_id) ?? []}
                  addonsLoading={addonsLoading}
                  selectedAddons={selectedAddons}
                  onAddonToggle={toggleAddon}
                  onAddonVariantChange={updateAddonPricingVariant}
                  variantMatrix={serviceNeedsVariantMatrix(chip, serviceTypes)}
                  onVariantChange={(v) => updateServicePricingVariant(idx, v)}
                  pricingLine={pricingLineByServiceId.get(chip.hub_service_type_id) ?? null}
                  showSpecialPriceControls={Boolean(petId)}
                  onSaleAmountChange={(amount) => updateServiceSaleAmount(idx, amount)}
                  onPersistSpecialChange={(persist, scope) =>
                    updateServicePersistSpecial(idx, persist, scope)
                  }
                  tableOverride={serviceTableOverride}
                />
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
        </div>

        </>
        ) : null}

        {/* ── Horário do bloco principal ─────────────────────────────────── */}
        {!isWalkIn ? (
        <div className="nam-section">
          <div className="nam-row nam-row--cols2">
            <div className="nam-field">
              <HubTimeField
                id="nam-starts"
                label="Início"
                valueHm={startsHm}
                onChangeHm={setStartsHm}
              />
            </div>
            <div className="nam-field">
              <HubTimeField
                id="nam-ends"
                label="Fim previsto"
                valueHm={endsHm}
                onChangeHm={setEndsHm}
              />
            </div>
          </div>
        </div>
        ) : null}

        {/* ── 3 + 4. Profissional / Recurso (criação; em edição fica no topo) ─ */}
        {!isEditMode ? (
        <div className="nam-section">
          <div className="nam-row nam-row--cols2">
            {(!isMultiPetSelection || syncSameStaffForAll) ? (
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
              {staffIncompatibleWithServices ? (
                <p className="nam-staff-compat-warn" role="status">
                  <AlertCircle size={14} aria-hidden />
                  Este profissional não está no mapeamento dos serviços atuais. Você pode manter ou trocar
                  conscientemente.
                </p>
              ) : null}
            </div>
            ) : (
            <div className="nam-field">
              <label className="nam-label">Profissional</label>
              <p className="nam-muted" style={{ margin: 0, fontSize: 13 }}>
                Definido por pet nos blocos acima.
              </p>
            </div>
            )}
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
        ) : null}

        <div className="nam-section nam-block-details">
          <button
            type="button"
            className="nam-block-details__toggle"
            onClick={() => setMainBlockDetailsOpen((o) => !o)}
            aria-expanded={mainBlockDetailsOpen}
          >
            <span>Detalhes do bloco</span>
            {mainBlockDetailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {mainBlockDetailsOpen ? (
            <div className="nam-block-details__body">
              <div className="nam-section" style={{ borderBottom: 'none', paddingTop: 10 }}>
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
              <div className="nam-section" style={{ borderBottom: 'none', paddingTop: 0 }}>
                <label className="nam-label">Descrição do bloco</label>
                <div className="nam-title-row" style={{ alignItems: 'flex-start' }}>
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
                    style={{ flex: 1 }}
                  />
                  {mainBlockNotesUserEdited ? (
                    <button
                      className="nam-btn-icon"
                      type="button"
                      title="Restaurar descrição automática"
                      onClick={() => {
                        setMainBlockNotesUserEdited(false);
                        setMainBlockNotes(
                          buildServiceDescriptionBullets(
                            serviceTypes,
                            (isMultiPetSelection
                              ? petVisitConfigs.flatMap((c) => c.services)
                              : services
                            ).map((s) => s.hub_service_type_id),
                          ),
                        );
                      }}
                    >
                      <RefreshCw size={14} />
                    </button>
                  ) : null}
                </div>
                <p className="nam-char-count">{mainBlockNotes.length}/8000</p>
              </div>
            </div>
          ) : null}
        </div>
            </div>
          )}
        </div>

        {!isWalkIn && !isMultiPetSelection ? (
          <>
        {extraBlocks.length > 0 ? (
          <div className="nam-section nam-extra-blocks">
            {extraBlocks.map((block, bIdx) => (
              <ExtraBlockCard
                key={block.key}
                block={block}
                index={bIdx}
                petName={petName || selectedPetNamesLabel || null}
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
          </>
        ) : null}

        {!isWalkIn ? (
          <>
        {/* ── 9. L&T ───────────────────────────────────────────────────── */}
        <div className="nam-section">
          {isPrimaryLevaTraz ? (
            <div className="nam-pickup">
              <div className="nam-lt-standalone" role="status">
                <p className="nam-lt-standalone__title">Parada de Leva e Traz</p>
                <p className="nam-lt-standalone__text">
                  Entra no <strong>Leva e Traz operacional</strong>. Ida e volta cria duas paradas
                  (busca + retorno). O preço segue o cadastro do serviço (ida e volta ou por perna).
                </p>
              </div>
              <div
                className="nam-pickup__mode-selector"
                style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0', flexWrap: 'wrap' }}
              >
                {(
                  [
                    { value: 'round_trip', label: 'Ida e volta' },
                    { value: 'pickup_only', label: 'Só busca' },
                    { value: 'delivery_only', label: 'Só retorno' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`hub-clientes__btn hub-clientes__btn--sm${pickupMode === opt.value ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'}`}
                    onClick={() => setPickupMode(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {pickupMode === 'round_trip' ? (
                <>
                  <p className="nam-pickup__title">Retorno (segunda parada)</p>
                  <p className="nam-aside__muted" style={{ marginBottom: 8, fontSize: 13 }}>
                    A busca usa o horário principal do agendamento ({startsHm} – {endsHm}).
                  </p>
                  <div className="nam-row nam-row--cols2">
                    <div className="nam-field">
                      <HubTimeField
                        id="nam-standalone-pickup-after-start"
                        label="Início do retorno"
                        valueHm={pickupAfter.starts_hm}
                        onChangeHm={(starts_hm) => {
                          setPickupAfter((b) => ({
                            ...b,
                            starts_hm,
                            ends_hm: addMinutes(starts_hm, PICKUP_ROUTE_LEG_DURATION_MIN),
                          }));
                        }}
                      />
                    </div>
                    <div className="nam-field">
                      <label className="nam-label">Motorista (retorno)</label>
                      <HubSearchableCombobox
                        id="nam-standalone-pickup-after-staff"
                        options={staffComboOptions}
                        value={pickupAfter.hub_staff_member_id || staffId}
                        onChange={(v) => setPickupAfter((b) => ({ ...b, hub_staff_member_id: v }))}
                        placeholder="Não atribuído"
                        clearable={false}
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <>
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
                    indicado. Os horários sugeridos ao ativar L&T seguem estes critérios.
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
                {pickupUsesPriceTiers ? (
                  <div className="nam-field">
                    <label className="nam-label">
                      {pickupLtPricingKind === 'km_banda' ? 'Faixa de quilometragem' : 'Opção de preço'}
                    </label>
                    <HubSearchableCombobox
                      id="nam-pickup-km-tier"
                      options={kmTierComboOptions}
                      value={String(pickupKmTierIndex)}
                      onChange={(v) => setPickupKmTierIndex(Number(v) || 0)}
                      placeholder={pickupLtPricingKind === 'km_banda' ? 'Faixa' : 'Opção'}
                      clearable={false}
                    />
                  </div>
                ) : null}
              </div>
              <div className="nam-pickup__mode-selector" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                {(
                  [
                    { value: 'round_trip',    label: 'Ida e volta' },
                    { value: 'pickup_only',   label: 'Só busca' },
                    { value: 'delivery_only', label: 'Só retorno' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`hub-clientes__btn hub-clientes__btn--sm${pickupMode === opt.value ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'}`}
                    onClick={() => setPickupMode(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {pickupMode !== 'delivery_only' ? (
              <>
              <p className="nam-pickup__title">Busca (antes do atendimento)</p>
              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <HubTimeField
                    id="nam-pickup-before-start"
                    label="Início"
                    valueHm={pickupBefore.starts_hm}
                    onChangeHm={(starts_hm) => setPickupBefore((b) => ({ ...b, starts_hm }))}
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
              </>
              ) : null}

              {pickupMode !== 'pickup_only' ? (
              <>
              <p className="nam-pickup__title" style={{ marginTop: 12 }}>Retorno (após atendimento)</p>
              {hmToMinutes(pickupAfter.starts_hm) < hmToMinutes(pickupDayLastEndHm) ? (
                <p className="nam-pickup__return-warn">
                  ⚠ Horário anterior ao fim do atendimento ({pickupDayLastEndHm}). O retorno começará ao fim do serviço.
                  <button
                    type="button"
                    className="nam-pickup__return-warn-fix"
                    onClick={() => {
                      const fixed = addMinutes(pickupDayLastEndHm, 0);
                      setPickupAfter((b) => ({
                        ...b,
                        starts_hm: fixed,
                        ends_hm: addMinutes(fixed, PICKUP_ROUTE_LEG_DURATION_MIN),
                      }));
                    }}
                  >
                    Corrigir
                  </button>
                </p>
              ) : null}
              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <HubTimeField
                    id="nam-pickup-after-start"
                    label="Início"
                    valueHm={pickupAfter.starts_hm}
                    onChangeHm={(starts_hm) => {
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
              </>
              ) : null}
            </div>
          )}
            </>
          )}
        </div>

        {/* ── 10. Repetição ────────────────────────────────────────────── */}
        <div className="nam-section">
          {initial?.package_balance_hint ? (
            <p className="nam-aside__muted" style={{ marginBottom: 8 }}>
              {initial.package_balance_hint}
            </p>
          ) : null}
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
                    onChange={(e) => {
                      const kind = e.target.value as RecurrenceKind;
                      setRecurrence((r) => ({
                        ...r,
                        kind,
                        interval_value: recurrenceIntervalFor(
                          kind,
                          r.kind === 'biweekly' ? 1 : r.interval_value,
                        ),
                      }));
                    }}
                  >
                    <option value="daily">{RECURRENCE_LABELS.daily}</option>
                    <option value="weekly">{RECURRENCE_LABELS.weekly}</option>
                    <option value="biweekly">{RECURRENCE_LABELS.biweekly}</option>
                    <option value="monthly">{RECURRENCE_LABELS.monthly}</option>
                  </select>
                </div>
                {recurrence.kind === 'biweekly' ? (
                  <div className="nam-field">
                    <label className="nam-label">Intervalo</label>
                    <p className="nam-aside__muted" style={{ marginTop: 8 }}>
                      A cada 2 semanas
                    </p>
                  </div>
                ) : (
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
                )}
              </div>

              {(recurrence.kind === 'weekly' || recurrence.kind === 'biweekly') && (
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

              <div className="nam-field" style={{ marginTop: 12 }}>
                <label className="nam-label">Como quer cobrar esta série?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                  <label className="nam-checkbox-label" style={{ alignItems: 'flex-start' }}>
                    <input
                      type="radio"
                      name="nam-series-billing"
                      checked={recurrence.billing_mode === 'per_occurrence'}
                      onChange={() => setRecurrence((r) => ({ ...r, billing_mode: 'per_occurrence' }))}
                    />
                    <span>
                      <strong>Separado</strong> — cada dia no caixa (como hoje)
                    </span>
                  </label>
                  <label className="nam-checkbox-label" style={{ alignItems: 'flex-start' }}>
                    <input
                      type="radio"
                      name="nam-series-billing"
                      checked={recurrence.billing_mode === 'periodic_invoice'}
                      onChange={() => setRecurrence((r) => ({ ...r, billing_mode: 'periodic_invoice' }))}
                    />
                    <span>
                      <strong>Fatura em série</strong> — cobrança agrupada no mês
                    </span>
                  </label>
                </div>
              </div>

              {recurrence.billing_mode === 'periodic_invoice' ? (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
                  <p className="nam-aside__muted" style={{ marginBottom: 8 }}>
                    A agenda mantém todas as datas; a cobrança sai numa única fatura por mês.
                  </p>
                  <div className="nam-row nam-row--cols2">
                    <div className="nam-field">
                      <label className="nam-label">Emitir em</label>
                      <select
                        className="nam-select"
                        value={recurrence.invoice_issue_rule}
                        onChange={(e) =>
                          setRecurrence((r) => ({
                            ...r,
                            invoice_issue_rule: e.target.value as RecurrenceForm['invoice_issue_rule'],
                          }))
                        }
                      >
                        <option value="first_business_day">1º dia útil do mês</option>
                        <option value="fixed_day">Dia fixo do mês</option>
                      </select>
                    </div>
                    {recurrence.invoice_issue_rule === 'fixed_day' ? (
                      <div className="nam-field">
                        <label className="nam-label">Dia da emissão</label>
                        <input
                          className="nam-input"
                          type="number"
                          min={1}
                          max={28}
                          value={recurrence.invoice_issue_day}
                          onChange={(e) =>
                            setRecurrence((r) => ({ ...r, invoice_issue_day: Number(e.target.value) || 1 }))
                          }
                        />
                      </div>
                    ) : (
                      <div className="nam-field" />
                    )}
                  </div>
                  <div className="nam-row nam-row--cols2">
                    <div className="nam-field">
                      <label className="nam-label">Vencimento</label>
                      <select
                        className="nam-select"
                        value={recurrence.invoice_due_rule}
                        onChange={(e) =>
                          setRecurrence((r) => ({
                            ...r,
                            invoice_due_rule: e.target.value as RecurrenceForm['invoice_due_rule'],
                          }))
                        }
                      >
                        <option value="same_day">Mesmo dia da emissão</option>
                        <option value="plus_days">Emissão + N dias</option>
                        <option value="fixed_day">Dia fixo do mês</option>
                      </select>
                    </div>
                    {recurrence.invoice_due_rule === 'plus_days' ? (
                      <div className="nam-field">
                        <label className="nam-label">Dias após emissão</label>
                        <input
                          className="nam-input"
                          type="number"
                          min={0}
                          max={90}
                          value={recurrence.invoice_due_plus_days}
                          onChange={(e) =>
                            setRecurrence((r) => ({
                              ...r,
                              invoice_due_plus_days: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                    ) : recurrence.invoice_due_rule === 'fixed_day' ? (
                      <div className="nam-field">
                        <label className="nam-label">Dia do vencimento</label>
                        <input
                          className="nam-input"
                          type="number"
                          min={1}
                          max={28}
                          value={recurrence.invoice_due_day}
                          onChange={(e) =>
                            setRecurrence((r) => ({ ...r, invoice_due_day: Number(e.target.value) || 1 }))
                          }
                        />
                      </div>
                    ) : (
                      <div className="nam-field" />
                    )}
                  </div>
                  <p className="nam-aside__muted" style={{ marginTop: 8 }}>
                    Preview: fatura mensal · emite{' '}
                    {recurrence.invoice_issue_rule === 'first_business_day'
                      ? 'no 1º dia útil'
                      : `no dia ${recurrence.invoice_issue_day}`}
                    {' · vence '}
                    {recurrence.invoice_due_rule === 'same_day'
                      ? 'no mesmo dia'
                      : recurrence.invoice_due_rule === 'plus_days'
                        ? `${recurrence.invoice_due_plus_days} dia(s) depois`
                        : `no dia ${recurrence.invoice_due_day}`}
                    .
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>

          </>
        ) : null}

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
    <ReceptionQuickRegisterPanel
      open={quickRegisterOpen}
      clinicId={clinicId}
      petsOnly={quickRegisterPetsOnly}
      existingGuardianId={guardianId || undefined}
      existingGuardianName={guardianName || undefined}
      onClose={() => {
        setQuickRegisterOpen(false);
        setQuickRegisterPetsOnly(false);
      }}
      onSaved={applyQuickRegisterResult}
    />
    {seriesScopeOverlay}
    </>
  );
};
