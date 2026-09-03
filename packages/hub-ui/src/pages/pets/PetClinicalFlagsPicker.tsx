import React from 'react';
import { PET_CLINICAL_FLAG_OPTIONS } from './petClinicalFlags';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  variant?: 'pet-wizard' | 'hub-pets-behavior';
  disabled?: boolean;
};

export const PetClinicalFlagsPicker: React.FC<Props> = ({
  value,
  onChange,
  variant = 'pet-wizard',
  disabled = false,
}) => {
  const toggle = (key: string) => {
    if (disabled) return;
    if (value.includes(key)) onChange(value.filter((k) => k !== key));
    else onChange([...value, key]);
  };

  const chipsWrapClass = variant === 'pet-wizard' ? 'pet-wizard__behavior-chips' : 'hub-pets-behavior__chips';
  const base = variant === 'pet-wizard' ? 'pet-wizard__behavior-chip' : 'hub-pets-behavior__chip';

  return (
    <div className={chipsWrapClass}>
      {PET_CLINICAL_FLAG_OPTIONS.map((opt) => {
        const selected = value.includes(opt.key);
        const level = opt.key === 'aggressive' || opt.key === 'allergy' ? 'danger' : 'warning';
        const onClass = selected ? `${base} ${base}--on ${base}--${level}` : base;
        return (
          <button
            key={opt.key}
            type="button"
            className={onClass}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => toggle(opt.key)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
