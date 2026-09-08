import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BedDouble,
  CheckCircle2,
  FileText,
  FlaskConical,
  Pill,
  Play,
  RotateCcw,
  Scissors,
  Send,
  Share2,
  Stethoscope,
  Syringe,
  Undo2,
} from 'lucide-react';
import type { DayBoardItem } from '../../../api/hubClinicalApi';
import type { VetCockpitPatientContext } from '../../../api/hubClinicalApi';
import type { HubEncounterOperationalPhase } from '../../../api/hubClinicalApi';
import { HubLoading } from '../../../components/HubLoading';
import { formatHubClinicalExamStatus, formatPrescriptionLine } from '../clinicalDisplay';
import { petAgeDetailedLabel } from '../../pets/petAge';
import {
  caseStatusLabel,
  formatCockpitShortDate,
  isDayBoardSurgery,
  isFinalOperationalStatus,
  isItemEmergency,
  itemOperationalStatus,
  sexLabel,
  VET_QUEUE_STATUS_LABEL,
} from './vetCockpitUtils';

export type VetCockpitDrawerSection =
  | 'sec-resumo'
  | 'sec-aplicado'
  | 'sec-medicacao'
  | 'sec-vacinas'
  | 'sec-carteirinha'
  | 'sec-exames'
  | 'sec-prescricoes'
  | 'sec-encaminhamentos';

type Props = {
  item: DayBoardItem | null;
  context: VetCockpitPatientContext | null;
  loading: boolean;
  canWrite: boolean;
  completing: boolean;
  phaseBusy: boolean;
  onStartConsultation: () => void;
  onOpenSurgery?: () => void;
  onOpenRecord: (section?: VetCockpitDrawerSection) => void;
  onAdmit?: () => void;
  onComplete: () => void;
  onSetOperationalPhase: (phase: HubEncounterOperationalPhase | null) => void;
};

function statusPillClass(status: string): string {
  if (status === 'in_progress') return 'vet-cockpit-queue__pill--progress';
  if (status === 'awaiting_exams') return 'vet-cockpit-queue__pill--exams';
  if (status === 'exams_returned') return 'vet-cockpit-queue__pill--returned';
  if (status === 'completed' || status === 'done') return 'vet-cockpit-queue__pill--done';
  if (status === 'checked_in') return 'vet-cockpit-queue__pill--checked';
  return 'vet-cockpit-queue__pill--waiting';
}

function ExamCountRow({
  requested,
  awaiting,
  available,
}: {
  requested: number;
  awaiting: number;
  available: number;
}) {
  return (
    <div className="vet-cockpit-exam-groups">
      <div>
        <span className="vet-cockpit-panel__k">Solicitados</span>
        <strong>{requested}</strong>
      </div>
      <div>
        <span className="vet-cockpit-panel__k">Aguardando</span>
        <strong>{awaiting}</strong>
      </div>
      <div>
        <span className="vet-cockpit-panel__k">Prontos</span>
        <strong className={available > 0 ? 'vet-cockpit-panel__accent-value' : undefined}>{available}</strong>
      </div>
    </div>
  );
}

