import React from 'react';

/** Passo 2: módulo clínico ainda não ligado — layout alinhado ao mock. */
export const PetWizardStepHealth: React.FC = () => {
  return (
    <div className="pet-wizard__step-pane">
      <h3 className="pet-wizard__section-title">Saúde e comportamento</h3>
      <div className="pet-wizard__empty">
        Esta área será preenchida com vacinas, alergias, comportamento e histórico clínico quando o módulo de saúde
        estiver ligado ao Hub. Nenhum dado deste passo é salvo nesta versão.
      </div>
    </div>
  );
};
