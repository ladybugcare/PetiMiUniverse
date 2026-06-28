import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ClipboardList,
  FlaskConical,
  LayoutList,
  MessageSquare,
  Microscope,
  Paperclip,
  Phone,
  Pill,
  Plus,
  Save,
  Stethoscope,
  Syringe,
} from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { FinancialAdjustmentPendingBadge } from '../../components/FinancialAdjustmentPendingBadge';
import '../clientes/clientes.css';
import {
  hubClinicalApi,
  hubEncountersApi,
  hubClinicalExamsApi,
  type HubEncounter,
  type HubEncounterEvent,
  type HubPrescription,
  type HubPrescriptionDocumentRow,
  type HubPrescriptionAdministration,
  type HubPrescriptionItem,
  type HubClinicalAttachment,
  type HubClinicalExam,
  type HubClinicalExamLabKind,
  type HubVaccination,
} from '../../api/hubClinicalApi';
import { hubInventoryApi, type HubInventoryItem } from '../../api/hubInventoryApi';
import { hubGuardiansApi } from '../../api/hubGuardiansApi';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import {
  formatEventAt,
  formatEventBody,
  formatEventTitle,
  formatHubClinicalExamStatus,
  formatPrescriptionLine,
  attachmentPublicUrl,
  todayYmd,
} from './clinicalDisplay';
import { petAgeDetailedLabel } from '../pets/petAge';
import './clinica-page.css';

// ── Debounced auto-save ──────────────────────────────────────────────────────

function useDebouncedSave(
  encounterId: string | undefined,
  clinicId: string | null,
  canWrite: boolean,
  onSaved: () => void,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, unknown>>({});

  const flush = useCallback(async (): Promise<'saved' | 'empty'> => {
    if (!encounterId || !clinicId || !canWrite) return 'empty';
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const keys = Object.keys(pending.current);
    if (keys.length === 0) return 'empty';
    const body = { ...pending.current, clinic_id: clinicId };
    pending.current = {};
    await hubEncountersApi.patch(encounterId, body);
    onSaved();
    return 'saved';
  }, [encounterId, clinicId, canWrite, onSaved]);

  const queue = useCallback(
    (patch: Record<string, unknown>) => {
      if (!canWrite) return;
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush().catch(() => {});
      }, 700);
    },
    [canWrite, flush],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { queue, flush };
}

function canonicalEncounterPrescription(enc: HubEncounter, prescriptions: HubPrescription[]): HubPrescription | null {
  const sameEncounter = prescriptions.filter(
    (p) =>
      p.hub_encounter_id === enc.id &&
      (p.status === undefined || p.status === 'active' || p.status === 'draft'),
  );
  sameEncounter.sort((a, b) => {
    const ta = new Date(a.prescribed_at || 0).getTime();
    const tb = new Date(b.prescribed_at || 0).getTime();
    return tb - ta;
  });
  return sameEncounter[0] ?? null;
}

const HUB_CWS_STATUS_ENCOUNTER: Record<string, { label: string; className: string }> = {
  waiting: { label: 'Aguardando', className: 'hub-cws-status--amber' },
  in_progress: { label: 'Em atendimento', className: 'hub-cws-status--green' },
  completed: { label: 'Finalizado', className: 'hub-cws-status--muted' },
  cancelled: { label: 'Cancelado', className: 'hub-cws-status--red' },
};

// ── Workspace principal ───────────────────────────────────────────────────────

