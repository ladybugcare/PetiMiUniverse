import React from 'react';
import type { PetWizardState } from '../types';

type Props = {
  state: PetWizardState;
  update: (p: Partial<PetWizardState>) => void;
};

export const PetWizardStepDocs: React.FC<Props> = ({ state, update }) => {
  return (
    <div className="pet-wizard__step-pane">
      <h3 className="pet-wizard__section-title">Documentos e observações</h3>
      <p className="pet-wizard__lead">
        Anexos e documentos serão suportados em uma versão futura. O texto abaixo é salvo no campo <strong>notas</strong>{' '}
        do pet (junto com observações relevantes do passo anterior, se existirem).
      </p>
      <div className="pet-wizard__fields">
        <div className="pet-wizard__field--full">
          <label className="pet-wizard__label">Notas finais</label>
          <textarea
            className="pet-wizard__textarea"
            value={state.notes}
            onChange={(e) => update({ notes: e.target.value })}
            placeholder="Observações clínicas, administrativas ou de contato."
            rows={8}
          />
        </div>
      </div>
      <div className="pet-wizard__empty" style={{ marginTop: 16 }}>
        Upload de documentos: em breve.
      </div>
    </div>
  );
};
