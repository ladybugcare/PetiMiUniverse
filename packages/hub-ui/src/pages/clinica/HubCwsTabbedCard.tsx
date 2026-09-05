import React, { useId, useState } from 'react';
import { HubCwsCardHeader } from './HubCwsCollapsibleCard';

export type HubCwsTab = {
  id: string;
  label: string;
};

type Props = {
  id: string;
  title: string;
  description?: string;
  tabs: HubCwsTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children: React.ReactNode;
  /** Conteúdo sempre visível abaixo das abas (ex.: listagem unificada). */
  footer?: React.ReactNode;
};

export function HubCwsTabbedCard({
  id,
  title,
  description,
  tabs,
  activeTab,
  onTabChange,
  children,
  footer,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const reactId = useId();
  const bodyId = `${id}-body-${reactId}`;

  return (
    <section
      id={id}
      className={`hub-cws-section hub-cws-card${expanded ? '' : ' hub-cws-card--collapsed'}`}
    >
      <HubCwsCardHeader
        title={title}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        bodyId={bodyId}
      />
      <div id={bodyId} hidden={!expanded}>
        {description ? <p className="hub-cws-card__lead">{description}</p> : null}
        <div className="hub-cws-tabs" role="tablist" aria-label={title}>
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={tab.id}
                className={`hub-cws-tab${selected ? ' hub-cws-tab--on' : ''}`}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {children}
        {footer ? <div className="hub-cws-tabbed-footer">{footer}</div> : null}
      </div>
    </section>
  );
}

export function HubCwsTabPanel({
  id,
  active,
  labelledBy,
  children,
}: {
  id: string;
  active: boolean;
  labelledBy: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      hidden={!active}
      className="hub-cws-tab-panel"
    >
      {children}
    </div>
  );
}
