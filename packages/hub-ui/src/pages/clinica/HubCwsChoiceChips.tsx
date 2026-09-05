import React from 'react';
import { X } from 'lucide-react';
import type { AnamnesisChip } from './anamnesisOptions';
import { examChoiceLabel, resolveExamChoice } from './physicalExamOptions';

type Props = {
  options: AnamnesisChip[];
  value: unknown;
  onChange: (next: string) => void;
  disabled?: boolean;
  ariaLabel: string;
};

export const HubCwsChoiceChips: React.FC<Props> = ({ options, value, onChange, disabled, ariaLabel }) => {
  const resolved = resolveExamChoice(value, options);
  const predefined = options.some((o) => o.key === resolved);
  const custom = resolved && !predefined ? resolved : '';

  return (
    <div className="hub-cws-chips" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = resolved === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            className={`hub-cws-chip${selected ? ` hub-cws-chip--on hub-cws-chip--${opt.level ?? 'info'}` : ''}`}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(selected ? '' : opt.key)}
          >
            {opt.label}
          </button>
        );
      })}
      {custom ? (
        <span className="hub-cws-chip hub-cws-chip--on hub-cws-chip--info hub-cws-chip--custom">
          {examChoiceLabel(custom, options)}
          {disabled ? null : (
            <button
              type="button"
              className="hub-cws-chip__remove"
              aria-label={`Remover ${custom}`}
              onClick={() => onChange('')}
            >
              <X size={14} strokeWidth={2.25} aria-hidden />
            </button>
          )}
        </span>
      ) : null}
    </div>
  );
};
