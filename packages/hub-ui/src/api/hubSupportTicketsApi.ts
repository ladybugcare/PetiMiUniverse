import { apiRequest } from '@petimi/web-core';

/** Fila de suporte PetiMi compartilhada com o Shift; o Hub sempre usa `product=hub`. */
const base = '/support/tickets';
const PRODUCT = 'hub';

export type HubSupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type HubSupportTicketCategory = 'técnico' | 'financeiro' | 'conta_perfil' | 'outro';
export type HubSupportTicketPriority = 'baixa' | 'normal' | 'alta' | 'urgente';

export interface HubTicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_role: 'user' | 'admin';
  message: string;
  read_by_receiver: boolean;
  created_at: string;
}

export interface HubTicketEvaluation {
  id: string;
  ticket_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface HubSupportTicket {
  id: string;
  user_id: string | null;
  product: 'hub' | 'shift';
  clinic_id: string | null;
  message: string | null;
  status: HubSupportTicketStatus;
  category?: string | null;
  priority?: HubSupportTicketPriority | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  last_message_at: string | null;
  last_message_by: 'user' | 'admin' | null;
  last_message?: HubTicketMessage | null;
  evaluation?: HubTicketEvaluation | null;
  unread_count?: number;
}

export interface CreateHubSupportTicketPayload {
  user_id: string;
  clinic_id: string | null;
  message: string;
  category: HubSupportTicketCategory;
  priority: HubSupportTicketPriority;
}

export const hubSupportTicketsApi = {
  async create(payload: CreateHubSupportTicketPayload): Promise<HubSupportTicket> {
    const data = (await apiRequest(base, {
      method: 'POST',
      body: JSON.stringify({ ...payload, user_role: 'clinic', product: PRODUCT, attachments: [] }),
    })) as { ticket: HubSupportTicket };
    return data.ticket;
  },

  async listMine(userId: string): Promise<HubSupportTicket[]> {
    const data = (await apiRequest(
      `${base}/my?${new URLSearchParams({ user_id: userId, product: PRODUCT })}`,
    )) as { tickets?: HubSupportTicket[] };
    return data?.tickets ?? [];
  },

  async unreadCount(userId: string): Promise<number> {
    const data = (await apiRequest(
      `${base}/unread-count?${new URLSearchParams({ user_id: userId, product: PRODUCT })}`,
    )) as { unread_count?: number };
    return typeof data?.unread_count === 'number' ? data.unread_count : 0;
  },

  async getMessages(ticketId: string): Promise<HubTicketMessage[]> {
    const data = (await apiRequest(`${base}/${encodeURIComponent(ticketId)}/messages`)) as {
      messages?: HubTicketMessage[];
    };
    return data?.messages ?? [];
  },

  async addMessage(ticketId: string, senderId: string, message: string): Promise<void> {
    await apiRequest(`${base}/${encodeURIComponent(ticketId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ sender_id: senderId, sender_role: 'user', message }),
    });
  },

  async markMessagesRead(ticketId: string, userId: string): Promise<void> {
    await apiRequest(
      `${base}/${encodeURIComponent(ticketId)}/messages/read?${new URLSearchParams({ user_id: userId })}`,
      { method: 'PATCH' },
    );
  },

  async evaluate(ticketId: string, rating: number, comment?: string): Promise<void> {
    await apiRequest(`${base}/${encodeURIComponent(ticketId)}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment: comment?.trim() || undefined }),
    });
  },
};

/** Disparado após criar ticket, enviar mensagem ou ler respostas — atualiza badges. */
export const HUB_SUPPORT_TICKETS_UPDATED_EVENT = 'hub-support-tickets-updated';

export function notifyHubSupportTicketsUpdated(): void {
  window.dispatchEvent(new Event(HUB_SUPPORT_TICKETS_UPDATED_EVENT));
}
