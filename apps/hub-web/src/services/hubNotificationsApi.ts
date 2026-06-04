import { apiRequest } from '@petimi/web-core';

export interface HubNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  created_at: string;
}

interface NotificationsResponse {
  notifications: HubNotification[];
}

interface UnreadCountResponse {
  unread_count: number;
}

export async function hubGetUnreadCount(userId: string): Promise<number> {
  const data = (await apiRequest(
    `/notifications/unread-count?user_id=${encodeURIComponent(userId)}`,
  )) as UnreadCountResponse;
  return typeof data?.unread_count === 'number' ? data.unread_count : 0;
}

export async function hubGetNotifications(
  userId: string,
  page = 1,
  limit = 12,
): Promise<HubNotification[]> {
  const qs = new URLSearchParams({
    user_id: userId,
    page: String(page),
    limit: String(limit),
  });
  const data = (await apiRequest(`/notifications?${qs}`)) as NotificationsResponse;
  return data?.notifications || [];
}

export async function hubMarkNotificationRead(id: string): Promise<void> {
  await apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT' });
}

export async function hubMarkAllNotificationsRead(userId: string): Promise<void> {
  await apiRequest('/notifications/read-all', {
    method: 'PUT',
    body: JSON.stringify({ user_id: userId }),
  });
}
