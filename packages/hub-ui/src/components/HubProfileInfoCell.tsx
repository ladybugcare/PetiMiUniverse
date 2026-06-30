import React from 'react';
import type { LucideIcon } from 'lucide-react';

const terracotta = '#c86a4d';

type Props = {
  icon: LucideIcon;
  label: string;
  value: string;
  iconColor?: string;
};

export const HubProfileInfoCell: React.FC<Props> = ({
  icon: Icon,
  label,
  value,
  iconColor = terracotta,
}) => (
  <div className="hub-meu-perfil__cell">
    <div className="hub-meu-perfil__cell-icon" aria-hidden>
      <Icon size={20} strokeWidth={1.75} color={iconColor} />
    </div>
    <div className="hub-meu-perfil__cell-label">{label}</div>
    <div className="hub-meu-perfil__cell-value">{value}</div>
  </div>
);
