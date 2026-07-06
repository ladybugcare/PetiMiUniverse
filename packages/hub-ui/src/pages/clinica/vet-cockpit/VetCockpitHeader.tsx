import React from 'react';
import type { TurnSummary } from './vetCockpitUtils';

type Props = {
  summary: TurnSummary;
  dateLabel: string;
};

const VetCockpitHeader: React.FC<Props> = ({ summary, dateLabel }) => {
  const currentName = summary.current?.pet?.name || '—';
  const nextName = summary.next?.pet?.name || '—';

  return (
    <section className="vet-cockpit-summary" aria-label="Resumo do dia">
      <p className="vet-cockpit-summary__date">{dateLabel}</p>
      <div className="hub-clientes__metrics vet-cockpit-summary__metrics">
        <div className="hub-clientes__metric-card">
          <div className="hub-clientes__metric-label">Restantes</div>
          <div className="hub-clientes__metric-value">{summary.remaining}</div>
        </div>
        <div className="hub-clientes__metric-card">
          <div className="hub-clientes__metric-label">Atual</div>
          <div className="hub-clientes__metric-value vet-cockpit-summary__metric-name">{currentName}</div>
        </div>
        <div className="hub-clientes__metric-card">
          <div className="hub-clientes__metric-label">Próximo</div>
          <div className="hub-clientes__metric-value vet-cockpit-summary__metric-name">{nextName}</div>
        </div>
        {summary.late > 0 ? (
          <div className="hub-clientes__metric-card vet-cockpit-summary__metric-card--late">
            <div className="hub-clientes__metric-label">Atrasados</div>
            <div className="hub-clientes__metric-value">{summary.late}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default VetCockpitHeader;
