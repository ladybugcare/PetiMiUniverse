import React, { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function HubCwsCardHeader({
  title,
  extra,
  expanded,
  onToggle,
  bodyId,
}: {
  title: React.ReactNode;
  extra?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  bodyId: string;
}) {
  return (
    <div className="hub-cws-card__head">
      <h2 className="hub-cws-card__title">{title}</h2>
      <div className="hub-cws-card__head-actions">
        {extra}
        <button
          type="button"
          className="hub-cws-collapse-btn"
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={expanded ? 'Recolher seção' : 'Expandir seção'}
          onClick={onToggle}
        >
          {expanded ? <ChevronUp size={18} strokeWidth={2.25} /> : <ChevronDown size={18} strokeWidth={2.25} />}
        </button>
      </div>
    </div>
  );
}

export function HubCwsCollapsibleCard({
  id,
  title,
  extra,
  description,
  className,
  children,
}: {
  id?: string;
  title: React.ReactNode;
  extra?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const reactId = useId();
  const bodyId = `${id ?? 'cws-card'}-body-${reactId}`;

  return (
    <section
      id={id}
      className={`hub-cws-section hub-cws-card${className ? ` ${className}` : ''}${expanded ? '' : ' hub-cws-card--collapsed'}`}
    >
      <HubCwsCardHeader
        title={title}
        extra={extra}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        bodyId={bodyId}
      />
      <div id={bodyId} hidden={!expanded}>
        {description ? <p className="hub-cws-card__lead">{description}</p> : null}
        {children}
      </div>
    </section>
  );
}
