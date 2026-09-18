import React, { type ReactNode } from 'react';

type Props = {
  title: string;
  subtitle: string;
  action: ReactNode;
};

const HubAccountProfileActionRow: React.FC<Props> = ({ title, subtitle, action }) => (
  <div className="hub-ap__action-row">
    <div className="hub-ap__action-row-copy">
      <p className="hub-ap__action-row-title">{title}</p>
      <p className="hub-ap__action-row-sub">{subtitle}</p>
    </div>
    {action}
  </div>
);

export default HubAccountProfileActionRow;
