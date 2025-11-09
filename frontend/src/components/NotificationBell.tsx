import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  UserPlus, 
  CheckCircle, 
  XCircle, 
  MessageCircle, 
  Mail, 
  MessageSquare, 
  AlertCircle, 
  Briefcase,
  X
} from 'lucide-react';
import { notificationsApi, Notification } from '../services/notificationsApi';
import { useAuth } from '../AuthContext';
import IconWrapper from './IconWrapper';

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const lastRequestTimeRef = useRef(0);
  const errorCountRef = useRef(0);
  const pollingPausedRef = useRef(false);

  // Memoizar userId para evitar re-renders desnecessários
  const userId = useMemo(() => user?.id, [user?.id]);

  // Detectar se está em desenvolvimento
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                        process.env.REACT_APP_ENV === 'development' ||
                        window.location.hostname === 'localhost';

  // Load unread count com throttling e tratamento de erro
  const loadUnreadCount = useCallback(async () => {
    if (!userId) return;
    
    // Se polling está pausado devido a muitos erros 429, não fazer requisição
    if (pollingPausedRef.current) {
      return;
    }
    
    // Throttle: não fazer requisição se a última foi há menos de 3 segundos
    const now = Date.now();
    const throttleMs = isDevelopment ? 3000 : 2000;
    if (now - lastRequestTimeRef.current < throttleMs) {
      return;
    }
    
    // Se já está carregando, não fazer nova requisição
    if (isLoadingRef.current) {
      return;
    }
    
    // Se houve muitos erros (429), aumentar o throttle significativamente
    if (errorCountRef.current > 2) {
      const backoffMs = errorCountRef.current > 5 ? 60000 : 30000; // 60s se muitos erros, 30s se alguns
      if (now - lastRequestTimeRef.current < backoffMs) {
        return;
      }
    }
    
    isLoadingRef.current = true;
    lastRequestTimeRef.current = now;
    
    try {
      const count = await notificationsApi.getUnreadCount(userId);
      setUnreadCount(count);
      errorCountRef.current = 0; // Reset error count em caso de sucesso
      pollingPausedRef.current = false; // Retomar polling se estava pausado
    } catch (error: any) {
      console.error('Error loading unread count:', error);
      
      // Se for erro 429, incrementar contador de erros e pausar polling
      if (error?.message?.includes('429') || error?.status === 429 || error?.message?.includes('Muitas requisições')) {
        errorCountRef.current += 1;
        
        // Se muitos erros 429, pausar polling temporariamente (5 minutos)
        if (errorCountRef.current > 3) {
          pollingPausedRef.current = true;
          console.warn('[NotificationBell] Muitos erros 429, pausando polling por 5 minutos');
          
          // Retomar após 5 minutos
          setTimeout(() => {
            pollingPausedRef.current = false;
            errorCountRef.current = 0;
            console.log('[NotificationBell] Polling retomado após pausa');
          }, 5 * 60 * 1000);
        }
      }
    } finally {
      isLoadingRef.current = false;
    }
  }, [userId, isDevelopment]);

  // Load notifications list
  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const response = await notificationsApi.getNotifications(userId, 1, 10);
      setNotifications(response.notifications);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Polling: Update unread count (intervalo maior em desenvolvimento devido ao StrictMode)
  useEffect(() => {
    if (!userId) return;
    
    // Carregar imediatamente apenas uma vez
    loadUnreadCount();
    
    // Intervalo maior em desenvolvimento (60s) para compensar StrictMode que duplica requisições
    // Em produção/staging: 30s é suficiente
    const pollingInterval = isDevelopment ? 60000 : 30000;
    
    const interval = setInterval(() => {
      loadUnreadCount();
    }, pollingInterval);
    
    return () => clearInterval(interval);
  }, [userId, loadUnreadCount, isDevelopment]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Toggle dropdown and load notifications
  const handleToggle = async () => {
    if (!isOpen) {
      await loadNotifications();
    }
    setIsOpen(!isOpen);
  };

  // Mark notification as read and navigate
  const handleNotificationClick = async (notification: Notification) => {
    try {
      if (!notification.read) {
        await notificationsApi.markAsRead(notification.id);
        setUnreadCount(prev => Math.max(0, prev - 1));
      }

      setIsOpen(false);

      if (notification.link) {
        navigate(notification.link);
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    if (!userId) return;
    try {
      await notificationsApi.markAllAsRead(userId);
      setUnreadCount(0);
      setNotifications(prev => 
        prev.map(n => ({ ...n, read: true }))
      );
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  // Delete notification
  const handleDelete = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    try {
      await notificationsApi.deleteNotification(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      await loadUnreadCount();
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  // Get icon for notification type
  const getNotificationIcon = (type: string) => {
    const iconProps = { size: 20 };
    switch (type) {
      case 'application_received':
        return <IconWrapper icon={UserPlus} {...iconProps} color="#7c3aed" />;
      case 'application_accepted':
        return <IconWrapper icon={CheckCircle} {...iconProps} color="#22c55e" />;
      case 'application_rejected':
        return <IconWrapper icon={XCircle} {...iconProps} color="#ef4444" />;
      case 'support_reply':
        return <IconWrapper icon={MessageCircle} {...iconProps} color="#0ea5e9" />;
      case 'unit_invitation':
        return <IconWrapper icon={Mail} {...iconProps} color="#f59e0b" />;
      case 'marketplace_message':
        return <IconWrapper icon={MessageSquare} {...iconProps} color="#ec4899" />;
      case 'demand_status_changed':
        return <IconWrapper icon={AlertCircle} {...iconProps} color="#f97316" />;
      case 'new_demand_created':
        return <IconWrapper icon={Briefcase} {...iconProps} color="#8b5cf6" />;
      default:
        return <IconWrapper icon={Bell} {...iconProps} color="#6b7280" />;
    }
  };

  // Format relative time
  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}m atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays < 7) return `${diffDays}d atrás`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  return (
    <div style={styles.container} ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={handleToggle}
        style={styles.bellButton}
        aria-label="Notificações"
      >
        <IconWrapper icon={Bell} size={20} />
        {unreadCount > 0 && (
          <span style={styles.badge}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div style={styles.dropdown}>
          {/* Header */}
          <div style={styles.header}>
            <h3 style={styles.title}>Notificações</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                style={styles.markAllButton}
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div style={styles.list}>
            {loading ? (
              <div style={styles.loading}>Carregando...</div>
            ) : notifications.length === 0 ? (
              <div style={styles.empty}>
                <IconWrapper icon={Bell} size={32} color="#d1d5db" />
                <p style={styles.emptyText}>Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  style={{
                    ...styles.notificationItem,
                    ...(notification.read ? {} : styles.notificationItemUnread),
                  }}
                >
                  <div style={styles.notificationIcon}>
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div style={styles.notificationContent}>
                    <div style={styles.notificationHeader}>
                      <h4 style={styles.notificationTitle}>
                        {notification.title}
                      </h4>
                      {!notification.read && <div style={styles.unreadDot} />}
                    </div>
                    <p style={styles.notificationMessage}>
                      {notification.message}
                    </p>
                    <span style={styles.notificationTime}>
                      {getRelativeTime(notification.created_at)}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, notification.id)}
                    style={styles.deleteButton}
                    aria-label="Remover notificação"
                  >
                    <IconWrapper icon={X} size={16} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={styles.footer}>
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/notifications');
                }}
                style={styles.viewAllButton}
              >
                Ver todas as notificações
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Styles
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: 'relative',
  },
  bellButton: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#525252',
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'background-color 0.2s ease',
  },
  badge: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '18px',
    height: '18px',
    padding: '0 4px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: '600',
    borderRadius: '9999px',
    border: '2px solid #ffffff',
  },
  dropdown: {
    position: 'absolute',
    top: '50px',
    right: '0',
    width: '400px',
    maxWidth: '90vw',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e5e5',
    zIndex: 1000,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #f5f5f5',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  markAllButton: {
    fontSize: '12px',
    color: '#7c3aed',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '500',
    padding: '4px 8px',
  },
  list: {
    maxHeight: '400px',
    overflowY: 'auto',
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    color: '#9ca3af',
  },
  empty: {
    padding: '40px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  emptyText: {
    color: '#9ca3af',
    margin: 0,
  },
  notificationItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px 20px',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    borderBottom: '1px solid #f5f5f5',
  },
  notificationItemUnread: {
    backgroundColor: '#eff6ff',
  },
  notificationIcon: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: '#f9fafb',
  },
  notificationContent: {
    flex: 1,
    minWidth: 0,
  },
  notificationHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  notificationTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  unreadDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#7c3aed',
    flexShrink: 0,
  },
  notificationMessage: {
    fontSize: '13px',
    color: '#525252',
    margin: '0 0 4px 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  notificationTime: {
    fontSize: '12px',
    color: '#9ca3af',
  },
  deleteButton: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#9ca3af',
    cursor: 'pointer',
    borderRadius: '6px',
    transition: 'all 0.2s ease',
  },
  footer: {
    padding: '12px 20px',
    borderTop: '1px solid #f5f5f5',
  },
  viewAllButton: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#7c3aed',
    backgroundColor: 'transparent',
    border: '1px solid #e9d5ff',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};

export default NotificationBell;

