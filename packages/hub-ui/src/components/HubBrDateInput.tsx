import React, { useEffect, useState } from 'react';
import { brDateToIso, isoDateToBr, normalizeBrDateTyping } from '../utils/hubBrDate';

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

/**
 * Input de data dd/mm/aaaa sem moldura Hub (rótulo/ícones).
 * Preferir {@link HubDateField} em telas novas.
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
