import React, { useEffect, useState } from 'react';
import { brDateToIso, isoDateToBr } from '../pages/clientes/formatters';

export type HubBrDateInputProps = {
  id: string;
  /** YYYY-MM-DD ou string vazia */
  valueIso: string;
  onChangeIso: (iso: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  required?: boolean;
};

/** Formata digitação para dd/mm/aaaa (até 8 dígitos). */
function normalizeBrDateTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * Campo de data em texto dd/mm/aaaa, alinhado ao Hub (evita o date picker nativo).
 * Valor externo em ISO; ao blur valida e reverte texto inválido.
 */
export const HubBrDateInput: React.FC<HubBrDateInputProps> = ({
  id,
  valueIso,
  onChangeIso,
  disabled,
  className = '',
  placeholder = 'dd/mm/aaaa',
  required,
}) => {
  const [draft, setDraft] = useState(() => isoDateToBr(valueIso));

  useEffect(() => {
    setDraft(isoDateToBr(valueIso));
  }, [valueIso]);

  const commit = () => {
    const iso = brDateToIso(draft);
    if (iso) {
      onChangeIso(iso);
      return;
    }
    if (!draft.trim()) {
      onChangeIso('');
      return;
    }
    setDraft(isoDateToBr(valueIso));
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="bday"
      placeholder={placeholder}
      className={className}
      value={draft}
      onChange={(e) => setDraft(normalizeBrDateTyping(e.target.value))}
      onBlur={commit}
      disabled={disabled}
      maxLength={10}
      required={required}
      aria-invalid={draft.length >= 10 && !brDateToIso(draft)}
    />
  );
};
