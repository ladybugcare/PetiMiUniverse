import React from 'react';
import { formatBrTaxIdInput, type BrTaxIdMode } from '../utils/formatBrTaxId';

export type HubBrTaxIdInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  value: string;
  onChange: (value: string) => void;
  /** `auto` = CPF até 11 dígitos, depois CNPJ. */
  mode?: BrTaxIdMode;
};

const PLACEHOLDER: Record<BrTaxIdMode, string> = {
  auto: '000.000.000-00',
  cpf: '000.000.000-00',
  cnpj: '00.000.000/0000-00',
};

const MAX_LENGTH: Record<BrTaxIdMode, number> = {
  auto: 18,
  cpf: 14,
  cnpj: 18,
};

/** Input de CPF/CNPJ BR com máscara. */
export const HubBrTaxIdInput: React.FC<HubBrTaxIdInputProps> = ({
  value,
  onChange,
  mode = 'auto',
  className = '',
  placeholder = PLACEHOLDER[mode],
  maxLength = MAX_LENGTH[mode],
  disabled,
  autoComplete = 'off',
  ...rest
}) => (
  <input
    {...rest}
    type="text"
    inputMode="numeric"
    autoComplete={autoComplete}
    className={className}
    placeholder={placeholder}
    maxLength={maxLength}
    value={value}
    disabled={disabled}
    onChange={(e) => onChange(formatBrTaxIdInput(e.target.value, mode))}
  />
);
