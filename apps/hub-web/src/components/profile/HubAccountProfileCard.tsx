import React, { type ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

const HubAccountProfileCard: React.FC<Props> = ({ title, subtitle, actions, children }) => (
  <section className="hub-ap__card">
    <header className="hub-ap__card-head">
      <div>
        <h2 className="hub-ap__card-title">{title}</h2>
        {subtitle ? <p className="hub-ap__card-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="hub-ap__card-actions">{actions}</div> : null}
    </header>
    {children}
  </section>
);

export default HubAccountProfileCard;
