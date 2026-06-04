import type { FC } from 'react';
import type { LucideProps } from 'lucide-react';
import { Hotel, Layers, Scissors, Stethoscope, Syringe, Truck, Users, Building2 } from 'lucide-react';
import type { HubServiceGroupValue } from '../utils/serviceTypeSlug';

const GROUP_ICONS: Record<HubServiceGroupValue, FC<LucideProps>> = {
  banho_tosa: Scissors,
  hotel: Hotel,
  creche: Users,
  clinica: Stethoscope,
  cirurgia: Syringe,
  leva_traz: Truck,
  internacao: Building2,
  outros: Layers,
};

export interface ServiceGroupIconProps extends LucideProps {
  group: string;
}

/** Ícone distintivo por grupo operacional; use `color` = cor de acento do serviço. */
export function ServiceGroupIcon({ group, color, size = 20, strokeWidth = 2.1, ...rest }: ServiceGroupIconProps) {
  const Icon = GROUP_ICONS[group as HubServiceGroupValue] ?? GROUP_ICONS.outros;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} aria-hidden {...rest} />;
}
