import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BedDouble,
  Check,
  ChevronRight,
  Coins,
  FileText,
  FlaskConical,
  LayoutList,
  MessageSquare,
  Paperclip,
  Pencil,
  Pill,
  Scissors,
  Share2,
  Stethoscope,
  Syringe,
  X,
} from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { getSelectedUnitId } from '../../utils/useSelectedUnitId';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import {
  hubClinicalCasesApi,
  hubClinicalTimelineApi,
  hubEncountersApi,
  hubClinicalApi,
  hubClinicalExamsApi,
  hubSpecialistReferralsApi,
  type HubClinicalCase,
  type HubClinicalCaseStatus,
  type HubClinicalTimelineEvent,
  type HubEncounter,
  type HubPrescription,
  type HubVaccination,
  type HubHospitalization,
  type HubSurgery,
  type HubClinicalAttachment,
  type HubClinicalExam,
  type HubSpecialistReferral,
} from '../../api/hubClinicalApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import {
  attachmentPublicUrl,
  formatHubClinicalExamStatus,
  formatHubComandaStatus,
  formatPrescriptionLine,
} from './clinicalDisplay';
import { HubPrescriptionHistoryList } from '../../components/clinical/HubPrescriptionHistoryList';
import { HubEncounterClinicalDocumentsList } from '../../components/clinical/HubEncounterClinicalDocumentsList';
import {
  clinicalCaseDisplayTitle,
  clinicalCaseTitleFallbacks,
  isGenericClinicalCaseTitle,
} from './clinicalCaseTitle';
import { petAgeDetailedLabel } from '../pets/petAge';
import { petInitials } from './vet-cockpit/vetCockpitUtils';
import {
  encounterStatusLabel,
  encounterTypeLabel,
  formatRecordDate,
  formatRecordDateTime,
} from './clinic-records/clinicRecordsUtils';
import './clinic-records/clinic-records.css';
import './clinica-page.css';

type CaseReopenHistoryItem = {
  at?: string;
  previous_status?: string;
  previous_closed_at?: string | null;
  reason?: string;
};

function caseReopenHistory(metadata: Record<string, unknown> | undefined): CaseReopenHistoryItem[] {
  const raw = metadata?.reopen_history;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is CaseReopenHistoryItem => !!item && typeof item === 'object');
}

