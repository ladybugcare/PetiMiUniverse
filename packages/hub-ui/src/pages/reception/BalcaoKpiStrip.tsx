import React from 'react';
import type { BalcaoFilterChip } from './balcaoBoard';

export type BalcaoKpiCounts = {
  chegadas: number;
  saidas: number;
  cobrar: number;
  atencao: number;
};

const KPIS: { id: BalcaoFilterChip; label: string; countKey: keyof BalcaoKpiCounts; attention?: boolean }[] = [
  { id: 'chegadas', label: 'Chegadas', countKey: 'chegadas' },
  { id: 'saidas', label: 'Saídas', countKey: 'saidas' },
  { id: 'cobrar', label: 'Cobranças', countKey: 'cobrar' },
  { id: 'atencao', label: 'Atenção', countKey: 'atencao', attention: true },
];

export type BalcaoKpiStripProps = {
  filter: BalcaoFilterChip;
  counts: BalcaoKpiCounts;
  showCobrar: boolean;
  onChange: (next: BalcaoFilterChip) => void;
};

const BalcaoKpiStrip: React.FC<BalcaoKpiStripProps> = ({ filter, counts, showCobrar, onChange }) => {
  return (
    <div
      className="hub-clientes__metrics hub-clinic-metrics hub-grooming-page__metrics-grid hub-balcao__metrics"
      role="toolbar"
      aria-label="Indicadores do balcão"
    >
      {KPIS.map((kpi) => {
        if (kpi.id === 'cobrar' && !showCobrar) return null;
        const active = filter === kpi.id;
        const value = counts[kpi.countKey];
        return (
          <button
            key={kpi.id}
            type="button"
            className={[
              'hub-clientes__metric-card',
              'hub-grooming-page__metric-btn',
              active ? 'hub-grooming-page__metric-btn--active' : '',
              kpi.attention && value > 0 ? 'hub-grooming-page__metric-card--late' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-pressed={active}
            onClick={() => onChange(active ? 'tudo' : kpi.id)}
          >
            <span className="hub-clientes__metric-value">{value}</span>
            <span className="hub-clientes__metric-label">{kpi.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default BalcaoKpiStrip;
