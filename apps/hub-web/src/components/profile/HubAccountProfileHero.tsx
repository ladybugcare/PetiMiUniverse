import React, { type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type HubAccountProfileChip = {
  icon: LucideIcon;
  label: string;
};

export type HubAccountProfileMeta = {
  label: string;
  value: string;
};

type Props = {
  kicker: string;
  name: string;
  photo: ReactNode;
  badges?: string[];
  chips?: HubAccountProfileChip[];
  meta?: HubAccountProfileMeta[];
};

const HubAccountProfileHero: React.FC<Props> = ({ kicker, name, photo, badges = [], chips = [], meta = [] }) => (
  <header className="hub-ap__hero">
    <div className="hub-ap__hero-photo">{photo}</div>
    <div className="hub-ap__hero-body">
      <p className="hub-ap__hero-kicker">{kicker}</p>
      <p className="hub-ap__hero-name">{name}</p>
      {badges.length > 0 ? (
        <div className="hub-ap__hero-badges">
          {badges.map((badge) => (
            <span key={badge} className="hub-ap__badge">
              {badge}
            </span>
          ))}
        </div>
      ) : null}
      {chips.length > 0 ? (
        <ul className="hub-ap__chips">
          {chips.map((chip) => {
            const Icon = chip.icon;
            return (
              <li key={chip.label} className="hub-ap__chip">
                <Icon className="hub-ap__chip-icon" size={15} strokeWidth={1.75} aria-hidden />
                <span className="hub-ap__chip-text">{chip.label}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {meta.length > 0 ? (
        <div className="hub-ap__meta">
          {meta.map((item) => (
            <div key={item.label} className="hub-ap__meta-item">
              <span className="hub-ap__meta-label">{item.label}</span>
              <span className="hub-ap__meta-value">{item.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  </header>
);

export default HubAccountProfileHero;
