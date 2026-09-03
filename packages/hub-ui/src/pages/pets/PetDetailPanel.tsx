import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  X,
  ExternalLink,
  Pencil,
  User,
  StickyNote,
  CalendarClock,
  Pill,
  Syringe,
  MoreHorizontal,
  FilePlus2,
  Coins,
  Heart,
  Calendar,
  Palette,
  Ruler,
  Tag,
  Stethoscope,
  FileText,
  ClipboardList,
  ChevronRight,
  Bird,
  Cat,
  Dog,
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  History,
} from 'lucide-react';
import { usePermissions } from '@petimi/web-core';
import type { HubPet, HubPetProfileChange } from '../../api/hubPetsApi';
import { hubPetsApi } from '../../api/hubPetsApi';
import {
  hubEncountersApi,
  hubClinicalApi,
  hubClinicalCasesApi,
  type HubClinicalCase,
  type HubEncounter,
  type HubEncounterStatus,
  type HubEncounterType,
  type HubPetClinicalFlag,
  type HubPrescription,
  type HubVaccination,
} from '../../api/hubClinicalApi';
import { HubTabs } from '../../components/HubTabs';
import { HubProfileInfoCell } from '../../components/HubProfileInfoCell';
import { HubProfileAvatar, profileInitials } from '../../components/HubProfileAvatar';
import { HubLoading } from '../../components/HubLoading';
import { ProfileFinanceSummaryCard } from '../../components/ProfileFinanceSummaryCard';
import { useAlert } from '../../components/AlertProvider';
import { formatPrescriptionLine } from '../clinica/clinicalDisplay';
import { petAgeDetailedLabel } from './petAge';
import {
  COAT_TYPE_LABELS,
  PORTE_LABELS,
  type CoatTypeValue,
  type PetBodyPorteValue,
} from '../../utils/hubServiceTypesPricingMatrix';
import { hubComandaApi } from '../../api/hubComandaApi';
import { hubFinancialApi, type HubFinanceReceivable } from '../../api/hubFinancialApi';
import { hubPackagesApi, type HubPackageBalance } from '../../api/hubPackagesApi';
import {
  hubAgendaApi,
  type HubAppointment,
  type HubAppointmentStatus,
} from '../../api/hubAgendaApi';
import { PetBehaviorTagsDisplay } from './PetBehaviorTagsDisplay';
import { PetProfileHistoryList } from './PetProfileHistoryList';
import { neuteredLabel } from './petClinicalFlags';
import { ComandaCheckoutDrawer } from '../finance/ComandaCheckoutDrawer';
import { HubComandaReceivableDrawer } from '../finance/HubComandaReceivableDrawer';
import {
  formatComandaListOpenedAt,
  formatComandaListPets,
  formatComandaListTitle,
  formatComandaOriginLabel,
  formatReceivableListTitle,
  isReceivablePayable,
  resolveComandaProfileChargeAction,
  resolveComandaProfileHref,
  resolveReceivableProfileHref,
} from '../finance/comandaListPreview';
import { ReceivableDueBadge } from '../finance/ReceivableDueBadge';
import { formatDueDateShort } from '../finance/dueDateTone';
import { buildProfileFinanceSummary } from '../finance/profileFinanceSummary';
import { buildBatchChargeItems } from '../finance/batchChargeItems';
import { BatchChargeDrawer } from '../finance/BatchChargeDrawer';
import { ChargeBundleHistorySection } from '../finance/ChargeBundleHistorySection';
import { SpecialPricesSection } from '../../components/SpecialPricesSection';
import { appointmentDrillHref } from '../finance/hubRelatoriosLinks';
import '../../components/hub-profile.css';
import '../clinica/clinica-page.css';
import '../clientes/clientes.css';
import '../finance/hub-finance-page.css';

type PetDetailTab = 'resumo' | 'historico_saude' | 'servicos' | 'financeiro';
type ProfileLayout = 'panel' | 'page';

const HISTORICO_PREVIEW_LIMIT = 3;
const UPCOMING_APPOINTMENTS_LIMIT = 3;

interface PetDetailPanelProps {
  pet: HubPet;
  onClose: () => void;
  onStartEdit: () => void;
  onOpenInNewPage?: () => void;
  onArchive?: () => void;
  hideNewPageButton?: boolean;
  hideHeader?: boolean;
  hideFooter?: boolean;
  layout?: ProfileLayout;
  canWrite: boolean;
  clinicId?: string | null;
  unitId?: string | null;
  canCreateReceivable?: boolean;
}

function formatBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function speciesKind(species: string): 'dog' | 'cat' | 'other' {
  const s = species.trim().toLowerCase();
  if (/gato|cat|felin/.test(s)) return 'cat';
  if (/c[aã]o|dog|canin/.test(s)) return 'dog';
  return 'other';
}

function PetSpeciesIcon({ species }: { species: string }) {
  const kind = speciesKind(species);
  const props = { size: 15, strokeWidth: 2, 'aria-hidden': true as const };
  if (kind === 'cat') return <Cat {...props} />;
  if (kind === 'dog') return <Dog {...props} />;
  return <Bird {...props} />;
}

function comandaBelongsToPet(comanda: Record<string, unknown>, petId: string): boolean {
  if ((comanda.pet_id as string | null | undefined) === petId) return true;
  const pets = comanda.pets as Array<{ id?: string }> | null | undefined;
  if (Array.isArray(pets) && pets.some((p) => p?.id === petId)) return true;
  return false;
}

function sexLabel(s: string | null): string {
  if (s === 'M') return 'Macho';
  if (s === 'F') return 'Fêmea';
  if (s === 'U') return 'Indefinido';
  return '—';
}

function formatDateBR(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayYmd(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="hub-pets-detail__info-pair">
      <span className="hub-pets-detail__info-label">{label}</span>
      <span className="hub-pets-detail__info-value">{value}</span>
    </div>
  );
}

function encounterStatusLabel(status: HubEncounterStatus | string): string {
  if (status === 'waiting') return 'Aguardando';
  if (status === 'in_progress') return 'Em atendimento';
  if (status === 'completed') return 'Finalizado';
  if (status === 'cancelled') return 'Cancelado';
  return status;
}

function encounterTypeLabel(type: HubEncounterType | string): string {
  if (type === 'consultation') return 'Consulta';
  if (type === 'return') return 'Retorno';
  if (type === 'emergency') return 'Emergência';
  if (type === 'procedure') return 'Procedimento';
  return type;
}

function caseStatusLabel(status: HubClinicalCase['status']): string {
  if (status === 'active') return 'Ativo';
  if (status === 'monitoring') return 'Monitoramento';
  if (status === 'resolved') return 'Resolvido';
  if (status === 'cancelled') return 'Cancelado';
  return status;
}

function encounterWhenLabel(e: HubEncounter): string {
  const raw = e.completed_at || e.started_at;
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function appointmentStatusLabel(status: HubAppointmentStatus): string {
  if (status === 'pending_confirm') return 'Aguardando confirmação';
  if (status === 'confirmed') return 'Confirmado';
  if (status === 'checked_in') return 'Check-in realizado';
  if (status === 'in_progress') return 'Em andamento';
  if (status === 'done') return 'Concluído';
  if (status === 'paid') return 'Pago';
  return 'Cancelado';
}

function appointmentTitle(appointment: HubAppointment): string {
  return (
    appointment.title ||
    appointment.service_type?.name ||
    appointment.services[0]?.service_type?.name ||
    'Agendamento'
  );
}

function sortEncountersRecent(list: HubEncounter[]): HubEncounter[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.started_at || a.completed_at || 0).getTime();
    const tb = new Date(b.started_at || b.completed_at || 0).getTime();
    return tb - ta;
  });
}

function sortPrescriptionsRecent(list: HubPrescription[]): HubPrescription[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.prescribed_at || 0).getTime();
    const tb = new Date(b.prescribed_at || 0).getTime();
    return tb - ta;
  });
}

