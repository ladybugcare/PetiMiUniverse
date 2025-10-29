import React from 'react';

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
  stepLabels?: string[];
}

const ProgressBar: React.FC<ProgressBarProps> = ({ currentStep, totalSteps, stepLabels }) => {
  return (
    <div className="progress-bar-container">
      <div className="progress-bar-line">
        <div 
          className="progress-bar-fill" 
          style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }}
        />
      </div>
      
      <div className="progress-steps">
        {Array.from({ length: totalSteps }, (_, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          
          return (
            <div 
              key={stepNumber} 
              className={`progress-step ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
            >
              <div className="progress-step-circle">
                {isCompleted ? '✓' : stepNumber}
              </div>
              {stepLabels && stepLabels[index] && (
                <span className="progress-step-label">{stepLabels[index]}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProgressBar;

