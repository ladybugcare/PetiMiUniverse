import React from 'react';
import { Check, HeartPulse, Info, Dog, X } from 'lucide-react';
import type { PetWizardState } from '../types';
import { PetBehaviorTagsPicker } from '../../PetBehaviorTagsPicker';
import { PetClinicalFlagsPicker } from '../../PetClinicalFlagsPicker';

type Props = {
  state: PetWizardState;
  update: (p: Partial<PetWizardState>) => void;
};

export const PetWizardStepHealth: React.FC<Props> = ({ state, update }) => {
  return (
    <div className="pet-wizard__step-pane">
      <div className="pet-wizard__block-head">
        <span className="pet-wizard__block-head-icon pet-wizard__block-head-icon--brand" aria-hidden>
          <HeartPulse size={22} strokeWidth={2} />
        </span>
        <div>
          <h3 className="pet-wizard__block-title">Saúde permanente</h3>
          <p className="pet-wizard__block-sub">
            Castrado e alertas clínicos ficam na ficha do pet e aparecem na clínica, no banho e tosa e no hotel.
          </p>
        </div>
      </div>

      <div className="pet-wizard__fields">
        <div className="pet-wizard__field--full">
          <label className="pet-wizard__label">
            Castrado(a)? <span className="req">*</span>
          </label>
          <div className="pet-wizard__seg">
            {(
              [
                ['Y', 'Sim', Check],
                ['N', 'Não', X],
              ] as const
            ).map(([v, lab, Icon]) => (
              <button
                key={v}
                type="button"
                className={`pet-wizard__seg-btn pet-wizard__seg-btn--neuter pet-wizard__seg-btn--neuter-${v.toLowerCase()} ${
                  state.neutered === v ? 'pet-wizard__seg-btn--on' : ''
                }`}
                onClick={() => update({ neutered: v })}
              >
                <Icon size={18} strokeWidth={2.25} aria-hidden />
                {lab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pet-wizard__basics-divider" />

      <div className="pet-wizard__block-head">
        <span className="pet-wizard__block-head-icon" aria-hidden>
          <HeartPulse size={22} strokeWidth={2} />
        </span>
        <div>
          <h3 className="pet-wizard__block-title">Alertas clínicos</h3>
          <p className="pet-wizard__block-sub">Alergia, cardiopata, agressivo e demais flags da clínica.</p>
        </div>
      </div>

      <PetClinicalFlagsPicker
        value={state.clinicalFlagKeys}
        onChange={(clinicalFlagKeys) => update({ clinicalFlagKeys })}
        variant="pet-wizard"
      />

      {state.clinicalFlagKeys.includes('allergy') ? (
        <div className="pet-wizard__fields" style={{ marginTop: 14 }}>
          <div className="pet-wizard__field--full">
            <label className="pet-wizard__label">Detalhe da alergia</label>
            <input
              className="pet-wizard__input"
              value={state.allergyDetail}
              onChange={(e) => update({ allergyDetail: e.target.value })}
              placeholder="Ex.: Alergia a dipirona"
            />
          </div>
        </div>
      ) : null}

      <div className="pet-wizard__basics-divider" />

      <div className="pet-wizard__block-head">
        <span className="pet-wizard__block-head-icon pet-wizard__block-head-icon--brand" aria-hidden>
          <Dog size={22} strokeWidth={2} />
        </span>
        <div>
          <h3 className="pet-wizard__block-title">Comportamento</h3>
          <p className="pet-wizard__block-sub">Selecione o que se aplica. A equipe operacional vê os mesmos chips.</p>
        </div>
      </div>

      <PetBehaviorTagsPicker
        value={state.behaviorTags}
        onChange={(behaviorTags) => update({ behaviorTags })}
        variant="pet-wizard"
      />

      <p className="pet-wizard__field-hint" style={{ marginTop: 12 }}>
        <Info size={14} strokeWidth={2} aria-hidden />
        Vacinas e doses ficam no prontuário da clínica, não neste passo.
      </p>
    </div>
  );
};
