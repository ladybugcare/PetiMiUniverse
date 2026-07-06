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
    <header className="vet-cockpit-header">
      <div className="vet-cockpit-header__date">{dateLabel}</div>
      <div className="vet-cockpit-header__stats">
        <div className="vet-cockpit-stat">
          <span className="vet-cockpit-stat__value">{summary.remaining}</span>
          <span className="vet-cockpit-stat__label">restantes</span>
        </div>
        <div className="vet-cockpit-stat vet-cockpit-stat--current">
          <span className="vet-cockpit-stat__label">Atual</span>
          <span className="vet-cockpit-stat__value vet-cockpit-stat__value--name">{currentName}</span>
        </div>
        <div className="vet-cockpit-stat">
          <span className="vet-cockpit-stat__label">Próximo</span>
          <span className="vet-cockpit-stat__value vet-cockpit-stat__value--name">{nextName}</span>
        </div>
        {summary.late > 0 ? (
          <div className="vet-cockpit-stat vet-cockpit-stat--late">
            <span className="vet-cockpit-stat__value">{summary.late}</span>
            <span className="vet-cockpit-stat__label">atrasados</span>
          </div>
        ) : null}
      </div>
    </header>
  );
};

export default VetCockpitHeader;
