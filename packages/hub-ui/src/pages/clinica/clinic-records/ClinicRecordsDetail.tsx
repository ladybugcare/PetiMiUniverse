import React from 'react';
import { Link } from 'react-router-dom';
import {
  BedDouble,
  ChevronRight,
  FileSearch,
  FileText,
  FlaskConical,
  FolderOpen,
  Home,
  Paperclip,
  Scissors,
  Share2,
  Stethoscope,
  Syringe,
} from 'lucide-react';
import { HubLoading } from '../../../components/HubLoading';
import { HubTabs } from '../../../components/HubTabs';
import { HubPrescriptionHistoryList } from '../../../components/clinical/HubPrescriptionHistoryList';
import type {
  HubClinicalAttachment,
  HubClinicalCase,
  HubClinicalExam,
  HubClinicalTimelineEvent,
  HubEncounter,
  HubPetClinicalFlag,
  HubPrescription,
  HubSpecialistReferral,
  HubVaccination,
} from '../../../api/hubClinicalApi';
import type { HubPet, HubPetProfileChange } from '../../../api/hubPetsApi';
import { attachmentPublicUrl, formatHubClinicalExamStatus, formatPrescriptionLine } from '../clinicalDisplay';
import { clinicalCaseDisplayTitle, clinicalCaseTitleFallbacks } from '../clinicalCaseTitle';
import { petAgeDetailedLabel } from '../../pets/petAge';
import { PetBehaviorTagsPicker } from '../../pets/PetBehaviorTagsPicker';
import { PetBehaviorTagsDisplay } from '../../pets/PetBehaviorTagsDisplay';
import { PetProfileHistoryList } from '../../pets/PetProfileHistoryList';
import { PET_CLINICAL_FLAG_OPTIONS, defaultClinicalFlagLabel, neuteredLabel } from '../../pets/petClinicalFlags';
import { behaviorTagLabel } from '../../pets/petBehaviorTags';
import { petInitials, sexLabel } from '../vet-cockpit/vetCockpitUtils';
import {
  CLINIC_RECORDS_TABS,
  encounterStatusLabel,
  encounterTypeLabel,
  examLabKindLabel,
  examStatusTone,
  formatRecordDate,
  formatRecordDateTime,
  referralPriorityLabel,
  referralStatusLabel,
  vaccineSourceLabel,
  type ClinicRecordsTabId,
} from './clinicRecordsUtils';
import './clinic-records.css';

type Props = {
  pet?: HubPet;
  loading: boolean;
  refreshing?: boolean;
  tab: ClinicRecordsTabId;
  onTabChange: (tab: ClinicRecordsTabId) => void;
  canWrite: boolean;
  canWritePets: boolean;
  clinicId: string | null;
  cases: HubClinicalCase[];
  encounters: HubEncounter[];
  timelineEvents: HubClinicalTimelineEvent[];
  flags: HubPetClinicalFlag[];
  prescriptions: HubPrescription[];
  vaccinations: HubVaccination[];
  attachments: HubClinicalAttachment[];
  exams: HubClinicalExam[];
  referrals: HubSpecialistReferral[];
  profileChanges: HubPetProfileChange[];
  newFlagKey: string;
  newFlagLabel: string;
  onNewFlagKeyChange: (value: string) => void;
  onNewFlagLabelChange: (value: string) => void;
  startingEncounter: boolean;
  savingFicha: boolean;
  onStartEncounter: () => void;
  onAddFlag: () => void;
  onRemoveFlag: (flag: HubPetClinicalFlag) => void;
  onSaveHealthFicha: (patch: { neutered?: boolean | null; behavior_tags?: string[] | null }) => void;
};

function caseStatusLabel(status: HubClinicalCase['status']): string {
  if (status === 'active') return 'Ativo';
  if (status === 'monitoring') return 'Monitoramento';
  if (status === 'resolved') return 'Resolvido';
  return 'Cancelado';
}

const CASE_STATUS_ORDER: Record<HubClinicalCase['status'], number> = {
  active: 0,
  monitoring: 1,
  resolved: 2,
  cancelled: 3,
};

function sortCases(items: HubClinicalCase[]): HubClinicalCase[] {
  return [...items].sort((a, b) => {
    const byStatus = CASE_STATUS_ORDER[a.status] - CASE_STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    return new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime();
  });
}

