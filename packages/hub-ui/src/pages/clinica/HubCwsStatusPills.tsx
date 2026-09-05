import React from 'react';

export type HubCwsStatusPill = {
  label: string;
  value: number;
  tone?: 'default' | 'amber' | 'green';
};

export function HubCwsStatusPills({ items }: { items: HubCwsStatusPill[] }) {
  return (
    <div className="hub-cws-exam-summary">
      {items.map((it) => (
        <div
          key={it.label}
          className={`hub-cws-exam-pill${
            it.tone === 'amber' ? ' hub-cws-exam-pill--amber' : it.tone === 'green' ? ' hub-cws-exam-pill--green' : ''
          }`}
        >
          <span>{it.label}</span>
          <strong>{it.value}</strong>
        </div>
      ))}
    </div>
  );
}
