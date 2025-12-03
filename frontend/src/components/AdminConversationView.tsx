import React, { useState, useEffect } from 'react';
import { X, Trash2, Archive, Shield } from 'lucide-react';
import { messagesApi, Message } from '../services/messagesApi';
import MessageBubble from './MessageBubble';
import Avatar from './Avatar';
import colors from '../styles/colors';

interface AdminConversationViewProps {
  conversationId: string;
  context: 'report' | 'support_ticket';
  ticketId?: string;
  onClose: () => void;
  onDeleteMessage?: (messageId: string) => void;
}

export const AdminConversationView: React.FC<AdminConversationViewProps> = ({
  conversationId,
  context,
  ticketId,
  onClose,
  onDeleteMessage,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setCurrentUserId(user.id || '');
    loadConversation();
  }, [conversationId, context, ticketId]);

  const loadConversation = async () => {
    try {
      setLoading(true);
      let result;
      
      if (context === 'support_ticket' && ticketId) {
        // Usar endpoint específico para suporte
        result = await messagesApi.getConversation(conversationId);
      } else {
        // Usar endpoint de auditoria
        result = await messagesApi.getConversation(conversationId);
      }
      
      setMessages(result.messages);
    } catch (error: any) {
      console.error('Error loading conversation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!onDeleteMessage) return;
    
    if (window.confirm('Tem certeza que deseja deletar esta mensagem permanentemente?')) {
      try {
        await onDeleteMessage(messageId);
        await loadConversation();
      } catch (error: any) {
        console.error('Error deleting message:', error);
        alert('Erro ao deletar mensagem: ' + error.message);
      }
    }
  };

  const contextLabels = {
    report: 'Reportada',
    support_ticket: `Vinculada a Ticket #${ticketId?.substring(0, 8)}`,
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerInfo}>
            <Shield size={20} color={colors.primary} />
            <div>
              <h3 style={styles.title}>Visualização Admin</h3>
              <span style={styles.contextBadge}>{contextLabels[context]}</span>
            </div>
          </div>
          <button onClick={onClose} style={styles.closeButton}>
            <X size={20} />
          </button>
        </div>

        {/* Aviso de privacidade */}
        <div style={styles.privacyWarning}>
          <p style={styles.warningText}>
            ⚠️ Esta conversa foi acessada para moderação. Todas as ações são registradas em log de auditoria.
          </p>
        </div>

        {/* Mensagens */}
        <div style={styles.messagesContainer}>
          {loading ? (
            <div style={styles.loading}>Carregando mensagens...</div>
          ) : messages.length === 0 ? (
            <div style={styles.emptyState}>Nenhuma mensagem encontrada</div>
          ) : (
            messages.map((message) => {
              const isOwn = message.sender_id === currentUserId;
              return (
                <div key={message.id} style={styles.messageRow}>
                  <MessageBubble
                    message={message.message}
                    isOwn={isOwn}
                    senderName={message.sender_name}
                    timestamp={message.created_at}
                    read={!!message.read_at}
                  />
                  {onDeleteMessage && (
                    <button
                      onClick={() => handleDeleteMessage(message.id)}
                      style={styles.deleteButton}
                      title="Deletar mensagem permanentemente"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    width: '90%',
    maxWidth: '800px',
    maxHeight: '90vh',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: `1px solid ${colors.border}`,
  },
  headerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: colors.text,
    margin: '0 0 4px 0',
  },
  contextBadge: {
    fontSize: '12px',
    color: colors.primary,
    fontFamily: 'Inter, sans-serif',
  },
  closeButton: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  privacyWarning: {
    padding: '12px 20px',
    backgroundColor: colors.warningLight,
    borderBottom: `1px solid ${colors.warning}`,
  },
  warningText: {
    fontSize: '13px',
    color: colors.text,
    fontFamily: 'Inter, sans-serif',
    margin: 0,
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    backgroundColor: '#f9fafb',
  },
  loading: {
    textAlign: 'center',
    padding: '48px',
    fontSize: '14px',
    color: colors.textSecondary,
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px',
    fontSize: '14px',
    color: colors.textSecondary,
  },
  messageRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    marginBottom: '12px',
  },
  deleteButton: {
    padding: '6px',
    backgroundColor: colors.danger,
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
};

export default AdminConversationView;





