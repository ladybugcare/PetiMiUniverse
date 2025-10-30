import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import { marketplaceMessagesApi, Conversation } from '../services/marketplaceMessagesApi';
import { ShoppingCart, PlusCircle, Package, MessageSquare } from 'lucide-react';
import colors from '../styles/colors';

const MarketplaceMessagesPage: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const menuItems: MenuItem[] = [
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: <ShoppingCart size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'criar-anuncio',
      label: 'Criar Anúncio',
      icon: <PlusCircle size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/marketplace/create',
    },
    {
      id: 'meus-anuncios',
      label: 'Meus Anúncios',
      icon: <Package size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/marketplace/my-listings',
    },
    {
      id: 'mensagens',
      label: 'Mensagens',
      icon: <MessageSquare size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/marketplace/messages',
    },
  ];

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const result = await marketplaceMessagesApi.getMyConversations(user.id);
      setConversations(result.conversations);
    } catch (error: any) {
      console.error('Error loading conversations:', error);
      alert('Erro ao carregar conversas: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unread_count, 0);

  return (
    <DashboardLayout
      pageName="Mensagens"
      menuItems={menuItems}
      notificationCount={totalUnread}
    >
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Mensagens do Marketplace</h1>
            <p style={styles.subtitle}>
              {totalUnread > 0
                ? `Você tem ${totalUnread} mensagem${totalUnread > 1 ? 's' : ''} não lida${totalUnread > 1 ? 's' : ''}`
                : 'Todas as mensagens foram lidas'}
            </p>
          </div>
        </div>

        {/* Conversations List */}
        {loading ? (
          <div style={styles.loading}>Carregando conversas...</div>
        ) : conversations.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyIcon}>💬</p>
            <p style={styles.emptyText}>Nenhuma conversa ainda</p>
            <p style={styles.emptyHint}>
              Quando alguém entrar em contato sobre seus anúncios, as mensagens aparecerão aqui
            </p>
          </div>
        ) : (
          <div style={styles.conversationsList}>
            {conversations.map((conversation) => (
              <div key={`${conversation.item_id}-${conversation.other_user_id}`} style={styles.conversationCard}>
                {/* Item Image */}
                <div style={styles.conversationImage}>
                  {conversation.item_images && conversation.item_images.length > 0 ? (
                    <img
                      src={conversation.item_images[0]}
                      alt={conversation.item_title}
                      style={styles.itemImage}
                    />
                  ) : (
                    <div style={styles.placeholderImage}>📦</div>
                  )}
                </div>

                {/* Conversation Info */}
                <div style={styles.conversationInfo}>
                  <h3 style={styles.itemTitle}>{conversation.item_title}</h3>
                  <p style={styles.lastMessage}>{conversation.last_message}</p>
                  <p style={styles.timestamp}>
                    {new Date(conversation.last_message_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                {/* Unread Badge */}
                {conversation.unread_count > 0 && (
                  <div style={styles.unreadBadge}>{conversation.unread_count}</div>
                )}

                {/* Status Badge */}
                {conversation.item_status === 'sold' && (
                  <div style={styles.soldBadge}>Vendido</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Info Box */}
        <div style={styles.infoBox}>
          <h3 style={styles.infoTitle}>💡 Dica</h3>
          <p style={styles.infoText}>
            Para uma experiência completa de mensagens em tempo real, visite a página de detalhes do item e clique em "Contatar Vendedor".
            Em breve teremos um sistema de chat completo aqui!
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '24px',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '32px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
  },
  subtitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
    margin: '8px 0 0 0',
  },
  conversationsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  conversationCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
  },
  conversationImage: {
    width: '80px',
    height: '80px',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
    flexShrink: 0,
  },
  itemImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
  },
  conversationInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: '0 0 8px 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  lastMessage: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
    margin: '0 0 4px 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  timestamp: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#a3a3a3',
    margin: 0,
  },
  unreadBadge: {
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
    flexShrink: 0,
  },
  soldBadge: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
  },
  loading: {
    textAlign: 'center',
    padding: '48px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px',
  },
  emptyIcon: {
    fontSize: '64px',
    margin: 0,
  },
  emptyText: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    margin: '16px 0 8px 0',
  },
  emptyHint: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  infoBox: {
    marginTop: '32px',
    backgroundColor: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: '12px',
    padding: '20px',
  },
  infoTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#0c4a6e',
    margin: '0 0 8px 0',
  },
  infoText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#075985',
    margin: 0,
    lineHeight: '1.5',
  },
};

export default MarketplaceMessagesPage;

