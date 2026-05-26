import React from 'react';
import { WIZARD_STEPS } from './types';

type Props = {
  activeStep: number;
  maxReached: number;
  onSelect: (i: number) => void;
};

export const PetWizardStepper: React.FC<Props> = ({ activeStep, maxReached, onSelect }) => {
  return (
    <div className="pet-wizard__stepper" role="tablist" aria-label="Passos do cadastro">
      {WIZARD_STEPS.map((label, i) => {
        const isActive = i === activeStep;
        const isDone = i < activeStep;
        const clickable = i <= maxReached;
        return (
          <React.Fragment key={label}>
            {i > 0 ? (
              <div
                className={`pet-wizard__stepper-line ${i <= activeStep ? 'pet-wizard__stepper-line--active' : ''}`}
                aria-hidden
              />
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'step' : undefined}
              className={[
                'pet-wizard__step-node',
                isActive ? 'pet-wizard__step-node--active' : '',
                isDone ? 'pet-wizard__step-node--done' : '',
                !clickable ? 'pet-wizard__step-node--locked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!clickable}
              onClick={() => clickable && onSelect(i)}
            >
              <span className="pet-wizard__step-node-num">{i + 1}</span>
              <span className="pet-wizard__step-node-label">{label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};
