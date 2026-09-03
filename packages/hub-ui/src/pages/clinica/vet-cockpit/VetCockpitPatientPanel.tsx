import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  FlaskConical,
  BedDouble,
  Pill,
  Play,
  Share2,
  Stethoscope,
  CheckCircle2,
} from 'lucide-react';
import type { DayBoardItem } from '../../../api/hubClinicalApi';
import type { VetCockpitPatientContext } from '../../../api/hubClinicalApi';
import type { HubEncounterOperationalPhase } from '../../../api/hubClinicalApi';
import { HubLoading } from '../../../components/HubLoading';
import { formatHubClinicalExamStatus } from '../clinicalDisplay';
import { petAgeDetailedLabel } from '../../pets/petAge';
import { itemOperationalStatus, sexLabel } from './vetCockpitUtils';

export type VetCockpitDrawerSection =
  | 'sec-resumo'
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
  onOpenRecord: (section?: VetCockpitDrawerSection) => void;
  onAdmit?: () => void;
  onComplete: () => void;
  onSetOperationalPhase: (phase: HubEncounterOperationalPhase | null) => void;
};

const VetCockpitPatientPanel: React.FC<Props> = ({
  item,
  context,
  loading,
  canWrite,
  completing,
  phaseBusy,
  onStartConsultation,
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

  if (loading || !context) {
    return (
      <div className="vet-cockpit-panel">
        <HubLoading variant="block" label="Carregando paciente…" />
      </div>
    );
  }

  const pet = context.pet;
  const st = itemOperationalStatus(item);
  const encounterId = item.encounter_id ?? context.encounter?.id;
  const inProgress = st === 'in_progress' || st === 'awaiting_exams' || st === 'exams_returned';
  const opPhase = context.encounter?.operational_phase ?? null;
  const weight =
    context.weight_kg != null && context.weight_kg !== ''
      ? `${context.weight_kg} kg`
      : '—';

  return (
    <div className="vet-cockpit-panel vet-cockpit-panel--with-footer">
      <div className="vet-cockpit-panel__scroll">
      <header className="vet-cockpit-panel__header">
        <h1 className="vet-cockpit-panel__pet-name">{pet.name}</h1>
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
            Abrir prontuário completo →
          </Link>
        ) : null}
        <div className="vet-cockpit-panel__meta">
          <div>
            <span className="vet-cockpit-panel__k">Tutor</span>
            <strong>{context.guardian?.full_name || '—'}</strong>
          </div>
          <div>
            <span className="vet-cockpit-panel__k">Peso</span>
            <strong>{weight}</strong>
          </div>
        </div>
        {context.chief_complaint ? (
          <div className="vet-cockpit-panel__complaint">
            <span className="vet-cockpit-panel__k">Motivo</span>
            <p>{context.chief_complaint}</p>
          </div>
        ) : null}
      </header>

      {context.flags.length > 0 ? (
        <div className="vet-cockpit-panel__alerts">
          {context.flags.map((f) => (
            <span key={f.flag_key} className="vet-cockpit-alert-chip">
              {f.label.toUpperCase()}
            </span>
          ))}
        </div>
      ) : null}

      {context.active_case ? (
        <section className="vet-cockpit-panel__section">
          <h3>Caso clínico</h3>
          <p>
            <strong>{context.active_case.title}</strong>
          </p>
          <p className="hub-clientes__muted">
            Status:{' '}
            {context.active_case.status === 'monitoring' ? 'Em acompanhamento' : 'Em investigação'}
          </p>
          <Link to={`/hub/clinica/casos/${context.active_case.id}`} className="hub-clientes__link">
            Ver caso
          </Link>
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
        {!historyExpanded ? (
          <ul className="vet-cockpit-panel__mini-list">
            {context.recent_encounters.slice(0, 3).map((e) => (
              <li key={e.id}>
                {e.started_at?.slice(0, 10) || '—'} — {e.chief_complaint || 'Atendimento'}
              </li>
            ))}
            {context.recent_encounters.length === 0 ? (
              <li className="hub-clientes__muted">Sem atendimentos recentes.</li>
            ) : null}
          </ul>
        ) : (
          <div className="vet-cockpit-panel__history-grid">
            <div>
              <h4>Atendimentos</h4>
              <ul>
                {context.recent_encounters.map((e) => (
                  <li key={e.id}>
                    {e.started_at?.slice(0, 10)} — {e.chief_complaint || '—'}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Exames</h4>
              <ul>
                {context.recent_exams.map((ex) => (
                  <li key={ex.id}>
                    {ex.exam_type} — {formatHubClinicalExamStatus(ex.status)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Prescrições</h4>
              <ul>
                {context.active_prescriptions.map((rx) => (
                  <li key={rx.id}>{rx.prescribed_at?.slice(0, 10) || '—'} — ativa</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Vacinas</h4>
              <ul>
                {context.recent_vaccinations.map((v) => (
                  <li key={v.id}>
                    {v.vaccine_name} — {String(v.administered_at || '').slice(0, 10)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      <section className="vet-cockpit-panel__section">
        <h3>Exames</h3>
        <div className="vet-cockpit-exam-groups">
          <div>
            <span className="vet-cockpit-panel__k">Solicitados</span>
            <strong>{context.exams_grouped.requested.length}</strong>
          </div>
          <div>
            <span className="vet-cockpit-panel__k">Aguardando</span>
            <strong>{context.exams_grouped.awaiting.length}</strong>
          </div>
          <div>
            <span className="vet-cockpit-panel__k">Disponíveis</span>
            <strong>{context.exams_grouped.available.length}</strong>
          </div>
        </div>
        {context.exams_grouped.available.length > 0 ? (
          <ul className="vet-cockpit-panel__mini-list">
            {context.exams_grouped.available.slice(0, 3).map((ex) => (
              <li key={ex.id}>
                {ex.exam_type}
                {ex.result_text ? ` — ${ex.result_text.slice(0, 80)}` : ''}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {context.active_prescriptions.length > 0 ? (
        <section className="vet-cockpit-panel__section">
          <h3>Prescrições ativas</h3>
          <ul className="vet-cockpit-panel__mini-list">
            {context.active_prescriptions.slice(0, 5).map((rx) => (
              <li key={rx.id}>
                {rx.items?.length ?? 0} item(ns) — {rx.prescribed_at?.slice(0, 10) || '—'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {context.active_hospitalization ? (
        <section className="vet-cockpit-panel__section vet-cockpit-panel__section--warn">
          <h3>🏥 Internado</h3>
          <p className="hub-clientes__muted">
            Desde {context.active_hospitalization.admitted_at?.slice(0, 10) || '—'}
          </p>
        </section>
      ) : null}

      </div>

      {encounterId && canWrite ? (
      <div className="vet-cockpit-actions">
            <button type="button" className="vet-cockpit-action-btn" onClick={() => onOpenRecord('sec-exames')}>
              <FlaskConical size={18} aria-hidden />
              Solicitar exame
            </button>
            <button type="button" className="vet-cockpit-action-btn" onClick={() => onOpenRecord('sec-prescricoes')}>
              <Pill size={18} aria-hidden />
              Prescrever
            </button>
            <button type="button" className="vet-cockpit-action-btn" onClick={() => onOpenRecord('sec-encaminhamentos')}>
              <Share2 size={18} aria-hidden />
              Encaminhar
            </button>
            <button type="button" className="vet-cockpit-action-btn" onClick={() => onOpenRecord('sec-prescricoes')}>
              <FileText size={18} aria-hidden />
              Gerar documento
            </button>
            {onAdmit ? (
              <button type="button" className="vet-cockpit-action-btn" onClick={onAdmit}>
                <BedDouble size={18} aria-hidden />
                Internar
              </button>
            ) : null}
        {inProgress ? (
          <>
            {opPhase !== 'awaiting_exams' ? (
              <button
                type="button"
                className="vet-cockpit-action-btn"
                disabled={phaseBusy}
                onClick={() => onSetOperationalPhase('awaiting_exams')}
              >
                Enviar para exames
              </button>
            ) : null}
            {opPhase === 'awaiting_exams' ? (
              <button
                type="button"
                className="vet-cockpit-action-btn"
                disabled={phaseBusy}
                onClick={() => onSetOperationalPhase('exams_returned')}
              >
                Paciente retornou
              </button>
            ) : null}
            {opPhase === 'exams_returned' ? (
              <button
                type="button"
                className="vet-cockpit-action-btn"
                disabled={phaseBusy}
                onClick={() => onSetOperationalPhase(null)}
              >
                Retomar consulta
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      ) : null}

      <div className="vet-cockpit-panel__footer">
        {!encounterId && canWrite ? (
          <button
            type="button"
            className="vet-cockpit-action-btn vet-cockpit-action-btn--primary"
            onClick={onStartConsultation}
          >
            <Play size={20} aria-hidden />
            Iniciar consulta
          </button>
        ) : null}
        {encounterId ? (
          <button
            type="button"
            className="vet-cockpit-action-btn vet-cockpit-action-btn--primary"
            onClick={() => onOpenRecord('sec-resumo')}
          >
            <Stethoscope size={20} aria-hidden />
            Abrir prontuário
          </button>
        ) : null}
        {encounterId && inProgress && canWrite ? (
          <button
            type="button"
            className="vet-cockpit-action-btn vet-cockpit-action-btn--finish"
            disabled={completing}
            onClick={onComplete}
          >
            <CheckCircle2 size={18} aria-hidden />
            {completing ? 'Finalizando…' : 'Finalizar atendimento'}
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default VetCockpitPatientPanel;
