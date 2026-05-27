import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  formatMonthYearPt,
  getMonthGrid,
  todayYmd,
  WEEKDAY_LABELS_PT,
} from '../utils/hubCalendar';

export type HubDatePickerPanelProps = {
  viewYear: number;
  viewMonth0: number;
  onViewChange: (year: number, month0: number) => void;
  selectedIso: string;
  onSelect: (iso: string) => void;
  onClear: () => void;
  onToday: () => void;
};

export const HubDatePickerPanel: React.FC<HubDatePickerPanelProps> = ({
  viewYear,
  viewMonth0,
  onViewChange,
  selectedIso,
  onSelect,
  onClear,
  onToday,
}) => {
  const today = todayYmd();
  const cells = getMonthGrid(viewYear, viewMonth0);

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth0 + delta, 1);
    onViewChange(d.getFullYear(), d.getMonth());
  };

  return (
    <div className="hub-date-picker" role="dialog" aria-label="Selecionar data">
      <div className="hub-date-picker__head">
        <p className="hub-date-picker__month" id="hub-date-picker-month">
          {formatMonthYearPt(viewYear, viewMonth0)}
        </p>
        <div className="hub-date-picker__nav">
          <button
            type="button"
            className="hub-date-picker__nav-btn"
            onClick={() => shiftMonth(-1)}
            aria-label="Mês anterior"
          >
            <ChevronUp size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="hub-date-picker__nav-btn"
            onClick={() => shiftMonth(1)}
            aria-label="Próximo mês"
          >
            <ChevronDown size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="hub-date-picker__weekdays" aria-hidden>
        {WEEKDAY_LABELS_PT.map((w, i) => (
          <span key={`${w}-${i}`} className="hub-date-picker__weekday">
            {w}
          </span>
        ))}
      </div>

      <div className="hub-date-picker__grid" role="grid" aria-labelledby="hub-date-picker-month">
        {cells.map((cell) => {
          const isSelected = cell.iso === selectedIso;
          const isToday = cell.iso === today;
          return (
            <button
              key={cell.iso}
              type="button"
              role="gridcell"
              className={[
                'hub-date-picker__day',
                !cell.inMonth ? 'hub-date-picker__day--muted' : '',
                isSelected ? 'hub-date-picker__day--selected' : '',
                isToday ? 'hub-date-picker__day--today' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(cell.iso)}
              aria-label={cell.iso}
              aria-selected={isSelected}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <div className="hub-date-picker__foot">
        <button type="button" className="hub-date-picker__foot-btn" onClick={onClear}>
          Limpar
        </button>
        <button type="button" className="hub-date-picker__foot-btn" onClick={onToday}>
          Hoje
        </button>
      </div>
    </div>
  );
};

export default HubDatePickerPanel;