function metadataDate(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

type TabId =
  | 'resumo'
  | 'timeline'
  | 'atendimentos'
  | 'prescricoes'
  | 'vacinas'
  | 'internacoes'
  | 'cirurgias'
  | 'exames'
  | 'encaminhamentos'
  | 'anexos'
  | 'financeiro';

const STATUS_LABELS: Record<HubClinicalCaseStatus, string> = {
  active: 'Ativo',
  monitoring: 'Monitoramento',
  resolved: 'Resolvido',
  cancelled: 'Cancelado',
};

const STATUS_OPTIONS: { value: HubClinicalCaseStatus; label: string }[] = [
  { value: 'active', label: 'Ativo' },
  { value: 'monitoring', label: 'Monitoramento' },
  { value: 'resolved', label: 'Resolvido' },
  { value: 'cancelled', label: 'Cancelado' },
];

const SURGERY_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const HOSP_STATUS_LABELS: Record<string, string> = {
  active: 'Ativa',
  discharged: 'Alta',
  death: 'Óbito',
  transferred: 'Transferida',
  cancelled: 'Cancelada',
};

const CASE_NAV: Array<{
  id: TabId;
  label: string;
  Icon: typeof Stethoscope;
  countKey?:
    | 'encounters'
    | 'prescriptions'
    | 'vaccinations'
    | 'hospitalizations'
    | 'surgeries'
    | 'exams'
    | 'referrals'
    | 'attachments'
    | 'comandas';
}> = [
  { id: 'resumo', label: 'Resumo', Icon: LayoutList },
  { id: 'timeline', label: 'Linha do tempo', Icon: MessageSquare },
  { id: 'atendimentos', label: 'Atendimentos', Icon: Stethoscope, countKey: 'encounters' },
  { id: 'prescricoes', label: 'Prescrições', Icon: Pill, countKey: 'prescriptions' },
  { id: 'vacinas', label: 'Vacinas', Icon: Syringe, countKey: 'vaccinations' },
  { id: 'internacoes', label: 'Internações', Icon: BedDouble, countKey: 'hospitalizations' },
  { id: 'cirurgias', label: 'Cirurgias', Icon: Scissors, countKey: 'surgeries' },
  { id: 'exames', label: 'Exames', Icon: FlaskConical, countKey: 'exams' },
  { id: 'encaminhamentos', label: 'Encaminhamentos', Icon: Share2, countKey: 'referrals' },
  { id: 'anexos', label: 'Anexos', Icon: Paperclip, countKey: 'attachments' },
  { id: 'financeiro', label: 'Financeiro', Icon: Coins, countKey: 'comandas' },
];

const HubClinicCasePage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');
  const canFinancial = hasPermission('hub.financial.read');

  const [clinicalCase, setClinicalCase] = useState<HubClinicalCase | null>(null);
  const [tab, setTab] = useState<TabId>('resumo');
  const [timelineEvents, setTimelineEvents] = useState<HubClinicalTimelineEvent[]>([]);
  const [encounters, setEncounters] = useState<HubEncounter[]>([]);
  const [prescriptions, setPrescriptions] = useState<HubPrescription[]>([]);
  const [vaccinations, setVaccinations] = useState<HubVaccination[]>([]);
  const [hospitalizations, setHospitalizations] = useState<HubHospitalization[]>([]);
  const [surgeries, setSurgeries] = useState<HubSurgery[]>([]);
  const [exams, setExams] = useState<HubClinicalExam[]>([]);
  const [referrals, setReferrals] = useState<HubSpecialistReferral[]>([]);
  const [attachments, setAttachments] = useState<HubClinicalAttachment[]>([]);
  const [comandas, setComandas] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadedCaseIdRef = useRef<string | null>(null);
  const [editingStatus, setEditingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<HubClinicalCaseStatus>('active');
  const [savingStatus, setSavingStatus] = useState(false);
  const [startingEncounter, setStartingEncounter] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenAction, setReopenAction] = useState<'encounter' | 'status' | 'internacao' | 'cirurgia' | null>(null);
  const [reopening, setReopening] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [summaryDraft, setSummaryDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const summaryInputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    if (!clinicId || !caseId) return;
    const keepContent = loadedCaseIdRef.current === caseId;
    if (keepContent) setRefreshing(true);
    else setLoading(true);
    try {
      const [caseRes, tlRes] = await Promise.allSettled([
        hubClinicalCasesApi.get(caseId, clinicId),
        hubClinicalTimelineApi.list(clinicId, { caseId }),
      ]);

      const theCase = caseRes.status === 'fulfilled' ? caseRes.value.case : null;
      setClinicalCase(theCase ?? null);
      if (theCase) setNewStatus(theCase.status);

      setTimelineEvents(tlRes.status === 'fulfilled' ? tlRes.value.events : []);

      if (theCase?.pet_id && clinicId) {
        const encP = hubEncountersApi.listByPet(clinicId, theCase.pet_id);
        const rxP = hubClinicalApi.listPrescriptions(clinicId, theCase.pet_id, caseId);
        const vaxP = hubClinicalApi.listVaccinations(clinicId, theCase.pet_id, caseId);
        const hospP = hubClinicalApi.listHospitalizations(clinicId, undefined, caseId);
        const surgP = hubClinicalApi.listSurgeries(clinicId, undefined, caseId);
        const examP = hubClinicalExamsApi.list(clinicId, { caseId, petId: theCase.pet_id });
        const refP = hubSpecialistReferralsApi.list(clinicId, { caseId, petId: theCase.pet_id });
        const attP = hubClinicalApi.listAttachments(clinicId, { petId: theCase.pet_id });
        const comP = canFinancial
          ? hubComandaApi.listComandas({ clinic_id: clinicId, hub_case_id: caseId }).catch(() => ({ comandas: [] }))
          : Promise.resolve({ comandas: [] });

        const [encFull, rxFull, vaxFull, hospFull, surgFull, examFull, refFull, attFull, comFull] = await Promise.allSettled([
          encP,
          rxP,
          vaxP,
          hospP,
          surgP,
          examP,
          refP,
          attP,
          comP,
        ]);

        const allEnc = encFull.status === 'fulfilled' ? encFull.value.encounters : [];
        const encForCase = allEnc
          .filter((e) => e.hub_case_id === caseId)
          .sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime());
        setEncounters(encForCase);

        const examList = examFull.status === 'fulfilled' ? examFull.value.exams : [];
        setExams(examList);
        setReferrals(refFull.status === 'fulfilled' ? refFull.value.referrals : []);

        setPrescriptions(rxFull.status === 'fulfilled' ? rxFull.value.prescriptions : []);
        setVaccinations(vaxFull.status === 'fulfilled' ? vaxFull.value.vaccinations : []);
        setHospitalizations(hospFull.status === 'fulfilled' ? hospFull.value.hospitalizations : []);
        setSurgeries(surgFull.status === 'fulfilled' ? surgFull.value.surgeries : []);

        const examIds = new Set(examList.map((x) => x.id));
        const encIds = new Set(encForCase.map((e) => e.id));
        const allAtt = attFull.status === 'fulfilled' ? attFull.value.attachments : [];
        setAttachments(
          allAtt.filter((a) => {
            if (a.hub_exam_id && examIds.has(a.hub_exam_id)) return true;
            if (a.hub_encounter_id && encIds.has(a.hub_encounter_id)) return true;
            return false;
          }),
        );

        setComandas(comFull.status === 'fulfilled' ? comFull.value.comandas ?? [] : []);
      }
      loadedCaseIdRef.current = caseId;
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar caso clínico');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clinicId, caseId, showError, canFinancial]);

  useEffect(() => {
    void load();
  }, [load]);

  const titleFallbacks = useMemo(
    () => clinicalCaseTitleFallbacks(encounters, caseId),
    [encounters, caseId],
  );
  const displayTitle = clinicalCaseDisplayTitle(clinicalCase?.title, titleFallbacks);
  const titleIsGeneric = isGenericClinicalCaseTitle(clinicalCase?.title);
  const latestEncounter = useMemo(() => {
    if (encounters.length === 0) return null;
    return [...encounters].sort(
      (a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime(),
    )[0] ?? null;
  }, [encounters]);

  const startTitleEdit = () => {
    if (!canWrite) return;
    const suggested =
      titleIsGeneric && !isGenericClinicalCaseTitle(displayTitle) ? displayTitle : clinicalCase?.title ?? '';
    setTitleDraft(isGenericClinicalCaseTitle(suggested) ? '' : suggested);
    setEditingTitle(true);
  };

  const cancelTitleEdit = () => {
    setEditingTitle(false);
    setTitleDraft('');
  };

  const startSummaryEdit = () => {
    if (!canWrite) return;
    setSummaryDraft(clinicalCase?.summary ?? '');
    setEditingSummary(true);
  };

  const cancelSummaryEdit = () => {
    setEditingSummary(false);
    setSummaryDraft('');
  };

  useEffect(() => {
    if (!editingTitle) return;
    const el = titleInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingTitle]);

  useEffect(() => {
    if (!editingSummary) return;
    summaryInputRef.current?.focus();
  }, [editingSummary]);

  const startEncounterInCase = async (reopenReasonValue?: string) => {
    if (!clinicId || !clinicalCase || !canWrite || startingEncounter) return;
    if (clinicalCase.status === 'cancelled') {
      showError('Caso cancelado não pode receber atendimento. Abra um caso novo.');
      return;
    }
    const unitId = clinicalCase.unit_id || getSelectedUnitId();
    if (!unitId) {
      showError('Selecione uma unidade no cabeçalho para abrir o atendimento.');
      return;
    }
    setStartingEncounter(true);
    try {
      const { encounter } = await hubEncountersApi.create({
        clinic_id: clinicId,
        pet_id: clinicalCase.pet_id,
        hub_case_id: clinicalCase.id,
        unit_id: unitId,
        ...(reopenReasonValue ? { reopen_reason: reopenReasonValue } : {}),
      });
      navigate(`/hub/clinica/atendimentos/${encounter.id}`);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao criar atendimento');
    } finally {
      setStartingEncounter(false);
    }
  };

  const requestNewEncounter = () => {
    if (!clinicalCase) return;
    if (clinicalCase.status === 'cancelled') {
      showError('Caso cancelado não pode receber atendimento. Abra um caso novo.');
      return;
    }
    if (clinicalCase.status === 'resolved') {
      setReopenAction('encounter');
      setReopenReason('');
      setReopenOpen(true);
      return;
    }
    void startEncounterInCase();
  };

  const persistReopenAndGo = async (reason: string, dest: 'internacao' | 'cirurgia') => {
    if (!clinicId || !caseId || !clinicalCase) return;
    const { case: updated } = await hubClinicalCasesApi.patch(caseId, {
      clinic_id: clinicId,
      status: 'active',
      reopen_reason: reason,
    });
    setClinicalCase(updated);
    const q = `pet_id=${encodeURIComponent(clinicalCase.pet_id)}&hub_case_id=${encodeURIComponent(clinicalCase.id)}`;
    navigate(dest === 'internacao' ? `/hub/clinica?admit=1&${q}` : `/hub/clinica?surgery=1&${q}`);
  };

  const confirmReopen = async () => {
    const reason = reopenReason.trim();
    if (reason.length < 8) {
      showError('Informe o motivo da reabertura (mínimo 8 caracteres).');
      return;
    }
    if (reopenAction === 'encounter') {
      setReopenOpen(false);
      await startEncounterInCase(reason);
      return;
    }
    if (reopenAction === 'status') {
      setSavingStatus(true);
      try {
        if (!clinicId || !caseId) return;
        const { case: updated } = await hubClinicalCasesApi.patch(caseId, {
          clinic_id: clinicId,
          status: newStatus,
          reopen_reason: reason,
        });
        setClinicalCase(updated);
        setEditingStatus(false);
        setReopenOpen(false);
        showSuccess('Caso reaberto');
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao reabrir caso');
      } finally {
        setSavingStatus(false);
      }
      return;
    }
    if (reopenAction === 'internacao' || reopenAction === 'cirurgia') {
      setReopening(true);
      try {
        await persistReopenAndGo(reason, reopenAction);
        setReopenOpen(false);
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao reabrir caso');
      } finally {
        setReopening(false);
      }
    }
  };

  const handleStatusSave = async () => {
    if (!clinicId || !caseId || !canWrite || !clinicalCase) return;
    const opening = newStatus === 'active' || newStatus === 'monitoring';
    const wasClosed = clinicalCase.status === 'resolved' || clinicalCase.status === 'cancelled';
    if (wasClosed && opening) {
      setReopenAction('status');
      setReopenReason('');
      setReopenOpen(true);
      return;
    }
    setSavingStatus(true);
    try {
      const { case: updated } = await hubClinicalCasesApi.patch(caseId, {
        clinic_id: clinicId,
        status: newStatus,
      });
      setClinicalCase(updated);
      setEditingStatus(false);
      showSuccess('Status do caso atualizado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar status');
    } finally {
      setSavingStatus(false);
    }
  };

  const handleTitleSave = async () => {
    if (!clinicId || !caseId || !canWrite || savingTitle) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      showError('Informe um título para o caso.');
      titleInputRef.current?.focus();
      return;
    }
    const stored = clinicalCase?.title?.trim() ?? '';
    if (nextTitle === stored) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      const { case: updated } = await hubClinicalCasesApi.patch(caseId, {
        clinic_id: clinicId,
        title: nextTitle,
      });
      setClinicalCase(updated);
      setEditingTitle(false);
      showSuccess('Título do caso atualizado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar o título');
    } finally {
      setSavingTitle(false);
    }
  };

  const handleSummarySave = async () => {
    if (!clinicId || !caseId || !canWrite || savingSummary) return;
    const nextSummary = summaryDraft.trim() || null;
    const stored = clinicalCase?.summary?.trim() || null;
    if (nextSummary === stored) {
      setEditingSummary(false);
      return;
    }
    setSavingSummary(true);
    try {
      const { case: updated } = await hubClinicalCasesApi.patch(caseId, {
        clinic_id: clinicId,
        summary: nextSummary,
      });
      setClinicalCase(updated);
      setEditingSummary(false);
      showSuccess('Resumo clínico atualizado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar o resumo');
    } finally {
      setSavingSummary(false);
    }
  };

  const cancelExam = async (exam: HubClinicalExam) => {
    if (!clinicId || !canWrite) return;
    if (!window.confirm(`Cancelar o pedido de exame «${exam.exam_type}»?`)) return;
    try {
      await hubClinicalExamsApi.patch(exam.id, { clinic_id: clinicId, status: 'cancelled' });
      showSuccess('Exame cancelado');
      void load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao cancelar exame');
    }
  };

  if (!canRead) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão para casos clínicos.</p>;
  }

  if (!clinicalCase || !caseId || !clinicId || clinicalCase.id !== caseId) {
    if (loading) {
      return (
        <div className="hub-clinic-page__pad">
          <HubLoading variant="block" label="Carregando caso clínico…" />
        </div>
      );
    }
    return (
      <div className="hub-clinic-page__pad">
        <p className="hub-clientes__muted">Caso clínico não encontrado.</p>
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--secondary hub-clientes__btn--sm"
          onClick={() => navigate(-1)}
        >
          Voltar
        </button>
      </div>
    );
  }

  const petName = clinicalCase.pet?.name ?? 'Pet';
  const petMeta = [
    clinicalCase.pet?.breed || clinicalCase.pet?.species,
    clinicalCase.pet?.birth_date ? petAgeDetailedLabel(clinicalCase.pet.birth_date) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const firstClosedAt = metadataDate(clinicalCase.metadata, 'first_closed_at');
  const lastReopenedAt = metadataDate(clinicalCase.metadata, 'last_reopened_at');
  const reopenEntries = caseReopenHistory(clinicalCase.metadata);

  const facts = [
    { label: 'Pet', value: petName },
    { label: 'Tutor', value: clinicalCase.guardian_snapshot?.full_name || '—' },
    { label: 'Veterinário', value: clinicalCase.primary_veterinarian?.full_name || '—' },
    { label: 'Aberto em', value: formatRecordDate(clinicalCase.opened_at) },
    { label: 'Fechado em', value: clinicalCase.closed_at ? formatRecordDate(clinicalCase.closed_at) : 'Em aberto' },
    ...(firstClosedAt && !clinicalCase.closed_at
      ? [{ label: 'Primeiro fechamento', value: formatRecordDate(firstClosedAt) }]
      : []),
    ...(lastReopenedAt ? [{ label: 'Última reabertura', value: formatRecordDate(lastReopenedAt) }] : []),
    { label: 'Atendimentos', value: String(encounters.length) },
  ];

  const counts = {
    encounters: encounters.length,
    prescriptions: prescriptions.length,
    vaccinations: vaccinations.length,
    hospitalizations: hospitalizations.length,
    surgeries: surgeries.length,
    exams: exams.length,
    referrals: referrals.length,
    attachments: attachments.length,
    comandas: comandas.length,
  };

  const stats: Array<{ id: TabId; label: string; value: number; Icon: typeof Stethoscope }> = [
    { id: 'atendimentos', label: 'Atendimentos', value: counts.encounters, Icon: Stethoscope },
    { id: 'cirurgias', label: 'Cirurgias', value: counts.surgeries, Icon: Scissors },
    { id: 'internacoes', label: 'Internações', value: counts.hospitalizations, Icon: BedDouble },
    { id: 'prescricoes', label: 'Prescrições', value: counts.prescriptions, Icon: FileText },
    { id: 'exames', label: 'Exames', value: counts.exams, Icon: FlaskConical },
    { id: 'encaminhamentos', label: 'Encaminhamentos', value: counts.referrals, Icon: Share2 },
  ];

  const activeNav = CASE_NAV.find((item) => item.id === tab) ?? CASE_NAV[0];

  return (
    <div className="hub-clinic-case-page hub-loading-host">
      {refreshing ? <HubLoading variant="banner" label="Atualizando caso…" /> : null}
      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-clinic-case-page__back"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft size={16} aria-hidden /> Voltar
      </button>

      <header className="hub-clinic-case-page__hero">
        <div className="hub-clinic-case-page__hero-top">
          <div className="hub-clinic-case-page__identity">
            <div className="hub-clinic-records__avatar hub-clinic-records__avatar--lg" aria-hidden>
              {petInitials(petName)}
            </div>
            <div className="hub-clinic-records__title-text">
              <p className="hub-clinic-records__kicker">Caso clínico</p>
              {editingTitle ? (
                <form
                  className="hub-clinic-case-page__title-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleTitleSave();
                  }}
                >
                  <label className="hub-clinic-case-page__sr-only" htmlFor="case-title-draft">
                    Título do caso
                  </label>
                  <input
                    ref={titleInputRef}
                    id="case-title-draft"
                    className="hub-clinic-case-page__title-input"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelTitleEdit();
                      }
                    }}
                    placeholder="Nomeie o caso: dermatite, pós-operatório, tosse…"
                    maxLength={500}
                    disabled={savingTitle}
                    aria-describedby="case-title-hint"
                  />
                  <div className="hub-clinic-case-page__title-actions">
                    <button
                      type="submit"
                      className="hub-clinic-case-page__title-icon-btn hub-clinic-case-page__title-icon-btn--save"
                      disabled={savingTitle || !titleDraft.trim()}
                      aria-label={savingTitle ? 'Salvando título' : 'Salvar título'}
                    >
                      <Check size={16} strokeWidth={2.25} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="hub-clinic-case-page__title-icon-btn"
                      disabled={savingTitle}
                      onClick={cancelTitleEdit}
                      aria-label="Cancelar edição do título"
                    >
                      <X size={16} strokeWidth={2.25} aria-hidden />
                    </button>
                  </div>
                  <p id="case-title-hint" className="hub-clinic-case-page__title-hint">
                    {savingTitle ? 'Salvando…' : 'Enter para salvar · Esc para cancelar'}
                  </p>
                </form>
              ) : (
                <h1 className="hub-clinic-case-page__title">
                  {canWrite ? (
                    <button
                      type="button"
                      className="hub-clinic-case-page__title-btn"
                      onClick={startTitleEdit}
                      title="Editar título do caso"
                    >
                      <span>{displayTitle}</span>
                      <Pencil size={16} strokeWidth={2} aria-hidden />
                    </button>
                  ) : (
                    displayTitle
                  )}
                </h1>
              )}
              <p className="hub-clinic-records__pet-meta">
                <Link to={`/hub/clinica/prontuarios?petId=${clinicalCase.pet_id}`} className="hub-clientes__link">
                  {petName}
                </Link>
                {petMeta ? ` · ${petMeta}` : ''}
                {clinicalCase.guardian_snapshot?.full_name
                  ? ` · Tutor: ${clinicalCase.guardian_snapshot.full_name}`
                  : ''}
              </p>
            </div>
          </div>

          <div className="hub-clinic-case-page__status-area">
            {editingStatus ? (
              <div className="hub-clinic-case-page__status-edit">
                <select
                  className="hub-clientes__input"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as HubClinicalCaseStatus)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                  disabled={savingStatus}
                  onClick={() => void handleStatusSave()}
                >
                  {savingStatus ? 'Salvando…' : 'Salvar'}
                </button>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  onClick={() => setEditingStatus(false)}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <span className={`hub-clinic-cases__badge hub-clinic-cases__badge--${clinicalCase.status}`}>
                  {STATUS_LABELS[clinicalCase.status]}
                </span>
                {canWrite ? (
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                    onClick={() => setEditingStatus(true)}
                  >
                    Alterar status
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>

        {titleIsGeneric && !editingTitle ? (
          canWrite ? (
            <button type="button" className="hub-clinic-case-page__generic-hint" onClick={startTitleEdit}>
              Este caso ainda está com um título genérico. Clique para identificar o episódio (ex.: dermatite,
              pós-operatório).
            </button>
          ) : (
            <p className="hub-clinic-case-page__generic-hint">
              Este caso ainda está com um título genérico. Edite para identificar o episódio (ex.: dermatite,
              pós-operatório).
            </p>
          )
        ) : null}

        <div className="hub-clinic-records__facts" aria-label="Dados do caso">
          {facts.map((fact) => (
            <div key={fact.label}>
              <span className="hub-clinic-records__fact-k">{fact.label}</span>
              <strong className={fact.value === '—' || fact.value === 'Em aberto' ? 'hub-clinic-records__muted-value' : undefined}>
                {fact.label === 'Pet' ? (
                  <Link to={`/hub/clinica/prontuarios?petId=${clinicalCase.pet_id}`} className="hub-clientes__link">
                    {fact.value}
                  </Link>
                ) : (
                  fact.value
                )}
              </strong>
            </div>
          ))}
        </div>

        <div className="hub-clinic-records__stats" aria-label="Resumo do caso">
          {stats.map((stat) => (
            <button
              key={stat.id}
              type="button"
              className="hub-clinic-records__stat hub-clinic-case-page__stat-btn"
              onClick={() => setTab(stat.id)}
            >
              <stat.Icon size={16} aria-hidden />
              <span className="hub-clinic-records__stat-value">{stat.value}</span>
              <span className="hub-clinic-records__stat-label">{stat.label}</span>
            </button>
          ))}
        </div>

        {canWrite ? (
          <div className="hub-clinic-case-page__actions">
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              disabled={startingEncounter || clinicalCase.status === 'cancelled'}
              title={
                clinicalCase.status === 'cancelled'
                  ? 'Caso cancelado: abra um caso novo'
                  : clinicalCase.status === 'resolved'
                    ? 'Vai reabrir o caso — motivo obrigatório'
                    : undefined
              }
              onClick={requestNewEncounter}
            >
              {startingEncounter
                ? 'Abrindo…'
                : clinicalCase.status === 'resolved'
                  ? 'Reabrir e novo atendimento'
                  : '+ Novo atendimento neste caso'}
            </button>
            {clinicalCase.status === 'cancelled' ? (
              <span className="hub-clientes__muted" style={{ fontSize: 13 }}>
                Caso cancelado — receita e novos procedimentos ficam em um caso novo.
              </span>
            ) : (
              <Link
                to={`/hub/clinica/receitas/nova?petId=${encodeURIComponent(clinicalCase.pet_id)}&caseId=${encodeURIComponent(clinicalCase.id)}`}
                className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
              >
                <Pill size={14} aria-hidden />
                Adicionar receita
              </Link>
            )}
          </div>
        ) : null}
      </header>

      <div className="hub-clinic-case-page__body">
        <nav className="hub-cws-rail" aria-label="Seções do caso">
          {CASE_NAV.filter((item) => item.id !== 'financeiro' || canFinancial).map(({ id, label, Icon, countKey }) => {
            const count = countKey ? counts[countKey] : null;
            return (
              <button
                key={id}
                type="button"
                className={`hub-cws-rail__btn ${tab === id ? 'hub-cws-rail__btn--active' : ''}`}
                onClick={() => setTab(id)}
              >
                <Icon size={18} className="hub-cws-rail__icon" aria-hidden />
                <span className="hub-clinic-case-page__rail-label">{label}</span>
                {count != null ? (
                  <span className="hub-clinic-case-page__rail-count">{count}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="hub-clinic-case-page__main">
          <h2 className="hub-clinic-case-page__main-title">{activeNav.label}</h2>
      {tab === 'resumo' && (
        <div className="hub-clinic-case-page__resumo-grid">
          <section className="hub-clinic-case-page__block">
            <div className="hub-clinic-case-page__block-head">
              <h2 className="hub-clinic-case-page__block-title">Resumo clínico</h2>
              {canWrite && !editingSummary ? (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  onClick={startSummaryEdit}
                >
                  <Pencil size={14} aria-hidden /> {clinicalCase.summary ? 'Editar' : 'Adicionar'}
                </button>
              ) : null}
            </div>
            {editingSummary ? (
              <form
                className="hub-clinic-case-page__summary-edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSummarySave();
                }}
              >
                <label className="hub-clinic-case-page__sr-only" htmlFor="case-summary-draft">
                  Resumo clínico
                </label>
                <textarea
                  ref={summaryInputRef}
                  id="case-summary-draft"
                  className="hub-clientes__input"
                  rows={4}
                  value={summaryDraft}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelSummaryEdit();
                    }
                  }}
                  placeholder="Síntese do episódio para a equipe encontrar o caso depois."
                  maxLength={4000}
                  disabled={savingSummary}
                />
                <div className="hub-clinic-case-page__status-edit">
                  <button
                    type="submit"
                    className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                    disabled={savingSummary}
                  >
                    {savingSummary ? 'Salvando…' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                    disabled={savingSummary}
                    onClick={cancelSummaryEdit}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : clinicalCase.summary ? (
              <p className="hub-clinic-records__card-body">{clinicalCase.summary}</p>
            ) : (
              <p className="hub-clinic-records__tab-empty">Nenhum resumo textual cadastrado para este caso.</p>
            )}
            {clinicalCase.tags.length > 0 ? (
              <div className="hub-clinic-case-page__tags" style={{ marginTop: 12 }}>
                {clinicalCase.tags.map((tag) => (
                  <span key={tag} className="hub-clinic-alert-chip">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="hub-clinic-case-page__block">
            <h2 className="hub-clinic-case-page__block-title">Último atendimento</h2>
            {latestEncounter ? (
              <>
                <p className="hub-clinic-records__card-title">
                  {encounterTypeLabel(latestEncounter.encounter_type)} · {encounterStatusLabel(latestEncounter.status)}
                </p>
                <p className="hub-clinic-records__card-body">
                  {latestEncounter.chief_complaint || latestEncounter.summary_notes || 'Sem queixa registrada.'}
                </p>
                <p className="hub-clinic-records__card-meta">
                  {formatRecordDateTime(latestEncounter.started_at)}
                </p>
                <Link to={`/hub/clinica/atendimentos/${latestEncounter.id}`} className="hub-clientes__link">
                  Abrir atendimento →
                </Link>
              </>
            ) : (
              <p className="hub-clinic-records__tab-empty">Nenhum atendimento neste caso.</p>
            )}
          </section>

          {reopenEntries.length > 0 ? (
            <section className="hub-clinic-case-page__block hub-clinic-case-page__block--wide">
              <h2 className="hub-clinic-case-page__block-title">Reaberturas</h2>
              <ol className="hub-clinic-records__timeline">
                {reopenEntries.map((entry, index) => (
                  <li key={`${entry.at ?? index}-${entry.reason ?? ''}`} className="hub-clinic-records__timeline-item">
                    <span className="hub-clinic-records__timeline-dot" aria-hidden />
                    <div>
                      <strong>
                        {entry.previous_status === 'cancelled' ? 'Reaberto após cancelamento' : 'Caso reaberto'}
                      </strong>
                      {entry.reason ? <p className="hub-clinic-records__card-body">{entry.reason}</p> : null}
                      <p className="hub-clinic-records__card-meta">
                        {entry.at ? formatRecordDateTime(entry.at) : 'Data não registrada'}
                        {entry.previous_closed_at
                          ? ` · fechado em ${formatRecordDate(entry.previous_closed_at)}`
                          : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      )}

      {tab === 'timeline' && (
        <div className="hub-clinic-records__section">
          {timelineEvents.length === 0 ? (
            <p className="hub-clinic-records__tab-empty">Nenhum evento clínico registrado neste caso.</p>
          ) : (
            <ol className="hub-clinic-records__timeline">
              {timelineEvents.map((ev) => (
                <li key={ev.id} className="hub-clinic-records__timeline-item">
                  <span className="hub-clinic-records__timeline-dot" aria-hidden />
                  <div>
                    <strong>{ev.title}</strong>
                    {ev.body ? <p className="hub-clinic-records__card-body">{ev.body}</p> : null}
                    <p className="hub-clinic-records__card-meta">
                      {formatRecordDateTime(ev.event_at)}
                      {ev.created_by_member ? ` · ${ev.created_by_member.full_name}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {tab === 'atendimentos' && (
        <div className="hub-clinic-records__section">
          {encounters.length === 0 ? (
            <p className="hub-clinic-records__tab-empty">Nenhum atendimento neste caso.</p>
          ) : (
            <div className="hub-clinic-records__cards">
              {encounters.map((e) => (
                <article key={e.id} className="hub-clinic-records__card">
                  <div className="hub-clinic-records__card-head">
                    <strong className="hub-clinic-records__card-title">{encounterTypeLabel(e.encounter_type)}</strong>
                    <span className={`hub-clinic-records__status hub-clinic-records__status--${e.status}`}>
                      {encounterStatusLabel(e.status)}
                    </span>
                  </div>
                  <p className="hub-clinic-records__card-body">{e.chief_complaint || e.summary_notes || 'Sem descrição.'}</p>
                  <p className="hub-clinic-records__card-meta">{formatRecordDateTime(e.started_at)}</p>
                  <Link
                    to={`/hub/clinica/atendimentos/${e.id}`}
                    className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                  >
                    Abrir atendimento
                    <ChevronRight size={14} aria-hidden />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'prescricoes' && (
        <div className="hub-clinic-records__section">
          {canWrite && clinicalCase.status !== 'cancelled' ? (
            <div style={{ marginBottom: 12 }}>
              <Link
                to={`/hub/clinica/receitas/nova?petId=${encodeURIComponent(clinicalCase.pet_id)}&caseId=${encodeURIComponent(clinicalCase.id)}`}
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Pill size={14} aria-hidden />
                Adicionar receita
              </Link>
            </div>
          ) : null}
          {prescriptions.length === 0 ? (
            <p className="hub-clinic-records__tab-empty">Nenhuma prescrição ou receita vinculada a este caso.</p>
          ) : clinicId ? (
            <HubPrescriptionHistoryList
              prescriptions={prescriptions}
              clinicId={clinicId}
              canWrite={canWrite}
            />
          ) : (
            <ul className="hub-clinic-records__list">
              {prescriptions.map((p) => (
                <li key={p.id}>{formatPrescriptionLine(p)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'vacinas' && (
        <div className="hub-clinic-records__section">
          {vaccinations.length === 0 ? (
            <p className="hub-clinic-records__tab-empty">Nenhuma vacina vinculada a este caso.</p>
          ) : (
            <div className="hub-clinic-records__cards">
              {vaccinations.map((v) => (
                <article key={v.id} className="hub-clinic-records__card">
                  <strong className="hub-clinic-records__card-title">{v.vaccine_name}</strong>
                  <p className="hub-clinic-records__card-meta">
                    {v.administered_at}
                    {v.next_dose_at ? ` · Próxima: ${v.next_dose_at}` : ''}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'internacoes' && (
        <div className="hub-clinic-records__section">
          {canWrite && clinicalCase && clinicalCase.status !== 'cancelled' ? (
            <div style={{ marginBottom: 12 }}>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                onClick={() => {
                  if (clinicalCase.status === 'resolved') {
                    setReopenAction('internacao');
                    setReopenReason('');
                    setReopenOpen(true);
                    return;
                  }
                  navigate(
                    `/hub/clinica?admit=1&pet_id=${encodeURIComponent(clinicalCase.pet_id)}&hub_case_id=${encodeURIComponent(clinicalCase.id)}`,
                  );
                }}
              >
                + Nova internação neste caso
              </button>
            </div>
          ) : null}
          {hospitalizations.length === 0 ? (
            <p className="hub-clinic-records__tab-empty">Nenhuma internação vinculada a este caso.</p>
          ) : (
            <div className="hub-clinic-records__cards">
              {hospitalizations.map((h) => (
                <Link
                  key={h.id}
                  to={`/hub/clinica/internacoes/${h.id}`}
                  className="hub-clinic-records__card hub-clinic-records__card--link"
                >
                  <strong className="hub-clinic-records__card-title">{HOSP_STATUS_LABELS[h.status] ?? h.status}</strong>
                  <p className="hub-clinic-records__card-meta">
                    {h.hub_hospital_beds ? `Leito ${h.hub_hospital_beds.code}` : 'Sem leito'}
                    {h.admitted_at ? ` · Entrada ${String(h.admitted_at).slice(0, 10)}` : ''}
                    {h.discharged_at ? ` · Alta ${String(h.discharged_at).slice(0, 10)}` : ''}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'cirurgias' && (
        <div className="hub-clinic-records__section">
          {canWrite && clinicalCase && clinicalCase.status !== 'cancelled' ? (
            <div style={{ marginBottom: 12 }}>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                onClick={() => {
                  if (clinicalCase.status === 'resolved') {
                    setReopenAction('cirurgia');
                    setReopenReason('');
                    setReopenOpen(true);
                    return;
                  }
                  navigate(
                    `/hub/clinica?surgery=1&pet_id=${encodeURIComponent(clinicalCase.pet_id)}&hub_case_id=${encodeURIComponent(clinicalCase.id)}`,
                  );
                }}
              >
                + Agendar cirurgia neste caso
              </button>
            </div>
          ) : null}
          {surgeries.length === 0 ? (
            <p className="hub-clinic-records__tab-empty">Nenhuma cirurgia vinculada a este caso.</p>
          ) : (
            <div className="hub-clinic-records__cards">
              {surgeries.map((s) => (
                <article key={s.id} className="hub-clinic-records__card">
                  <strong className="hub-clinic-records__card-title">{s.title}</strong>
                  <p className="hub-clinic-records__card-meta">
                    {SURGERY_STATUS_LABELS[s.status] ?? s.status}
                    {s.scheduled_at ? ` · ${formatRecordDateTime(s.scheduled_at)}` : ''}
                  </p>
                  <Link to={`/hub/clinica/cirurgias/${s.id}`} className="hub-clientes__link">
                    Abrir ficha
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'exames' && (
        <div className="hub-clinic-records__section">
          {exams.length === 0 ? (
            <p className="hub-clinic-records__tab-empty">Nenhum exame estruturado neste caso. Solicite no atendimento.</p>
          ) : (
            <div className="hub-clinic-records__cards">
              {exams.map((ex) => (
                <article key={ex.id} className="hub-clinic-records__card">
                  <div className="hub-clinic-records__card-head">
                    <strong className="hub-clinic-records__card-title">{ex.exam_type}</strong>
                    <span className="hub-clientes__muted">{formatHubClinicalExamStatus(ex.status)}</span>
                  </div>
                  <p className="hub-clinic-records__card-meta">
                    Solicitado em {formatRecordDateTime(ex.requested_at)}
                  </p>
                  {ex.result_text ? <p className="hub-clinic-records__card-body">{ex.result_text}</p> : null}
                  {ex.hub_encounter_id ? (
                    <Link to={`/hub/clinica/atendimentos/${ex.hub_encounter_id}`} className="hub-clientes__link">
                      Ver atendimento
                    </Link>
                  ) : null}
                  {canWrite && ex.status !== 'cancelled' && ex.status !== 'completed' ? (
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={() => void cancelExam(ex)}
                    >
                      Cancelar pedido
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
          <HubEncounterClinicalDocumentsList
            kind="exam_order"
            clinicId={clinicId}
            encounters={encounters}
            canWrite={canWrite}
          />
        </div>
      )}

      {tab === 'encaminhamentos' && (
        <div className="hub-clinic-records__section">
          {referrals.length === 0 ? (
            <p className="hub-clinic-records__tab-empty">Nenhum encaminhamento neste caso. Registre no atendimento.</p>
          ) : (
            <div className="hub-clinic-records__cards">
              {referrals.map((ref) => (
                <article key={ref.id} className="hub-clinic-records__card">
                  <strong className="hub-clinic-records__card-title">{ref.specialty}</strong>
                  <p className="hub-clinic-records__card-body">{ref.referral_reason}</p>
                  {ref.hub_encounter_id ? (
                    <Link to={`/hub/clinica/atendimentos/${ref.hub_encounter_id}`} className="hub-clientes__link">
                      Ver atendimento
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
          )}
          <HubEncounterClinicalDocumentsList
            kind="specialist_referral"
            clinicId={clinicId}
            encounters={encounters}
            canWrite={canWrite}
          />
        </div>
      )}

      {tab === 'anexos' && (
        <div className="hub-clinic-records__section">
          {attachments.length === 0 ? (
            <p className="hub-clinic-records__tab-empty">Nenhum anexo dos atendimentos deste caso.</p>
          ) : (
            <ul className="hub-clinic-records__list">
              {attachments.map((a) => (
                <li key={a.id}>
                  <a href={attachmentPublicUrl(a.storage_path)} target="_blank" rel="noreferrer" className="hub-clientes__link">
                    {a.title || a.file_name}
                  </a>
                  {a.uploaded_at ? (
                    <span className="hub-clientes__muted" style={{ marginLeft: 8 }}>
                      {String(a.uploaded_at).slice(0, 10)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'financeiro' && (
        <div className="hub-clinic-records__section">
          {!canFinancial ? (
            <p className="hub-clinic-records__tab-empty">Sem permissão para visualizar comandas deste caso.</p>
          ) : comandas.length === 0 ? (
            <p className="hub-clinic-records__tab-empty">Nenhuma comanda registrada para este caso.</p>
          ) : (
            <table className="hub-clinic-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Valor</th>
                  <th>Aberta em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {comandas.map((c) => (
                  <tr key={String(c.id)}>
                    <td>{formatHubComandaStatus(String(c.status ?? ''))}</td>
                    <td>
                      {typeof c.total_amount === 'number'
                        ? c.total_amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : '—'}
                    </td>
                    <td>{c.opened_at ? new Date(String(c.opened_at)).toLocaleString('pt-BR') : '—'}</td>
                    <td>
                      <Link to="/hub/caixa" className="hub-clientes__link">
                        Caixa
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
        </div>
      </div>

      {reopenOpen ? (
        <div className="hub-clinic-amend-overlay" role="dialog" aria-modal="true" aria-labelledby="case-reopen-title">
          <div className="hub-clinic-amend-modal">
            <h3 id="case-reopen-title">
              {reopenAction === 'internacao'
                ? 'Reabrir caso e internar'
                : reopenAction === 'cirurgia'
                  ? 'Reabrir caso e agendar cirurgia'
                  : reopenAction === 'status'
                    ? 'Reabrir caso'
                    : 'Reabrir caso e iniciar atendimento'}
            </h3>
            <p className="hub-clientes__muted">
              {reopenAction === 'status'
                ? `O caso será reaberto como «${STATUS_LABELS[newStatus]}». O fechamento original permanece no histórico.`
                : 'Este caso está resolvido. Continuar reabre o caso e registra o motivo na linha do tempo.'}
            </p>
            <label className="hub-clientes__label" htmlFor="case_reopen_reason">
              Motivo da reabertura <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <textarea
              id="case_reopen_reason"
              className="hub-clientes__textarea"
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Ex.: retorno da dermatite, recidiva, continuidade do tratamento"
              maxLength={1000}
              autoFocus
            />
            <div className="hub-clinic-amend-modal__footer">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                onClick={() => {
                  setReopenOpen(false);
                  setReopenReason('');
                  setReopenAction(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={
                  reopenReason.trim().length < 8 || startingEncounter || savingStatus || reopening
                }
                onClick={() => void confirmReopen()}
              >
                {startingEncounter || savingStatus || reopening ? 'Reabrindo…' : 'Confirmar reabertura'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default HubClinicCasePage;
