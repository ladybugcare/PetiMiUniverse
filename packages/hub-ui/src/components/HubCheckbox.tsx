import React, { useEffect, useRef } from 'react';
import { Check, Minus } from 'lucide-react';
import './HubCheckbox.css';

export type HubCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
  disabled?: boolean;
  /** Estado parcial (ex.: activo em alguns serviços do grupo). */
  indeterminate?: boolean;
  id?: string;
  name?: string;
  value?: string;
  className?: string;
  /** Quando não há texto visível (ex.: célula de tabela). */
  ariaLabel?: string;
};

/**
 * Checkbox com visual do tema Hub (caixa terracotta + ícone de confirmação).
 * O input nativo permanece para acessibilidade e teclado.
 */
export const HubCheckbox: React.FC<HubCheckboxProps> = ({
  checked,
  onChange,
  children,
  disabled = false,
  indeterminate = false,
  id,
  name,
  value,
  className = '',
  ariaLabel,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate, checked]);

  const showCheck = checked && !indeterminate;
  const showMinus = indeterminate;

  return (
    <label
      className={['hub-checkbox', disabled ? 'hub-checkbox--disabled' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        ref={inputRef}
        type="checkbox"
        className="hub-checkbox__input"
        id={id}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-checked={indeterminate ? 'mixed' : checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={[
          'hub-checkbox__box',
          showMinus ? 'hub-checkbox__box--indeterminate' : '',
          showCheck ? 'hub-checkbox__box--checked' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden
      >
        {showMinus ? <Minus size={14} strokeWidth={3} /> : null}
        {showCheck ? <Check size={14} strokeWidth={3} /> : null}
      </span>
      {children != null ? <span className="hub-checkbox__label">{children}</span> : null}
    </label>
  );
};

export default HubCheckbox;
