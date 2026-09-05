import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { clinicalFlagLabel } from '../pets/petClinicalFlags';
import { behaviorTagLabel } from '../pets/petBehaviorTags';
import { HubAnamnesisChipPicker } from './HubAnamnesisChipPicker';
import { HubCwsCollapsibleCard } from './HubCwsCollapsibleCard';
import {
  anamnesisText,
  asStringList,
  DIET_TYPE_OPTIONS,
  dietTypeLabel,
  fichaBehaviorChips,
  isCatSpecies,
  isDogSpecies,
  mergeChipValues,
  painLevelLabel,
  PAIN_LEVEL_OPTIONS,
  painRelevantFichaTags,
  visitBehaviorLabel,
  visitBehaviorOptions,
} from './anamnesisOptions';

type Flag = { flag_key: string; label: string };

type Props = {
  anamnesis: Record<string, unknown>;
  examPain: string;
  flags: Flag[];
  behaviorTags: string[];
  petId: string | null;
  species?: string | null;
  readOnly: boolean;
  onPatch: (fields: Record<string, unknown>) => void;
};

export const HubWorkspaceAnamnesis: React.FC<Props> = ({
  anamnesis,
  examPain,
  flags,
  behaviorTags,
  petId,
  species,
  readOnly,
  onPatch,
}) => {
  const dietTypes = asStringList(anamnesis.diet_types);
  const visitBehaviors = asStringList(anamnesis.behavior_today);
  const painLevel = anamnesisText(anamnesis.pain);
  const fichaChips = useMemo(() => fichaBehaviorChips(behaviorTags), [behaviorTags]);
  const visitOptions = useMemo(() => visitBehaviorOptions(species), [species]);
  const painFicha = useMemo(() => painRelevantFichaTags(behaviorTags), [behaviorTags]);
  const examPainTrim = examPain.trim();

  const bringFichaBehavior = () => {
    if (readOnly || behaviorTags.length === 0) return;
    onPatch({ behavior_today: mergeChipValues(visitBehaviors, behaviorTags) });
  };

  return (
    <HubCwsCollapsibleCard id="sec-anamnese" title="Anamnese">

      <div className="hub-cws-ficha">
        <div className="hub-cws-ficha__head">
          <span className="hub-cws-k">Da ficha do pet</span>
          {petId ? (
            <Link to={`/hub/pets/${petId}`} className="hub-cws-ficha__link">
              Abrir ficha
            </Link>
          ) : null}
        </div>
        <div className="hub-cws-ficha__rows">
          <div>
            <p className="hub-cws-ficha__label">Saúde</p>
            {flags.length > 0 ? (
              <div className="hub-cws-ficha__pills">
                {flags.map((f) => (
                  <span key={f.flag_key} className="hub-cws-ficha-pill hub-cws-ficha-pill--health">
                    {clinicalFlagLabel(f.flag_key, f.label)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="hub-cws-v hub-cws-v--empty">Nenhum alerta clínico na ficha.</p>
            )}
          </div>
          <div>
            <p className="hub-cws-ficha__label">Comportamento</p>
            {fichaChips.length > 0 ? (
              <div className="hub-cws-ficha__pills">
                {fichaChips.map((chip) => (
                  <span
                    key={chip.key}
                    className={`hub-cws-ficha-pill hub-cws-ficha-pill--${chip.level ?? 'info'}`}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="hub-cws-v hub-cws-v--empty">Nenhuma observação de comportamento na ficha.</p>
            )}
          </div>
        </div>
        <p className="hub-cws-ficha__hint">
          Use saúde e comportamento da ficha como base.
          {isDogSpecies(species)
            ? ' Dor em cães costuma aparecer como mudança nesses sinais — registre o que mudou hoje.'
            : isCatSpecies(species)
              ? ' Dor em gatos costuma aparecer como retraimento ou agressão ao toque — registre o que mudou hoje.'
              : ' Dor costuma aparecer como mudança de comportamento — registre o que mudou hoje.'}
        </p>
        {!readOnly && behaviorTags.length > 0 ? (
          <button type="button" className="hub-cws-ficha__action" onClick={bringFichaBehavior}>
            Trazer comportamento da ficha para hoje
          </button>
        ) : null}
      </div>

      <div className="hub-cws-field-grid hub-cws-field-grid--2">
        <div className="hub-clinic-field hub-cws-field-tight">
          <label htmlFor="an_history">Histórico</label>
          <textarea
            id="an_history"
            className="hub-cws-textarea"
            value={anamnesisText(anamnesis.history)}
            disabled={readOnly}
            onChange={(e) => onPatch({ history: e.target.value })}
            rows={3}
            placeholder="Doenças, cirurgias, consultas recentes"
          />
        </div>
        <div className="hub-clinic-field hub-cws-field-tight">
          <label htmlFor="an_medications">Medicamentos em uso</label>
          <textarea
            id="an_medications"
            className="hub-cws-textarea"
            value={anamnesisText(anamnesis.medications)}
            disabled={readOnly}
            onChange={(e) => onPatch({ medications: e.target.value })}
            rows={3}
            placeholder="Nome, dose e há quanto tempo"
          />
        </div>
      </div>

      <div className="hub-cws-an-block">
        <div className="hub-cws-an-block__title">Alimentação</div>
        <HubAnamnesisChipPicker
          options={DIET_TYPE_OPTIONS}
          value={dietTypes}
          disabled={readOnly}
          onChange={(next) => onPatch({ diet_types: next })}
          customPlaceholder="Outra alimentação…"
          labelFor={dietTypeLabel}
        />
        <div className="hub-clinic-field hub-cws-field-tight hub-cws-an-block__notes">
          <label htmlFor="an_diet">Marca, quantidade e rotina</label>
          <textarea
            id="an_diet"
            className="hub-cws-textarea hub-cws-textarea--short"
            value={anamnesisText(anamnesis.diet)}
            disabled={readOnly}
            onChange={(e) => onPatch({ diet: e.target.value })}
            rows={2}
            placeholder="Ex.: ração X, 150 g 2x ao dia"
          />
        </div>
      </div>

      <div className="hub-cws-an-block">
        <div className="hub-cws-an-block__title">Comportamento nesta consulta</div>
        <p className="hub-cws-an-block__hint">
          Marque o que o tutor relata ou o que você observa agora — inclusive sinais que sugerem dor.
        </p>
        <HubAnamnesisChipPicker
          options={visitOptions}
          value={visitBehaviors}
          disabled={readOnly}
          onChange={(next) => onPatch({ behavior_today: next })}
          customPlaceholder="Outro comportamento…"
          labelFor={visitBehaviorLabel}
        />
        <div className="hub-clinic-field hub-cws-field-tight hub-cws-an-block__notes">
          <label htmlFor="an_behavior">Notas de comportamento</label>
          <textarea
            id="an_behavior"
            className="hub-cws-textarea hub-cws-textarea--short"
            value={anamnesisText(anamnesis.behavior)}
            disabled={readOnly}
            onChange={(e) => onPatch({ behavior: e.target.value })}
            rows={2}
            placeholder="O que mudou em relação à ficha"
          />
        </div>
      </div>

      <div className="hub-cws-an-block hub-cws-an-block--pain">
        <div className="hub-cws-an-block__title">Dor relatada</div>
        <div className="hub-cws-chips" role="group" aria-label="Intensidade da dor relatada">
          {PAIN_LEVEL_OPTIONS.map((opt) => {
            const selected = painLevel === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                className={`hub-cws-chip${selected ? ` hub-cws-chip--on hub-cws-chip--${opt.level}` : ''}`}
                aria-pressed={selected}
                disabled={readOnly}
                onClick={() => onPatch({ pain: selected ? '' : opt.key })}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {painFicha.length > 0 ? (
          <p className="hub-cws-ficha__hint">
            Na ficha: {painFicha.map((t) => behaviorTagLabel(t)).join(', ')}. Esses sinais podem mascarar ou
            amplificar a dor — compare com o exame físico.
          </p>
        ) : null}
        {examPainTrim ? (
          <p className="hub-cws-ficha__hint">
            Avaliação no exame físico: <strong>{painLevelLabel(examPainTrim)}</strong>
            {painLevel ? ` · relato na anamnese: ${painLevelLabel(painLevel)}` : ''}.
          </p>
        ) : painLevel ? (
          <p className="hub-cws-ficha__hint">
            Relato na anamnese: {painLevelLabel(painLevel)}. Confirme no exame físico.
          </p>
        ) : null}
        <div className="hub-clinic-field hub-cws-field-tight hub-cws-an-block__notes">
          <label htmlFor="an_pain_notes">Local e observação da dor</label>
          <textarea
            id="an_pain_notes"
            className="hub-cws-textarea hub-cws-textarea--short"
            value={anamnesisText(anamnesis.pain_notes)}
            disabled={readOnly}
            onChange={(e) => onPatch({ pain_notes: e.target.value })}
            rows={2}
            placeholder="Onde dói, quando piora, o que o tutor percebeu"
          />
        </div>
      </div>

      <div className="hub-cws-field-grid hub-cws-field-grid--2">
        <div className="hub-clinic-field hub-cws-field-tight">
          <label htmlFor="an_environment">Ambiente</label>
          <textarea
            id="an_environment"
            className="hub-cws-textarea"
            value={anamnesisText(anamnesis.environment)}
            disabled={readOnly}
            onChange={(e) => onPatch({ environment: e.target.value })}
            rows={3}
            placeholder="Casa, quintal, outros animais, passeios"
          />
        </div>
        <div className="hub-clinic-field hub-cws-field-tight">
          <label htmlFor="an_chief_complaint_detail">Detalhamento da queixa</label>
          <textarea
            id="an_chief_complaint_detail"
            className="hub-cws-textarea"
            value={anamnesisText(anamnesis.chief_complaint_detail)}
            disabled={readOnly}
            onChange={(e) => onPatch({ chief_complaint_detail: e.target.value })}
            rows={3}
            placeholder="Quando começou, frequência, o que já tentaram"
          />
        </div>
      </div>
    </HubCwsCollapsibleCard>
  );
};
