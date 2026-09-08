import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import {
  buildHm,
  hourOptions,
  minuteOptions,
  normalizeHmTyping,
  nowHm,
  parseHm,
  splitHm,
} from '../utils/hubTime';
import './HubTimeField.css';

export type HubTimeFieldProps = {
  id: string;
  /** HH:mm ou string vazia */
  valueHm: string;
  onChangeHm: (hm: string) => void;
  /** Rótulo visível (renderizado em caixa alta via CSS). */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
  /** Botão «Agora» ao lado do campo (padrão: false). */
  showNowButton?: boolean;
  /** Intervalo de minutos no seletor (1–30). Padrão: 1. */
  minuteStep?: number;
  className?: string;
};

type FloatingRect = { top: number; left: number; width: number };

/**
 * Campo de horário (HH:mm) com seletor em duas colunas (hora / minuto), estilo Hub.
 */
export const HubTimeField: React.FC<HubTimeFieldProps> = ({
  id,
  valueHm,
  onChangeHm,
  label,
  placeholder = '--:--',
  disabled = false,
  required,
  hint,
  showNowButton = false,
  minuteStep = 1,
  className = '',
}) => {
  const hintId = useId();
  const pickerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hourColRef = useRef<HTMLDivElement>(null);
  const minuteColRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(() => parseHm(valueHm) ?? valueHm);
  const [open, setOpen] = useState(false);
  const [floating, setFloating] = useState<FloatingRect | null>(null);
  const [pickHour, setPickHour] = useState<number | null>(() => splitHm(valueHm)?.hour ?? null);
  const [pickMinute, setPickMinute] = useState<number | null>(() => splitHm(valueHm)?.minute ?? null);

  const hours = useMemo(() => hourOptions(), []);
  const minutes = useMemo(() => minuteOptions(minuteStep), [minuteStep]);

  useEffect(() => {
    const parsed = parseHm(valueHm);
    setDraft(parsed ?? (valueHm.trim() ? valueHm : ''));
    const parts = splitHm(valueHm);
    setPickHour(parts?.hour ?? null);
    setPickMinute(parts?.minute ?? null);
  }, [valueHm]);

  const invalid = draft.length >= 5 && !parseHm(draft);

  const commitDraft = useCallback(() => {
    const parsed = parseHm(draft);
    if (parsed) {
      onChangeHm(parsed);
      return;
    }
    if (!draft.trim()) {
      onChangeHm('');
      return;
    }
    setDraft(parseHm(valueHm) ?? '');
  }, [draft, onChangeHm, valueHm]);

  const applyHm = useCallback(
    (hm: string) => {
      onChangeHm(hm);
      setDraft(hm);
      const parts = splitHm(hm);
      setPickHour(parts?.hour ?? null);
      setPickMinute(parts?.minute ?? null);
    },
    [onChangeHm],
  );

  const openPicker = useCallback(() => {
    if (disabled) return;
    const parts = splitHm(valueHm) ?? splitHm(nowHm());
    setPickHour(parts?.hour ?? null);
    setPickMinute(parts?.minute ?? null);
    setOpen(true);
  }, [disabled, valueHm]);

  const updateFloating = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const margin = 8;
    const panelWidth = Math.max(Math.min(rect.width, 200), 140);
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

  useLayoutEffect(() => {
    if (!open) return;
    const scrollSelected = (col: HTMLDivElement | null, selected: number | null) => {
      if (!col || selected == null) return;
      const el = col.querySelector<HTMLElement>(`[data-value="${selected}"]`);
      el?.scrollIntoView({ block: 'center' });
    };
    scrollSelected(hourColRef.current, pickHour);
    scrollSelected(minuteColRef.current, pickMinute);
  }, [open, pickHour, pickMinute]);

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

  const selectHour = (hour: number) => {
    setPickHour(hour);
    const minute = pickMinute ?? 0;
    setPickMinute(minute);
    applyHm(buildHm(hour, minute));
  };

  const selectMinute = (minute: number) => {
    setPickMinute(minute);
    const hour = pickHour ?? Math.min(23, Math.max(0, new Date().getHours()));
    setPickHour(hour);
    applyHm(buildHm(hour, minute));
    setOpen(false);
  };

  const rootClass = [
    'hub-time-field',
    disabled ? 'hub-time-field--disabled' : '',
    invalid ? 'hub-time-field--invalid' : '',
    open ? 'hub-time-field--open' : '',
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
            className="hub-time-picker--portal"
            role="dialog"
            aria-label="Selecionar horário"
            style={{
              position: 'fixed',
              top: floating.top,
              left: floating.left,
              width: floating.width,
              zIndex: 11000,
            }}
          >
            <div className="hub-time-picker">
              <div className="hub-time-picker__col" ref={hourColRef} aria-label="Hora">
                {hours.map((h) => (
                  <button
                    key={h}
                    type="button"
                    data-value={h}
                    className={`hub-time-picker__option${pickHour === h ? ' hub-time-picker__option--selected' : ''}`}
                    onClick={() => selectHour(h)}
                  >
                    {String(h).padStart(2, '0')}
                  </button>
                ))}
              </div>
              <div className="hub-time-picker__col" ref={minuteColRef} aria-label="Minuto">
                {minutes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-value={m}
                    className={`hub-time-picker__option${pickMinute === m ? ' hub-time-picker__option--selected' : ''}`}
                    onClick={() => selectMinute(m)}
                  >
                    {String(m).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={rootClass} ref={rootRef}>
      {label ? (
        <label className="hub-time-field__label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <div className="hub-time-field__row">
        <div className={`hub-time-field__control ${open ? 'hub-time-field__control--open' : ''}`}>
          <button
            type="button"
            className="hub-time-field__icon-btn"
            onClick={openPicker}
            disabled={disabled}
            aria-label="Abrir seletor de horário"
            aria-expanded={open}
            aria-controls={open ? pickerId : undefined}
          >
            <Clock size={18} strokeWidth={2} aria-hidden />
          </button>
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={placeholder}
            className="hub-time-field__input"
            value={draft}
            onChange={(e) => setDraft(normalizeHmTyping(e.target.value))}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitDraft();
                setOpen(false);
              }
            }}
            onClick={openPicker}
            disabled={disabled}
            maxLength={5}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={hint ? hintId : undefined}
            aria-haspopup="dialog"
            aria-expanded={open}
          />
          <button
            type="button"
            className="hub-time-field__icon-btn"
            onClick={() => (open ? setOpen(false) : openPicker())}
            disabled={disabled}
            aria-label={open ? 'Fechar seletor de horário' : 'Abrir seletor de horário'}
            tabIndex={-1}
          >
            <Clock size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {showNowButton ? (
          <button
            type="button"
            className="hub-time-field__now"
            onClick={() => {
              applyHm(nowHm());
              setOpen(false);
            }}
            disabled={disabled}
          >
            Agora
          </button>
        ) : null}
      </div>
      {invalid ? (
        <p className="hub-time-field__error" role="alert">
          Horário inválido. Use o formato HH:mm.
        </p>
      ) : hint ? (
        <p id={hintId} className="hub-time-field__hint">
          {hint}
        </p>
      ) : null}
      {panel}
    </div>
  );
};

export default HubTimeField;