function RecordFacts({ facts }: { facts: Array<{ label: string; value: string }> }) {
  if (facts.length === 0) return null;
  return (
    <dl className="hub-rx-med__facts">
      {facts.map((fact) => (
        <div key={`${fact.label}-${fact.value}`} className="hub-rx-med__fact">
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RecordGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="hub-rx-group" aria-label={hint ? `${title} — ${hint}` : title}>
      <header className="hub-rx-group__head">
        <h3 className="hub-rx-group__title">{title}</h3>
        {hint ? <p className="hub-rx-group__hint">{hint}</p> : null}
      </header>
      {children}
    </section>
  );
}

const ClinicRecordsDetail: React.FC<Props> = ({
  pet,
  loading,
  refreshing = false,
  tab,
  onTabChange,
  canWrite,
  canWritePets,
  clinicId,
  cases,
  encounters,
  timelineEvents,
  flags,
  prescriptions,
  vaccinations,
  attachments,
  exams,
  referrals,
  profileChanges,
  newFlagKey,
  newFlagLabel,
  onNewFlagKeyChange,
  onNewFlagLabelChange,
  startingEncounter,
  savingFicha,
  onStartEncounter,
  onAddFlag,
  onRemoveFlag,
  onSaveHealthFicha,
}) => {
  if (!pet) {
    return (
      <div className="hub-clinic-records__detail hub-clinic-records__detail--empty">
        <FileSearch size={32} aria-hidden />
        <p>Selecione um pet na lista para abrir o prontuário.</p>
        <p className="hub-clientes__muted">
          A operação do dia (fila, internar, cirurgia) fica em{' '}
          <Link to="/hub/clinica" className="hub-clientes__link">
            Consultório
          </Link>
          .
        </p>
      </div>
    );
  }

  if (loading && !refreshing) {
    return (
      <div className="hub-clinic-records__detail">
        <HubLoading variant="block" label="Carregando prontuário…" />
      </div>
    );
  }

  const activeCasesCount = cases.filter((c) => c.status === 'active' || c.status === 'monitoring').length;
  const guardianName = pet.primary_guardian?.guardian_name;
  const facts = [
    { label: 'Tutor', value: guardianName || '—' },
    { label: 'Espécie', value: pet.species || '—' },
    { label: 'Raça', value: pet.breed || '—' },
    { label: 'Sexo', value: sexLabel(pet.sex) },
    { label: 'Idade', value: petAgeDetailedLabel(pet.birth_date ?? null) },
    { label: 'Castrado(a)', value: neuteredLabel(pet.neutered) },
  ];

  return (
    <div className="hub-clinic-records__detail hub-clinic-records__detail--with-footer hub-loading-host">
      {refreshing ? <HubLoading variant="banner" label="Atualizando prontuário…" /> : null}
      <div className="hub-clinic-records__detail-scroll">
        <header className="hub-clinic-records__header">
          <div className="hub-clinic-records__title-row">
            <div className="hub-clinic-records__avatar hub-clinic-records__avatar--lg" aria-hidden>
              {petInitials(pet.name)}
            </div>
            <div className="hub-clinic-records__title-text">
              <p className="hub-clinic-records__kicker">Prontuário</p>
              <h1 className="hub-clinic-records__pet-name">{pet.name}</h1>
              <p className="hub-clinic-records__pet-meta">
                {[pet.breed || pet.species, sexLabel(pet.sex), petAgeDetailedLabel(pet.birth_date ?? null)]
                  .filter((part) => part && part !== '—')
                  .join(' • ')}
              </p>
            </div>
          </div>

          {flags.length > 0 || (pet.behavior_tags?.length ?? 0) > 0 ? (
            <div className="hub-clinic-records__alerts" aria-label="Alertas do pet">
              {flags.map((f) => (
                <span key={f.flag_key} className="hub-clinic-alert-chip">
                  {f.label || defaultClinicalFlagLabel(f.flag_key)}
                </span>
              ))}
              {(pet.behavior_tags ?? []).map((t) => (
                <span key={`b-${t}`} className="hub-clinic-alert-chip hub-clinic-alert-chip--behavior">
                  {behaviorTagLabel(t)}
                </span>
              ))}
            </div>
          ) : null}

          <div className="hub-clinic-records__facts">
            {facts.map((fact) => (
              <div key={fact.label}>
                <span className="hub-clinic-records__fact-k">{fact.label}</span>
                <strong className={fact.value === '—' ? 'hub-clinic-records__muted-value' : undefined}>
                  {fact.value}
                </strong>
              </div>
            ))}
          </div>

          <div className="hub-clinic-records__stats" aria-label="Resumo do prontuário">
            <div className="hub-clinic-records__stat">
              <FolderOpen size={16} aria-hidden />
              <span className="hub-clinic-records__stat-value">{activeCasesCount}</span>
              <span className="hub-clinic-records__stat-label">Casos ativos</span>
            </div>
            <div className="hub-clinic-records__stat">
              <Stethoscope size={16} aria-hidden />
              <span className="hub-clinic-records__stat-value">{encounters.length}</span>
              <span className="hub-clinic-records__stat-label">Atendimentos</span>
            </div>
            <div className="hub-clinic-records__stat">
              <FileText size={16} aria-hidden />
              <span className="hub-clinic-records__stat-value">{prescriptions.length}</span>
              <span className="hub-clinic-records__stat-label">Prescrições e receitas</span>
            </div>
            <div className="hub-clinic-records__stat">
              <Syringe size={16} aria-hidden />
              <span className="hub-clinic-records__stat-value">{vaccinations.length}</span>
              <span className="hub-clinic-records__stat-label">Vacinas</span>
            </div>
          </div>
        </header>

        <HubTabs
          className="hub-clinic-records__tabs"
          ariaLabel="Seções do prontuário"
          variant="page"
          activeId={tab}
          onTabChange={(id) => onTabChange(id as ClinicRecordsTabId)}
          items={CLINIC_RECORDS_TABS}
        />

        {tab === 'casos' ? (
          <div className="hub-clinic-records__section">
            {cases.length === 0 ? (
              <p className="hub-clinic-records__tab-empty">Nenhum caso clínico registrado.</p>
            ) : (
              <div className="hub-clinic-records__cases">
                {sortCases(cases).map((c) => {
                  const open = c.status === 'active' || c.status === 'monitoring';
                  return (
                    <article
                      key={c.id}
                      className={[
                        'hub-clinic-records__case',
                        open ? 'hub-clinic-records__case--open' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div className="hub-clinic-records__case-main">
                        <div className="hub-clinic-records__card-head">
                          <strong className="hub-clinic-records__card-title">
                            {clinicalCaseDisplayTitle(c.title, clinicalCaseTitleFallbacks(encounters, c.id))}
                          </strong>
                          <span className={`hub-clinic-cases__badge hub-clinic-cases__badge--${c.status}`}>
                            {caseStatusLabel(c.status)}
                          </span>
                        </div>
                        {c.summary ? <p className="hub-clinic-records__card-body">{c.summary}</p> : null}
                        <p className="hub-clinic-records__card-meta">
                          Aberto em {formatRecordDate(c.opened_at)}
                          {c.closed_at ? ` · Fechado em ${formatRecordDate(c.closed_at)}` : ''}
                        </p>
                      </div>
                      <Link
                        to={`/hub/clinica/casos/${c.id}`}
                        className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm hub-clinic-records__case-action"
                      >
                        Ver caso
                        <ChevronRight size={14} aria-hidden />
                      </Link>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {tab === 'timeline' ? (
          <div className="hub-clinic-records__section">
            {timelineEvents.length === 0 && encounters.length === 0 ? (
              <p className="hub-clinic-records__tab-empty">Sem histórico clínico.</p>
            ) : timelineEvents.length > 0 ? (
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
            ) : (
              <div className="hub-clinic-records__cards">
                {encounters.map((e) => (
                  <article key={e.id} className="hub-clinic-records__card">
                    <div className="hub-clinic-records__card-head">
                      <strong className="hub-clinic-records__card-title">
                        {encounterTypeLabel(e.encounter_type)}
                      </strong>
                      <span className={`hub-clinic-records__status hub-clinic-records__status--${e.status}`}>
                        {encounterStatusLabel(e.status)}
                      </span>
                    </div>
                    <p className="hub-clinic-records__card-body">
                      {e.chief_complaint || e.summary_notes || 'Sem descrição.'}
                    </p>
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
        ) : null}

        {tab === 'prescricoes' ? (
          <div className="hub-clinic-records__section">
            {prescriptions.length === 0 ? (
              <p className="hub-clinic-records__tab-empty">Nenhuma prescrição ou receita registrada.</p>
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
        ) : null}

        {tab === 'vacinas' ? (
          <div className="hub-clinic-records__section">
            {vaccinations.length === 0 ? (
              <p className="hub-clinic-records__tab-empty">Nenhuma vacina registrada.</p>
            ) : (
              <div className="hub-rx-history-list">
                {(['clinic', 'external'] as const).map((group) => {
                  const rows = [...vaccinations]
                    .filter((v) => (group === 'external' ? v.source === 'external' : v.source !== 'external'))
                    .sort(
                      (a, b) =>
                        new Date(b.administered_at || 0).getTime() - new Date(a.administered_at || 0).getTime(),
                    );
                  if (rows.length === 0) return null;
                  return (
                    <RecordGroup
                      key={group}
                      title={group === 'external' ? 'Vacinas externas' : 'Vacinas na clínica'}
                      hint={group === 'external' ? 'Aplicadas fora da clínica' : 'Aplicadas no atendimento'}
                    >
                      <ul className="hub-rx-cards">
                        {rows.map((v) => (
                          <li
                            key={v.id}
                            className={`hub-rx-card ${group === 'external' ? 'hub-rx-card--home' : 'hub-rx-card--clinic'}`}
                          >
                            <div className="hub-rx-card__head">
                              <span className={`hub-rx-kind ${group === 'external' ? 'hub-rx-kind--home' : 'hub-rx-kind--clinic'}`}>
                                {group === 'external' ? <Home size={12} aria-hidden /> : <Syringe size={12} aria-hidden />}
                                {vaccineSourceLabel(v.source)}
                              </span>
                              <span className="hub-clientes__muted hub-rx-card__date">
                                {formatRecordDate(v.administered_at)}
                              </span>
                            </div>
                            <strong className="hub-rx-med__name">{v.vaccine_name}</strong>
                            <RecordFacts
                              facts={[
                                { label: 'Aplicada', value: formatRecordDate(v.administered_at) },
                                v.next_dose_at ? { label: 'Próxima dose', value: formatRecordDate(v.next_dose_at) } : null,
                                v.batch_number ? { label: 'Lote', value: v.batch_number } : null,
                                v.expiry_date ? { label: 'Validade', value: formatRecordDate(v.expiry_date) } : null,
                              ].filter((f): f is { label: string; value: string } => Boolean(f))}
                            />
                            {v.notes ? <p className="hub-rx-card__notes">{v.notes}</p> : null}
                          </li>
                        ))}
                      </ul>
                    </RecordGroup>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {tab === 'exames' ? (
          <div className="hub-clinic-records__section">
            {exams.length === 0 && referrals.length === 0 && attachments.length === 0 ? (
              <p className="hub-clinic-records__tab-empty">Nenhum exame, encaminhamento ou anexo.</p>
            ) : (
              <div className="hub-rx-history-list">
                {exams.length > 0 ? (
                  <RecordGroup title="Exames" hint="Solicitados e resultados">
                    <ul className="hub-rx-cards">
                      {[...exams]
                        .sort(
                          (a, b) =>
                            new Date(b.requested_at || 0).getTime() - new Date(a.requested_at || 0).getTime(),
                        )
                        .map((ex) => {
                          const examFiles = attachments.filter((a) => a.hub_exam_id === ex.id);
                          return (
                            <li
                              key={ex.id}
                              className={`hub-rx-card ${ex.lab_kind === 'external' ? 'hub-rx-card--home' : 'hub-rx-card--clinic'}`}
                            >
                              <div className="hub-rx-card__head">
                                <span
                                  className={`hub-rx-kind ${ex.lab_kind === 'external' ? 'hub-rx-kind--home' : 'hub-rx-kind--clinic'}`}
                                >
                                  <FlaskConical size={12} aria-hidden />
                                  {examLabKindLabel(ex.lab_kind)}
                                </span>
                                <span className={`hub-clinic-records__status hub-clinic-records__status--${examStatusTone(ex.status)}`}>
                                  {formatHubClinicalExamStatus(ex.status)}
                                </span>
                              </div>
                              <strong className="hub-rx-med__name">{ex.exam_type}</strong>
                              <RecordFacts
                                facts={[
                                  ex.lab_name || ex.external_lab_name
                                    ? { label: 'Laboratório', value: ex.lab_name || ex.external_lab_name || '' }
                                    : null,
                                  { label: 'Solicitado', value: formatRecordDateTime(ex.requested_at) },
                                  ex.collected_at ? { label: 'Coletado', value: formatRecordDateTime(ex.collected_at) } : null,
                                  ex.result_at ? { label: 'Resultado', value: formatRecordDateTime(ex.result_at) } : null,
                                  ex.urgency === 'urgent' ? { label: 'Prioridade', value: 'Urgente' } : null,
                                  ex.requested_by_member?.full_name
                                    ? { label: 'Solicitado por', value: ex.requested_by_member.full_name }
                                    : null,
                                ].filter((f): f is { label: string; value: string } => Boolean(f))}
                              />
                              {ex.clinical_indication ? (
                                <p className="hub-rx-card__notes">{ex.clinical_indication}</p>
                              ) : null}
                              {ex.result_text ? <p className="hub-rx-card__notes">{ex.result_text}</p> : null}
                              <div className="hub-clinic-records__chip-row">
                                {ex.hub_encounter_id ? (
                                  <Link
                                    to={`/hub/clinica/atendimentos/${ex.hub_encounter_id}`}
                                    className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                                  >
                                    Ver atendimento
                                    <ChevronRight size={14} aria-hidden />
                                  </Link>
                                ) : null}
                                {ex.external_result_url ? (
                                  <a
                                    href={ex.external_result_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                                  >
                                    Resultado externo
                                    <ChevronRight size={14} aria-hidden />
                                  </a>
                                ) : null}
                                {examFiles.map((a) => (
                                  <a
                                    key={a.id}
                                    href={attachmentPublicUrl(a.storage_path)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                                  >
                                    <Paperclip size={14} aria-hidden />
                                    {a.title || a.file_name}
                                  </a>
                                ))}
                              </div>
                            </li>
                          );
                        })}
                    </ul>
                  </RecordGroup>
                ) : null}

                {referrals.length > 0 ? (
                  <RecordGroup title="Encaminhamentos" hint="Para especialista">
                    <ul className="hub-rx-cards">
                      {[...referrals]
                        .sort(
                          (a, b) =>
                            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
                        )
                        .map((ref) => (
                          <li
                            key={ref.id}
                            className={`hub-rx-card ${ref.priority === 'urgent' ? 'hub-rx-card--mixed' : 'hub-rx-card--home'}`}
                          >
                            <div className="hub-rx-card__head">
                              <span className={`hub-rx-kind ${ref.priority === 'urgent' ? 'hub-rx-kind--mixed' : 'hub-rx-kind--home'}`}>
                                <Share2 size={12} aria-hidden />
                                Encaminhamento
                              </span>
                              <span
                                className={`hub-clinic-records__status hub-clinic-records__status--${
                                  ref.status === 'cancelled' ? 'cancelled' : ref.status === 'issued' ? 'completed' : 'waiting'
                                }`}
                              >
                                {referralStatusLabel(ref.status)}
                              </span>
                            </div>
                            <strong className="hub-rx-med__name">{ref.specialty}</strong>
                            <RecordFacts
                              facts={[
                                { label: 'Prioridade', value: referralPriorityLabel(ref.priority) },
                                ref.specialist_name ? { label: 'Especialista', value: ref.specialist_name } : null,
                                ref.specialist_contact ? { label: 'Contato', value: ref.specialist_contact } : null,
                                { label: 'Solicitado', value: formatRecordDateTime(ref.created_at) },
                                ref.requested_by_member?.full_name
                                  ? { label: 'Por', value: ref.requested_by_member.full_name }
                                  : null,
                              ].filter((f): f is { label: string; value: string } => Boolean(f))}
                            />
                            {ref.referral_reason ? <p className="hub-rx-card__notes">{ref.referral_reason}</p> : null}
                            {ref.clinical_summary ? <p className="hub-rx-card__notes">{ref.clinical_summary}</p> : null}
                            {ref.hub_encounter_id ? (
                              <Link
                                to={`/hub/clinica/atendimentos/${ref.hub_encounter_id}`}
                                className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                              >
                                Ver atendimento
                                <ChevronRight size={14} aria-hidden />
                              </Link>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                  </RecordGroup>
                ) : null}

                {attachments.filter((a) => !a.hub_exam_id || !exams.some((ex) => ex.id === a.hub_exam_id)).length > 0 ? (
                  <RecordGroup title="Anexos" hint="Arquivos do prontuário">
                    <ul className="hub-rx-cards">
                      {attachments
                        .filter((a) => !a.hub_exam_id || !exams.some((ex) => ex.id === a.hub_exam_id))
                        .map((a) => (
                          <li key={a.id} className="hub-rx-card">
                            <div className="hub-rx-card__head">
                              <span className="hub-rx-kind hub-rx-kind--home">
                                <Paperclip size={12} aria-hidden />
                                Anexo
                              </span>
                              {a.uploaded_at ? (
                                <span className="hub-clientes__muted hub-rx-card__date">
                                  {formatRecordDateTime(a.uploaded_at)}
                                </span>
                              ) : null}
                            </div>
                            <strong className="hub-rx-med__name">{a.title || a.file_name}</strong>
                            <a
                              href={attachmentPublicUrl(a.storage_path)}
                              target="_blank"
                              rel="noreferrer"
                              className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                            >
                              Abrir anexo
                              <ChevronRight size={14} aria-hidden />
                            </a>
                          </li>
                        ))}
                    </ul>
                  </RecordGroup>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {tab === 'flags' ? (
          <div className="hub-clinic-records__section hub-clinic-records__flags">
            <section className="hub-clinic-records__block">
              <h3>Castrado(a)</h3>
              <p className="hub-clinic-records__card-meta">Atual: {neuteredLabel(pet.neutered)}</p>
              {canWritePets ? (
                <div className="hub-clinic-records__chip-row">
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                    disabled={savingFicha || pet.neutered === true}
                    onClick={() => onSaveHealthFicha({ neutered: true })}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                    disabled={savingFicha || pet.neutered === false}
                    onClick={() => onSaveHealthFicha({ neutered: false })}
                  >
                    Não
                  </button>
                </div>
              ) : null}
            </section>

            <section className="hub-clinic-records__block">
              <h3>Alertas clínicos</h3>
              {flags.length === 0 ? (
                <p className="hub-clientes__muted">Nenhum alerta ativo.</p>
              ) : (
                <ul className="hub-clinic-records__flag-list">
                  {flags.map((f) => (
                    <li key={f.flag_key}>
                      <span>
                        {f.label || defaultClinicalFlagLabel(f.flag_key)}{' '}
                        <span className="hub-clientes__muted">({f.flag_key})</span>
                      </span>
                      {canWrite ? (
                        <button
                          type="button"
                          className="hub-clientes__link-btn"
                          onClick={() => onRemoveFlag(f)}
                        >
                          Remover
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? (
                <div className="hub-clientes__form-stack hub-clinic-records__flag-form">
                  <label className="hub-clientes__label">Tipo de alerta</label>
                  <select
                    className="hub-clientes__input"
                    value={newFlagKey}
                    onChange={(e) => onNewFlagKeyChange(e.target.value)}
                  >
                    {PET_CLINICAL_FLAG_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <label className="hub-clientes__label">Descrição</label>
                  <input
                    className="hub-clientes__input"
                    value={newFlagLabel}
                    onChange={(e) => onNewFlagLabelChange(e.target.value)}
                    placeholder="Ex.: Alergia a dipirona"
                  />
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                    onClick={onAddFlag}
                  >
                    Adicionar alerta
                  </button>
                </div>
              ) : null}
            </section>

            <section className="hub-clinic-records__block">
              <h3>Comportamento</h3>
              {canWritePets ? (
                <PetBehaviorTagsPicker
                  value={pet.behavior_tags ?? []}
                  onChange={(behaviorTags) =>
                    onSaveHealthFicha({ behavior_tags: behaviorTags.length ? behaviorTags : [] })
                  }
                  variant="hub-pets-behavior"
                  disabled={savingFicha}
                />
              ) : (
                <PetBehaviorTagsDisplay tags={pet.behavior_tags ?? []} />
              )}
            </section>

            <section className="hub-clinic-records__block">
              <h3>Histórico da ficha</h3>
              <PetProfileHistoryList changes={profileChanges} />
            </section>
          </div>
        ) : null}
      </div>

      {canWrite ? (
        <div className="hub-clinic-records__footer" role="group" aria-label="Ações a partir do prontuário">
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={startingEncounter}
            onClick={onStartEncounter}
          >
            <Stethoscope size={16} aria-hidden />
            {startingEncounter ? 'Abrindo…' : 'Iniciar atendimento'}
          </button>
          <Link
            to={`/hub/clinica?admit=1&pet_id=${encodeURIComponent(pet.id)}`}
            className="hub-clientes__btn hub-clientes__btn--ghost"
          >
            <BedDouble size={16} aria-hidden />
            Internar
          </Link>
          <Link
            to={`/hub/clinica?surgery=1&pet_id=${encodeURIComponent(pet.id)}`}
            className="hub-clientes__btn hub-clientes__btn--ghost"
          >
            <Scissors size={16} aria-hidden />
            Cirurgia
          </Link>
        </div>
      ) : null}
    </div>
  );
};

export default ClinicRecordsDetail;
