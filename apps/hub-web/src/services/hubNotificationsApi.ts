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

export type HubNotificationPrefCategory = 'acoes' | 'operacao' | 'alertas';

export type HubNotificationPrefsMap = Record<HubNotificationPrefCategory, boolean>;

export interface HubNotificationPrefsResponse {
  clinic_id: string;
  categories: HubNotificationPrefsMap;
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

export async function hubGetNotificationPrefs(clinicId: string): Promise<HubNotificationPrefsMap> {
  const qs = new URLSearchParams({ clinic_id: clinicId });
  const data = (await apiRequest(`/notifications/prefs?${qs}`)) as HubNotificationPrefsResponse;
  return {
    acoes: data?.categories?.acoes !== false,
    operacao: data?.categories?.operacao !== false,
    alertas: data?.categories?.alertas !== false,
  };
}

export async function hubUpdateNotificationPrefs(
  clinicId: string,
  categories: HubNotificationPrefsMap,
): Promise<HubNotificationPrefsMap> {
  const data = (await apiRequest('/notifications/prefs', {
    method: 'PUT',
    body: JSON.stringify({ clinic_id: clinicId, categories }),
  })) as HubNotificationPrefsResponse;
  return {
    acoes: data?.categories?.acoes !== false,
    operacao: data?.categories?.operacao !== false,
    alertas: data?.categories?.alertas !== false,
  };
}
