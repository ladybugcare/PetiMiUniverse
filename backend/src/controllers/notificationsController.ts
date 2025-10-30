import type { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// ========================================
// INTERFACES
// ========================================

interface NotificationData {
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
}

interface GetNotificationsQuery {
  user_id?: string;
  page?: string;
  limit?: string;
  unread_only?: string;
}

// ========================================
// HELPER: Criar Notificação (usado internamente)
// ========================================

export const createNotification = async (data: NotificationData): Promise<void> => {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert([{
        user_id: data.user_id,
        type: data.type,
        title: data.title,
        message: data.message,
        link: data.link || null,
        entity_type: data.entity_type || null,
        entity_id: data.entity_id || null,
        read: false
      }]);

    if (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  } catch (error) {
    console.error('Failed to create notification:', error);
    // Não lançar erro para não quebrar o fluxo principal
  }
};

// ========================================
// GET /notifications - Buscar notificações do usuário
// ========================================

export const getNotifications = async (
  req: Request<{}, {}, {}, GetNotificationsQuery>,
  res: Response
) => {
  const { user_id, page = '1', limit = '20', unread_only } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build query
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', user_id);

    // Filter by read status if requested
    if (unread_only === 'true') {
      query = query.eq('read', false);
    }

    // Apply pagination and ordering
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) throw error;

    res.json({
      notifications: data || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum)
      }
    });
  } catch (error: any) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ error: error.message || 'Failed to get notifications' });
  }
};

// ========================================
// GET /notifications/unread-count - Contar notificações não lidas
// ========================================

export const getUnreadCount = async (req: Request, res: Response) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id as string)
      .eq('read', false);

    if (error) throw error;

    res.json({ unread_count: count || 0 });
  } catch (error: any) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ error: error.message || 'Failed to get unread count' });
  }
};

// ========================================
// PUT /notifications/:id/read - Marcar notificação como lida
// ========================================

export const markAsRead = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Notification ID is required' });
  }

  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ notification: data });
  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: error.message || 'Failed to mark notification as read' });
  }
};

// ========================================
// PUT /notifications/read-all - Marcar todas como lidas
// ========================================

export const markAllAsRead = async (req: Request, res: Response) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user_id)
      .eq('read', false);

    if (error) throw error;

    res.json({ message: 'All notifications marked as read' });
  } catch (error: any) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: error.message || 'Failed to mark all notifications as read' });
  }
};

// ========================================
// DELETE /notifications/:id - Deletar notificação
// ========================================

export const deleteNotification = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Notification ID is required' });
  }

  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Notification deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: error.message || 'Failed to delete notification' });
  }
};

// ========================================
// DELETE /notifications/clear-read - Limpar notificações lidas
// ========================================

export const clearReadNotifications = async (req: Request, res: Response) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user_id)
      .eq('read', true);

    if (error) throw error;

    res.json({ message: 'Read notifications cleared successfully' });
  } catch (error: any) {
    console.error('Error clearing read notifications:', error);
    res.status(500).json({ error: error.message || 'Failed to clear read notifications' });
  }
};