const HubClinicalWorkspacePage: React.FC = () => {
  const { encounterId } = useParams<{ encounterId: string }>();
  const navigate = useNavigate();
  const clinicId = getStoredClinicId();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('hub.clinic.write');
  const canCreateReceivable = hasPermission('hub.receivables.create');
  const canViewFinancial = hasPermission('hub.financial.read');

  const [encounter, setEncounter] = useState<HubEncounter | null>(null);
  const [flags, setFlags] = useState<Array<{ flag_key: string; label: string }>>([]);
  const [events, setEvents] = useState<HubEncounterEvent[]>([]);
  const [evTitle, setEvTitle] = useState('');
  const [evBody, setEvBody] = useState('');
  const [saveHint, setSaveHint] = useState('');
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [encounterExams, setEncounterExams] = useState<HubClinicalExam[]>([]);
  const [encounterVaccinations, setEncounterVaccinations] = useState<HubVaccination[]>([]);
  const [rxItemsCount, setRxItemsCount] = useState(0);
  const [evolutionDrawerOpen, setEvolutionDrawerOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('sec-resumo');

  // Amend (edição pós-finalização)
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendReason, setAmendReason] = useState('');
  const [amending, setAmending] = useState(false);
  const [versions, setVersions] = useState<Array<{
    id: string;
    version_no: number;
    change_reason: string | null;
    created_at: string;
    changed_by_member: { id: string; full_name: string } | null;
  }>>([]);

  const onSaved = useCallback(() => {
    setSaveHint('Salvo');
    setTimeout(() => setSaveHint(''), 2000);
  }, []);

  const { queue, flush } = useDebouncedSave(encounterId, clinicId, canWrite, onSaved);

  const load = useCallback(async () => {
    if (!clinicId || !encounterId) return;
    setLoading(true);
    try {
      const { encounter: enc } = await hubEncountersApi.get(encounterId, clinicId);
      setEncounter(enc);
      const [fl, ev] = await Promise.all([
        enc.pet_id ? hubClinicalApi.listPetFlags(clinicId, enc.pet_id) : Promise.resolve({ flags: [] }),
        enc.pet_id ? hubClinicalApi.listEvents(clinicId, enc.pet_id) : Promise.resolve({ events: [] }),
      ]);
      setFlags(fl.flags ?? []);
      setEvents(ev.events ?? []);

      let examsList: HubClinicalExam[] = [];
      let vacList: HubVaccination[] = [];
      let rxCount = 0;
      try {
        const exP = hubClinicalExamsApi.list(clinicId, { encounterId: enc.id });
        const vacP = enc.pet_id
          ? hubClinicalApi.listVaccinations(clinicId, enc.pet_id)
          : Promise.resolve({ vaccinations: [] as HubVaccination[] });
        const rxP = enc.pet_id
          ? hubClinicalApi.listPrescriptions(clinicId, enc.pet_id)
          : Promise.resolve({ prescriptions: [] as HubPrescription[] });
        const [exRes, vacRes, rxRes] = await Promise.all([exP, vacP, rxP]);
        examsList = exRes.exams ?? [];
        vacList = vacRes.vaccinations ?? [];
        const canonical = canonicalEncounterPrescription(enc, rxRes.prescriptions ?? []);
        rxCount = canonical?.items?.length ?? 0;
      } catch {
        examsList = [];
        vacList = [];
        rxCount = 0;
      }
      setEncounterExams(examsList);
      setEncounterVaccinations(vacList);
      setRxItemsCount(rxCount);

      if (enc.status === 'completed') {
        const vRes = await hubEncountersApi.getVersions(encounterId, clinicId);
        setVersions(vRes.versions ?? []);
      } else {
        setVersions([]);
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar atendimento');
    } finally {
      setLoading(false);
    }
  }, [clinicId, encounterId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchField = (key: string, value: unknown) => {
    setEncounter((prev) => (prev ? { ...prev, [key]: value } : prev));
    queue({ [key]: value });
  };

  const patchNested = (root: 'anamnesis' | 'physical_exam' | 'diagnosis', field: string, value: unknown) => {
    setEncounter((prev) => {
      if (!prev) return prev;
      const block = { ...(prev[root] as Record<string, unknown>), [field]: value };
      queue({ [root]: block });
      return { ...prev, [root]: block };
    });
  };

  const hasBillingIdentity =
    !!(encounter?.guardian_id && encounter?.pet_id) || !!encounter?.hub_case_id;

  const finish = async () => {
    if (!clinicId || !encounterId || !canWrite || !encounter) return;
    if (!hasBillingIdentity) {
      showError(
        'Para finalizar, associe tutor e pet ao atendimento — ou vincule um caso clínico com pet/tutor cadastrado.',
      );
      return;
    }
    setCompleting(true);
    try {
      const { encounter: enc } = await hubEncountersApi.complete(encounterId, clinicId);
      setEncounter(enc);
      showSuccess('Atendimento finalizado');
      navigate('/hub/clinica/atendimentos');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao finalizar');
    } finally {
      setCompleting(false);
    }
  };

  const handleAmend = async () => {
    if (!clinicId || !encounterId || !canWrite || !amendReason.trim()) return;
    setAmending(true);
    try {
      const { encounter: enc } = await hubEncountersApi.amend(encounterId, {
        clinic_id: clinicId,
        change_reason: amendReason.trim(),
        chief_complaint: encounter?.chief_complaint,
        summary_notes: encounter?.summary_notes,
        anamnesis: encounter?.anamnesis,
        physical_exam: encounter?.physical_exam,
        diagnosis: encounter?.diagnosis,
        hub_staff_member_id: encounter?.hub_staff_member_id,
      });
      setEncounter(enc);
      setAmendOpen(false);
      setAmendReason('');
      showSuccess('Atendimento atualizado com registro de alteração');
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar alteração');
    } finally {
      setAmending(false);
    }
  };

  const timelineEvents = useMemo(() => {
    if (!encounter) return [];
    const list = [...events];
    list.sort((a, b) => {
      const ma = a.hub_encounter_id === encounter.id ? 1 : 0;
      const mb = b.hub_encounter_id === encounter.id ? 1 : 0;
      if (ma !== mb) return mb - ma;
      return new Date(b.event_at).getTime() - new Date(a.event_at).getTime();
    });
    return list;
  }, [events, encounter]);

  const allergyQuickLabel = useMemo(() => {
    const hit = flags.find(
      (f) => /alerg|dermat|hipersens|food/i.test(f.flag_key) || /alerg/i.test(f.label),
    );
    if (hit) return hit.label;
    if (flags.length === 0) return 'Nenhuma registrada';
    return flags.map((f) => f.label).join(' · ');
  }, [flags]);

  const vaccineQuickLabel = useMemo(() => {
    const n = encounterVaccinations.length;
    if (n === 0) return 'Sem doses registradas';
    return `${n} registro${n > 1 ? 's' : ''} no prontuário`;
  }, [encounterVaccinations]);

  const lastExamQuickLabel = useMemo(() => {
    if (encounterExams.length === 0) return 'Nenhum neste atendimento';
    const sorted = [...encounterExams].sort(
      (a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime(),
    );
    const last = sorted[0];
    return `${last.exam_type} · ${formatHubClinicalExamStatus(last.status)}`;
  }, [encounterExams]);

  const stepperMeta = useMemo(() => {
    if (!encounter) {
      return { done: [false, false, false, false, false, false], current: 0 };
    }
    const pe0 = (encounter.physical_exam || {}) as Record<string, unknown>;
    const dx0 = (encounter.diagnosis || {}) as Record<string, unknown>;
    const done = [
      !!(encounter.chief_complaint?.trim() || encounter.summary_notes?.trim()),
      !!(
        pe0.weight_kg ||
        pe0.temperature_c ||
        pe0.heart_rate ||
        pe0.respiratory_rate ||
        pe0.hydration ||
        pe0.mucosa
      ),
      !!(String(dx0.suspicions ?? '').trim() || String(dx0.conclusion ?? '').trim()),
      rxItemsCount > 0,
      encounterExams.length > 0,
      encounter.status === 'completed',
    ];
    let current = 0;
    for (let i = 0; i < done.length; i += 1) {
      if (!done[i]) {
        current = i;
        break;
      }
      if (i === done.length - 1) current = i;
    }
    return { done, current };
  }, [encounter, rxItemsCount, encounterExams.length]);

  const encounterCode = useMemo(() => {
    if (!encounter) return 'AT-';
    return `AT-${encounter.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  }, [encounter]);

  const caseProgressUi = useMemo(() => {
    if (!encounter?.case) return { label: 'Sem caso vinculado', tone: 'muted' as const };
    const map: Record<string, { label: string; tone: 'amber' | 'green' | 'muted' | 'red' }> = {
      active: { label: 'Em investigação', tone: 'amber' },
      monitoring: { label: 'Em monitoramento', tone: 'amber' },
      resolved: { label: 'Resolvido', tone: 'muted' },
      cancelled: { label: 'Cancelado', tone: 'red' },
    };
    return map[encounter.case.status] ?? { label: 'Em andamento', tone: 'muted' };
  }, [encounter]);

  const examStats = useMemo(() => {
    let pendentes = 0;
    let concluidos = 0;
    for (const ex of encounterExams) {
      if (ex.status === 'completed' || ex.status === 'result_received') concluidos += 1;
      else if (ex.status !== 'cancelled') pendentes += 1;
    }
    return { total: encounterExams.length, pendentes, concluidos };
  }, [encounterExams]);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveNav(id);
    }
  }, []);

  const statusUi = useMemo(() => {
    if (!encounter) return HUB_CWS_STATUS_ENCOUNTER.waiting;
    return HUB_CWS_STATUS_ENCOUNTER[encounter.status] ?? HUB_CWS_STATUS_ENCOUNTER.waiting;
  }, [encounter]);

  if (loading || !encounter) {
    return <p style={{ padding: 24 }}>{loading ? 'Carregando atendimento…' : 'Atendimento não encontrado.'}</p>;
  }

  const pet = encounter.pet;
  const pe = (encounter.physical_exam || {}) as Record<string, unknown>;
  const an = (encounter.anamnesis || {}) as Record<string, unknown>;
  const dx = (encounter.diagnosis || {}) as Record<string, unknown>;
  const weight = pe.weight_kg != null && pe.weight_kg !== '' ? `${pe.weight_kg} kg` : '—';
  const readOnly = !canWrite || encounter.status === 'completed';
  const needsIdentificationForCheckout = !hasBillingIdentity && encounter.status !== 'completed';

  const STEPPER_STEPS = [
    { id: 'sec-resumo', label: 'Consulta' },
    { id: 'sec-exame', label: 'Exame' },
    { id: 'sec-diagnostico', label: 'Diagnóstico' },
    { id: 'sec-prescricoes', label: 'Prescrição' },
    { id: 'sec-exames', label: 'Exames' },
    { id: 'sec-footer-actions', label: 'Cobrar' },
  ] as const;

  const NAV_ITEMS = [
    { id: 'sec-resumo', label: 'Resumo', Icon: LayoutList },
    { id: 'sec-anamnese', label: 'Anamnese', Icon: ClipboardList },
    { id: 'sec-exame', label: 'Exame físico', Icon: Stethoscope },
    { id: 'sec-diagnostico', label: 'Diagnóstico', Icon: Microscope },
    { id: 'sec-evolucao', label: 'Evolução clínica', Icon: MessageSquare },
    { id: 'sec-prescricoes', label: 'Prescrições', Icon: Pill },
    { id: 'sec-vacinas', label: 'Vacinas', Icon: Syringe },
    { id: 'sec-exames', label: 'Exames solicitados', Icon: FlaskConical },
    { id: 'sec-anexos', label: 'Anexos', Icon: Paperclip },
  ] as const;

  return (
    <>
      <div className="hub-clientes hub-clinic-workspace hub-clinic-workspace--prontuario">
        <Link
          to="/hub/clinica/atendimentos"
          className="hub-clientes__btn hub-clientes__btn--ghost hub-clinic-workspace__back hub-cws-back"
        >
          <ArrowLeft size={16} /> Voltar à fila
        </Link>

        <header className="hub-cws-header">
          <div className="hub-cws-header__primary">
            <div className="hub-cws-header__pet">
              <div className="hub-cws-avatar" aria-hidden>
                {(pet?.name || 'P').slice(0, 1).toUpperCase()}
              </div>
              <div className="hub-cws-header__pet-text">
                <div className="hub-cws-header__title-row">
                  <h1 className="hub-cws-header__pet-name">{pet?.name || 'Pet'}</h1>
                  <span className={`hub-cws-status ${statusUi.className}`}>{statusUi.label}</span>
                </div>
                <FinancialAdjustmentPendingBadge
                  pending={Boolean(encounter.financial_adjustment_pending)}
                  showCaixaLink={canViewFinancial}
                />
                <p className="hub-cws-header__pet-line">
                  {[pet?.species || '—', pet?.breed || '—', `Porte ${pet?.size_tier || '—'}`, petAgeDetailedLabel(pet?.birth_date ?? null), weight !== '—' ? weight : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="hub-cws-header__tutor">
                  <Phone size={14} className="hub-cws-header__tutor-icon" aria-hidden />
                  <span>
                    Tutor: <strong>{encounter.guardian?.full_name || '—'}</strong>
                  </span>
                </p>
              </div>
            </div>
            <div className="hub-cws-header__case-block">
              <p className="hub-cws-header__case-id">
                Atendimento <strong>#{encounterCode}</strong>
              </p>
              <p className="hub-cws-header__case-meta">
                {encounter.started_at
                  ? `Aberto em ${new Date(encounter.started_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
                  : 'Horário de abertura não registrado'}
                {encounter.staff_member?.full_name
                  ? ` · ${encounter.staff_member.full_name}`
                  : ''}
              </p>
              {encounter.case ? (
                <p className="hub-cws-header__case-link">
                  Caso:{' '}
                  <Link to={`/hub/clinica/casos/${encounter.hub_case_id}`} className="hub-clientes__link">
                    {encounter.case.title}
                  </Link>
                </p>
              ) : null}
            </div>
          </div>
          {flags.length > 0 ? (
            <div className="hub-cws-header__flags">
              {flags.map((f) => (
                <span key={f.flag_key} className="hub-clinic-alert-chip">
                  {f.label}
                </span>
              ))}
            </div>
          ) : null}
          {encounter.status === 'completed' ? (
            <div className="hub-clinic-workspace__completed-banner hub-cws-completed">
              <span>
                Atendimento finalizado em{' '}
                {encounter.completed_at ? new Date(encounter.completed_at).toLocaleDateString('pt-BR') : '—'}
              </span>
              {canWrite ? (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  onClick={() => setAmendOpen(true)}
                >
                  Editar com motivo
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        <div className="hub-cws-quick">
          <div className="hub-cws-quick-card">
            <span className="hub-cws-quick-card__label">Último peso</span>
            <strong className="hub-cws-quick-card__value">{weight}</strong>
            <span className="hub-cws-quick-card__hint">No exame físico</span>
          </div>
          <div className="hub-cws-quick-card">
            <span className="hub-cws-quick-card__label">Vacinas</span>
            <strong className="hub-cws-quick-card__value hub-cws-quick-card__value--ok">{vaccineQuickLabel}</strong>
            <span className="hub-cws-quick-card__hint">Prontuário do pet</span>
          </div>
          <div className="hub-cws-quick-card">
            <span className="hub-cws-quick-card__label">Alertas / alergias</span>
            <strong className="hub-cws-quick-card__value">{allergyQuickLabel}</strong>
            <span className="hub-cws-quick-card__hint">Flags clínicas</span>
          </div>
          <div className="hub-cws-quick-card">
            <span className="hub-cws-quick-card__label">Últimos exames</span>
            <strong className="hub-cws-quick-card__value hub-cws-quick-card__value--sm">{lastExamQuickLabel}</strong>
            <span className="hub-cws-quick-card__hint">Neste atendimento</span>
          </div>
        </div>

        <nav className="hub-cws-stepper" aria-label="Etapas do atendimento">
          {STEPPER_STEPS.map((st, idx) => {
            const done = stepperMeta.done[idx];
            const current = stepperMeta.current === idx;
            const stateClass = done ? 'hub-cws-step--done' : current ? 'hub-cws-step--current' : 'hub-cws-step--todo';
            return (
              <React.Fragment key={st.id}>
                {idx > 0 ? <span className="hub-cws-stepper__rule" aria-hidden /> : null}
                <button
                  type="button"
                  className={`hub-cws-step ${stateClass}`}
                  onClick={() => scrollToSection(st.id)}
                >
                  <span className="hub-cws-step__num">{idx + 1}</span>
                  <span className="hub-cws-step__label">{st.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {needsIdentificationForCheckout ? (
          <div className="hub-clinic-banner hub-cws-banner">
            <p style={{ margin: 0 }}>
              <strong>Identificação pendente.</strong> Para <strong>finalizar</strong> ou <strong>abrir comanda/checkout</strong>,
              é necessário{' '}
              {encounter.hub_case_id
                ? 'um tutor e pet vinculados (direto no atendimento ou via caso clínico com pet cadastrado)'
                : 'associar tutor e pet a este atendimento ou vincular um caso clínico com pet/tutor cadastrado'}
              .
            </p>
            {!readOnly && clinicId && encounter.pet_id ? (
              <HubEncounterGuardianPicker encounter={encounter} clinicId={clinicId} onLinked={() => void load()} />
            ) : null}
            <p className="hub-clientes__muted" style={{ marginTop: 8, marginBottom: 0 }}>
              Cadastro de tutores: <Link to="/hub/clientes">Clientes</Link>
            </p>
          </div>
        ) : null}

        <div className="hub-cws-body-grid">
          <nav className="hub-cws-rail" aria-label="Seções do prontuário">
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={`hub-cws-rail__btn ${activeNav === id ? 'hub-cws-rail__btn--active' : ''}`}
                onClick={() => scrollToSection(id)}
              >
                <Icon size={18} className="hub-cws-rail__icon" aria-hidden />
                {label}
              </button>
            ))}
          </nav>

          <div className="hub-cws-main-col">
            <section id="sec-resumo" className="hub-cws-section hub-cws-card">
              <h2 className="hub-cws-card__title">Resumo do caso</h2>
              <div className="hub-cws-resumo-grid">
                <div>
                  <span className="hub-cws-k">Queixa principal</span>
                  <p className="hub-cws-v hub-cws-v--accent">{encounter.chief_complaint?.trim() || '—'}</p>
                </div>
                <div>
                  <span className="hub-cws-k">Histórico resumido</span>
                  <p className="hub-cws-v">{String(an.history ?? '').trim() || encounter.summary_notes?.trim() || '—'}</p>
                </div>
                <div>
                  <span className="hub-cws-k">Hipóteses</span>
                  <p className="hub-cws-v">{String(dx.suspicions ?? '').trim() || '—'}</p>
                </div>
                <div>
                  <span className="hub-cws-k">Status clínico</span>
                  <span className={`hub-cws-pill hub-cws-pill--${caseProgressUi.tone}`}>{caseProgressUi.label}</span>
                </div>
              </div>
              <div className="hub-cws-field-grid hub-cws-field-grid--2">
                <div className="hub-clinic-field hub-cws-field-tight">
                  <label htmlFor="chief_complaint">Queixa principal</label>
                  <textarea
                    id="chief_complaint"
                    className="hub-cws-textarea"
                    value={encounter.chief_complaint || ''}
                    disabled={readOnly}
                    onChange={(e) => patchField('chief_complaint', e.target.value || null)}
                    rows={2}
                  />
                </div>
                <div className="hub-clinic-field hub-cws-field-tight">
                  <label htmlFor="summary_notes">Resumo / notas do caso</label>
                  <textarea
                    id="summary_notes"
                    className="hub-cws-textarea"
                    value={encounter.summary_notes || ''}
                    disabled={readOnly}
                    onChange={(e) => patchField('summary_notes', e.target.value || null)}
                    rows={2}
                  />
                </div>
              </div>
            </section>

            <section id="sec-anamnese" className="hub-cws-section hub-cws-card">
              <h2 className="hub-cws-card__title">Anamnese</h2>
              <div className="hub-cws-field-grid hub-cws-field-grid--2">
                {(
                  [
                    ['history', 'Histórico'],
                    ['diet', 'Alimentação'],
                    ['behavior', 'Comportamento'],
                    ['medications', 'Medicamentos em uso'],
                    ['environment', 'Ambiente'],
                    ['chief_complaint_detail', 'Detalhamento da queixa'],
                  ] as const
                ).map(([field, lbl]) => (
                  <div key={field} className="hub-clinic-field hub-cws-field-tight">
                    <label htmlFor={`an_${field}`}>{lbl}</label>
                    <textarea
                      id={`an_${field}`}
                      className="hub-cws-textarea"
                      value={String(an[field] ?? '')}
                      disabled={readOnly}
                      onChange={(e) => patchNested('anamnesis', field, e.target.value)}
                      rows={3}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section id="sec-exame" className="hub-cws-section hub-cws-card">
              <h2 className="hub-cws-card__title">Exame físico</h2>
              <div className="hub-cws-subtitle">Sinais vitais</div>
              <div className="hub-cws-vitals">
                {(
                  [
                    ['temperature_c', 'Temperatura (°C)'],
                    ['heart_rate', 'FC (bpm)'],
                    ['respiratory_rate', 'FR (rpm)'],
                    ['crt', 'TPC'],
                    ['weight_kg', 'Peso (kg)'],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className="hub-cws-vital-cell">
                    <label htmlFor={`pe_${field}`}>{label}</label>
                    <input
                      id={`pe_${field}`}
                      type="text"
                      value={String(pe[field] ?? '')}
                      disabled={readOnly}
                      onChange={(e) => patchNested('physical_exam', field, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="hub-cws-subtitle">Avaliação</div>
              <div className="hub-cws-vitals">
                {(
                  [
                    ['hydration', 'Hidratação'],
                    ['mucosa', 'Mucosas'],
                    ['pain', 'Dor'],
                    ['lymph_nodes', 'Linfonodos'],
                    ['general_state', 'Estado geral'],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className="hub-cws-vital-cell">
                    <label htmlFor={`pe_${field}`}>{label}</label>
                    <input
                      id={`pe_${field}`}
                      type="text"
                      value={String(pe[field] ?? '')}
                      disabled={readOnly}
                      onChange={(e) => patchNested('physical_exam', field, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="hub-clinic-field hub-cws-field-tight">
                <label htmlFor="pe_notes">Observações do exame</label>
                <textarea
                  id="pe_notes"
                  className="hub-cws-textarea"
                  value={String(pe.notes ?? '')}
                  disabled={readOnly}
                  onChange={(e) => patchNested('physical_exam', 'notes', e.target.value)}
                  rows={2}
                />
              </div>
            </section>

            <section id="sec-diagnostico" className="hub-cws-section hub-cws-card">
              <h2 className="hub-cws-card__title">Diagnóstico</h2>
              <div className="hub-clinic-field hub-cws-field-tight">
                <label htmlFor="dx_suspicions">Hipóteses</label>
                <textarea
                  id="dx_suspicions"
                  className="hub-cws-textarea"
                  value={String(dx.suspicions ?? '')}
                  disabled={readOnly}
                  onChange={(e) => patchNested('diagnosis', 'suspicions', e.target.value)}
                  rows={3}
                />
              </div>
              <div className="hub-clinic-field hub-cws-field-tight">
                <label htmlFor="dx_conclusion">Diagnóstico final / conclusão</label>
                <textarea
                  id="dx_conclusion"
                  className="hub-cws-textarea"
                  value={String(dx.conclusion ?? '')}
                  disabled={readOnly}
                  onChange={(e) => patchNested('diagnosis', 'conclusion', e.target.value)}
                  rows={3}
                />
              </div>
              <div className="hub-cws-cid-placeholder">
                <span className="hub-cws-k">CID veterinário</span>
                <p className="hub-clientes__muted" style={{ margin: '4px 0 0' }}>
                  Campo reservado para classificação futura.
                </p>
              </div>
            </section>

            <section id="sec-evolucao" className="hub-cws-section hub-cws-card hub-cws-card--muted">
              <h2 className="hub-cws-card__title">Evolução clínica</h2>
              <p className="hub-clientes__muted" style={{ marginTop: 0 }}>
                A linha do tempo deste caso fica no painel à direita. Use <strong>+ Registrar evolução</strong> para
                abrir o formulário.
              </p>
              <button type="button" className="hub-cws-btn-primary-outline" onClick={() => setEvolutionDrawerOpen(true)}>
                <Plus size={16} /> Registrar evolução
              </button>
            </section>

            <section id="sec-prescricoes" className="hub-cws-section hub-cws-card">
              <h2 className="hub-cws-card__title">Prescrições</h2>
              <HubWorkspacePrescriptions
                encounter={encounter}
                clinicId={clinicId!}
                readOnly={readOnly}
                onClinicalRefresh={() => void load()}
              />
            </section>

            <section id="sec-vacinas" className="hub-cws-section hub-cws-card">
              <h2 className="hub-cws-card__title">Vacinas</h2>
              <HubWorkspaceVaccinations
                encounter={encounter}
                clinicId={clinicId!}
                readOnly={readOnly}
                onClinicalRefresh={() => void load()}
              />
            </section>

            <section id="sec-exames" className="hub-cws-section hub-cws-card">
              <h2 className="hub-cws-card__title">Exames solicitados</h2>
              <div className="hub-cws-exam-summary">
                <div className="hub-cws-exam-pill">
                  <span>Total</span>
                  <strong>{examStats.total}</strong>
                </div>
                <div className="hub-cws-exam-pill hub-cws-exam-pill--amber">
                  <span>Pendentes</span>
                  <strong>{examStats.pendentes}</strong>
                </div>
                <div className="hub-cws-exam-pill hub-cws-exam-pill--green">
                  <span>Concluídos</span>
                  <strong>{examStats.concluidos}</strong>
                </div>
              </div>
              <HubWorkspaceClinicalExams
                encounter={encounter}
                clinicId={clinicId!}
                readOnly={readOnly}
                onClinicalRefresh={() => void load()}
              />
            </section>

            <section id="sec-anexos" className="hub-cws-section hub-cws-card">
              <h2 className="hub-cws-card__title">Anexos</h2>
              <HubWorkspaceAttachments encounter={encounter} clinicId={clinicId!} readOnly={readOnly} />
            </section>

            {versions.length > 0 ? (
              <section className="hub-cws-section hub-cws-card">
                <h2 className="hub-cws-card__title">Histórico de alterações ({versions.length})</h2>
                <ul className="hub-clinic-records__list">
                  {versions.map((v) => (
                    <li key={v.id}>
                      <strong>v{v.version_no}</strong>
                      {' — '}
                      {v.change_reason || '(sem motivo informado)'}
                      {v.changed_by_member ? ` · ${v.changed_by_member.full_name}` : ''}
                      <small className="hub-clientes__muted" style={{ marginLeft: 8 }}>
                        {new Date(v.created_at).toLocaleString('pt-BR')}
                      </small>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div id="sec-footer-actions" className="hub-cws-footer-anchor" aria-hidden />
          </div>

          <aside className="hub-cws-timeline-col" aria-label="Evolução clínica">
            <div className="hub-cws-timeline-head">
              <h2 className="hub-cws-timeline-title">Evolução clínica</h2>
              {!readOnly ? (
                <button
                  type="button"
                  className="hub-cws-timeline-add"
                  onClick={() => setEvolutionDrawerOpen(true)}
                >
                  <Plus size={16} /> Registrar
                </button>
              ) : null}
            </div>
            <div className="hub-cws-timeline-scroll">
              {timelineEvents.length === 0 ? (
                <p className="hub-clientes__muted">Sem eventos registrados ainda.</p>
              ) : (
                timelineEvents.map((ev) => (
                  <article key={ev.id} className="hub-cws-tl-card">
                    <div className="hub-cws-tl-card__dot" aria-hidden />
                    <div className="hub-cws-tl-card__body">
                      <div className="hub-cws-tl-card__meta">
                        <span className="hub-cws-tl-card__time">{formatEventAt(ev)}</span>
                      </div>
                      <h3 className="hub-cws-tl-card__title">{formatEventTitle(ev)}</h3>
                      {formatEventBody(ev) ? (
                        <p className="hub-cws-tl-card__text">{formatEventBody(ev)}</p>
                      ) : null}
                      <span className={`hub-cws-pill hub-cws-pill--muted`}>
                        {ev.hub_encounter_id === encounter.id ? 'Este atendimento' : 'Prontuário'}
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
            <button type="button" className="hub-cws-timeline-more" onClick={() => scrollToSection('sec-evolucao')}>
              Ir para seção evolução
            </button>
          </aside>
        </div>

        <footer className="hub-cws-footer">
          <div className="hub-cws-footer__left">
            <span className="hub-cws-footer__hint">{saveHint}</span>
            <span className="hub-clientes__muted hub-cws-footer__started">
              {encounter.started_at
                ? `Atendimento iniciado em ${new Date(encounter.started_at).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}`
                : null}
            </span>
          </div>
          <div className="hub-cws-footer__actions">
            {canWrite && encounter.status !== 'completed' ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost hub-cws-footer__btn"
                onClick={() => {
                void flush().then((r) => {
                  if (r === 'saved') showSuccess('Rascunho salvo');
                });
                }}
              >
                <Save size={16} /> Salvar rascunho
              </button>
            ) : null}
            {/* Checkout de fim de atendimento removido — use o Caixa (Atendimentos do dia). */}
            {canWrite && encounter.status !== 'completed' ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-cws-footer__btn hub-cws-footer__btn--primary"
                disabled={completing || needsIdentificationForCheckout}
                title={
                  needsIdentificationForCheckout
                    ? 'Associe um tutor ao atendimento antes de finalizar.'
                    : undefined
                }
                onClick={() => void finish()}
              >
                <Check size={16} /> {completing ? 'Finalizando…' : 'Finalizar atendimento'}
              </button>
            ) : null}
          </div>
        </footer>

        {evolutionDrawerOpen ? (
          <div
            className="hub-cws-drawer-overlay"
            role="presentation"
            onClick={() => setEvolutionDrawerOpen(false)}
          />
        ) : null}
        {evolutionDrawerOpen ? (
          <div className="hub-cws-drawer" role="dialog" aria-modal="true" aria-labelledby="hub-cws-drawer-title">
            <div className="hub-cws-drawer__head">
              <h2 id="hub-cws-drawer-title">Nova evolução</h2>
              <button type="button" className="hub-cws-drawer__close" onClick={() => setEvolutionDrawerOpen(false)}>
                Fechar
              </button>
            </div>
            <div className="hub-cws-drawer__body">
              <label className="hub-clientes__label" htmlFor="ev_title_drawer">
                Título
              </label>
              <input
                id="ev_title_drawer"
                className="hub-clientes__input"
                value={evTitle}
                onChange={(e) => setEvTitle(e.target.value)}
              />
              <label className="hub-clientes__label" htmlFor="ev_body_drawer">
                Texto
              </label>
              <textarea
                id="ev_body_drawer"
                className="hub-clientes__textarea"
                rows={5}
                value={evBody}
                onChange={(e) => setEvBody(e.target.value)}
              />
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={!evTitle.trim() || readOnly}
                onClick={() => {
                  if (!clinicId || !encounter) return;
                  void hubClinicalApi
                    .createEvent({
                      clinic_id: clinicId,
                      pet_id: encounter.pet_id ?? '',
                      hub_encounter_id: encounter.id,
                      event_type: 'note',
                      title: evTitle.trim(),
                      body: evBody.trim() || null,
                    })
                    .then((r) => {
                      setEvents((prev) => [r.event, ...prev]);
                      setEvTitle('');
                      setEvBody('');
                      setEvolutionDrawerOpen(false);
                      showSuccess('Evolução registrada');
                    })
                    .catch((e: unknown) => showError((e as Error)?.message || 'Erro ao salvar evolução'));
                }}
              >
                Salvar evolução
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Modal de emenda (edição pós-finalização) */}
      {amendOpen && (
        <div className="hub-clinic-amend-overlay">
          <div className="hub-clinic-amend-modal">
            <h3>Editar atendimento finalizado</h3>
            <p className="hub-clientes__muted">
              Este atendimento foi finalizado. Informe o motivo da alteração para continuar.
            </p>
            <label className="hub-clientes__label" htmlFor="amend_reason">
              Motivo da alteração <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <textarea
              id="amend_reason"
              className="hub-clientes__textarea"
              rows={3}
              value={amendReason}
              onChange={(e) => setAmendReason(e.target.value)}
              placeholder="Ex.: Correção de diagnóstico após resultado de exame"
            />
            <div className="hub-clinic-amend-modal__footer">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                onClick={() => { setAmendOpen(false); setAmendReason(''); }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={amending || !amendReason.trim()}
                onClick={() => void handleAmend()}
              >
                {amending ? 'Salvando…' : 'Salvar com motivo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout centralizado no Caixa — removido daqui */}
    </>
  );
};

// ── Sub-componentes ───────────────────────────────────────────────────────────

function HubEncounterGuardianPicker({
  encounter,
  clinicId,
  onLinked,
}: {
  encounter: HubEncounter;
  clinicId: string;
  onLinked: () => void;
}) {
  const { showError, showSuccess } = useAlert();
  const [guardianId, setGuardianId] = useState('');
  const [options, setOptions] = useState<HubComboboxOption[]>([]);

  useEffect(() => {
    void hubGuardiansApi.list(clinicId, false, { status: 'active' }).then((r) => {
      const petId = encounter.pet_id;
      const rows = (r.guardians ?? []).filter((g) => (g.pets ?? []).some((p) => p.id === petId));
      setOptions(rows.map((x) => ({ value: x.id, label: x.full_name })));
    });
  }, [clinicId, encounter.pet_id]);

  const assign = async () => {
    if (!guardianId) return;
    try {
      await hubEncountersApi.patch(encounter.id, { clinic_id: clinicId, guardian_id: guardianId });
      showSuccess('Tutor associado ao atendimento');
      setGuardianId('');
      onLinked();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao associar tutor');
    }
  };

  return (
    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', maxWidth: 560 }}>
      <div style={{ flex: '1 1 220px' }}>
        <span className="hub-clientes__label">Tutor vinculado ao pet</span>
        <HubSearchableCombobox
          id="encounter-guardian-picker"
          className="hub-combobox--clientes"
          options={options}
          value={guardianId}
          onChange={setGuardianId}
          placeholder="Buscar tutor…"
          allowCreate={false}
        />
      </div>
      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
        disabled={!guardianId}
        onClick={() => void assign()}
      >
        Associar ao atendimento
      </button>
      {options.length === 0 ? (
        <p className="hub-clientes__muted" style={{ width: '100%', marginBottom: 0 }}>
          Nenhum tutor desta clínica está vinculado a este pet. Vincule na ficha do cliente ou do animal.
        </p>
      ) : null}
    </div>
  );
}

function prescriptionItemToPayload(it: HubPrescriptionItem): {
  medication_name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  hub_inventory_item_id: string | null;
  administration: HubPrescriptionAdministration;
} {
  const administration: HubPrescriptionAdministration =
    it.administration === 'administered_in_clinic' ? 'administered_in_clinic' : 'home_use';
  return {
    medication_name: it.medication_name,
    dosage: it.dosage ?? null,
    frequency: it.frequency ?? null,
    duration: it.duration ?? null,
    instructions: it.instructions ?? null,
    hub_inventory_item_id: it.hub_inventory_item_id ?? null,
    administration,
  };
}

function HubWorkspacePrescriptions({
  encounter,
  clinicId,
  readOnly,
  onClinicalRefresh,
}: {
  encounter: HubEncounter;
  clinicId: string;
  readOnly: boolean;
  onClinicalRefresh?: () => void;
}) {
  const { showError, showSuccess } = useAlert();
  const [items, setItems] = useState<HubPrescription[]>([]);
  const [documents, setDocuments] = useState<HubPrescriptionDocumentRow[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [med, setMed] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [duration, setDuration] = useState('');
  const [inventoryId, setInventoryId] = useState('');
  const [administration, setAdministration] = useState<HubPrescriptionAdministration>('home_use');
  const [medicationItems, setMedicationItems] = useState<HubInventoryItem[]>([]);
  const [notesDraft, setNotesDraft] = useState('');

  const reloadList = useCallback(async () => {
    const r = await hubClinicalApi.listPrescriptions(clinicId, encounter.pet_id ?? undefined);
    setItems(r.prescriptions ?? []);
  }, [clinicId, encounter.pet_id]);

  const canonicalRx = useMemo(() => {
    const sameEncounter = items.filter(
      (p) => p.hub_encounter_id === encounter.id && (p.status === undefined || p.status === 'active' || p.status === 'draft'),
    );
    sameEncounter.sort((a, b) => {
      const ta = new Date(a.prescribed_at || 0).getTime();
      const tb = new Date(b.prescribed_at || 0).getTime();
      return tb - ta;
    });
    return sameEncounter[0] ?? null;
  }, [items, encounter.id]);

  const caseLinkedOthers = useMemo(() => {
    if (!encounter.hub_case_id) return [];
    return items.filter(
      (p) =>
        p.hub_case_id === encounter.hub_case_id &&
        p.hub_encounter_id !== encounter.id &&
        p.id !== canonicalRx?.id &&
        (p.status === undefined || p.status === 'active' || p.status === 'draft'),
    );
  }, [items, encounter.hub_case_id, encounter.id, canonicalRx?.id]);

  useEffect(() => {
    void reloadList();
    void hubInventoryApi.items
      .list(clinicId, false, 'medication')
      .then((r) => setMedicationItems(r.items ?? []))
      .catch(() => setMedicationItems([]));
  }, [clinicId, encounter.pet_id, reloadList]);

  useEffect(() => {
    setNotesDraft(canonicalRx?.notes?.trim() ? String(canonicalRx.notes) : '');
  }, [canonicalRx?.id, canonicalRx?.notes]);

  useEffect(() => {
    if (!canonicalRx?.id) {
      setDocuments([]);
      return;
    }
    void hubClinicalApi
      .listPrescriptionDocuments(canonicalRx.id, clinicId)
      .then((r) => setDocuments(r.documents ?? []))
      .catch(() => setDocuments([]));
  }, [canonicalRx?.id, clinicId]);

  const add = async () => {
    if (!med.trim()) return;
    try {
      await hubClinicalApi.createPrescription({
        clinic_id: clinicId,
        hub_encounter_id: encounter.id,
        hub_case_id: encounter.hub_case_id ?? undefined,
        pet_id: encounter.pet_id ?? '',
        hub_staff_member_id: encounter.hub_staff_member_id,
        items: [
          {
            medication_name: med.trim(),
            dosage: dosage.trim() || null,
            frequency: frequency.trim() || null,
            duration: duration.trim() || null,
            instructions: null,
            hub_inventory_item_id: inventoryId || null,
            administration,
          },
        ],
      });
      setMed('');
      setDosage('');
      setFrequency('');
      setDuration('');
      setInventoryId('');
      setAdministration('home_use');
      await reloadList();
      showSuccess('Medicamento incluído na prescrição do atendimento');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar prescrição');
    }
  };

  const saveNotes = async () => {
    if (!canonicalRx) return;
    try {
      await hubClinicalApi.patchPrescription(canonicalRx.id, {
        clinic_id: clinicId,
        notes: notesDraft.trim() ? notesDraft.trim() : null,
      });
      await reloadList();
      showSuccess('Observações da prescrição salvas');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar observações');
    }
  };

  const removeItemAt = async (index: number) => {
    if (!canonicalRx || readOnly) return;
    const list = [...(canonicalRx.items ?? [])];
    if (index < 0 || index >= list.length) return;
    if (list.length <= 1) {
      showError('A prescrição precisa ter pelo menos um medicamento. Remova itens só quando houver mais de um.');
      return;
    }
    list.splice(index, 1);
    try {
      await hubClinicalApi.patchPrescription(canonicalRx.id, {
        clinic_id: clinicId,
        items: list.map(prescriptionItemToPayload),
      });
      await reloadList();
      showSuccess('Item removido');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao remover item');
    }
  };

  const issueDoc = async () => {
    if (!canonicalRx || readOnly) return;
    setIssuing(true);
    try {
      await hubClinicalApi.issuePrescriptionDocument(canonicalRx.id, {
        clinic_id: clinicId,
        issued_by: encounter.hub_staff_member_id,
      });
      hubClinicalApi.openPrescriptionPdf(canonicalRx.id, clinicId);
      const r = await hubClinicalApi.listPrescriptionDocuments(canonicalRx.id, clinicId);
      setDocuments(r.documents ?? []);
      showSuccess('Receita emitida (nova versão no histórico)');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao emitir receita');
    } finally {
      setIssuing(false);
    }
  };

  return (
    <>
      <p className="hub-clientes__muted" style={{ marginTop: 0, marginBottom: 12 }}>
        Uma prescrição por atendimento: os medicamentos adicionados entram na mesma receita até você emitir ou alterar os itens.
      </p>
      {!readOnly && (
        <div className="hub-cws-rx-form">
          <input className="hub-clientes__input" placeholder="Medicamento" value={med} onChange={(e) => setMed(e.target.value)} />
          <input className="hub-clientes__input" placeholder="Dosagem" value={dosage} onChange={(e) => setDosage(e.target.value)} />
          <input className="hub-clientes__input" placeholder="Frequência" value={frequency} onChange={(e) => setFrequency(e.target.value)} />
          <input className="hub-clientes__input" placeholder="Duração" value={duration} onChange={(e) => setDuration(e.target.value)} />
          <select
            className="hub-clientes__input"
            value={administration}
            onChange={(e) => setAdministration(e.target.value as HubPrescriptionAdministration)}
          >
            <option value="home_use">Uso em casa (retirada / posologia domiciliar)</option>
            <option value="administered_in_clinic">Administrado na clínica</option>
          </select>
          {medicationItems.length > 0 ? (
            <select className="hub-clientes__input" value={inventoryId} onChange={(e) => setInventoryId(e.target.value)}>
              <option value="">Item de estoque (opcional)</option>
              {medicationItems.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm" onClick={() => void add()}>
            Adicionar à prescrição
          </button>
        </div>
      )}

      {canonicalRx ? (
        <div className="hub-clinic-records__panel" style={{ marginBottom: 16, padding: 12, border: '1px solid var(--hub-border, #e5dcd6)', borderRadius: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <strong>Prescrição deste atendimento</strong>
            {!readOnly ? (
              <>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                  disabled={issuing || !(canonicalRx.items?.length)}
                  onClick={() => void issueDoc()}
                >
                  {issuing ? 'Emitindo…' : documents.length ? 'Reemitir receita (nova versão)' : 'Emitir receita'}
                </button>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--sm"
                  disabled={issuing}
                  onClick={() => hubClinicalApi.openPrescriptionPdf(canonicalRx.id, clinicId)}
                >
                  Abrir PDF
                </button>
              </>
            ) : (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--sm"
                onClick={() => hubClinicalApi.openPrescriptionPdf(canonicalRx.id, clinicId)}
              >
                Abrir PDF
              </button>
            )}
          </div>
          <ul className="hub-cws-rx-list">
            {(canonicalRx.items ?? []).map((it, idx) => (
              <li key={it.id ?? `${canonicalRx.id}-${idx}`} className="hub-cws-rx-item">
                <div className="hub-cws-rx-item__name">{it.medication_name}</div>
                <div className="hub-cws-rx-item__meta">
                  {[it.dosage, it.frequency, it.duration].filter(Boolean).join(' · ') || '—'}
                  {it.administration === 'administered_in_clinic' ? ' · Clínica' : ''}
                </div>
                {!readOnly ? (
                  <button type="button" className="hub-clientes__btn hub-clientes__btn--sm" onClick={() => void removeItemAt(idx)}>
                    Remover
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {!readOnly ? (
            <div className="hub-clientes__form-stack" style={{ marginBottom: 0 }}>
              <label className="hub-clientes__muted" style={{ fontSize: 12 }}>
                Observações da prescrição
                <textarea
                  className="hub-clientes__input"
                  rows={2}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Orientações gerais, alertas de administração…"
                />
              </label>
              <button type="button" className="hub-clientes__btn hub-clientes__btn--sm" onClick={() => void saveNotes()}>
                Salvar observações
              </button>
            </div>
          ) : canonicalRx.notes ? (
            <p className="hub-clientes__muted" style={{ marginBottom: 0 }}>
              {String(canonicalRx.notes)}
            </p>
          ) : null}

          {documents.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <span className="hub-clientes__muted" style={{ fontSize: 12 }}>
                Histórico de emissões (versões)
              </span>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                {documents.map((d) => (
                  <li key={d.id}>
                    Versão {d.version_no}
                    {d.issued_at ? ` — ${new Date(d.issued_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                    {d.issued_by_member?.full_name ? ` — ${d.issued_by_member.full_name}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="hub-clientes__muted" style={{ marginBottom: 12 }}>
          Nenhuma prescrição neste atendimento ainda. Use o formulário acima para adicionar o primeiro medicamento.
        </p>
      )}

      {caseLinkedOthers.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <span className="hub-clientes__muted" style={{ fontSize: 12 }}>
            Outras prescrições do mesmo caso (outros atendimentos)
          </span>
          <ul className="hub-clinic-records__list">
            {caseLinkedOthers.map((p) => (
              <li key={p.id}>
                {formatPrescriptionLine(p)}
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--sm"
                  style={{ marginLeft: 8 }}
                  onClick={() => hubClinicalApi.openPrescriptionPdf(p.id, clinicId)}
                >
                  PDF
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function HubWorkspaceVaccinations({
  encounter,
  clinicId,
  readOnly,
  onClinicalRefresh,
}: {
  encounter: HubEncounter;
  clinicId: string;
  readOnly: boolean;
  onClinicalRefresh?: () => void;
}) {
  const { showError } = useAlert();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [vaccine, setVaccine] = useState('');
  const [batch, setBatch] = useState('');

  useEffect(() => {
    void hubClinicalApi.listVaccinations(clinicId, encounter.pet_id ?? undefined).then((r) => setItems(r.vaccinations ?? []));
  }, [clinicId, encounter.pet_id]);

  const add = async () => {
    if (!vaccine.trim()) return;
    try {
      await hubClinicalApi.createVaccination({
        clinic_id: clinicId,
        pet_id: encounter.pet_id ?? '',
        hub_encounter_id: encounter.id,
        hub_case_id: encounter.hub_case_id ?? undefined,
        vaccine_name: vaccine,
        batch_number: batch || undefined,
        administered_at: todayYmd(),
      });
      setVaccine('');
      setBatch('');
      const r = await hubClinicalApi.listVaccinations(clinicId, encounter.pet_id ?? undefined);
      setItems(r.vaccinations ?? []);
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registar vacina');
    }
  };

  const vacRows = items.filter(
    (v) =>
      v.hub_encounter_id === encounter.id || (!!encounter.hub_case_id && v.hub_case_id === encounter.hub_case_id),
  );

  return (
    <>
      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <input placeholder="Vacina" value={vaccine} onChange={(e) => setVaccine(e.target.value)} />
          <input placeholder="Lote" value={batch} onChange={(e) => setBatch(e.target.value)} />
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm" onClick={() => void add()}>
            Registrar
          </button>
        </div>
      )}
      {vacRows.length === 0 ? (
        <p className="hub-clientes__muted" style={{ marginBottom: 0 }}>
          Nenhuma vacina registrada neste atendimento ou caso.
        </p>
      ) : (
        <div className="hub-cws-vaccine-table-wrap">
          <table className="hub-cws-vaccine-table">
            <thead>
              <tr>
                <th>Vacina</th>
                <th>Lote</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {vacRows.map((v) => (
                <tr key={String(v.id)}>
                  <td>{String(v.vaccine_name)}</td>
                  <td>{String(v.batch_number ?? '—')}</td>
                  <td>{String(v.administered_at || '').slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function HubWorkspaceClinicalExams({
  encounter,
  clinicId,
  readOnly,
  onClinicalRefresh,
}: {
  encounter: HubEncounter;
  clinicId: string;
  readOnly: boolean;
  onClinicalRefresh?: () => void;
}) {
  const { showError, showSuccess } = useAlert();
  const [exams, setExams] = useState<HubClinicalExam[]>([]);
  const [examType, setExamType] = useState('');
  const [labKind, setLabKind] = useState<HubClinicalExamLabKind>('internal');
  const [labName, setLabName] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const reload = useCallback(() => {
    return hubClinicalExamsApi.list(clinicId, { encounterId: encounter.id }).then((r) => {
      setExams(r.exams ?? []);
    });
  }, [clinicId, encounter.id]);

  useEffect(() => {
    void reload().catch(() => setExams([]));
  }, [reload]);

  const requestExam = async () => {
    if (!examType.trim()) return;
    try {
      await hubClinicalExamsApi.create({
        clinic_id: clinicId,
        pet_id: encounter.pet_id ?? '',
        hub_encounter_id: encounter.id,
        hub_case_id: encounter.hub_case_id ?? null,
        exam_type: examType.trim(),
        lab_kind: labKind,
        lab_name: labKind === 'internal' ? (labName.trim() || null) : null,
        external_lab_name: labKind === 'external' ? (labName.trim() || null) : null,
        requested_by: encounter.hub_staff_member_id ?? null,
      });
      setExamType('');
      setLabName('');
      await reload();
      showSuccess('Exame solicitado');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao solicitar exame');
    }
  };

  const attachResultFile = async (exam: HubClinicalExam, file: File | null) => {
    if (!file || readOnly) return;
    setUploadingId(exam.id);
    try {
      const { attachment } = await hubClinicalApi.uploadAttachmentFile({
        clinicId,
        petId: encounter.pet_id ?? '',
        encounterId: encounter.id,
        examId: exam.id,
        file,
        title: `Resultado: ${exam.exam_type}`,
      });
      const url = attachment.storage_path;
      const isHttp = /^https?:\/\//i.test(url);
      const prevMeta = (exam.metadata && typeof exam.metadata === 'object' ? exam.metadata : {}) as Record<
        string,
        unknown
      >;
      await hubClinicalExamsApi.patch(exam.id, {
        clinic_id: clinicId,
        status: 'result_received',
        result_at: new Date().toISOString(),
        result_text: exam.result_text ?? 'Resultado anexado.',
        ...(isHttp ? { external_result_url: url } : {}),
        metadata: {
          ...prevMeta,
          result_attachment_id: attachment.id,
          result_storage_path: url,
        },
      });
      await reload();
      showSuccess('Resultado anexado ao exame');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao anexar resultado');
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <>
      {!readOnly && (
        <div className="hub-clientes__form-stack" style={{ marginBottom: 16, maxWidth: 520 }}>
          <input
            className="hub-clientes__input"
            placeholder="Tipo de exame (ex.: hemograma, bioquímica)"
            value={examType}
            onChange={(e) => setExamType(e.target.value)}
          />
          <select className="hub-clientes__input" value={labKind} onChange={(e) => setLabKind(e.target.value as HubClinicalExamLabKind)}>
            <option value="internal">Laboratório interno</option>
            <option value="external">Laboratório externo</option>
          </select>
          <input
            className="hub-clientes__input"
            placeholder={labKind === 'internal' ? 'Nome do lab interno (opcional)' : 'Nome do laboratório externo'}
            value={labName}
            onChange={(e) => setLabName(e.target.value)}
          />
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            disabled={!examType.trim()}
            onClick={() => void requestExam()}
          >
            Solicitar exame
          </button>
        </div>
      )}
      {exams.length === 0 ? (
        <p className="hub-clientes__muted">Nenhum exame estruturado neste atendimento.</p>
      ) : (
        <div className="hub-cws-exam-table-wrap">
          <table className="hub-cws-exam-table">
            <thead>
              <tr>
                <th>Exame</th>
                <th>Status</th>
                <th>Solicitado em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {exams.map((ex) => (
                <tr key={ex.id}>
                  <td>
                    <strong>{ex.exam_type}</strong>
                  </td>
                  <td>{formatHubClinicalExamStatus(ex.status)}</td>
                  <td className="hub-clientes__muted">{new Date(ex.requested_at).toLocaleString('pt-BR')}</td>
                  <td>
                    {ex.external_result_url ? (
                      <a href={ex.external_result_url} target="_blank" rel="noreferrer" className="hub-clientes__link">
                        Resultado
                      </a>
                    ) : null}
                    {!readOnly &&
                    (ex.status === 'requested' ||
                      ex.status === 'collected' ||
                      ex.status === 'sent' ||
                      ex.status === 'result_received') ? (
                      <label className="hub-cws-exam-file">
                        <span className="hub-clientes__link" style={{ cursor: 'pointer' }}>
                          Anexar
                        </span>
                        <input
                          id={`exam-file-${ex.id}`}
                          type="file"
                          accept="image/*,application/pdf"
                          className="hub-cws-exam-file__input"
                          disabled={uploadingId === ex.id}
                          onChange={(e) => void attachResultFile(ex, e.target.files?.[0] ?? null)}
                        />
                        {uploadingId === ex.id ? <span className="hub-clientes__muted"> …</span> : null}
                      </label>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function HubWorkspaceAttachments({
  encounter,
  clinicId,
  readOnly,
}: {
  encounter: HubEncounter;
  clinicId: string;
  readOnly: boolean;
}) {
  const { showError } = useAlert();
  const [items, setItems] = useState<HubClinicalAttachment[]>([]);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);

  const reload = () =>
    hubClinicalApi.listAttachments(clinicId, { encounterId: encounter.id }).then((r) => setItems(r.attachments ?? []));

  useEffect(() => {
    void reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, encounter.id]);

  const onFile = async (file: File | null) => {
    if (!file || readOnly) return;
    setUploading(true);
    try {
      await hubClinicalApi.uploadAttachmentFile({
        clinicId,
        petId: encounter.pet_id ?? '',
        encounterId: encounter.id,
        file,
        title: title.trim() || file.name,
      });
      setTitle('');
      await reload();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao enviar exame');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {!readOnly && (
        <div className="hub-clientes__form-stack" style={{ marginBottom: 16, maxWidth: 480 }}>
          <input
            className="hub-clientes__input"
            placeholder="Título do exame"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            disabled={uploading}
          />
          {uploading ? <p className="hub-clientes__muted">Enviando arquivo…</p> : null}
        </div>
      )}
      <div className="hub-cws-attach-grid">
        {items.map((a) => (
          <a
            key={a.id}
            href={attachmentPublicUrl(a.storage_path)}
            target="_blank"
            rel="noreferrer"
            className="hub-cws-attach-card"
          >
            <span className="hub-cws-attach-card__name">{a.title || a.file_name}</span>
            <span className="hub-cws-attach-card__meta">{a.mime_type || 'Arquivo'}</span>
          </a>
        ))}
      </div>
    </>
  );
}

export default HubClinicalWorkspacePage;
