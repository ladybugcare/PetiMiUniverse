import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import LoadingOverlay from '../components/LoadingOverlay';
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
  Trash2,
  Check
} from 'lucide-react';
import IconWrapper from '../components/IconWrapper';
import { notificationsApi, Notification } from '../services/notificationsApi';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';
import { colors } from '../styles/colors';

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const userId = user?.id;

  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'VET';
  const { menuItems } = useSidebarMenu(userRole);

  // Load notifications
  const loadNotifications = async (currentPage: number = 1) => {
    if (!userId) return;
    setLoading(true);
    try {
      const unreadOnly = filter === 'unread';
      const response = await notificationsApi.getNotifications(userId, currentPage, 20, unreadOnly);
      
      let filteredNotifications = response.notifications;
      if (filter === 'read') {
        filteredNotifications = response.notifications.filter(n => n.read);
      }

      setNotifications(filteredNotifications);
      setTotalPages(response.pagination.totalPages);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications(page);
  }, [userId, filter, page]);

  // Mark as read and navigate
  const handleNotificationClick = async (notification: Notification) => {
    try {
      if (!notification.read) {
        await notificationsApi.markAsRead(notification.id);
        setNotifications(prev =>
          prev.map(n => (n.id === notification.id ? { ...n, read: true } : n))
        );
      }

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
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  // Clear read notifications
  const handleClearRead = async () => {
    if (!userId) return;
    if (!window.confirm('Deseja remover todas as notificações lidas?')) return;
    
    try {
      await notificationsApi.clearReadNotifications(userId);
      await loadNotifications(1);
      setPage(1);
    } catch (error) {
      console.error('Error clearing read notifications:', error);
    }
  };

  // Delete notification
  const handleDelete = async (notificationId: string) => {
    try {
      await notificationsApi.deleteNotification(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  // Get icon for notification type
  const getNotificationIcon = (type: string) => {
    const iconProps = { size: 24 };
    switch (type) {
      case 'application_received':
        return <IconWrapper icon={UserPlus} {...iconProps} color={colors.brand.primary[500]} />;
      case 'application_accepted':
        return <IconWrapper icon={CheckCircle} {...iconProps} color={colors.success[500]} />;
      case 'application_rejected':
        return <IconWrapper icon={XCircle} {...iconProps} color={colors.error[500]} />;
      case 'support_reply':
        return <IconWrapper icon={MessageCircle} {...iconProps} color={colors.info[500]} />;
      case 'unit_invitation':
        return <IconWrapper icon={Mail} {...iconProps} color={colors.warning[500]} />;
      case 'marketplace_message':
        return <IconWrapper icon={MessageSquare} {...iconProps} color={colors.brand.secondary[500]} />;
      case 'demand_status_changed':
        return <IconWrapper icon={AlertCircle} {...iconProps} color={colors.warning[500]} />;
      case 'new_demand_created':
        return <IconWrapper icon={Briefcase} {...iconProps} color={colors.brand.primary[500]} />;
      default:
        return <IconWrapper icon={Bell} {...iconProps} color={colors.neutral[600]} />;
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins} minuto${diffMins > 1 ? 's' : ''} atrás`;
    if (diffHours < 24) return `${diffHours} hora${diffHours > 1 ? 's' : ''} atrás`;
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `${diffDays} dias atrás`;
    
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
    <DashboardLayout pageName="Notificações" menuItems={menuItems}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>
              <IconWrapper icon={Bell} size={28} style={{ marginRight: '12px' }} />
              Notificações
            </h1>
            <p style={styles.subtitle}>
              {unreadCount > 0 
                ? `Você tem ${unreadCount} notificação${unreadCount > 1 ? 'ões' : ''} não lida${unreadCount > 1 ? 's' : ''}`
                : 'Todas as notificações foram lidas'}
            </p>
          </div>
          
          <div style={styles.headerActions}>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllAsRead} style={styles.actionButton}>
                <IconWrapper icon={Check} size={18} />
                Marcar todas como lidas
              </button>
            )}
            <button onClick={handleClearRead} style={styles.actionButtonSecondary}>
              <Trash2 size={18} />
              Limpar lidas
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={styles.filters}>
          <button
            onClick={() => setFilter('all')}
            style={{
              ...styles.filterButton,
              ...(filter === 'all' ? styles.filterButtonActive : {}),
            }}
          >
            Todas ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            style={{
              ...styles.filterButton,
              ...(filter === 'unread' ? styles.filterButtonActive : {}),
            }}
          >
            Não lidas ({unreadCount})
          </button>
          <button
            onClick={() => setFilter('read')}
            style={{
              ...styles.filterButton,
              ...(filter === 'read' ? styles.filterButtonActive : {}),
            }}
          >
            Lidas ({notifications.length - unreadCount})
          </button>
        </div>

        {/* Notifications List */}
        {notifications.length === 0 ? (
          <div style={styles.empty}>
            <IconWrapper icon={Bell} size={64} color="#d1d5db" />
            <h3 style={styles.emptyTitle}>Nenhuma notificação</h3>
            <p style={styles.emptyText}>
              {filter === 'unread'
                ? 'Você não tem notificações não lidas'
                : filter === 'read'
                ? 'Você não tem notificações lidas'
                : 'Você não tem notificações'}
            </p>
          </div>
        ) : (
          <div style={styles.notificationsList}>
            {notifications.map((notification) => (
              <div
                key={notification.id}
                style={{
                  ...styles.notificationCard,
                  ...(notification.read ? {} : styles.notificationCardUnread),
                }}
              >
                <div
                  onClick={() => handleNotificationClick(notification)}
                  style={styles.notificationContent}
                >
                  <div style={styles.notificationIconWrapper}>
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div style={styles.notificationBody}>
                    <div style={styles.notificationHeader}>
                      <h3 style={styles.notificationTitle}>
                        {notification.title}
                      </h3>
                      {!notification.read && <div style={styles.unreadBadge}>Nova</div>}
                    </div>
                    <p style={styles.notificationMessage}>{notification.message}</p>
                    <span style={styles.notificationTime}>
                      {formatDate(notification.created_at)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(notification.id)}
                  style={styles.deleteButton}
                  aria-label="Remover notificação"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={styles.pagination}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                ...styles.paginationButton,
                ...(page === 1 ? styles.paginationButtonDisabled : {}),
              }}
            >
              Anterior
            </button>
            <span style={styles.paginationInfo}>
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                ...styles.paginationButton,
                ...(page === totalPages ? styles.paginationButtonDisabled : {}),
              }}
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
    <LoadingOverlay visible={loading} label="Carregando notificações..." />
    </>
  );
};

// Styles
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
    gap: '20px',
    flexWrap: 'wrap',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '28px',
    fontWeight: '600',
    color: '#262626',
    margin: '0 0 8px 0',
    display: 'flex',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#ffffff',
    backgroundColor: colors.brand.primary[500],
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  actionButtonSecondary: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#525252',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  filters: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    padding: '0',
    borderBottom: '1px solid #e5e5e5',
  },
  filterButton: {
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#737373',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  filterButtonActive: {
    color: colors.brand.primary[500],
    borderBottomColor: colors.brand.primary[500],
  },
  loading: {
    padding: '60px 20px',
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: '16px',
  },
  empty: {
    padding: '60px 20px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  emptyTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#525252',
    margin: 0,
  },
  emptyText: {
    fontSize: '14px',
    color: '#9ca3af',
    margin: 0,
  },
  notificationsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  notificationCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    padding: '20px',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    transition: 'all 0.2s ease',
  },
  notificationCardUnread: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  notificationContent: {
    flex: 1,
    display: 'flex',
    gap: '16px',
    cursor: 'pointer',
    minWidth: 0,
  },
  notificationIconWrapper: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    backgroundColor: '#f9fafb',
  },
  notificationBody: {
    flex: 1,
    minWidth: 0,
  },
  notificationHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  notificationTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  unreadBadge: {
    padding: '4px 8px',
    fontSize: '11px',
    fontWeight: '600',
    color: colors.brand.primary[500],
    backgroundColor: colors.brand.primary[50],
    borderRadius: '6px',
  },
  notificationMessage: {
    fontSize: '14px',
    color: '#525252',
    margin: '0 0 8px 0',
    lineHeight: '1.5',
  },
  notificationTime: {
    fontSize: '13px',
    color: '#9ca3af',
  },
  deleteButton: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#9ca3af',
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    marginTop: '32px',
  },
  paginationButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#525252',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  paginationButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  paginationInfo: {
    fontSize: '14px',
    color: '#737373',
  },
};

export default NotificationsPage;

