import type {
  HubSupportTicketCategory,
  HubSupportTicketPriority,
  HubSupportTicketStatus,
} from '../../api/hubSupportTicketsApi';

export const HUB_SUPPORT_CATEGORY_LABELS: Record<HubSupportTicketCategory, string> = {
  técnico: 'Problema técnico',
  financeiro: 'Financeiro / plano',
  conta_perfil: 'Conta e acesso',
  outro: 'Outro assunto',
};

export const HUB_SUPPORT_PRIORITY_LABELS: Record<HubSupportTicketPriority, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const HUB_SUPPORT_STATUS_LABELS: Record<HubSupportTicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em análise',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

export function hubSupportCategoryLabel(category: string | null | undefined): string {
  if (!category) return 'Outro assunto';
  return HUB_SUPPORT_CATEGORY_LABELS[category as HubSupportTicketCategory] ?? 'Outro assunto';
}
