import React, { useMemo } from 'react';
import { behaviorTagLabel } from '../pets/petBehaviorTags';
import { HubCwsChoiceChips } from './HubCwsChoiceChips';
import { HubCwsCollapsibleCard } from './HubCwsCollapsibleCard';
import {
  anamnesisText,
  asStringList,
  PAIN_LEVEL_OPTIONS,
  painLevelLabel,
  painRelatedVisitBehaviors,
  painRelevantFichaTags,
  visitBehaviorLabel,
} from './anamnesisOptions';
import {
  CRT_OPTIONS,
  GENERAL_STATE_OPTIONS,
  HYDRATION_OPTIONS,
  LYMPH_OPTIONS,
  MUCOSA_OPTIONS,
  type VitalField,
  vitalReferenceHint,
} from './physicalExamOptions';

type Props = {
  exam: Record<string, unknown>;
  anamnesis: Record<string, unknown>;
  behaviorTags: string[];
  species?: string | null;
  readOnly: boolean;
  onPatch: (field: string, value: unknown) => void;
};

const VITALS: Array<{ field: VitalField; label: string; inputMode: 'decimal' | 'numeric'; placeholder: string }> = [
  { field: 'temperature_c', label: 'Temperatura (°C)', inputMode: 'decimal', placeholder: '38,5' },
  { field: 'heart_rate', label: 'FC (bpm)', inputMode: 'numeric', placeholder: '90' },
  { field: 'respiratory_rate', label: 'FR (rpm)', inputMode: 'numeric', placeholder: '20' },
  { field: 'weight_kg', label: 'Peso (kg)', inputMode: 'decimal', placeholder: '12,4' },
];

export const HubWorkspacePhysicalExam: React.FC<Props> = ({
  exam,
  anamnesis,
  behaviorTags,
  species,
  readOnly,
  onPatch,
}) => {
  const anamnesisPain = anamnesisText(anamnesis.pain);
  const visitPainSigns = useMemo(
    () => painRelatedVisitBehaviors(asStringList(anamnesis.behavior_today)),
    [anamnesis.behavior_today],
  );
  const fichaPain = useMemo(() => painRelevantFichaTags(behaviorTags), [behaviorTags]);

  return (
    <HubCwsCollapsibleCard id="sec-exame" title="Exame físico">

      <div className="hub-cws-subtitle">Sinais vitais</div>
      <div className="hub-cws-vitals hub-cws-vitals--exam">
        {VITALS.map(({ field, label, inputMode, placeholder }) => (
          <div key={field} className="hub-cws-vital-cell">
            <label htmlFor={`pe_${field}`}>{label}</label>
            <input
              id={`pe_${field}`}
              type="text"
              inputMode={inputMode}
              value={exam[field] == null ? '' : String(exam[field])}
              disabled={readOnly}
              placeholder={placeholder}
              onChange={(e) => onPatch(field, e.target.value)}
            />
            <p className="hub-cws-vital-hint">{vitalReferenceHint(field, species)}</p>
          </div>
        ))}
      </div>
      <div className="hub-cws-an-block hub-cws-an-block--tight">
        <div className="hub-cws-an-block__title">TPC</div>
        <HubCwsChoiceChips
          options={CRT_OPTIONS}
          value={exam.crt}
          disabled={readOnly}
          ariaLabel="Tempo de preenchimento capilar"
          onChange={(next) => onPatch('crt', next || null)}
        />
      </div>

      <div className="hub-cws-subtitle">Avaliação</div>
      <div className="hub-cws-exam-assess">
        <div className="hub-cws-an-block hub-cws-an-block--tight">
          <div className="hub-cws-an-block__title">Hidratação</div>
          <HubCwsChoiceChips
            options={HYDRATION_OPTIONS}
            value={exam.hydration}
            disabled={readOnly}
            ariaLabel="Hidratação"
            onChange={(next) => onPatch('hydration', next || null)}
          />
        </div>
        <div className="hub-cws-an-block hub-cws-an-block--tight">
          <div className="hub-cws-an-block__title">Mucosas</div>
          <HubCwsChoiceChips
            options={MUCOSA_OPTIONS}
            value={exam.mucosa}
            disabled={readOnly}
            ariaLabel="Mucosas"
            onChange={(next) => onPatch('mucosa', next || null)}
          />
        </div>
        <div className="hub-cws-an-block hub-cws-an-block--tight">
          <div className="hub-cws-an-block__title">Linfonodos</div>
          <HubCwsChoiceChips
            options={LYMPH_OPTIONS}
            value={exam.lymph_nodes}
            disabled={readOnly}
            ariaLabel="Linfonodos"
            onChange={(next) => onPatch('lymph_nodes', next || null)}
          />
        </div>
        <div className="hub-cws-an-block hub-cws-an-block--tight">
          <div className="hub-cws-an-block__title">Estado geral</div>
          <HubCwsChoiceChips
            options={GENERAL_STATE_OPTIONS}
            value={exam.general_state}
            disabled={readOnly}
            ariaLabel="Estado geral"
            onChange={(next) => onPatch('general_state', next || null)}
          />
        </div>
      </div>

      <div className="hub-cws-an-block hub-cws-an-block--pain">
        <div className="hub-cws-an-block__title">Dor no exame</div>
        <p className="hub-cws-an-block__hint">Avaliação do veterinário — a mesma escala da anamnese.</p>
        <HubCwsChoiceChips
          options={PAIN_LEVEL_OPTIONS}
          value={exam.pain}
          disabled={readOnly}
          ariaLabel="Dor no exame físico"
          onChange={(next) => onPatch('pain', next || null)}
        />
        {anamnesisPain ? (
          <p className="hub-cws-ficha__hint">
            Relato na anamnese: <strong>{painLevelLabel(anamnesisPain)}</strong>
            {visitPainSigns.length > 0
              ? ` · sinais no comportamento: ${visitPainSigns.map((t) => visitBehaviorLabel(t)).join(', ')}`
              : ''}
            .
          </p>
        ) : visitPainSigns.length > 0 ? (
          <p className="hub-cws-ficha__hint">
            Na anamnese há sinais que sugerem dor: {visitPainSigns.map((t) => visitBehaviorLabel(t)).join(', ')}.
          </p>
        ) : null}
        {fichaPain.length > 0 ? (
          <p className="hub-cws-ficha__hint">
            Ficha: {fichaPain.map((t) => behaviorTagLabel(t)).join(', ')}. Pode mascarar ou amplificar a reação à
            palpação.
          </p>
        ) : null}
        {!readOnly && anamnesisPain && anamnesisPain !== exam.pain ? (
          <button type="button" className="hub-cws-ficha__action" onClick={() => onPatch('pain', anamnesisPain)}>
            Usar relato da anamnese
          </button>
        ) : null}
      </div>

      <div className="hub-clinic-field hub-cws-field-tight hub-cws-an-block__notes">
        <label htmlFor="pe_notes">Observações do exame</label>
        <textarea
          id="pe_notes"
          className="hub-cws-textarea"
          value={anamnesisText(exam.notes)}
          disabled={readOnly}
          onChange={(e) => onPatch('notes', e.target.value)}
          rows={3}
          placeholder="Achados por sistema, ausculta, abdômen, pele…"
        />
      </div>
    </HubCwsCollapsibleCard>
  );
};
