// Support Tickets API Service
import { apiRequest } from './api';

// ========================================
// TIPOS
// ========================================
export interface SupportTicket {
  id: string;
  user_id: string;
  user_role: 'clinic' | 'vet';
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  admin_reply: string | null;
  admin_id: string | null;
  user_read: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  last_message_at: string | null;
  last_message_by: 'user' | 'admin' | null;
  last_message?: TicketMessage;
  evaluation?: TicketEvaluation | null;
  unread_count?: number;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: 'user' | 'admin';
  message: string;
  read_by_receiver: boolean;
  created_at: string;
}

export interface TicketEvaluation {
  id: string;
  ticket_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface CreateTicketData {
  user_id: string;
  user_role: 'clinic' | 'vet';
  message: string;
}

export interface AddMessageData {
  sender_id: string;
  sender_role: 'user' | 'admin';
  message: string;
}

export interface CreateEvaluationData {
  rating: number;
  comment?: string;
}

export interface ReplyToTicketData {
  admin_id: string;
  admin_reply: string;
}

export interface UpdateStatusData {
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
}

export interface TicketsCount {
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  total: number;
}

// ========================================
// API SERVICE
// ========================================
export const supportTicketsApi = {
  // Criar novo ticket de suporte
  create: async (data: CreateTicketData): Promise<{ ticket: SupportTicket }> => {
    return apiRequest('/support/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Obter tickets do usuário logado
  getUserTickets: async (userId: string): Promise<{ tickets: SupportTicket[] }> => {
    return apiRequest(`/support/tickets/my?user_id=${userId}`);
  },

  // Obter todos os tickets (admin) com filtro opcional de status
  getAllTickets: async (status?: string): Promise<{ tickets: SupportTicket[] }> => {
    const statusParam = status ? `?status=${status}` : '';
    return apiRequest(`/support/tickets${statusParam}`);
  },

  // Responder a um ticket (admin)
  replyToTicket: async (
    ticketId: string,
    data: ReplyToTicketData
  ): Promise<{ ticket: SupportTicket }> => {
    return apiRequest(`/support/tickets/${ticketId}/reply`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Atualizar status de um ticket (admin)
  updateStatus: async (
    ticketId: string,
    data: UpdateStatusData
  ): Promise<{ ticket: SupportTicket }> => {
    return apiRequest(`/support/tickets/${ticketId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Obter contagem de tickets por status (admin)
  getTicketsCount: async (): Promise<{ counts: TicketsCount }> => {
    return apiRequest('/support/tickets/count');
  },

  // Marcar ticket como lido (usuário)
  markAsRead: async (ticketId: string): Promise<{ ticket: SupportTicket }> => {
    return apiRequest(`/support/tickets/${ticketId}/read`, {
      method: 'PATCH',
    });
  },

  // Obter contagem de mensagens não lidas (usuário)
  getUnreadCount: async (userId: string): Promise<{ unread_count: number }> => {
    return apiRequest(`/support/tickets/unread-count?user_id=${userId}`);
  },

  // Obter mensagens de um ticket
  getMessages: async (ticketId: string): Promise<{ messages: TicketMessage[] }> => {
    return apiRequest(`/support/tickets/${ticketId}/messages`);
  },

  // Adicionar mensagem a um ticket
  addMessage: async (
    ticketId: string,
    data: AddMessageData
  ): Promise<{ message: TicketMessage }> => {
    return apiRequest(`/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Marcar mensagens como lidas
  markMessagesAsRead: async (ticketId: string, userId: string): Promise<{ success: boolean }> => {
    return apiRequest(`/support/tickets/${ticketId}/messages/read?user_id=${userId}`, {
      method: 'PATCH',
    });
  },

  // Criar avaliação do ticket (auto-resolve)
  evaluateTicket: async (
    ticketId: string,
    data: CreateEvaluationData
  ): Promise<{ evaluation: TicketEvaluation; ticket: SupportTicket; message: string }> => {
    return apiRequest(`/support/tickets/${ticketId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

