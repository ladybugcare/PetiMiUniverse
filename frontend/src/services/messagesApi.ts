import { apiRequest } from './api';

// ========================================
// TIPOS
// ========================================
export interface Conversation {
  id: string;
  participant1_id: string;
  participant1_type: 'clinic' | 'vet' | 'freelancer' | 'admin';
  participant2_id: string;
  participant2_type: 'clinic' | 'vet' | 'freelancer' | 'admin';
  demand_id?: string;
  application_id?: string;
  archived_by_participant1: boolean;
  archived_by_participant2: boolean;
  last_message_at?: string;
  created_at: string;
  other_participant?: {
    id: string;
    type: 'clinic' | 'vet' | 'freelancer' | 'admin';
    name: string;
    photo_url?: string;
  };
  unread_count?: number;
  last_message?: {
    message: string;
    created_at: string;
    sender_id: string;
  };
  demand?: {
    id: string;
    title: string;
  };
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: 'clinic' | 'vet' | 'freelancer' | 'admin';
  message: string;
  read_at?: string;
  deleted_at?: string;
  created_at: string;
  sender_name?: string;
  sender_photo_url?: string;
  demand?: {
    id: string;
    title: string;
  };
}

export interface CreateConversationData {
  participant1_id: string;
  participant1_type: 'clinic' | 'vet' | 'freelancer' | 'admin';
  participant2_id: string;
  participant2_type: 'clinic' | 'vet' | 'freelancer' | 'admin';
  demand_id?: string;
  application_id?: string;
}

export interface SendMessageData {
  message: string;
  demand_id?: string;
}

export interface ReportMessageData {
  report_reason: string;
}

// ========================================
// API SERVICE
// ========================================
export const messagesApi = {
  // Criar nova conversa
  createConversation: async (data: CreateConversationData): Promise<{ conversation: Conversation }> => {
    return apiRequest('/api/messages/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Listar minhas conversas
  getMyConversations: async (): Promise<{ conversations: Conversation[] }> => {
    return apiRequest('/api/messages/conversations');
  },

  // Obter conversa específica com mensagens
  getConversation: async (conversationId: string): Promise<{ conversation: Conversation; messages: Message[] }> => {
    return apiRequest(`/api/messages/conversations/${conversationId}`);
  },

  // Obter apenas metadados da conversa (sem conteúdo)
  getConversationMetadata: async (conversationId: string): Promise<{ conversation: Conversation & { message_count: number } }> => {
    return apiRequest(`/api/messages/conversations/${conversationId}/metadata`);
  },

  // Enviar mensagem
  sendMessage: async (conversationId: string, data: SendMessageData): Promise<{ message: Message }> => {
    return apiRequest(`/api/messages/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Marcar mensagens como lidas
  markAsRead: async (conversationId: string): Promise<{ success: boolean }> => {
    return apiRequest(`/api/messages/conversations/${conversationId}/read`, {
      method: 'PATCH',
    });
  },

  // Arquivar/desarquivar conversa
  archiveConversation: async (conversationId: string, archive: boolean = true): Promise<{ success: boolean }> => {
    return apiRequest(`/api/messages/conversations/${conversationId}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ archive }),
    });
  },

  // Deletar mensagem (soft delete)
  deleteMessage: async (messageId: string): Promise<{ success: boolean }> => {
    return apiRequest(`/api/messages/messages/${messageId}`, {
      method: 'DELETE',
    });
  },

  // Reportar mensagem
  reportMessage: async (messageId: string, data: ReportMessageData): Promise<{ report: any }> => {
    return apiRequest(`/api/messages/messages/${messageId}/report`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Validar se par de participantes é permitido (helper)
  validateConversationPair: (type1: string, type2: string): boolean => {
    // Bloquear admin ↔ admin
    if (type1 === 'admin' && type2 === 'admin') {
      return false;
    }

    // Admin pode conversar com qualquer tipo (clinic, vet, freelancer)
    if (type1 === 'admin' || type2 === 'admin') {
      return true;
    }

    // Bloquear vet ↔ freelancer
    if (
      (type1 === 'vet' && type2 === 'freelancer') ||
      (type1 === 'freelancer' && type2 === 'vet')
    ) {
      return false;
    }

    // Permitir clinic ↔ vet e clinic ↔ freelancer
    if (
      (type1 === 'clinic' && (type2 === 'vet' || type2 === 'freelancer')) ||
      (type2 === 'clinic' && (type1 === 'vet' || type1 === 'freelancer'))
    ) {
      return true;
    }

    return false;
  },
};

