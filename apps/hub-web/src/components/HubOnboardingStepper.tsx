import React from 'react';

type Props = {
  steps: string[];
  activeStep: number;
};

const HubOnboardingStepper: React.FC<Props> = ({ steps, activeStep }) => {
  return (
    <div className="pet-wizard__stepper hub-onboarding-stepper-wrap" role="tablist" aria-label="Passos do cadastro">
      {steps.map((label, i) => {
        const isActive = i === activeStep;
        const isDone = i < activeStep;
        return (
          <React.Fragment key={label}>
            {i > 0 ? (
              <div
                className={`pet-wizard__stepper-line ${i <= activeStep ? 'pet-wizard__stepper-line--active' : ''}`}
                aria-hidden
              />
            ) : null}
            <div
              role="tab"
              aria-selected={isActive}
              className={[
                'pet-wizard__step-node',
                isActive ? 'pet-wizard__step-node--active' : '',
                isDone ? 'pet-wizard__step-node--done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="pet-wizard__step-node-num">{i + 1}</span>
              <span className="pet-wizard__step-node-label">{label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default HubOnboardingStepper;
