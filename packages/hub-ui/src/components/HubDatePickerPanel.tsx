import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  datePickerYearMax,
  DATE_PICKER_YEAR_MIN,
  getMonthGrid,
  MONTH_LABELS_PT,
  MONTH_LABELS_SHORT_PT,
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

type PickerLevel = 'days' | 'months' | 'years';

const YEARS_PER_PAGE = 12;

function clampYear(year: number): number {
  return Math.min(datePickerYearMax(), Math.max(DATE_PICKER_YEAR_MIN, year));
}

function yearPageStart(year: number): number {
  const min = DATE_PICKER_YEAR_MIN;
  const offset = Math.max(0, year - min);
  return min + Math.floor(offset / YEARS_PER_PAGE) * YEARS_PER_PAGE;
}

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
  const [level, setLevel] = useState<PickerLevel>('days');
  const yearMax = datePickerYearMax();

  const years = useMemo(() => {
    const start = yearPageStart(viewYear);
    const list: number[] = [];
    for (let y = start; y < start + YEARS_PER_PAGE && y <= yearMax; y++) {
      list.push(y);
    }
    return list;
  }, [viewYear, yearMax]);

  const yearRangeLabel = years.length
    ? `${years[0]}–${years[years.length - 1]}`
    : String(viewYear);

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth0 + delta, 1);
    onViewChange(clampYear(d.getFullYear()), d.getMonth());
  };

  const shiftYearPage = (deltaPages: number) => {
    const next = clampYear(yearPageStart(viewYear) + deltaPages * YEARS_PER_PAGE);
    onViewChange(next, viewMonth0);
  };

  const canPrevYearPage = yearPageStart(viewYear) > DATE_PICKER_YEAR_MIN;
  const canNextYearPage = yearPageStart(viewYear) + YEARS_PER_PAGE <= yearMax;

  return (
    <div className="hub-date-picker" role="dialog" aria-label="Selecionar data">
      <div className="hub-date-picker__head">
        {level === 'days' ? (
          <div className="hub-date-picker__caption">
            <button
              type="button"
              className="hub-date-picker__caption-btn"
              onClick={() => setLevel('months')}
              aria-label={`Escolher mês, atual ${MONTH_LABELS_PT[viewMonth0]}`}
            >
              {MONTH_LABELS_PT[viewMonth0]}
              <ChevronDown size={14} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              className="hub-date-picker__caption-btn"
              onClick={() => setLevel('years')}
              aria-label={`Escolher ano, atual ${viewYear}`}
            >
              {viewYear}
              <ChevronDown size={14} strokeWidth={2} aria-hidden />
            </button>
          </div>
        ) : level === 'months' ? (
          <button
            type="button"
            className="hub-date-picker__caption-btn"
            onClick={() => setLevel('years')}
            aria-label={`Escolher ano, atual ${viewYear}`}
          >
            {viewYear}
            <ChevronDown size={14} strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <p className="hub-date-picker__month" id="hub-date-picker-month">
            {yearRangeLabel}
          </p>
        )}
        <div className="hub-date-picker__nav">
          <button
            type="button"
            className="hub-date-picker__nav-btn"
            onClick={() => {
              if (level === 'years') shiftYearPage(-1);
              else if (level === 'months') onViewChange(clampYear(viewYear - 1), viewMonth0);
              else shiftMonth(-1);
            }}
            aria-label={
              level === 'years' ? 'Anos anteriores' : level === 'months' ? 'Ano anterior' : 'Mês anterior'
            }
            disabled={
              level === 'years' ? !canPrevYearPage : level === 'months' ? viewYear <= DATE_PICKER_YEAR_MIN : false
            }
          >
            <ChevronUp size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="hub-date-picker__nav-btn"
            onClick={() => {
              if (level === 'years') shiftYearPage(1);
              else if (level === 'months') onViewChange(clampYear(viewYear + 1), viewMonth0);
              else shiftMonth(1);
            }}
            aria-label={
              level === 'years' ? 'Próximos anos' : level === 'months' ? 'Próximo ano' : 'Próximo mês'
            }
            disabled={
              level === 'years' ? !canNextYearPage : level === 'months' ? viewYear >= yearMax : false
            }
          >
            <ChevronDown size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {level === 'days' ? (
        <>
          <div className="hub-date-picker__weekdays" aria-hidden>
            {WEEKDAY_LABELS_PT.map((w, i) => (
              <span key={`${w}-${i}`} className="hub-date-picker__weekday">
                {w}
              </span>
            ))}
          </div>

          <div className="hub-date-picker__grid" role="grid" aria-label={`${MONTH_LABELS_PT[viewMonth0]} de ${viewYear}`}>
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
        </>
      ) : null}

      {level === 'months' ? (
        <div className="hub-date-picker__choice-grid" role="listbox" aria-label="Selecionar mês">
          {MONTH_LABELS_SHORT_PT.map((label, month0) => {
            const selected = month0 === viewMonth0;
            return (
              <button
                key={label}
                type="button"
                role="option"
                aria-selected={selected}
                className={[
                  'hub-date-picker__choice',
                  selected ? 'hub-date-picker__choice--selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  onViewChange(viewYear, month0);
                  setLevel('days');
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {level === 'years' ? (
        <div className="hub-date-picker__choice-grid" role="listbox" aria-label="Selecionar ano">
          {years.map((year) => {
            const selected = year === viewYear;
            return (
              <button
                key={year}
                type="button"
                role="option"
                aria-selected={selected}
                className={[
                  'hub-date-picker__choice',
                  selected ? 'hub-date-picker__choice--selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  onViewChange(year, viewMonth0);
                  setLevel('months');
                }}
              >
                {year}
              </button>
            );
          })}
        </div>
      ) : null}

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
