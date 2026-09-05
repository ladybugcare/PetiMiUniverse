import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { AnamnesisChip } from './anamnesisOptions';

type Props = {
  options: AnamnesisChip[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  allowCustom?: boolean;
  customPlaceholder?: string;
  labelFor?: (key: string) => string;
};

function chipClass(level: AnamnesisChip['level'], selected: boolean): string {
  const base = 'hub-cws-chip';
  if (!selected) return base;
  return `${base} ${base}--on ${base}--${level ?? 'info'}`;
}

export const HubAnamnesisChipPicker: React.FC<Props> = ({
  options,
  value,
  onChange,
  disabled = false,
  allowCustom = true,
  customPlaceholder = 'Outra opção…',
  labelFor,
}) => {
  const [customInput, setCustomInput] = useState('');
  const predefinedKeys = new Set(options.map((o) => o.key));
  const customValues = value.filter((v) => !predefinedKeys.has(v));

  const toggle = (key: string) => {
    if (disabled) return;
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  };

  const addCustom = () => {
    if (disabled) return;
    const trimmed = customInput.trim();
    if (!trimmed || value.includes(trimmed)) {
      setCustomInput('');
      return;
    }
    onChange([...value, trimmed]);
    setCustomInput('');
  };

  return (
    <div>
      <div className="hub-cws-chips">
        {options.map((opt) => {
          const selected = value.includes(opt.key);
          return (
            <button
              key={opt.key}
              type="button"
              className={chipClass(opt.level, selected)}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => toggle(opt.key)}
            >
              {opt.label}
            </button>
          );
        })}
        {customValues.map((tag) => (
          <span key={tag} className={`${chipClass('info', true)} hub-cws-chip--custom`}>
            {labelFor?.(tag) ?? tag}
            {disabled ? null : (
              <button
                type="button"
                className="hub-cws-chip__remove"
                aria-label={`Remover ${tag}`}
                onClick={() => onChange(value.filter((v) => v !== tag))}
              >
                <X size={14} strokeWidth={2.25} aria-hidden />
              </button>
            )}
          </span>
        ))}
      </div>
      {allowCustom && !disabled ? (
        <div className="hub-cws-chip-add">
          <input
            className="hub-cws-chip-add__input"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder={customPlaceholder}
            maxLength={80}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <button
            type="button"
            className="hub-cws-chip-add__btn"
            onClick={addCustom}
            disabled={!customInput.trim()}
          >
            <Plus size={15} strokeWidth={2.25} aria-hidden />
            Adicionar
          </button>
        </div>
      ) : null}
    </div>
  );
};
