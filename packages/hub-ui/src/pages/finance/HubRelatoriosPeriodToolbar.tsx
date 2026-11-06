import React, { useMemo } from 'react';
import { HubDateField } from '../../components/HubDateField';
import {
  defaultRangeForPreset,
  type HubReportPeriod,
} from './hubRelatoriosPeriod';

type HubRelatoriosPeriodToolbarProps = {
  variant: 'standard' | 'absent' | 'lookahead';
  period: HubReportPeriod;
  onChange: (next: HubReportPeriod) => void;
  /** Compacto ao lado do título do relatório. */
  inline?: boolean;
};

type PresetOption = { days: number; label: string };

const PRESETS: Record<HubRelatoriosPeriodToolbarProps['variant'], PresetOption[]> = {
  standard: [
    { days: 7, label: '7 dias' },
    { days: 30, label: '30 dias' },
    { days: 90, label: '90 dias' },
  ],
  absent: [
    { days: 30, label: '30 dias' },
    { days: 60, label: '60 dias' },
    { days: 90, label: '90 dias' },
    { days: 180, label: '180 dias' },
  ],
  lookahead: [
    { days: 7, label: '7 dias' },
    { days: 14, label: '14 dias' },
    { days: 30, label: '30 dias' },
    { days: 60, label: '60 dias' },
  ],
};

export const HubRelatoriosPeriodToolbar: React.FC<HubRelatoriosPeriodToolbarProps> = ({
  variant,
  period,
  onChange,
  inline = false,
}) => {
  const range = useMemo(() => {
    if (period.mode === 'range') return { from: period.from, to: period.to };
    return defaultRangeForPreset(period.days);
  }, [period]);

  const rangeError = range.from > range.to;
  const isCustom = variant === 'standard' && period.mode === 'range';

  const label =
    variant === 'absent' ? 'Sem atividade há' : variant === 'lookahead' ? 'Próximos' : 'Período';

  return (
    <div
      className={
        inline
          ? 'hub-relatorios__period-toolbar hub-relatorios__period-toolbar--inline'
          : 'hub-clientes__toolbar hub-relatorios__period-toolbar'
      }
    >
      <div className="hub-relatorios__period-group">
        {inline ? null : <span className="hub-clientes__label">{label}</span>}
        <div className="hub-relatorios__segmented" role="group" aria-label={label}>
          {PRESETS[variant].map((opt) => {
            const active = period.mode === 'preset' && period.days === opt.days;
            return (
              <button
                key={opt.days}
                type="button"
                className={
                  active
                    ? 'hub-relatorios__segmented-btn hub-relatorios__segmented-btn--active'
                    : 'hub-relatorios__segmented-btn'
                }
                aria-pressed={active}
                onClick={() => onChange({ mode: 'preset', days: opt.days })}
              >
                {opt.label}
              </button>
            );
          })}
          {variant === 'standard' ? (
            <button
              type="button"
              className={
                isCustom
                  ? 'hub-relatorios__segmented-btn hub-relatorios__segmented-btn--active'
                  : 'hub-relatorios__segmented-btn'
              }
              aria-pressed={isCustom}
              onClick={() => onChange({ mode: 'range', from: range.from, to: range.to })}
            >
              Personalizado
            </button>
          ) : null}
        </div>
      </div>

      {isCustom ? (
        <div className="hub-relatorios__period-custom">
          <HubDateField
            id="relatorios-from"
            label="De"
            valueIso={period.from}
            onChangeIso={(from) => onChange({ mode: 'range', from, to: period.to })}
            showTodayButton={false}
            className="hub-relatorios__date-field"
          />
          <HubDateField
            id="relatorios-to"
            label="Até"
            valueIso={period.to}
            onChangeIso={(to) => onChange({ mode: 'range', from: period.from, to })}
            showTodayButton={false}
            className="hub-relatorios__date-field"
          />
          {rangeError ? (
            <p className="hub-relatorios__period-error">A data inicial não pode ser depois da final.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default HubRelatoriosPeriodToolbar;
