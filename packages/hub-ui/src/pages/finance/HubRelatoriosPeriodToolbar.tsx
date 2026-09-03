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
};

export const HubRelatoriosPeriodToolbar: React.FC<HubRelatoriosPeriodToolbarProps> = ({
  variant,
  period,
  onChange,
}) => {
  const presetValue = period.mode === 'preset' ? String(period.days) : 'custom';
  const range = useMemo(() => {
    if (period.mode === 'range') return { from: period.from, to: period.to };
    return defaultRangeForPreset(period.days);
  }, [period]);

  const rangeError = range.from > range.to;

  const label =
    variant === 'absent' ? 'Sem atividade há' : variant === 'lookahead' ? 'Próximos' : 'Período';

  return (
    <div className="hub-clientes__toolbar hub-relatorios__period-toolbar">
      <div className="hub-servicos__filter-field">
        <span className="hub-clientes__label">{label}</span>
        <select
          className="hub-clientes__select-input"
          value={presetValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'custom') {
              onChange({ mode: 'range', from: range.from, to: range.to });
              return;
            }
            onChange({ mode: 'preset', days: Number(v) });
          }}
        >
          {variant === 'absent' ? (
            <>
              <option value={30}>30 dias</option>
              <option value={60}>60 dias</option>
              <option value={90}>90 dias</option>
              <option value={180}>180 dias</option>
            </>
          ) : variant === 'lookahead' ? (
            <>
              <option value={7}>7 dias</option>
              <option value={14}>14 dias</option>
              <option value={30}>30 dias</option>
              <option value={60}>60 dias</option>
            </>
          ) : (
            <>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </>
          )}
          {variant === 'standard' ? <option value="custom">Personalizado…</option> : null}
        </select>
      </div>

      {variant === 'standard' && period.mode === 'range' ? (
        <>
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
        </>
      ) : null}
    </div>
  );
};

export default HubRelatoriosPeriodToolbar;
