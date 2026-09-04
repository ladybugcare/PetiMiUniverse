import React from 'react';
import { ChevronDown } from 'lucide-react';

type Props = {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
};

const VetCockpitOpsSection: React.FC<Props> = ({ id, title, open, onToggle, actions, children }) => {
  const headingId = `vet-cockpit-ops-${id}`;

  return (
    <section className="vet-cockpit-ops" aria-labelledby={headingId}>
      <div className="vet-cockpit-ops__header">
        <button
          type="button"
          className="vet-cockpit-ops__toggle"
          aria-expanded={open}
          aria-controls={`${headingId}-body`}
          onClick={onToggle}
        >
          <span id={headingId} className="vet-cockpit-ops__title">
            {title}
          </span>
          <ChevronDown
            size={16}
            className={`vet-cockpit-ops__chevron${open ? ' vet-cockpit-ops__chevron--open' : ''}`}
            aria-hidden
          />
        </button>
        {actions ? <div className="vet-cockpit-ops__actions">{actions}</div> : null}
      </div>
      {open ? (
        <div className="vet-cockpit-ops__body" id={`${headingId}-body`}>
          {children}
        </div>
      ) : null}
    </section>
  );
};

export default VetCockpitOpsSection;
