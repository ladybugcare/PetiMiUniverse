import {
  AlertTriangle,
  Bell,
  CircleDollarSign,
  LogIn,
  LogOut,
  PackageMinus,
  Sparkles,
  Truck,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

export type HubNotificationVisual = {
  Icon: LucideIcon;
  label: string;
  /** Cor do ícone e do rótulo de categoria. */
  color: string;
  /** Fundo da bolha do ícone. */
  tint: string;
};

const FALLBACK: HubNotificationVisual = {
  Icon: Bell,
  label: 'Aviso',
  color: '#525252',
  tint: '#f5f5f5',
};

const VISUALS: Record<string, HubNotificationVisual> = {
  hub_pet_ready: { Icon: Sparkles, label: 'Pet pronto', color: '#15803d', tint: '#dcfce7' },
  hub_pet_on_the_way: { Icon: Truck, label: 'Pet a caminho', color: '#1d4ed8', tint: '#dbeafe' },
  hub_payment_due: { Icon: CircleDollarSign, label: 'Cobrança', color: '#b45309', tint: '#fef3c7' },
  hub_cancellation_pending: {
    Icon: AlertTriangle,
    label: 'Cancelamento',
    color: '#b91c1c',
    tint: '#fee2e2',
  },
  hub_stock_alert: { Icon: PackageMinus, label: 'Estoque', color: '#c2410c', tint: '#ffedd5' },
  hub_boarding_checkin: { Icon: LogIn, label: 'Check-in', color: '#0f766e', tint: '#ccfbf1' },
  hub_boarding_checkout: { Icon: LogOut, label: 'Check-out', color: '#a16207', tint: '#fef9c3' },
  unit_invitation: { Icon: UserPlus, label: 'Convite', color: '#c86a4d', tint: '#fdece6' },
};

export function hubNotificationVisual(type: string | null | undefined): HubNotificationVisual {
  if (!type) return FALLBACK;
  return VISUALS[type] ?? FALLBACK;
}