export const PetDetailPanel: React.FC<PetDetailPanelProps> = ({
  pet,
  onClose,
  onStartEdit,
  onOpenInNewPage,
  onArchive,
  hideNewPageButton = false,
  hideHeader = false,
  hideFooter = false,
  layout = 'panel',
  canWrite,
  clinicId,
  unitId,
  canCreateReceivable = false,
}) => {
  const navigate = useNavigate();
  const { showError } = useAlert();
  const { hasPermission } = usePermissions();
  const canClinicWrite = hasPermission('hub.clinic.write');
  const canFinancialRead = hasPermission('hub.financial.read');
  const canAppointmentsRead = hasPermission('hub.appointments.read');
  const isPage = layout === 'page';
  const [tab, setTab] = useState<PetDetailTab>('resumo');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const [comandas, setComandas] = useState<Array<Record<string, unknown>>>([]);
  const [receivables, setReceivables] = useState<HubFinanceReceivable[]>([]);
  const [finLoading, setFinLoading] = useState(false);
  const [checkoutComandaId, setCheckoutComandaId] = useState<string | null>(null);
  const [receivableDrawer, setReceivableDrawer] = useState<{
    comandaId: string;
    receivableIds: string[];
    selectedReceivableId: string;
  } | null>(null);
  const [openingComanda, setOpeningComanda] = useState(false);
  const [showBatchCharge, setShowBatchCharge] = useState(false);
  const [packageBalances, setPackageBalances] = useState<HubPackageBalance[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [clinicalFlags, setClinicalFlags] = useState<HubPetClinicalFlag[]>([]);
  const [profileChanges, setProfileChanges] = useState<HubPetProfileChange[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [clinicalCases, setClinicalCases] = useState<HubClinicalCase[]>([]);
  const [encounters, setEncounters] = useState<HubEncounter[]>([]);
  const [prescriptions, setPrescriptions] = useState<HubPrescription[]>([]);
  const [vaccinations, setVaccinations] = useState<HubVaccination[]>([]);
  const [clinicalHistoryLoading, setClinicalHistoryLoading] = useState(false);
  const [upcomingAppointments, setUpcomingAppointments] = useState<HubAppointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState(false);

  useEffect(() => {
    if (!clinicId) {
      setClinicalFlags([]);
      setProfileChanges([]);
      return;
    }
    let cancelled = false;
    setHealthLoading(true);
    void Promise.allSettled([
      hubClinicalApi.listPetFlags(clinicId, pet.id),
      hubPetsApi.listProfileChanges(clinicId, pet.id),
    ]).then((results) => {
      if (cancelled) return;
      const flagsRes = results[0];
      const changesRes = results[1];
      setClinicalFlags(flagsRes.status === 'fulfilled' ? flagsRes.value.flags ?? [] : []);
      setProfileChanges(changesRes.status === 'fulfilled' ? changesRes.value.changes ?? [] : []);
      setHealthLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [clinicId, pet.id, pet.updated_at]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!clinicId) {
        setClinicalCases([]);
        setEncounters([]);
        setPrescriptions([]);
        setVaccinations([]);
        return;
      }
      setClinicalHistoryLoading(true);
      try {
        const results = await Promise.allSettled([
          hubClinicalCasesApi.list(clinicId, { petId: pet.id }),
          hubEncountersApi.listByPet(clinicId, pet.id),
          hubClinicalApi.listPrescriptions(clinicId, pet.id),
          hubClinicalApi.listVaccinations(clinicId, pet.id),
        ]);
        if (cancelled) return;
        const pick = <T,>(i: number, fallback: T): T => {
          const r = results[i];
          return r?.status === 'fulfilled' ? (r.value as T) : fallback;
        };
        setClinicalCases(pick(0, { cases: [] }).cases ?? []);
        setEncounters(sortEncountersRecent(pick(1, { encounters: [] }).encounters ?? []));
        setPrescriptions(sortPrescriptionsRecent(pick(2, { prescriptions: [] }).prescriptions ?? []));
        setVaccinations(pick(3, { vaccinations: [] }).vaccinations ?? []);
      } finally {
        if (!cancelled) setClinicalHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, pet.id]);

  useEffect(() => {
    if (tab !== 'resumo' || !clinicId || !canAppointmentsRead) {
      setUpcomingAppointments([]);
      setAppointmentsError(false);
      return;
    }

    let cancelled = false;
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 180);
    setAppointmentsLoading(true);
    setAppointmentsError(false);

    void hubAgendaApi
      .list({
        clinic_id: clinicId,
        from: now.toISOString(),
        to: horizon.toISOString(),
      })
      .then(({ appointments }) => {
        if (cancelled) return;
        setUpcomingAppointments(
          appointments
            .filter(
              (appointment) =>
                appointment.pet_id === pet.id &&
                appointment.status !== 'cancelled' &&
                !appointment.parent_appointment_id &&
                new Date(appointment.starts_at).getTime() >= now.getTime(),
            )
            .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setUpcomingAppointments([]);
        setAppointmentsError(true);
      })
      .finally(() => {
        if (!cancelled) setAppointmentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, clinicId, pet.id, canAppointmentsRead]);

  const [startingEncounter, setStartingEncounter] = useState(false);

  const loadPackageBalances = useCallback(async () => {
    if (!clinicId) return;
    setPackagesLoading(true);
    try {
      const res = await hubPackagesApi.listPetBalances(clinicId, pet.id);
      setPackageBalances(res.balances ?? []);
    } catch {
      setPackageBalances([]);
    } finally {
      setPackagesLoading(false);
    }
  }, [clinicId, pet.id]);

  useEffect(() => {
    if (tab === 'servicos') void loadPackageBalances();
  }, [tab, loadPackageBalances]);

  const loadFinanceiro = useCallback(async () => {
    if (!clinicId) return;
    setFinLoading(true);
    try {
      const guardianId = pet.primary_guardian?.guardian_id ?? null;
      const [cmd, rec] = await Promise.all([
        hubComandaApi
          .listComandas({ clinic_id: clinicId, enrich: true })
          .then((r) => r.comandas.filter((c) => comandaBelongsToPet(c, pet.id)))
          .catch(() => [] as Array<Record<string, unknown>>),
        guardianId
          ? hubFinancialApi
              .listReceivables(clinicId, { status: undefined })
              .then((r) => r.filter((rv) => rv.guardian_id === guardianId))
              .catch(() => [] as HubFinanceReceivable[])
          : Promise.resolve([] as HubFinanceReceivable[]),
      ]);
      const petComandaIds = new Set(cmd.map((c) => String(c.id)));
      setComandas(cmd);
      setReceivables(
        rec.filter(
          (rv) =>
            (rv.comanda_id && petComandaIds.has(rv.comanda_id)) ||
            (rv.lines ?? []).some((ln) => ln.pet_id === pet.id),
        ),
      );
    } finally {
      setFinLoading(false);
    }
  }, [clinicId, pet.id, pet.primary_guardian?.guardian_id]);

  useEffect(() => {
    if (tab === 'financeiro' || tab === 'resumo') void loadFinanceiro();
  }, [tab, loadFinanceiro]);

  const financeSummary = useMemo(
    () => buildProfileFinanceSummary(receivables, comandas),
    [receivables, comandas],
  );

  const frequentEncounter = useMemo(() => {
    const validEncounters = encounters.filter((encounter) => encounter.status !== 'cancelled');
    if (validEncounters.length === 0) return null;

    const counts = new Map<string, number>();
    validEncounters.forEach((encounter) => {
      counts.set(encounter.encounter_type, (counts.get(encounter.encounter_type) ?? 0) + 1);
    });

    const [type, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const latest = validEncounters.find((encounter) => encounter.encounter_type === type) ?? validEncounters[0];

    return {
      type,
      count,
      total: validEncounters.length,
      percentage: Math.round((count / validEncounters.length) * 100),
      latest,
    };
  }, [encounters]);

  const batchChargeItems = useMemo(
    () => buildBatchChargeItems(receivables, comandas),
    [receivables, comandas],
  );

  const goToFinanceiroTab = () => setTab('financeiro');

  const openSingleChargeItem = (item: (typeof batchChargeItems)[number]) => {
    if (item.kind === 'receivable' && item.comandaId && item.receivableId) {
      setReceivableDrawer({
        comandaId: item.comandaId,
        receivableIds: [item.receivableId],
        selectedReceivableId: item.receivableId,
      });
      return;
    }
    if (item.kind === 'comanda' && item.comandaId) {
      setCheckoutComandaId(item.comandaId);
    }
  };

  const handleSummaryCharge = () => {
    if (!canCreateReceivable) {
      goToFinanceiroTab();
      return;
    }
    if (batchChargeItems.length === 0) {
      goToFinanceiroTab();
      return;
    }
    if (batchChargeItems.length === 1) {
      openSingleChargeItem(batchChargeItems[0]);
      return;
    }
    setShowBatchCharge(true);
  };

  const renderFinanceSummaryBlock = (asPageSection: boolean) => {
    const card = (
      <ProfileFinanceSummaryCard
        summary={financeSummary}
        loading={finLoading}
        emptyLabel="Ainda não há movimentos financeiros associados a este pet. Quando existir faturamento ou pagamentos, o resumo aparecerá aqui."
        onOpenFinanceiro={goToFinanceiroTab}
        onCharge={financeSummary.outstandingTotal > 0 && canCreateReceivable ? handleSummaryCharge : null}
      />
    );
    if (asPageSection) {
      return (
        <section className="hub-meu-perfil__panel">
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Resumo financeiro</h2>
              <p className="hub-meu-perfil__panel-sub">Saldo em aberto deste pet.</p>
            </div>
          </header>
          {card}
        </section>
      );
    }
    return (
      <div className="hub-clientes__section">
        <div className="hub-clientes__contact-card">
          <h3 className="hub-clientes__contact-card-title" style={{ marginBottom: 12 }}>
            Resumo financeiro
          </h3>
          {card}
        </div>
      </div>
    );
  };

  const handleOpenComandaManual = async () => {
    if (!clinicId) return;
    const guardianId = pet.primary_guardian?.guardian_id;
    if (!guardianId) {
      alert('Este pet não tem tutor principal cadastrado.');
      return;
    }
    setOpeningComanda(true);
    try {
      const detail = await hubComandaApi.openComanda({
        clinic_id: clinicId,
        origin_type: 'manual',
        guardian_id: guardianId,
        unit_id: unitId ?? undefined,
        pet_id: pet.id,
        manual_lines: [],
      });
      const comandaId = (detail.comanda as Record<string, unknown>).id as string;
      navigate(`/hub/caixa/comanda/${comandaId}`);
    } catch (e: unknown) {
      alert((e as Error)?.message || 'Erro ao abrir comanda');
    } finally {
      setOpeningComanda(false);
    }
  };

  const handleStartEncounter = async () => {
    if (!clinicId || !canClinicWrite) return;
    setStartingEncounter(true);
    try {
      const { encounter } = await hubEncountersApi.create({ clinic_id: clinicId, pet_id: pet.id });
      navigate(`/hub/clinica/atendimentos/${encounter.id}`, { state: { from: 'pet' } });
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao iniciar atendimento');
    } finally {
      setStartingEncounter(false);
    }
  };

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen]);

  const active = !pet.deleted_at;
  const breedLine = [pet.breed || pet.species, sexLabel(pet.sex)].filter((x) => x && x !== '—').join(' • ');
  const primaryTutor = pet.primary_guardian?.guardian_name;
  const primaryTutorId = pet.primary_guardian?.guardian_id;
  const since = pet.created_at
    ? new Date(pet.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';
  const porteLabel =
    pet.size_tier && PORTE_LABELS[pet.size_tier as PetBodyPorteValue]
      ? PORTE_LABELS[pet.size_tier as PetBodyPorteValue]
      : '—';
  const pelagemLabel =
    pet.coat_type && COAT_TYPE_LABELS[pet.coat_type as CoatTypeValue]
      ? COAT_TYPE_LABELS[pet.coat_type as CoatTypeValue]
      : '—';

  const openFullPage = () => {
    if (onOpenInNewPage) onOpenInNewPage();
    else navigate(`/hub/pets/${pet.id}`);
  };

  const petScheduleState = {
    openPetCreate: true,
    petAppointmentInitial: {
      date: todayYmd(),
      pet_id: pet.id,
      pet_name: pet.name,
      guardian_id: pet.primary_guardian?.guardian_id ?? null,
      guardian_name: pet.primary_guardian?.guardian_name ?? null,
    },
  };
  const petScheduleParams = new URLSearchParams({
    openCreate: '1',
    petId: pet.id,
    prefillDate: todayYmd(),
  });
  if (pet.primary_guardian?.guardian_id) {
    petScheduleParams.set('guardianId', pet.primary_guardian.guardian_id);
  }
  const petScheduleHref = `/hub/appointments?${petScheduleParams.toString()}`;

  const quickActions = (
    <div className="hub-pets-detail__quick-actions">
      <Link
        to={petScheduleHref}
        state={petScheduleState}
        className="hub-pets-detail__quick-item hub-pets-detail__quick-link"
        title={`Agendar para ${pet.name}`}
      >
        <span className="hub-clientes__icon-btn">
          <CalendarClock size={18} strokeWidth={1.75} aria-hidden />
        </span>
        <span className="hub-pets-detail__quick-label">Agendar</span>
      </Link>
      {canClinicWrite ? (
        <Link
          to={`/hub/clinica/receitas/nova?petId=${encodeURIComponent(pet.id)}`}
          className="hub-pets-detail__quick-item hub-pets-detail__quick-link"
          title="Criar receita"
        >
          <span className="hub-clientes__icon-btn" aria-hidden>
            <Pill size={18} strokeWidth={1.75} />
          </span>
          <span className="hub-pets-detail__quick-label">Criar receita</span>
        </Link>
      ) : (
        <button type="button" className="hub-pets-detail__quick-item" title="Sem permissão para criar receita" disabled>
          <span className="hub-clientes__icon-btn hub-pets-detail__quick-icon--disabled" aria-hidden>
            <Pill size={18} strokeWidth={1.75} />
          </span>
          <span className="hub-pets-detail__quick-label">Criar receita</span>
        </button>
      )}
      <Link
        to={`/hub/clinica/prontuarios?petId=${encodeURIComponent(pet.id)}&tab=vacinas`}
        className="hub-pets-detail__quick-item hub-pets-detail__quick-link"
        title="Vacinas no prontuário"
      >
        <span className="hub-clientes__icon-btn" aria-hidden>
          <Syringe size={18} strokeWidth={1.75} />
        </span>
        <span className="hub-pets-detail__quick-label">Vacinas</span>
      </Link>
      {canWrite ? (
        <button type="button" className="hub-pets-detail__quick-item" title="Editar ficha" onClick={onStartEdit}>
          <span className="hub-clientes__icon-btn" aria-hidden>
            <Pencil size={18} strokeWidth={1.75} />
          </span>
          <span className="hub-pets-detail__quick-label">Editar</span>
        </button>
      ) : (
        <button type="button" className="hub-pets-detail__quick-item" title="Sem permissão para editar" disabled>
          <span className="hub-clientes__icon-btn hub-pets-detail__quick-icon--disabled" aria-hidden>
            <Pencil size={18} strokeWidth={1.75} />
          </span>
          <span className="hub-pets-detail__quick-label">Editar</span>
        </button>
      )}
      {onArchive && canWrite ? (
        <div className="hub-pets-detail__quick-item hub-pets-detail__dropdown-wrap" ref={moreRef}>
          <button
            type="button"
            className="hub-pets-detail__quick-stack"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-label="Mais opções"
            onClick={() => setMoreOpen((o) => !o)}
          >
            <span className="hub-clientes__icon-btn">
              <MoreHorizontal size={18} strokeWidth={1.75} />
            </span>
            <span className="hub-pets-detail__quick-label">Mais</span>
          </button>
          {moreOpen ? (
            <div className="hub-clientes__dropdown-menu" role="menu">
              <button
                type="button"
                className="hub-clientes__dropdown-item hub-clientes__dropdown-item--danger"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onArchive();
                }}
              >
                Arquivar
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const renderHealthProfile = (compact = false) => {
    if (healthLoading) {
      return <HubLoading variant="block" label="Carregando ficha…" />;
    }

    const behaviorCount = pet.behavior_tags?.length ?? 0;
    const alertCount = clinicalFlags.length;

    return (
      <div className={`hub-pet-care${compact ? ' hub-pet-care--compact' : ''}`}>
        <div className={`hub-pet-care__overview ${alertCount > 0 ? 'hub-pet-care__overview--attention' : ''}`}>
          <span className="hub-pet-care__overview-icon" aria-hidden>
            {alertCount > 0 ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
          </span>
          <div className="hub-pet-care__overview-copy">
            <strong>{alertCount > 0 ? `${alertCount} alerta${alertCount === 1 ? '' : 's'} para atenção` : 'Sem alertas clínicos ativos'}</strong>
            <span>Informações essenciais para cuidar de {pet.name} com segurança.</span>
          </div>
          <div className="hub-pet-care__overview-stats" aria-label="Resumo da ficha">
            <span><strong>{alertCount}</strong> clínico{alertCount === 1 ? '' : 's'}</span>
            <span><strong>{behaviorCount}</strong> comportamento{behaviorCount === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div className="hub-pet-care__grid">
          <section className="hub-pet-care__card hub-pet-care__card--health">
            <header className="hub-pet-care__card-head">
              <span className="hub-pet-care__card-icon" aria-hidden>
                <HeartPulse size={20} />
              </span>
              <div>
                <h3>Saúde</h3>
                <p>Alertas clínicos permanentes</p>
              </div>
              <span className="hub-pet-care__count">{alertCount}</span>
            </header>
            {alertCount > 0 ? (
              <div className="hub-clinic-pet-header__alerts">
                {clinicalFlags.map((flag) => (
                  <span key={flag.flag_key} className="hub-clinic-alert-chip">
                    <AlertTriangle size={13} aria-hidden />
                    {flag.label}
                  </span>
                ))}
              </div>
            ) : (
              <div className="hub-pet-care__empty">
                <CheckCircle2 size={17} aria-hidden />
                <span>Nenhum cuidado clínico especial registrado.</span>
              </div>
            )}
          </section>

          <section className="hub-pet-care__card hub-pet-care__card--behavior">
            <header className="hub-pet-care__card-head">
              <span className="hub-pet-care__card-icon" aria-hidden>
                <Dog size={20} />
              </span>
              <div>
                <h3>Comportamento</h3>
                <p>Preferências e pontos de atenção</p>
              </div>
              <span className="hub-pet-care__count">{behaviorCount}</span>
            </header>
            {behaviorCount > 0 ? (
              <PetBehaviorTagsDisplay tags={pet.behavior_tags ?? []} />
            ) : (
              <div className="hub-pet-care__empty">
                <Dog size={17} aria-hidden />
                <span>Nenhuma observação de comportamento registrada.</span>
              </div>
            )}
          </section>
        </div>

        <section className="hub-pet-care__history">
          <header className="hub-pet-care__history-head">
            <span className="hub-pet-care__history-icon" aria-hidden>
              <History size={18} />
            </span>
            <div>
              <h3>Histórico da ficha</h3>
              <p>Atualizações feitas pelas equipes de atendimento.</p>
            </div>
          </header>
          <PetProfileHistoryList changes={profileChanges} />
        </section>
      </div>
    );
  };

  const renderFrequentEncounter = (compact = false) => {
    if (clinicalHistoryLoading) {
      return <HubLoading variant="inline" label="Calculando estatística…" size="sm" />;
    }

    if (!frequentEncounter) {
      return (
        <div className="hub-pets-detail__empty-inline hub-pet-frequency__empty">
          <span className="hub-pet-frequency__empty-icon" aria-hidden>
            <Stethoscope size={20} />
          </span>
          <div>
            <strong>Estatística ainda indisponível</strong>
            <p>Ela aparecerá depois do primeiro atendimento clínico deste pet.</p>
          </div>
        </div>
      );
    }

    const { type, count, total, percentage, latest } = frequentEncounter;

    return (
      <div className={`hub-pet-frequency${compact ? ' hub-pet-frequency--compact' : ''}`}>
        <div className="hub-pet-frequency__icon" aria-hidden>
          <Stethoscope size={24} />
        </div>
        <div className="hub-pet-frequency__content">
          <div className="hub-pet-frequency__top">
            <div>
              <span className="hub-pet-frequency__eyebrow">Mais frequente</span>
              <h3>{encounterTypeLabel(type)}</h3>
            </div>
            <strong className="hub-pet-frequency__number">{count}</strong>
          </div>
          <div
            className="hub-pet-frequency__bar"
            role="progressbar"
            aria-label={`Participação de ${encounterTypeLabel(type)}`}
            aria-valuenow={percentage}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${percentage}%` }} />
          </div>
          <p className="hub-pet-frequency__summary">
            {count} de {total} atendimento{total === 1 ? '' : 's'} · {percentage}% do histórico
          </p>
          <div className="hub-pet-frequency__latest">
            <span>Mais recente em {encounterWhenLabel(latest)}</span>
            <Link to={`/hub/clinica/atendimentos/${latest.id}`} className="hub-clientes__link">
              Abrir atendimento →
            </Link>
          </div>
        </div>
      </div>
    );
  };

  const renderUpcomingAppointments = (compact = false) => {
    if (!canAppointmentsRead) {
      return (
        <div className="hub-pet-appointments__empty">
          <CalendarClock size={20} aria-hidden />
          <div>
            <strong>Agenda indisponível</strong>
            <p>Seu perfil não tem permissão para visualizar compromissos.</p>
          </div>
        </div>
      );
    }

    if (appointmentsLoading) {
      return <HubLoading variant="inline" label="Carregando compromissos…" size="sm" />;
    }

    if (appointmentsError) {
      return (
        <div className="hub-pet-appointments__empty hub-pet-appointments__empty--error">
          <AlertTriangle size={20} aria-hidden />
          <div>
            <strong>Não foi possível carregar a agenda</strong>
            <p>Tente novamente ao reabrir o perfil.</p>
          </div>
        </div>
      );
    }

    if (upcomingAppointments.length === 0) {
      return (
        <div className="hub-pet-appointments__empty">
          <CalendarClock size={22} aria-hidden />
          <div>
            <strong>Nenhum compromisso futuro</strong>
            <p>{pet.name} está com a agenda livre nos próximos meses.</p>
            <Link to={petScheduleHref} state={petScheduleState} className="hub-clientes__link">
              Agendar compromisso →
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className={`hub-pet-appointments${compact ? ' hub-pet-appointments--compact' : ''}`}>
        {upcomingAppointments.slice(0, UPCOMING_APPOINTMENTS_LIMIT).map((appointment, index) => {
          const startsAt = new Date(appointment.starts_at);
          const endsAt = new Date(appointment.ends_at);
          const validDate = !Number.isNaN(startsAt.getTime());
          const timeLabel = validDate
            ? startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : 'Horário indefinido';
          const endTimeLabel = !Number.isNaN(endsAt.getTime())
            ? endsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : null;

          return (
            <Link
              key={appointment.id}
              to={appointmentDrillHref(appointment.id, appointment.starts_at)}
              className="hub-pet-appointments__item"
            >
              <span className="hub-pet-appointments__date" aria-hidden>
                <strong>{validDate ? startsAt.toLocaleDateString('pt-BR', { day: '2-digit' }) : '—'}</strong>
                <span>{validDate ? startsAt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') : ''}</span>
              </span>
              <span className="hub-pet-appointments__body">
                <span className="hub-pet-appointments__title-row">
                  <strong>{appointmentTitle(appointment)}</strong>
                  {index === 0 ? <span className="hub-pet-appointments__next">Próximo</span> : null}
                </span>
                <span className="hub-pet-appointments__meta">
                  <CalendarClock size={14} aria-hidden />
                  {validDate ? startsAt.toLocaleDateString('pt-BR', { weekday: 'long' }) : 'Data indefinida'}
                  {' · '}
                  {timeLabel}{endTimeLabel ? ` às ${endTimeLabel}` : ''}
                </span>
                {appointment.staff_member?.full_name ? (
                  <span className="hub-pet-appointments__meta">
                    <User size={14} aria-hidden />
                    {appointment.staff_member.full_name}
                  </span>
                ) : null}
              </span>
              <span className={`hub-pet-appointments__status hub-pet-appointments__status--${appointment.status}`}>
                {appointmentStatusLabel(appointment.status)}
              </span>
              <ChevronRight className="hub-pet-appointments__chevron" size={18} aria-hidden />
            </Link>
          );
        })}
        {upcomingAppointments.length > UPCOMING_APPOINTMENTS_LIMIT ? (
          <p className="hub-pet-appointments__more">
            +{upcomingAppointments.length - UPCOMING_APPOINTMENTS_LIMIT} compromisso
            {upcomingAppointments.length - UPCOMING_APPOINTMENTS_LIMIT === 1 ? '' : 's'} na agenda
          </p>
        ) : null}
      </div>
    );
  };

  const renderResumoPage = () => (
    <>
      <section className="hub-meu-perfil__panel">
        <header className="hub-meu-perfil__panel-head">
          <div>
            <h2 className="hub-meu-perfil__panel-title">Informações gerais</h2>
            <p className="hub-meu-perfil__panel-sub">Dados cadastrais do pet.</p>
          </div>
          {canWrite ? (
            <button type="button" className="hub-meu-perfil__btn-outline" onClick={onStartEdit}>
              <Pencil size={16} strokeWidth={2} aria-hidden />
              Editar informações
            </button>
          ) : null}
        </header>
        <div className="hub-meu-perfil__grid">
          <HubProfileInfoCell icon={Heart} label="Espécie" value={pet.species || '—'} />
          <HubProfileInfoCell icon={Calendar} label="Data de nascimento" value={formatDateBR(pet.birth_date)} />
          <HubProfileInfoCell icon={Tag} label="Raça" value={pet.breed || '—'} />
          <HubProfileInfoCell icon={Palette} label="Cor" value={pet.coat_color || '—'} />
          <HubProfileInfoCell icon={User} label="Sexo" value={sexLabel(pet.sex)} />
          <HubProfileInfoCell icon={Heart} label="Castrado(a)" value={neuteredLabel(pet.neutered)} />
          <HubProfileInfoCell icon={Palette} label="Pelagem" value={pelagemLabel} />
          <HubProfileInfoCell icon={Ruler} label="Porte" value={porteLabel} />
          <HubProfileInfoCell icon={User} label="Idade" value={petAgeDetailedLabel(pet.birth_date)} />
        </div>
      </section>

      <section className="hub-meu-perfil__panel">
        <header className="hub-meu-perfil__panel-head">
          <div>
            <h2 className="hub-meu-perfil__panel-title">Saúde e comportamento</h2>
            <p className="hub-meu-perfil__panel-sub">Ficha permanente compartilhada com clínica, banho e tosa e hotel.</p>
          </div>
          {canWrite ? (
            <button type="button" className="hub-meu-perfil__btn-outline" onClick={onStartEdit}>
              <Pencil size={16} strokeWidth={2} aria-hidden />
              Editar ficha
            </button>
          ) : null}
        </header>
        {renderHealthProfile()}
      </section>

      {renderFinanceSummaryBlock(true)}

      <section className="hub-meu-perfil__panel">
        <header className="hub-meu-perfil__panel-head">
          <div>
            <h2 className="hub-meu-perfil__panel-title">Atendimento mais frequente</h2>
            <p className="hub-meu-perfil__panel-sub">Tipo de atendimento predominante no histórico deste pet.</p>
          </div>
        </header>
        {renderFrequentEncounter()}
      </section>

      <section className="hub-meu-perfil__panel">
        <header className="hub-meu-perfil__panel-head">
          <div>
            <h2 className="hub-meu-perfil__panel-title">Próximos compromissos</h2>
            <p className="hub-meu-perfil__panel-sub">Agenda de cuidados dos próximos 180 dias.</p>
          </div>
          {canAppointmentsRead ? (
            <Link to="/hub/appointments" className="hub-meu-perfil__btn-outline">
              <Calendar size={16} aria-hidden />
              Ver agenda
            </Link>
          ) : null}
        </header>
        {renderUpcomingAppointments()}
      </section>

      {pet.secondary_guardian?.guardian_name ? (
        <section className="hub-meu-perfil__panel">
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Co-tutor</h2>
              <p className="hub-meu-perfil__panel-sub">Segundo responsável pelo pet.</p>
            </div>
          </header>
          <p className="hub-clientes__muted" style={{ margin: 0, fontSize: 14 }}>
            <User size={16} strokeWidth={1.75} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} aria-hidden />
            <span className="hub-pets-detail__hero-tutor-name">{pet.secondary_guardian.guardian_name}</span>
          </p>
        </section>
      ) : null}

      {pet.notes ? (
        <section className="hub-meu-perfil__panel">
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Notas</h2>
              <p className="hub-meu-perfil__panel-sub">Observações internas.</p>
            </div>
          </header>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, color: '#4a3b3a' }}>
            {pet.notes}
          </p>
        </section>
      ) : null}
    </>
  );

  const renderResumoPanel = () => (
    <>
      <div className="hub-clientes__section">
        <div className="hub-clientes__contact-card">
          <div className="hub-clientes__contact-card-head">
            <h3 className="hub-clientes__contact-card-title">Informações gerais</h3>
            {canWrite ? (
              <button type="button" className="hub-clientes__link-btn hub-clientes__link-btn--with-icon" onClick={onStartEdit}>
                <Pencil size={15} strokeWidth={2} aria-hidden />
                Editar
              </button>
            ) : null}
          </div>
          <div className="hub-pets-detail__info-grid">
            <InfoPair label="Espécie" value={pet.species || '—'} />
            <InfoPair label="Data de nascimento" value={formatDateBR(pet.birth_date)} />
            <InfoPair label="Raça" value={pet.breed || '—'} />
            <InfoPair label="Cor" value={pet.coat_color || '—'} />
            <InfoPair label="Sexo" value={sexLabel(pet.sex)} />
            <InfoPair label="Pelagem" value={pelagemLabel} />
            <InfoPair label="Castrado(a)" value={neuteredLabel(pet.neutered)} />
            <InfoPair label="Porte" value={porteLabel} />
          </div>
        </div>
      </div>

      <div className="hub-clientes__section">
        <div className="hub-clientes__contact-card">
          <div className="hub-clientes__contact-card-head hub-pet-care__panel-head">
            <div>
              <h3 className="hub-clientes__contact-card-title">Saúde e comportamento</h3>
              <p className="hub-pet-care__panel-sub">Cuidados compartilhados entre as equipes.</p>
            </div>
            {canWrite ? (
              <button type="button" className="hub-clientes__link-btn hub-clientes__link-btn--with-icon" onClick={onStartEdit}>
                <Pencil size={15} strokeWidth={2} aria-hidden />
                Editar
              </button>
            ) : null}
          </div>
          {renderHealthProfile(true)}
        </div>
      </div>

      {renderFinanceSummaryBlock(false)}

      <div className="hub-clientes__section">
        <div className="hub-clientes__contact-card">
          <h3 className="hub-clientes__contact-card-title" style={{ marginBottom: 12 }}>
            Atendimento mais frequente
          </h3>
          {renderFrequentEncounter(true)}
        </div>
      </div>

      <div className="hub-clientes__section">
        <div className="hub-clientes__contact-card">
          <div className="hub-clientes__contact-card-head" style={{ marginBottom: 10 }}>
            <h3 className="hub-clientes__contact-card-title">Próximos compromissos</h3>
            {canAppointmentsRead ? (
              <Link to="/hub/appointments" className="hub-clientes__link-btn">
                Ver agenda
              </Link>
            ) : null}
          </div>
          {renderUpcomingAppointments(true)}
        </div>
      </div>

      {pet.secondary_guardian?.guardian_name ? (
        <div className="hub-clientes__section">
          <div className="hub-clientes__contact-card">
            <h3 className="hub-clientes__contact-card-title" style={{ marginBottom: 12 }}>
              Co-tutor
            </h3>
            <p className="hub-clientes__muted" style={{ margin: 0, fontSize: 14 }}>
              <User size={16} strokeWidth={1.75} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} aria-hidden />
              <span className="hub-pets-detail__hero-tutor-name">{pet.secondary_guardian.guardian_name}</span>
            </p>
          </div>
        </div>
      ) : null}

      {pet.notes ? (
        <div className="hub-clientes__section">
          <div className="hub-clientes__contact-card">
            <div className="hub-clientes__contact-card-head">
              <h3 className="hub-clientes__contact-card-title">Notas</h3>
            </div>
            <div className="hub-clientes__contact-row" style={{ marginTop: 0 }}>
              <span className="hub-clientes__contact-row-icon" aria-hidden>
                <StickyNote size={18} strokeWidth={1.75} />
              </span>
              <p className="hub-clientes__contact-row-text" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {pet.notes}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  const renderHistoricoTab = () => {
    const previewCases = clinicalCases.slice(0, HISTORICO_PREVIEW_LIMIT);
    const previewEncounters = encounters.slice(0, HISTORICO_PREVIEW_LIMIT);
    const previewPrescriptions = prescriptions.slice(0, HISTORICO_PREVIEW_LIMIT);
    const previewVaccinations = vaccinations.slice(0, HISTORICO_PREVIEW_LIMIT);
    const hasClinicalHistory =
      clinicalCases.length > 0 || encounters.length > 0 || prescriptions.length > 0;
    const hasHealthData = clinicalFlags.length > 0 || vaccinations.length > 0;
    const prontuarioBase = `/hub/clinica/prontuarios?petId=${encodeURIComponent(pet.id)}`;

    const verMais = (tab: string, total: number) => {
      if (total <= HISTORICO_PREVIEW_LIMIT) return null;
      return (
        <Link to={`${prontuarioBase}&tab=${tab}`} className="hub-pets-detail__ver-mais">
          Ver mais ({total - HISTORICO_PREVIEW_LIMIT}) no prontuário
        </Link>
      );
    };

    const actionButtons = (
      <div className="hub-pets-detail__historico-actions">
        {canClinicWrite ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            disabled={startingEncounter || !clinicId}
            onClick={() => void handleStartEncounter()}
          >
            <Stethoscope size={14} aria-hidden />
            {startingEncounter ? 'Abrindo…' : 'Novo atendimento'}
          </button>
        ) : null}
        {canClinicWrite ? (
          <Link
            to={`/hub/clinica/receitas/nova?petId=${encodeURIComponent(pet.id)}`}
            className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
          >
            <Pill size={14} aria-hidden />
            Criar receita
          </Link>
        ) : null}
        <Link to={prontuarioBase} className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm">
          <ClipboardList size={14} aria-hidden />
          Abrir prontuário
        </Link>
        <Link
          to={`${prontuarioBase}&tab=vacinas`}
          className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
        >
          <Syringe size={14} aria-hidden />
          Vacinas
        </Link>
      </div>
    );

    const clinicalEmptyState = (
      <div className="hub-pets-detail__historico-empty">
        <div className="hub-pets-detail__historico-empty-icon" aria-hidden>
          <FileText size={28} strokeWidth={1.5} />
        </div>
        <h3 className="hub-pets-detail__historico-empty-title">
          {pet.name} ainda não tem histórico clínico
        </h3>
        <p className="hub-pets-detail__historico-empty-text">
          Quando houver atendimentos, casos ou receitas, eles aparecem aqui. Enquanto isso, você pode começar por uma
          destas ações:
        </p>
        {actionButtons}
      </div>
    );

    const healthSection = (
      <>
        <h3 className="hub-clientes__contact-card-title" style={{ margin: '20px 0 10px' }}>
          Saúde e vacinas
        </h3>
        {clinicalFlags.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {clinicalFlags.map((f) => (
              <span key={f.flag_key} className="hub-clinic-alert-chip">
                {f.label}
              </span>
            ))}
          </div>
        ) : (
          <p className="hub-clientes__muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
            Nenhum alerta clínico ativo.
          </p>
        )}
        {vaccinations.length === 0 ? (
          <p className="hub-clientes__muted" style={{ margin: 0, fontSize: 13 }}>
            Nenhuma vacina registrada.
          </p>
        ) : (
          <section className="hub-pets-detail__history-section" style={{ marginBottom: 0 }}>
            <div className="hub-pets-detail__history-section-head">
              <h4 className="hub-clientes__label">Vacinas</h4>
              {verMais('vacinas', vaccinations.length)}
            </div>
            <ul className="hub-pets-detail__history-list">
              {previewVaccinations.map((v) => (
                <li key={v.id} className="hub-pets-detail__history-row">
                  <p className="hub-pets-detail__history-row-title hub-pets-detail__history-row-title--static">
                    {v.vaccine_name}
                  </p>
                  <p className="hub-pets-detail__history-row-meta">
                    {formatDateBR(v.administered_at.slice(0, 10))}
                    {v.next_dose_at ? ` · Próxima: ${formatDateBR(v.next_dose_at.slice(0, 10))}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    );

    const clinicalHistoryLists = (
      <>
        <div className="hub-pets-detail__historico-head">
          <h3 className="hub-clientes__contact-card-title" style={{ margin: 0 }}>
            Histórico clínico
          </h3>
          {canClinicWrite ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              disabled={startingEncounter || !clinicId}
              onClick={() => void handleStartEncounter()}
            >
              <Stethoscope size={14} aria-hidden />
              {startingEncounter ? 'Abrindo…' : 'Novo atendimento'}
            </button>
          ) : null}
        </div>

        {clinicalCases.length > 0 ? (
          <section className="hub-pets-detail__history-section">
            <div className="hub-pets-detail__history-section-head">
              <h4 className="hub-clientes__label">Casos clínicos</h4>
              {verMais('casos', clinicalCases.length)}
            </div>
            <ul className="hub-pets-detail__history-list">
              {previewCases.map((c) => (
                <li key={c.id} className="hub-pets-detail__history-row">
                  <div className="hub-pets-detail__history-row-main">
                    <Link to={`/hub/clinica/casos/${c.id}`} className="hub-pets-detail__history-row-title">
                      {c.title}
                    </Link>
                    <span className={`hub-clinic-cases__badge hub-clinic-cases__badge--${c.status}`}>
                      {caseStatusLabel(c.status)}
                    </span>
                  </div>
                  <p className="hub-pets-detail__history-row-meta">
                    Aberto em {new Date(c.opened_at).toLocaleDateString('pt-BR')}
                    {c.closed_at ? ` · Fechado em ${new Date(c.closed_at).toLocaleDateString('pt-BR')}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {encounters.length > 0 ? (
          <section className="hub-pets-detail__history-section">
            <div className="hub-pets-detail__history-section-head">
              <h4 className="hub-clientes__label">Atendimentos</h4>
              {verMais('timeline', encounters.length)}
            </div>
            <ul className="hub-pets-detail__history-list">
              {previewEncounters.map((e) => (
                <li key={e.id} className="hub-pets-detail__history-row">
                  <Link to={`/hub/clinica/atendimentos/${e.id}`} className="hub-pets-detail__history-row-title">
                    {encounterTypeLabel(e.encounter_type)} · {encounterStatusLabel(e.status)}
                  </Link>
                  <p className="hub-pets-detail__history-row-meta">
                    {e.chief_complaint || e.summary_notes || 'Sem descrição'} · {encounterWhenLabel(e)}
                    {e.staff_member?.full_name ? ` · ${e.staff_member.full_name}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {prescriptions.length > 0 ? (
          <section className="hub-pets-detail__history-section">
            <div className="hub-pets-detail__history-section-head">
              <h4 className="hub-clientes__label">Últimas receitas</h4>
              {verMais('prescricoes', prescriptions.length)}
            </div>
            <ul className="hub-pets-detail__history-list">
              {previewPrescriptions.map((p) => (
                <li key={p.id} className="hub-pets-detail__history-row">
                  <p className="hub-pets-detail__history-row-title hub-pets-detail__history-row-title--static">
                    {formatPrescriptionLine(p)}
                  </p>
                  <p className="hub-pets-detail__history-row-meta">
                    {p.prescribed_at
                      ? new Date(p.prescribed_at).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
                      : '—'}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="hub-pets-detail__historico-footer-link">
          <Link to={prontuarioBase} className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm">
            <ClipboardList size={14} aria-hidden />
            Ver prontuário completo
          </Link>
        </div>
      </>
    );

    const inner = clinicalHistoryLoading ? (
      <HubLoading variant="inline" label="Carregando histórico clínico…" size="sm" />
    ) : (
      <>
        {hasClinicalHistory ? clinicalHistoryLists : clinicalEmptyState}
        {hasClinicalHistory || hasHealthData ? healthSection : null}
      </>
    );

    if (isPage) {
      return (
        <section className="hub-meu-perfil__panel">
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Histórico & Saúde</h2>
              <p className="hub-meu-perfil__panel-sub">Resumo clínico — o detalhe completo fica no prontuário.</p>
            </div>
          </header>
          {inner}
        </section>
      );
    }

    return (
      <div className="hub-clientes__section">
        <div className="hub-clientes__contact-card">{inner}</div>
      </div>
    );
  };

  const renderServicosTab = () => {
    const packagesBlock = packagesLoading ? (
      <HubLoading variant="inline" label="Carregando pacotes…" size="sm" />
    ) : packageBalances.length === 0 ? (
      <div className="hub-clientes__empty-state">Nenhum pacote ativo para este pet.</div>
    ) : (
      <ul className="hub-clientes__detail-list">
        {packageBalances.map((b) => {
          const pkg = Array.isArray(b.hub_packages) ? b.hub_packages[0] : b.hub_packages;
          const svc = (b as { hub_service_types?: { name?: string } | { name?: string }[] }).hub_service_types;
          const svcName = Array.isArray(svc) ? svc[0]?.name : svc?.name;
          return (
            <li key={b.id} className="hub-clientes__contact-card" style={{ marginBottom: 8, padding: 12 }}>
              <strong>{pkg?.name ?? 'Pacote'}</strong>
              <p className="hub-clientes__muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                {svcName ?? 'Serviço'} · {b.sessions_remaining} de {b.sessions_total ?? b.sessions_remaining} sessões
                {b.expires_at ? ` · válido até ${new Date(`${b.expires_at}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}
              </p>
            </li>
          );
        })}
      </ul>
    );

    const specialBlock =
      clinicId ? (
        <div style={{ marginTop: 20 }}>
          <SpecialPricesSection
            clinicId={clinicId}
            petId={pet.id}
            guardianId={pet.primary_guardian?.id}
            canWrite={canWrite}
          />
        </div>
      ) : null;

    const inner = (
      <>
        <h4 className="hub-clientes__label">Pacotes</h4>
        {packagesBlock}
        {specialBlock}
      </>
    );

    if (isPage) {
      return (
        <section className="hub-meu-perfil__panel">
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Serviços</h2>
              <p className="hub-meu-perfil__panel-sub">Pacotes, preços especiais e acordos deste pet.</p>
            </div>
          </header>
          {inner}
        </section>
      );
    }

    return inner;
  };

  const renderFinanceiroTab = () => {
    const openComandas = comandas.filter((c) => c.status === 'aberta');
    const inner = (
      <>
        {canCreateReceivable && clinicId && (
          <div className="hub-clientes__fin-compose">
            <div className="hub-clientes__fin-compose-head">
              <div>
                <h3 className="hub-clientes__fin-compose-title">Nova comanda</h3>
                <p className="hub-clientes__fin-compose-sub">
                  Itens novos entram vinculados a {pet.name}.
                </p>
              </div>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                disabled={openingComanda}
                onClick={() => void handleOpenComandaManual()}
              >
                <FilePlus2 size={14} strokeWidth={2} aria-hidden />
                {openingComanda ? 'Abrindo…' : 'Abrir comanda'}
              </button>
            </div>
            {batchChargeItems.length >= 2 ? (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  onClick={() => setShowBatchCharge(true)}
                >
                  <Coins size={14} strokeWidth={2} aria-hidden />
                  Cobrar em conjunto ({batchChargeItems.length})
                </button>
              </div>
            ) : null}
            <div className="hub-clientes__fin-pet-picker" role="group" aria-label="Pet da comanda">
              <span className="hub-clientes__fin-pet-chip hub-clientes__fin-pet-chip--active" aria-current="true">
                <PetSpeciesIcon species={pet.species} />
                <span className="hub-clientes__fin-pet-chip-name">{pet.name}</span>
              </span>
            </div>
          </div>
        )}

        {finLoading ? (
          <HubLoading variant="inline" label="Carregando financeiro…" size="sm" />
        ) : (
          <>
            {openComandas.length > 0 && (
              <section className="hub-clientes__fin-section">
                <h4 className="hub-clientes__fin-section-title">
                  Comandas abertas
                  <span className="hub-clientes__fin-section-count">{openComandas.length}</span>
                </h4>
                <ul className="hub-clientes__fin-list">
                  {openComandas.map((c) => {
                    const title = formatComandaListTitle(c);
                    const petsLabel = formatComandaListPets(c, [{ id: pet.id, name: pet.name }]);
                    const opened = formatComandaListOpenedAt(c);
                    const originLabel = formatComandaOriginLabel(c.origin_type);
                    const href = resolveComandaProfileHref(c, { canFinancialRead });
                    const charge = resolveComandaProfileChargeAction(c, receivables, {
                      canCreateReceivable,
                      canFinancialRead,
                    });
                    return (
                      <li key={String(c.id)} className="hub-clientes__fin-row">
                        <button
                          type="button"
                          className="hub-clientes__fin-row-main"
                          onClick={() => navigate(href)}
                          title={href.includes('/financeiro/') ? 'Abrir no financeiro' : 'Abrir no caixa'}
                        >
                          <span className="hub-clientes__fin-row-title">{title}</span>
                          <span className="hub-clientes__fin-row-meta">
                            <span className="hub-clientes__fin-row-origin">{originLabel}</span>
                            <span aria-hidden> · </span>
                            <span>{petsLabel}</span>
                            {opened ? (
                              <>
                                <span aria-hidden> · </span>
                                <span>{opened}</span>
                              </>
                            ) : null}
                          </span>
                        </button>
                        <span className="hub-clientes__fin-row-amount">
                          {formatBrl(Number(c.balance_due ?? c.total_amount ?? 0))}
                        </span>
                        {charge.kind !== 'none' && (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-clientes__fin-row-action"
                            onClick={() => {
                              if (charge.kind === 'checkout_drawer') {
                                setCheckoutComandaId(charge.comandaId);
                              } else if (charge.kind === 'receivable_drawer') {
                                setReceivableDrawer({
                                  comandaId: charge.comandaId,
                                  receivableIds: [charge.receivableId],
                                  selectedReceivableId: charge.receivableId,
                                });
                              } else if (charge.kind === 'navigate') {
                                navigate(charge.href);
                              }
                            }}
                            title={
                              charge.kind === 'receivable_drawer' || charge.kind === 'navigate'
                                ? 'Registrar pagamento'
                                : 'Receber'
                            }
                            aria-label={
                              charge.kind === 'receivable_drawer' || charge.kind === 'navigate'
                                ? 'Registrar pagamento'
                                : 'Receber'
                            }
                          >
                            <Coins size={14} strokeWidth={2} />
                          </button>
                        )}
                        <ChevronRight
                          className="hub-clientes__fin-row-chevron"
                          size={16}
                          strokeWidth={2}
                          aria-hidden
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {receivables.length > 0 ? (
              <section className="hub-clientes__fin-section">
                <h4 className="hub-clientes__fin-section-title">
                  Recebíveis
                  <span className="hub-clientes__fin-section-count">{Math.min(receivables.length, 20)}</span>
                </h4>
                <ul className="hub-clientes__fin-list">
                  {receivables.slice(0, 20).map((rv) => {
                    const href = resolveReceivableProfileHref(rv, { canFinancialRead });
                    const payable = isReceivablePayable(rv.status);
                    const canPay = payable && canCreateReceivable && Boolean(rv.comanda_id) && Boolean(unitId);
                    const linkedComanda = rv.comanda_id
                      ? comandas.find((c) => String(c.id) === rv.comanda_id) ?? null
                      : null;
                    const title = formatReceivableListTitle(rv, linkedComanda);
                    const originLabel = formatComandaOriginLabel(rv.source_type);
                    const petsLabel = linkedComanda
                      ? formatComandaListPets(linkedComanda, [{ id: pet.id, name: pet.name }])
                      : pet.name;
                    const rowMain = (
                      <>
                        <span className="hub-clientes__fin-row-title">{title}</span>
                        <span className="hub-clientes__fin-row-meta">
                          <span className="hub-clientes__fin-row-origin">{originLabel}</span>
                          <span aria-hidden> · </span>
                          <span>{petsLabel}</span>
                          <span aria-hidden> · </span>
                          <span>{formatDueDateShort(rv.due_date)}</span>
                        </span>
                      </>
                    );
                    return (
                      <li key={rv.id} className="hub-clientes__fin-row">
                        {href ? (
                          <button
                            type="button"
                            className="hub-clientes__fin-row-main"
                            onClick={() => navigate(href)}
                            title="Abrir no financeiro"
                          >
                            {rowMain}
                          </button>
                        ) : (
                          <div className="hub-clientes__fin-row-main">{rowMain}</div>
                        )}
                        <ReceivableDueBadge dueDate={rv.due_date} status={rv.status} showDate={false} />
                        <span className="hub-clientes__fin-row-amount">{formatBrl(rv.final_amount)}</span>
                        {canPay && rv.comanda_id ? (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-clientes__fin-row-action"
                            onClick={() =>
                              setReceivableDrawer({
                                comandaId: rv.comanda_id!,
                                receivableIds: [rv.id],
                                selectedReceivableId: rv.id,
                              })
                            }
                            title="Registrar pagamento"
                            aria-label="Registrar pagamento"
                          >
                            <Coins size={14} strokeWidth={2} />
                          </button>
                        ) : null}
                        {href ? (
                          <ChevronRight
                            className="hub-clientes__fin-row-chevron"
                            size={16}
                            strokeWidth={2}
                            aria-hidden
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : openComandas.length === 0 && comandas.length === 0 ? (
              <p className="hub-clientes__muted hub-clientes__fin-empty">
                Nenhum lançamento financeiro encontrado para este pet.
              </p>
            ) : null}

            {pet.primary_guardian?.guardian_id ? (
              <ChargeBundleHistorySection
                guardianId={pet.primary_guardian.guardian_id}
                guardianName={pet.primary_guardian.guardian_name ?? undefined}
                petId={pet.id}
                onChanged={() => void loadFinanceiro()}
              />
            ) : null}
          </>
        )}
      </>
    );

    if (isPage) {
      return (
        <section className="hub-meu-perfil__panel">
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Financeiro</h2>
              <p className="hub-meu-perfil__panel-sub">Comandas abertas e recebíveis deste pet.</p>
            </div>
          </header>
          {inner}
        </section>
      );
    }

    return <div style={{ padding: '0 4px' }}>{inner}</div>;
  };

  const tabs = (
    <HubTabs
      className={isPage ? undefined : 'hub-pets-detail__tabs'}
      variant="detail"
      ariaLabel="Detalhe do pet"
      activeId={tab}
      onTabChange={(id) => setTab(id as PetDetailTab)}
      items={[
        { id: 'resumo', label: 'Resumo' },
        { id: 'historico_saude', label: 'Histórico & Saúde' },
        { id: 'servicos', label: 'Serviços' },
        { id: 'financeiro', label: 'Financeiro' },
      ]}
    />
  );

  const tabContent = (
    <>
      {tab === 'resumo' && (isPage ? renderResumoPage() : renderResumoPanel())}
      {tab === 'historico_saude' && renderHistoricoTab()}
      {tab === 'servicos' && renderServicosTab()}
      {tab === 'financeiro' && renderFinanceiroTab()}
    </>
  );

  const financeDrawer =
    clinicId && unitId && checkoutComandaId ? (
      <ComandaCheckoutDrawer
        key={checkoutComandaId}
        open={!!checkoutComandaId}
        onClose={() => setCheckoutComandaId(null)}
        clinicId={clinicId}
        unitId={unitId}
        comandaId={checkoutComandaId}
        onSuccess={() => {
          setCheckoutComandaId(null);
          void loadFinanceiro();
        }}
      />
    ) : null;

  const receivablePanel =
    receivableDrawer && clinicId ? (
      <HubComandaReceivableDrawer
        key={`${receivableDrawer.comandaId}-${receivableDrawer.selectedReceivableId}`}
        open
        onClose={() => setReceivableDrawer(null)}
        comandaId={receivableDrawer.comandaId}
        receivableIds={receivableDrawer.receivableIds}
        selectedReceivableId={receivableDrawer.selectedReceivableId}
        onSelectReceivable={(id) =>
          setReceivableDrawer((prev) => (prev ? { ...prev, selectedReceivableId: id } : prev))
        }
        onRefreshComanda={() => {
          void loadFinanceiro();
        }}
        highlightPayment
      />
    ) : null;

  const batchChargePanel = (
    <BatchChargeDrawer
      open={showBatchCharge}
      items={batchChargeItems}
      guardianName={pet.primary_guardian?.guardian_name ?? undefined}
      onClose={() => setShowBatchCharge(false)}
      onDone={() => {
        setShowBatchCharge(false);
        void loadFinanceiro();
      }}
      onBundleCreated={(id) => navigate(`/hub/financeiro/cobranca-lote/${id}/pronto-para-envio`)}
    />
  );

  if (isPage) {
    return (
      <>
        <div className="hub-meu-perfil">
          <aside className="hub-meu-perfil__sidebar">
            <div className="hub-meu-perfil__card hub-meu-perfil__summary">
              <HubProfileAvatar name={pet.name} />
              <h2 className="hub-meu-perfil__sidebar-name">{pet.name}</h2>
              <span className={`hub-meu-perfil__badge ${active ? '' : 'hub-meu-perfil__badge--muted'}`}>
                {active ? 'Ativo' : 'Inativo'}
              </span>
              {breedLine ? <p className="hub-meu-perfil__contact">{breedLine}</p> : null}
              <p className="hub-meu-perfil__contact">{petAgeDetailedLabel(pet.birth_date)}</p>
              {primaryTutor ? (
                <p className="hub-meu-perfil__contact">
                  Tutor:{' '}
                  {primaryTutorId ? (
                    <Link to={`/hub/clientes/${primaryTutorId}`} style={{ color: 'inherit', fontWeight: 600 }}>
                      {primaryTutor}
                    </Link>
                  ) : (
                    primaryTutor
                  )}
                </p>
              ) : null}
              <div className="hub-meu-perfil__sidebar-actions">{quickActions}</div>
            </div>

            <div className="hub-meu-perfil__card hub-meu-perfil__aside-meta">
              <div className="hub-meu-perfil__meta-row">
                <span className="hub-meu-perfil__meta-label">Cadastrado em</span>
                <span className="hub-meu-perfil__meta-value">{since}</span>
              </div>
              <div className="hub-meu-perfil__meta-row">
                <span className="hub-meu-perfil__meta-label">Espécie</span>
                <span className="hub-meu-perfil__meta-value">{pet.species || '—'}</span>
              </div>
            </div>
          </aside>

          <div className="hub-meu-perfil__main">
            {tabs}
            {tabContent}
          </div>
        </div>
        {financeDrawer}
        {receivablePanel}
        {batchChargePanel}
      </>
    );
  }

  return (
    <div className="hub-pets-detail">
      {!hideHeader ? (
        <div className="hub-clientes__panel-header">
          <div style={{ flex: 1 }} />
          <button type="button" className="hub-clientes__panel-close" aria-label="Fechar painel" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      ) : null}

      <div className="hub-pets-detail__hero">
        <div className="hub-clientes__panel-avatar-lg hub-pets-detail__hero-avatar">{profileInitials(pet.name)}</div>
        <div className="hub-pets-detail__hero-body">
          <div className="hub-pets-detail__hero-title-row">
            <h2 className="hub-clientes__panel-name hub-pets-detail__hero-name">{pet.name}</h2>
            <span className={`hub-clientes__pill ${active ? 'hub-clientes__pill--active' : 'hub-clientes__pill--inactive'}`}>
              {active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
          {breedLine ? <p className="hub-pets-detail__hero-muted">{breedLine}</p> : null}
          <p className="hub-pets-detail__hero-muted">{petAgeDetailedLabel(pet.birth_date)}</p>
          {primaryTutor ? (
            <p className="hub-pets-detail__hero-muted hub-pets-detail__hero-tutor">
              Tutor:{' '}
              <span className="hub-pets-detail__hero-tutor-name">{primaryTutor}</span>
            </p>
          ) : null}
        </div>
      </div>

      {quickActions}
      {tabs}
      {tabContent}
      {financeDrawer}
      {receivablePanel}
      {batchChargePanel}

      {canWrite && !hideFooter ? (
        <div className="hub-clientes__footer-btns">
          <div className="hub-clientes__btn-row">
            <button type="button" className="hub-clientes__btn hub-clientes__btn--outline" onClick={onStartEdit}>
              Editar pet
            </button>
            {!hideNewPageButton ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                onClick={openFullPage}
                title="Abrir o perfil completo"
              >
                <ExternalLink size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Ver perfil completo
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
