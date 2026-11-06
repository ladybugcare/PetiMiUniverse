import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { HubDateField } from './HubDateField';
import { formatYmd, parseIsoYmd } from '../utils/hubCalendar';
import './HubViewDateToolbar.css';

export type HubDayNavProps = {
  /** Data selecionada (Date local ou ISO YYYY-MM-DD). */
  value: Date | string;
  onChange: (next: Date) => void;
  dateFieldId: string;
  disabled?: boolean;
  className?: string;
};

function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  return parseIsoYmd(value) ?? new Date();
}

function shiftDate(d: Date, delta: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + delta);
  return n;
}

/**
 * Navegação de dia no padrão da Clínica: ← → + HubDateField + Hoje.
 */
export function HubDayNav({ value, onChange, dateFieldId, disabled = false, className = '' }: HubDayNavProps) {
  const date = toDate(value);
  const iso = formatYmd(date);

  return (
    <div className={`hub-view-date-toolbar__nav-cluster${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="hub-view-date-toolbar__icon-btn"
        aria-label="Dia anterior"
        onClick={() => onChange(shiftDate(date, -1))}
        disabled={disabled}
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        className="hub-view-date-toolbar__icon-btn"
        aria-label="Próximo dia"
        onClick={() => onChange(shiftDate(date, 1))}
        disabled={disabled}
      >
        <ChevronRight size={18} />
      </button>
      <HubDateField
        id={dateFieldId}
        className="hub-view-date-toolbar__date-field"
        valueIso={iso}
        onChangeIso={(nextIso) => {
          if (!nextIso) return;
          const parsed = parseIsoYmd(nextIso);
          if (parsed) onChange(parsed);
        }}
        disabled={disabled}
        showTodayButton
      />
    </div>
  );
}

export default HubDayNav;
