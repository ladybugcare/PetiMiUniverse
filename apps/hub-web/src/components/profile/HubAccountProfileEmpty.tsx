import React, { type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type Props = {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  action?: ReactNode;
};

const HubAccountProfileEmpty: React.FC<Props> = ({ icon: Icon, title, subtitle, action }) => (
  <div className="hub-ap__empty">
    <div className="hub-ap__empty-icon" aria-hidden>
      <Icon size={22} strokeWidth={1.75} />
    </div>
    <p className="hub-ap__empty-title">{title}</p>
    <p className="hub-ap__empty-sub">{subtitle}</p>
    {action}
  </div>
);

export default HubAccountProfileEmpty;
