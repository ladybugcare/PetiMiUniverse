import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronDown } from 'lucide-react';
import { brDateToIso, isoDateToBr, normalizeBrDateTyping } from '../utils/hubBrDate';
import { parseIsoYmd, todayYmd } from '../utils/hubCalendar';
import { HubDatePickerPanel } from './HubDatePickerPanel';
import './HubDateField.css';

export type HubDateFieldProps = {
  id: string;
  /** YYYY-MM-DD ou string vazia */
  valueIso: string;
  onChangeIso: (iso: string) => void;
  /** Rótulo visível (renderizado em caixa alta via CSS). */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Texto de ajuda abaixo do campo. */
  hint?: string;
  /** Botão «Hoje» ao lado do campo (padrão: true). */
  showTodayButton?: boolean;
  className?: string;
};

type FloatingRect = { top: number; left: number; width: number };

function viewFromIso(iso: string): { year: number; month0: number } {
  const parsed = parseIsoYmd(iso);
  if (parsed) return { year: parsed.getFullYear(), month0: parsed.getMonth() };
  const now = new Date();
  return { year: now.getFullYear(), month0: now.getMonth() };
}

/**
 * Campo de data brasileiro (dd/mm/aaaa) com calendário para seleção, botão Hoje e estilo Hub.
 * Valor controlado em ISO (YYYY-MM-DD).
 */
export const HubDateField: React.FC<HubDateFieldProps> = ({
  id,
  valueIso,
  onChangeIso,
  label,
  placeholder = 'dd/mm/aaaa',
  disabled = false,
  required,
  hint,
  showTodayButton = true,
  className = '',
}) => {
  const hintId = useId();
  const pickerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(() => isoDateToBr(valueIso));
  const [open, setOpen] = useState(false);
  const [floating, setFloating] = useState<FloatingRect | null>(null);
  const [viewYear, setViewYear] = useState(() => viewFromIso(valueIso).year);
  const [viewMonth0, setViewMonth0] = useState(() => viewFromIso(valueIso).month0);

  useEffect(() => {
    setDraft(isoDateToBr(valueIso));
  }, [valueIso]);

  const invalid = draft.length >= 10 && !brDateToIso(draft);

  const commitDraft = useCallback(() => {
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
  }, [draft, onChangeIso, valueIso]);

  const applyIso = useCallback(
    (iso: string) => {
      onChangeIso(iso);
      setDraft(iso ? isoDateToBr(iso) : '');
      if (iso) {
        const v = viewFromIso(iso);
        setViewYear(v.year);
        setViewMonth0(v.month0);
      }
      setOpen(false);
    },
    [onChangeIso],
  );

  const openPicker = useCallback(() => {
    if (disabled) return;
    const v = viewFromIso(valueIso || todayYmd());
    setViewYear(v.year);
    setViewMonth0(v.month0);
    setOpen(true);
  }, [disabled, valueIso]);

  const updateFloating = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const margin = 8;
    const panelWidth = Math.max(rect.width, 280);
    let left = rect.left;
    const vw = window.innerWidth;
    if (left + panelWidth > vw - margin) {
      left = Math.max(margin, vw - margin - panelWidth);
    }
    setFloating({
      top: rect.bottom + 4,
      left,
      width: panelWidth,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setFloating(null);
      return;
    }
    updateFloating();
    const onWin = () => updateFloating();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open, updateFloating]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      commitDraft();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, commitDraft]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        commitDraft();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, commitDraft]);

  const rootClass = [
    'hub-date-field',
    disabled ? 'hub-date-field--disabled' : '',
    invalid ? 'hub-date-field--invalid' : '',
    open ? 'hub-date-field--open' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const panel =
    open && floating
      ? createPortal(
          <div
            ref={panelRef}
            id={pickerId}
            className="hub-date-picker--portal"
            style={{
              position: 'fixed',
              top: floating.top,
              left: floating.left,
              width: floating.width,
              zIndex: 11000,
            }}
          >
            <HubDatePickerPanel
              viewYear={viewYear}
              viewMonth0={viewMonth0}
              onViewChange={(y, m0) => {
                setViewYear(y);
                setViewMonth0(m0);
              }}
              selectedIso={valueIso}
              onSelect={applyIso}
              onClear={() => applyIso('')}
              onToday={() => applyIso(todayYmd())}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={rootClass} ref={rootRef}>
      {label ? (
        <label className="hub-date-field__label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <div className="hub-date-field__row">
        <div
          className={`hub-date-field__control ${open ? 'hub-date-field__control--open' : ''}`}
        >
          <button
            type="button"
            className="hub-date-field__icon-btn"
            onClick={openPicker}
            disabled={disabled}
            aria-label="Abrir calendário"
            aria-expanded={open}
            aria-controls={open ? pickerId : undefined}
          >
            <Calendar size={18} strokeWidth={2} aria-hidden />
          </button>
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={placeholder}
            className="hub-date-field__input"
            value={draft}
            onChange={(e) => setDraft(normalizeBrDateTyping(e.target.value))}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitDraft();
                setOpen(false);
              }
            }}
            disabled={disabled}
            maxLength={10}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={hint ? hintId : undefined}
            aria-haspopup="dialog"
            aria-expanded={open}
          />
          <button
            type="button"
            className="hub-date-field__chevron-btn"
            onClick={() => (open ? setOpen(false) : openPicker())}
            disabled={disabled}
            aria-label={open ? 'Fechar calendário' : 'Abrir calendário'}
            tabIndex={-1}
          >
            <ChevronDown
              size={18}
              strokeWidth={2}
              className={open ? 'hub-date-field__chevron--open' : ''}
              aria-hidden
            />
          </button>
        </div>
        {showTodayButton ? (
          <button
            type="button"
            className="hub-date-field__today"
            onClick={() => applyIso(todayYmd())}
            disabled={disabled}
          >
            Hoje
          </button>
        ) : null}
      </div>
      {invalid ? (
        <p className="hub-date-field__error" role="alert">
          Data inválida. Use o formato dd/mm/aaaa.
        </p>
      ) : hint ? (
        <p id={hintId} className="hub-date-field__hint">
          {hint}
        </p>
      ) : null}
      {panel}
    </div>
  );
};

export default HubDateField;
