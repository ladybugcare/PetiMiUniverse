import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  behaviorTagLabel,
  behaviorTagLevel,
  isPredefinedBehaviorTag,
  normalizeBehaviorTags,
  PET_BEHAVIOR_TAG_DEFS,
} from './petBehaviorTags';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Prefixo de classe CSS: 'pet-wizard' ou 'hub-pets-behavior'. */
  variant?: 'pet-wizard' | 'hub-pets-behavior';
};

function chipClassName(variant: Props['variant'], key: string, selected: boolean): string {
  const base = variant === 'pet-wizard' ? 'pet-wizard__behavior-chip' : 'hub-pets-behavior__chip';
  const level = behaviorTagLevel(key);
  if (!selected) return base;
  return `${base} ${base}--on ${base}--${level}`;
}

export const PetBehaviorTagsPicker: React.FC<Props> = ({ value, onChange, variant = 'pet-wizard' }) => {
  const [customInput, setCustomInput] = useState('');

  const toggle = (key: string) => {
    if (value.includes(key)) {
      onChange(value.filter((t) => t !== key));
    } else {
      onChange(normalizeBehaviorTags([...value, key]));
    }
  };

  const removeCustom = (key: string) => {
    onChange(value.filter((t) => t !== key));
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setCustomInput('');
      return;
    }
    onChange(normalizeBehaviorTags([...value, trimmed]));
    setCustomInput('');
  };

  const customTags = value.filter((t) => !isPredefinedBehaviorTag(t));

  const inputClass = variant === 'pet-wizard' ? 'pet-wizard__input' : 'hub-clientes__input';
  const btnClass =
    variant === 'pet-wizard'
      ? 'pet-wizard__btn pet-wizard__btn--outline pet-wizard__behavior-add-btn'
      : 'hub-clientes__btn hub-clientes__btn--outline hub-pets-behavior__add-btn';
  const chipsWrapClass =
    variant === 'pet-wizard' ? 'pet-wizard__behavior-chips' : 'hub-pets-behavior__chips';
  const customRowClass =
    variant === 'pet-wizard' ? 'pet-wizard__behavior-custom-row' : 'hub-pets-behavior__custom-row';

  return (
    <div>
      <div className={chipsWrapClass}>
        {PET_BEHAVIOR_TAG_DEFS.map((def) => {
          const selected = value.includes(def.key);
          return (
            <button
              key={def.key}
              type="button"
              className={chipClassName(variant, def.key, selected)}
              aria-pressed={selected}
              onClick={() => toggle(def.key)}
            >
              {def.label}
            </button>
          );
        })}
      </div>

      {customTags.length > 0 ? (
        <div className={chipsWrapClass} style={{ marginTop: 10 }}>
          {customTags.map((tag) => (
            <span
              key={tag}
              className={`${chipClassName(variant, tag, true)} ${
                variant === 'pet-wizard' ? 'pet-wizard__behavior-chip--custom' : 'hub-pets-behavior__chip--custom'
              }`}
            >
              {behaviorTagLabel(tag)}
              <button
                type="button"
                className={
                  variant === 'pet-wizard'
                    ? 'pet-wizard__behavior-chip-remove'
                    : 'hub-pets-behavior__chip-remove'
                }
                aria-label={`Remover ${tag}`}
                onClick={() => removeCustom(tag)}
              >
                <X size={14} strokeWidth={2.25} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className={customRowClass}>
        <input
          className={inputClass}
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder="Outro comportamento ou alerta…"
          maxLength={100}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <button type="button" className={btnClass} onClick={addCustom} disabled={!customInput.trim()}>
          <Plus size={16} strokeWidth={2.25} aria-hidden />
          Adicionar
        </button>
      </div>
    </div>
  );
};
