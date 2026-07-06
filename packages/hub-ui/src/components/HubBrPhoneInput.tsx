import React from 'react';
import { formatBrPhoneInput } from '../utils/formatBrPhone';

export type HubBrPhoneInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  value: string;
  onChange: (value: string) => void;
};

/** Input de telefone BR com máscara (00) 00000-0000. */
export const HubBrPhoneInput: React.FC<HubBrPhoneInputProps> = ({
  value,
  onChange,
  className = '',
  placeholder = '(00) 00000-0000',
  maxLength = 16,
  disabled,
  autoComplete = 'tel',
  ...rest
}) => (
  <input
    {...rest}
    type="tel"
    inputMode="tel"
    autoComplete={autoComplete}
    className={className}
    placeholder={placeholder}
    maxLength={maxLength}
    value={value}
    disabled={disabled}
    onChange={(e) => onChange(formatBrPhoneInput(e.target.value))}
  />
);