const VetCockpitPatientPanel: React.FC<Props> = ({
  item,
  context,
  loading,
  canWrite,
  completing,
  phaseBusy,
  onStartConsultation,
  onOpenSurgery,
  onOpenRecord,
  onAdmit,
  onComplete,
  onSetOperationalPhase,
}) => {
  const [historyExpanded, setHistoryExpanded] = useState(false);

  if (!item) {
    return (
      <div className="vet-cockpit-panel vet-cockpit-panel--empty">
        <p className="hub-clientes__muted">Selecione um paciente na fila para ver o contexto clínico.</p>
      </div>
    );
  }

  const isSurgery = item ? isDayBoardSurgery(item) : false;

  if (!context) {
    return (
      <div className="vet-cockpit-panel">
        {loading ? <HubLoading variant="block" label="Carregando paciente…" /> : (
          <>
            <p className="hub-clientes__muted">Sem contexto clínico para este paciente.</p>
            {isSurgery && item?.surgery_id && onOpenSurgery ? (
              <div className="vet-cockpit-panel__footer">
                <button type="button" className="vet-cockpit-action-btn vet-cockpit-action-btn--primary" onClick={onOpenSurgery}>
                  <Scissors size={18} aria-hidden />
                  Abrir ficha da cirurgia
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  }

  const pet = context.pet;
  const st = itemOperationalStatus(item);
  const encounterId = item.encounter_id ?? context.encounter?.id;
  const inProgress = st === 'in_progress' || st === 'awaiting_exams' || st === 'exams_returned';
  const writeActionsLocked = isFinalOperationalStatus(st);
  const writeActionsTitle = writeActionsLocked ? 'Disponível apenas durante o atendimento' : undefined;
  const opPhase = context.encounter?.operational_phase ?? null;
  const hasWeight = context.weight_kg != null && context.weight_kg !== '';
  const weight = hasWeight ? `${context.weight_kg} kg` : 'Não informado';
  const guardianPhone = context.guardian?.phone?.trim() || '';
  const emergency = isItemEmergency(item);
  const examCounts = context.exams_grouped;
  const previousEncounters = context.recent_encounters.filter((e) => e.id !== encounterId);

  return (
    <div className="vet-cockpit-panel vet-cockpit-panel--with-footer">
      <div className="vet-cockpit-panel__scroll">
        <header className="vet-cockpit-panel__header">
          <div className="vet-cockpit-panel__title-row">
            <h1 className="vet-cockpit-panel__pet-name">{pet.name}</h1>
            <span className={`vet-cockpit-queue__pill ${statusPillClass(st)}`}>
              {isSurgery && st === 'in_progress' ? 'Em cirurgia' : VET_QUEUE_STATUS_LABEL[st] || st}
            </span>
          </div>
          <div className="vet-cockpit-panel__subtitle-row">
            <p className="vet-cockpit-panel__pet-line">
              {[pet.breed || pet.species, sexLabel(pet.sex), petAgeDetailedLabel(pet.birth_date ?? null)]
                .filter(Boolean)
                .join(' • ')}
            </p>
            {pet.id ? (
              <Link
                to={`/hub/clinica/prontuarios?petId=${encodeURIComponent(pet.id)}`}
                className="hub-clientes__link vet-cockpit-panel__prontuario-link"
              >
                Histórico completo →
              </Link>
            ) : null}
          </div>

            {emergency || isSurgery || context.flags.length > 0 ? (
            <div className="vet-cockpit-panel__alerts">
              {isSurgery ? <span className="vet-cockpit-alert-chip">Cirurgia</span> : null}
              {emergency ? <span className="vet-cockpit-alert-chip">Emergência</span> : null}
              {context.flags.map((f) => (
                <span key={f.flag_key} className="vet-cockpit-alert-chip">
                  {f.label}
                </span>
              ))}
            </div>
          ) : null}

          <div className="vet-cockpit-panel__facts">
            <div>
              <span className="vet-cockpit-panel__k">Tutor</span>
              <strong>{context.guardian?.full_name || '—'}</strong>
              {guardianPhone ? (
                <a className="vet-cockpit-panel__phone" href={`tel:${guardianPhone}`}>
                  {guardianPhone}
                </a>
              ) : null}
            </div>
            <div>
              <span className="vet-cockpit-panel__k">Peso</span>
              <strong className={hasWeight ? undefined : 'vet-cockpit-panel__muted-value'}>{weight}</strong>
            </div>
            {isSurgery ? (
              <div>
                <span className="vet-cockpit-panel__k">Cirurgia</span>
                <strong>{item.surgery_title || item.title || item.service_type?.name || 'Procedimento'}</strong>
              </div>
            ) : null}
            {context.chief_complaint ? (
              <div>
                <span className="vet-cockpit-panel__k">Motivo</span>
                <strong>{context.chief_complaint}</strong>
              </div>
            ) : null}
            {context.active_case ? (
              <div>
                <span className="vet-cockpit-panel__k">Caso clínico</span>
                <strong>{context.active_case.title}</strong>
                <span className="vet-cockpit-panel__fact-meta">
                  {caseStatusLabel(context.active_case.status)}
                  {' · '}
                  <Link to={`/hub/clinica/casos/${context.active_case.id}`} className="hub-clientes__link">
                    Ver caso
                  </Link>
                </span>
              </div>
            ) : null}
          </div>
        </header>

        {context.active_hospitalization ? (
          <section className="vet-cockpit-panel__section vet-cockpit-panel__section--warn">
            <h3>Internado</h3>
            <p className="hub-clientes__muted">
              Desde {formatCockpitShortDate(context.active_hospitalization.admitted_at)}
              {' · '}
              <Link to={`/hub/clinica/internacoes/${context.active_hospitalization.id}`} className="hub-clientes__link">
                Abrir internação
              </Link>
            </p>
          </section>
        ) : null}

        <section className="vet-cockpit-panel__snapshot" aria-label="Contexto clínico">
          {encounterId ? (
            <button type="button" className="vet-cockpit-snapshot-card" onClick={() => onOpenRecord('sec-exames')}>
              <span className="vet-cockpit-panel__k">Exames</span>
              <ExamCountRow
                requested={examCounts.requested.length}
                awaiting={examCounts.awaiting.length}
                available={examCounts.available.length}
              />
            </button>
          ) : (
            <div className="vet-cockpit-snapshot-card">
              <span className="vet-cockpit-panel__k">Exames</span>
              <ExamCountRow
                requested={examCounts.requested.length}
                awaiting={examCounts.awaiting.length}
                available={examCounts.available.length}
              />
            </div>
          )}
          <div className="vet-cockpit-snapshot-card">
            <span className="vet-cockpit-panel__k">Atendimentos anteriores</span>
            {previousEncounters.length === 0 ? (
              <p className="hub-clientes__muted">Nenhum atendimento anterior neste histórico.</p>
            ) : (
              <ul className="vet-cockpit-panel__mini-list vet-cockpit-panel__mini-list--flush">
                {previousEncounters.slice(0, 2).map((e) => (
                  <li key={e.id}>
                    {formatCockpitShortDate(e.started_at)} — {e.chief_complaint || 'Atendimento'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {examCounts.available.length > 0 ? (
          <ul className="vet-cockpit-panel__mini-list">
            {examCounts.available.slice(0, 3).map((ex) => (
              <li key={ex.id}>
                {ex.exam_type}
                {ex.result_text ? ` — ${ex.result_text.slice(0, 80)}` : ''}
              </li>
            ))}
          </ul>
        ) : null}

        {context.active_prescriptions.length > 0 ? (
          <section className="vet-cockpit-panel__section">
            <h3>Prescrições ativas</h3>
            <ul className="vet-cockpit-panel__mini-list">
              {context.active_prescriptions.slice(0, 5).map((rx) => (
                <li key={rx.id}>
                  {formatPrescriptionLine(rx)} — {formatCockpitShortDate(rx.prescribed_at)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="vet-cockpit-panel__section">
          <div className="vet-cockpit-panel__section-head">
            <h3>Histórico relevante</h3>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              onClick={() => setHistoryExpanded((v) => !v)}
            >
              {historyExpanded ? 'Recolher' : 'Expandir'}
            </button>
          </div>
          {historyExpanded ? (
            <div className="vet-cockpit-panel__history-grid">
              <div>
                <h4>Atendimentos</h4>
                <ul>
                  {context.recent_encounters.length === 0 ? (
                    <li className="hub-clientes__muted">Sem atendimentos recentes.</li>
                  ) : (
                    context.recent_encounters.map((e) => (
                      <li key={e.id}>
                        {formatCockpitShortDate(e.started_at)} — {e.chief_complaint || '—'}
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <h4>Exames</h4>
                <ul>
                  {context.recent_exams.length === 0 ? (
                    <li className="hub-clientes__muted">Nenhum exame recente.</li>
                  ) : (
                    context.recent_exams.map((ex) => (
                      <li key={ex.id}>
                        {ex.exam_type} — {formatHubClinicalExamStatus(ex.status)}
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <h4>Prescrições</h4>
                <ul>
                  {context.active_prescriptions.length === 0 ? (
                    <li className="hub-clientes__muted">Nenhuma prescrição ativa.</li>
                  ) : (
                    context.active_prescriptions.map((rx) => (
                      <li key={rx.id}>{formatCockpitShortDate(rx.prescribed_at)} — ativa</li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <h4>Vacinas</h4>
                <ul>
                  {context.recent_vaccinations.length === 0 ? (
                    <li className="hub-clientes__muted">Nenhuma vacina recente.</li>
                  ) : (
                    context.recent_vaccinations.map((v) => (
                      <li key={v.id}>
                        {v.vaccine_name} — {formatCockpitShortDate(String(v.administered_at || ''))}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          ) : (
            <p className="hub-clientes__muted vet-cockpit-panel__history-hint">
              Exames, vacinas e atendimentos anteriores.
            </p>
          )}
        </section>
      </div>

      {encounterId && canWrite ? (
        <div className="vet-cockpit-actions">
          <button
            type="button"
            className="vet-cockpit-action-btn"
            disabled={writeActionsLocked}
            title={writeActionsTitle}
            onClick={() => onOpenRecord('sec-exames')}
          >
            <FlaskConical size={16} aria-hidden />
            Solicitar exame
          </button>
          <button
            type="button"
            className="vet-cockpit-action-btn"
            disabled={writeActionsLocked}
            title={writeActionsTitle}
            onClick={() => onOpenRecord('sec-medicacao')}
          >
            <Syringe size={16} aria-hidden />
            Aplicar medicação
          </button>
          <button
            type="button"
            className="vet-cockpit-action-btn"
            disabled={writeActionsLocked}
            title={writeActionsTitle}
            onClick={() => onOpenRecord('sec-prescricoes')}
          >
            <Pill size={16} aria-hidden />
            Prescrever
          </button>
          <button
            type="button"
            className="vet-cockpit-action-btn"
            disabled={writeActionsLocked}
            title={writeActionsTitle}
            onClick={() => onOpenRecord('sec-encaminhamentos')}
          >
            <Share2 size={16} aria-hidden />
            Encaminhar
          </button>
          <button
            type="button"
            className="vet-cockpit-action-btn"
            disabled={writeActionsLocked}
            title={writeActionsTitle}
            onClick={() => onOpenRecord('sec-prescricoes')}
          >
            <FileText size={16} aria-hidden />
            Gerar documento
          </button>
          {onAdmit ? (
            <button
              type="button"
              className="vet-cockpit-action-btn"
              disabled={writeActionsLocked}
              title={writeActionsTitle}
              onClick={onAdmit}
            >
              <BedDouble size={16} aria-hidden />
              Internar
            </button>
          ) : null}
          {inProgress ? (
            <>
              {opPhase !== 'awaiting_exams' ? (
                <button
                  type="button"
                  className="vet-cockpit-action-btn vet-cockpit-action-btn--phase"
                  disabled={phaseBusy}
                  onClick={() => onSetOperationalPhase('awaiting_exams')}
                >
                  <Send size={16} aria-hidden />
                  Enviar para exames
                </button>
              ) : null}
              {opPhase === 'awaiting_exams' ? (
                <button
                  type="button"
                  className="vet-cockpit-action-btn vet-cockpit-action-btn--phase"
                  disabled={phaseBusy}
                  onClick={() => onSetOperationalPhase('exams_returned')}
                >
                  <Undo2 size={16} aria-hidden />
                  Paciente retornou
                </button>
              ) : null}
              {opPhase === 'exams_returned' ? (
                <button
                  type="button"
                  className="vet-cockpit-action-btn vet-cockpit-action-btn--phase"
                  disabled={phaseBusy}
                  onClick={() => onSetOperationalPhase(null)}
                >
                  <RotateCcw size={16} aria-hidden />
                  Retomar consulta
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div className="vet-cockpit-panel__footer">
        {isSurgery && item.surgery_id && onOpenSurgery ? (
          <button
            type="button"
            className="vet-cockpit-action-btn"
            onClick={onOpenSurgery}
          >
            <Scissors size={18} aria-hidden />
            Abrir ficha da cirurgia
          </button>
        ) : null}
        {!encounterId && canWrite ? (
          <button
            type="button"
            className="vet-cockpit-action-btn vet-cockpit-action-btn--primary"
            onClick={onStartConsultation}
          >
            <Play size={18} aria-hidden />
            {isSurgery ? 'Abrir atendimento da cirurgia' : 'Iniciar consulta'}
          </button>
        ) : null}
        {encounterId ? (
          <button
            type="button"
            className="vet-cockpit-action-btn vet-cockpit-action-btn--primary"
            onClick={() => onOpenRecord('sec-resumo')}
          >
            <Stethoscope size={18} aria-hidden />
            {inProgress ? 'Continuar atendimento' : 'Abrir prontuário'}
          </button>
        ) : null}
        {encounterId && inProgress && canWrite ? (
          <button
            type="button"
            className="vet-cockpit-action-btn vet-cockpit-action-btn--finish"
            disabled={completing}
            onClick={onComplete}
          >
            <CheckCircle2 size={16} aria-hidden />
            {completing ? 'Finalizando…' : 'Finalizar atendimento'}
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default VetCockpitPatientPanel;
