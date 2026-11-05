/**
 * Spec da home “Hoje na unidade” (`/hub/dashboard`).
 * Cards só aparecem se o usuário tiver a permissão; módulos sem dado útil
 * mostram empty state, não KPI inventado.
 */

export const TODAY_DASHBOARD_PAGE_TITLE = 'Hoje na unidade';

export const TODAY_DASHBOARD_PERMISSIONS = [
  'hub.appointments.read',
  'hub.clinic.read',
  'grooming.queue.read',
  'boarding.reservations.read',
  'pickup.routes.read',
  'hub.financial.read',
  'hub.inventory.read',
] as const;

export type TodayOpsCardId = 'agenda' | 'clinic' | 'grooming' | 'boarding' | 'pickup';

export type TodayOpsCardSpec = {
  id: TodayOpsCardId;
  label: string;
  permission: string;
  href: string;
  /** Métrica principal (rótulo curto). */
  primaryHint: string;
  /** Métrica secundária (rótulo curto). */
  secondaryHint: string;
};

export const TODAY_OPS_CARDS: TodayOpsCardSpec[] = [
  {
    id: 'agenda',
    label: 'Agenda',
    permission: 'hub.appointments.read',
    href: '/hub/appointments',
    primaryHint: 'Agendamentos hoje',
    secondaryHint: 'Por grupo de serviço',
  },
  {
    id: 'clinic',
    label: 'Clínica',
    permission: 'hub.clinic.read',
    href: '/hub/clinica',
    primaryHint: 'Fila do dia',
    secondaryHint: 'Aguardando · em atendimento · concluídos',
  },
  {
    id: 'grooming',
    label: 'Banho & Tosa',
    permission: 'grooming.queue.read',
    href: '/hub/banho-tosa',
    primaryHint: 'Fila do dia',
    secondaryHint: 'Em serviço · aguardando · prontos',
  },
  {
    id: 'boarding',
    label: 'Hotel & Creche',
    permission: 'boarding.reservations.read',
    href: '/hub/hotel-creche',
    primaryHint: 'Ocupação',
    secondaryHint: 'Check-ins previstos hoje',
  },
  {
    id: 'pickup',
    label: 'Leva e Traz',
    permission: 'pickup.routes.read',
    href: '/hub/leva-e-traz',
    primaryHint: 'Rotas do dia',
    secondaryHint: 'Paradas pendentes',
  },
];
