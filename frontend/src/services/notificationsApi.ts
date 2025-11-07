const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

// ========================================
// INTERFACES
// ========================================

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

// ========================================
// API FUNCTIONS
// ========================================

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

  const response = await fetch(`${API_BASE_URL}/notifications?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch notifications');
  }

  return response.json();
};

/**
 * Contar notificações não lidas
 */
export const getUnreadCount = async (userId: string): Promise<number> => {
  const response = await fetch(
    `${API_BASE_URL}/notifications/unread-count?user_id=${userId}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch unread count');
  }

  const data: UnreadCountResponse = await response.json();
  return data.unread_count;
};

/**
 * Marcar notificação como lida
 */
export const markAsRead = async (notificationId: string): Promise<Notification> => {
  const response = await fetch(
    `${API_BASE_URL}/notifications/${notificationId}/read`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to mark notification as read');
  }

  const data = await response.json();
  return data.notification;
};

/**
 * Marcar todas as notificações como lidas
 */
export const markAllAsRead = async (userId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/notifications/read-all`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId }),
  });

  if (!response.ok) {
    throw new Error('Failed to mark all notifications as read');
  }
};

/**
 * Deletar notificação específica
 */
export const deleteNotification = async (notificationId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to delete notification');
  }
};

/**
 * Limpar todas as notificações lidas
 */
export const clearReadNotifications = async (userId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/notifications/clear-read`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId }),
  });

  if (!response.ok) {
    throw new Error('Failed to clear read notifications');
  }
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

