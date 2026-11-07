import { apiRequest } from './api';

// =================================// INTERFACES
// =================================
export interface Notification {
  id: string;
  user_id: string;
  type: 
    | 'application_received'
    | 'application_accepted'
    | 'application_rejected'
    | 'support_reply'
    | 'unit_invitation'
    | 'marketplace_message'
    | 'demand_status_changed'
    | 'new_demand_created';
  title: string;
  message: string;
  link?: string;
  entity_type?: string;
  entity_id?: string;
  read: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UnreadCountResponse {
  unread_count: number;
}

// =================================// API FUNCTIONS
// =================================
/**
 * Buscar notificações do usuário (paginadas)
 */
export const getNotifications = async (
  userId: string,
  page: number = 1,
  limit: number = 20,
  unreadOnly: boolean = false
): Promise<NotificationsResponse> => {
  const params = new URLSearchParams({
    user_id: userId,
    page: page.toString(),
    limit: limit.toString(),
  });

  if (unreadOnly) {
    params.append('unread_only', 'true');
  }

  return apiRequest(`/notifications?${params}`, { method: 'GET' });
};

/**
 * Contar notificações não lidas
 * Usa apiRequest para ter retry/throttling automático
 */
export const getUnreadCount = async (userId: string): Promise<number> => {
  try {
    const data: UnreadCountResponse = await apiRequest(
      `/notifications/unread-count?user_id=${userId}`,
      {
        method: 'GET',
      }
    );
    return data.unread_count;
  } catch (error: any) {
    // Melhorar mensagem de erro para incluir status 429
    if (error?.message?.includes('429') || error?.status === 429) {
      throw new Error('Muitas requisições. Aguarde alguns minutos.');
    }
    throw new Error(error?.message || 'Failed to fetch unread count');
  }
};

/**
 * Marcar notificação como lida
 */
export const markAsRead = async (notificationId: string): Promise<Notification> => {
  const data = await apiRequest(`/notifications/${notificationId}/read`, { method: 'PUT' });
  return data.notification;
};

/**
 * Marcar todas as notificações como lidas
 */
export const markAllAsRead = async (userId: string): Promise<void> => {
  await apiRequest('/notifications/read-all', {
    method: 'PUT',
    body: JSON.stringify({ user_id: userId }),
  });
};

/**
 * Deletar notificação específica
 */
export const deleteNotification = async (notificationId: string): Promise<void> => {
  await apiRequest(`/notifications/${notificationId}`, { method: 'DELETE' });
};

/**
 * Limpar todas as notificações lidas
 */
export const clearReadNotifications = async (userId: string): Promise<void> => {
  await apiRequest('/notifications/clear-read', {
    method: 'DELETE',
    body: JSON.stringify({ user_id: userId }),
  });
};

// Export all as default object
export const notificationsApi = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
};

export default notificationsApi;

