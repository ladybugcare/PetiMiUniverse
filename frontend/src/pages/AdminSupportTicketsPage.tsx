import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import {
  Clock,
  CheckCircle,
  XCircle,
  User,
  Send,
  ArrowLeft,
  Star,
  MessageCircle
} from 'lucide-react';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';
import { 
  supportTicketsApi, 
  SupportTicket, 
  TicketMessage 
} from '../services/supportTicketsApi';
import { SuccessModal } from '../components/SuccessModal';
import IconWrapper from '../components/IconWrapper';
import colors from '../styles/colors';

const AdminSupportTicketsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'ADMIN';
  const { menuItems } = useSidebarMenu(userRole);

  useEffect(() => {
    loadTickets();
  }, [statusFilter]);

  useEffect(() => {
    if (selectedTicket) {
      loadMessages(selectedTicket.id);
    }
  }, [selectedTicket]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadTickets = async () => {
    try {
      setLoading(true);
      const result = await supportTicketsApi.getAllTickets(statusFilter);
      setTickets(result.tickets);
    } catch (error: any) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (ticketId: string) => {
    try {
      const result = await supportTicketsApi.getMessages(ticketId);
      setMessages(result.messages);
    } catch (error: any) {
      console.error('Error loading messages:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !selectedTicket || !user) return;
    
    if (newMessage.trim().length < 5) {
      setErrorMessage('A mensagem deve ter pelo menos 5 caracteres');
      setShowErrorModal(true);
      return;
    }

    try {
      setSending(true);
      await supportTicketsApi.addMessage(selectedTicket.id, {
        sender_id: user.id,
        sender_role: 'admin',
        message: newMessage.trim(),
      });
      
      setNewMessage('');
      loadMessages(selectedTicket.id);
      loadTickets(); // Atualizar lista de tickets
    } catch (error: any) {
      console.error('Error sending message:', error);
      setErrorMessage(error.message || 'Erro ao enviar mensagem');
      setShowErrorModal(true);
    } finally {
      setSending(false);
    }
  };

  const handleOpenTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setMessages([]);
  };

  const handleCloseTicket = () => {
    setSelectedTicket(null);
    setMessages([]);
    setNewMessage('');
  };

  const handleUpdateStatus = async (status: SupportTicket['status']) => {
    if (!selectedTicket) return;
    
    try {
      await supportTicketsApi.updateStatus(selectedTicket.id, { status });
      setSelectedTicket({ ...selectedTicket, status });
      loadTickets();
    } catch (error: any) {
      console.error('Error updating status:', error);
      setErrorMessage('Erro ao atualizar status. Tente novamente.');
      setShowErrorModal(true);
    }
  };

  const getStatusBadge = (status: SupportTicket['status']) => {
    const statusConfig: { [key: string]: { label: string; icon: React.ReactNode; color: string; bgColor: string } } = {
      open: { label: 'Aberto', icon: <Clock size={14} />, color: '#ef4444', bgColor: '#fee2e2' },
      in_progress: { label: 'Em Análise', icon: <Clock size={14} />, color: '#f59e0b', bgColor: '#fef3c7' },
      resolved: { label: 'Resolvido', icon: <CheckCircle size={14} />, color: '#22c55e', bgColor: '#dcfce7' },
      closed: { label: 'Fechado', icon: <XCircle size={14} />, color: '#6b7280', bgColor: '#f3f4f6' },
    };

    const config = statusConfig[status] || statusConfig.open;

    return (
      <span
        style={{
          ...styles.statusBadge,
          color: config.color,
          backgroundColor: config.bgColor,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {config.icon}
          {config.label}
        </span>
      </span>
    );
  };

  const getRoleBadge = (role: 'clinic' | 'vet' | 'freelancer' | 'admin') => {
    const roleConfig = {
      clinic: {
        label: 'Clínica',
        color: colors.primary,
        backgroundColor: colors.primaryLight,
      },
      vet: {
        label: 'Veterinário',
        color: '#0ea5e9',
        backgroundColor: '#e0f2fe',
      },
      freelancer: {
        label: 'Freelancer',
        color: '#10b981',
        backgroundColor: '#d1fae5',
      },
      admin: {
        label: 'Administrador',
        color: '#8b5cf6',
        backgroundColor: '#ede9fe',
      },
    };

    const config = roleConfig[role] || roleConfig.clinic;

    return (
      <span
        style={{
          ...styles.roleBadge,
          color: config.color,
          backgroundColor: config.backgroundColor,
        }}
      >
        {config.label}
      </span>
    );
  };

  const renderStars = (rating: number) => {
    return (
      <div style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={16}
            fill={star <= rating ? colors.primary : 'transparent'}
            color={star <= rating ? colors.primary : colors.textSecondary}
          />
        ))}
      </div>
    );
  };

  const isEvaluated = selectedTicket?.evaluation !== null && selectedTicket?.evaluation !== undefined;
  const canSendMessage = !isEvaluated;

  // VIEW: Lista de tickets
  if (!selectedTicket) {
    return (
      <DashboardLayout
        pageName="Tickets de Suporte"
        menuItems={menuItems}
      >
        <div style={styles.container}>
          {/* Header com filtros */}
          <div style={styles.header}>
            <div>
              <h1 style={styles.title}>Tickets de Suporte</h1>
              <p style={styles.subtitle}>
                Gerencie solicitações de suporte de usuários
              </p>
            </div>

            <div style={styles.filterContainer}>
              <label style={styles.filterLabel}>Filtrar por status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={styles.filterSelect}
              >
                <option value="all">Todos</option>
                <option value="open">Abertos</option>
                <option value="in_progress">Em Análise</option>
                <option value="resolved">Resolvidos</option>
                <option value="closed">Fechados</option>
              </select>
            </div>
          </div>

          {/* Lista de tickets */}
          {loading ? (
            <div style={styles.loading}>Carregando tickets...</div>
          ) : tickets.length === 0 ? (
            <div style={styles.emptyState}>
              <MessageCircle size={64} color="#a3a3a3" />
              <p style={styles.emptyText}>Nenhum ticket encontrado</p>
              <p style={styles.emptyHint}>
                {statusFilter === 'all' 
                  ? 'Não há tickets de suporte no momento'
                  : 'Não há tickets com este status'}
              </p>
            </div>
          ) : (
            <div style={styles.ticketsList}>
              {tickets.map((ticket) => (
                <div 
                  key={ticket.id} 
                  style={styles.ticketCard}
                  onClick={() => handleOpenTicket(ticket)}
                >
                  <div style={styles.ticketHeader}>
                    <div style={styles.ticketMeta}>
                      <User size={16} color={colors.primary} />
                      <div style={styles.userInfo}>
                        <span style={styles.ticketUserId}>
                          {ticket.user_name || ticket.user_id.substring(0, 8) + '...'}
                        </span>
                        <span style={styles.ticketDate}>
                          {new Date(ticket.created_at).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                    <div style={styles.badgesContainer}>
                      {getRoleBadge(ticket.user_role)}
                      {getStatusBadge(ticket.status)}
                    </div>
                  </div>

                  {ticket.evaluation && (
                    <div style={styles.ticketEvaluation}>
                      {renderStars(ticket.evaluation.rating)}
                      {ticket.evaluation.comment && (
                        <span style={styles.evaluationComment}>
                          "{ticket.evaluation.comment}"
                        </span>
                      )}
                    </div>
                  )}

                  {ticket.last_message && (
                    <div style={styles.lastMessage}>
                      <span style={styles.lastMessageLabel}>
                        {ticket.last_message.sender_role === 'admin' ? 'Você' : 'Usuário'}:
                      </span>
                      <span style={styles.lastMessageText}>
                        {ticket.last_message.message.substring(0, 100)}
                        {ticket.last_message.message.length > 100 ? '...' : ''}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // VIEW: Thread de conversação
  return (
    <DashboardLayout
      pageName="Ticket de Suporte"
      menuItems={menuItems}
    >
      <div style={styles.container}>
        {/* Header da conversação */}
        <div style={styles.conversationHeader}>
          <button onClick={handleCloseTicket} style={styles.backButton}>
            <ArrowLeft size={20} />
            <span>Voltar</span>
          </button>
          <div style={styles.conversationInfo}>
            <User size={16} color={colors.primary} />
            <span style={styles.userName}>
              {selectedTicket.user_name || selectedTicket.user_id.substring(0, 8) + '...'}
            </span>
            {getRoleBadge(selectedTicket.user_role)}
            {getStatusBadge(selectedTicket.status)}
            <span style={styles.ticketId}>#{selectedTicket.id.substring(0, 8)}</span>
          </div>
          
          {/* Ações de status */}
          {!isEvaluated && (
            <div style={styles.statusActions}>
              {selectedTicket.status === 'open' && (
                <button
                  onClick={() => handleUpdateStatus('in_progress')}
                  style={{ ...styles.statusButton, ...styles.progressButton }}
                >
                  <Clock size={16} />
                  Em Análise
                </button>
              )}
              {(selectedTicket.status === 'open' || selectedTicket.status === 'in_progress') && (
                <button
                  onClick={() => handleUpdateStatus('resolved')}
                  style={{ ...styles.statusButton, ...styles.resolveButton }}
                >
                  <CheckCircle size={16} />
                  Resolver
                </button>
              )}
              {selectedTicket.status !== 'closed' && (
                <button
                  onClick={() => handleUpdateStatus('closed')}
                  style={{ ...styles.statusButton, ...styles.closeButton }}
                >
                  <XCircle size={16} />
                  Fechar
                </button>
              )}
            </div>
          )}
        </div>

        {/* Avaliação (se existir) */}
        {selectedTicket.evaluation && (
          <div style={styles.evaluationBanner}>
            <div style={styles.evaluationContent}>
              <div style={styles.evaluationHeader}>
                <IconWrapper icon={CheckCircle} size={20} color={colors.primary} />
                <span style={styles.evaluationTitle}>Ticket Avaliado pelo Usuário</span>
              </div>
              {renderStars(selectedTicket.evaluation.rating)}
              {selectedTicket.evaluation.comment && (
                <p style={styles.evaluationCommentText}>"{selectedTicket.evaluation.comment}"</p>
              )}
            </div>
          </div>
        )}

        {/* Thread de mensagens */}
        <div style={styles.messagesContainer}>
          {messages.map((message) => {
            const isAdmin = message.sender_role === 'admin';
            return (
              <div
                key={message.id}
                style={{
                  ...styles.messageWrapper,
                  justifyContent: isAdmin ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    ...styles.messageBubble,
                    ...(isAdmin ? styles.adminMessage : styles.userMessage),
                  }}
                >
                  <div style={styles.messageHeader}>
                    <span style={styles.messageSender}>
                      {isAdmin ? 'Você (Admin)' : 'Usuário'}
                    </span>
                  </div>
                  <p style={styles.messageText}>{message.message}</p>
                  <span style={styles.messageTime}>
                    {new Date(message.created_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input ou mensagem de encerramento */}
        {canSendMessage ? (
          <form onSubmit={handleSendMessage} style={styles.inputForm}>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Digite sua resposta..."
              style={styles.input}
              disabled={sending}
              maxLength={1000}
            />
            <button
              type="submit"
              style={styles.sendButton}
              disabled={sending || !newMessage.trim()}
            >
              <Send size={20} />
              {sending ? 'Enviando...' : 'Enviar'}
            </button>
          </form>
        ) : (
          <div style={styles.closedMessage}>
            <CheckCircle size={24} color={colors.primary} />
            <div>
              <p style={styles.closedTitle}>Ticket avaliado e encerrado pelo usuário</p>
              <p style={styles.closedSubtitle}>
                Este ticket foi resolvido e não pode mais receber mensagens
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal de erro */}
      <SuccessModal
        isOpen={showErrorModal}
        message={errorMessage}
        onClose={() => setShowErrorModal(false)}
      />
    </DashboardLayout>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '28px',
    fontWeight: '600',
    color: colors.text,
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: colors.textSecondary,
    margin: 0,
  },
  filterContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  filterLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: colors.text,
  },
  filterSelect: {
    padding: '10px 16px',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    outline: 'none',
  },
  loading: {
    textAlign: 'center',
    padding: '64px',
    fontSize: '16px',
    color: colors.textSecondary,
  },
  emptyState: {
    textAlign: 'center',
    padding: '64px 32px',
    backgroundColor: '#fafafa',
    borderRadius: '12px',
    border: `2px dashed ${colors.border}`,
  },
  emptyText: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: colors.text,
    marginTop: '24px',
    marginBottom: '8px',
  },
  emptyHint: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: colors.textSecondary,
    margin: 0,
  },
  ticketsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  ticketCard: {
    backgroundColor: '#ffffff',
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '20px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  ticketHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  ticketMeta: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    flex: 1,
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  ticketUserId: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: colors.text,
  },
  statusBadge: {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '600',
    borderRadius: '16px',
    display: 'inline-flex',
    alignItems: 'center',
  },
  roleBadge: {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '600',
    borderRadius: '16px',
  },
  ticketDate: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: colors.textSecondary,
  },
  badgesContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  ticketEvaluation: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    backgroundColor: '#f0fdf4',
    borderRadius: '8px',
    marginBottom: '12px',
  },
  starsContainer: {
    display: 'flex',
    gap: '4px',
  },
  evaluationComment: {
    fontSize: '13px',
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  lastMessage: {
    display: 'flex',
    gap: '6px',
    fontSize: '14px',
    color: colors.text,
  },
  lastMessageLabel: {
    fontWeight: '600',
  },
  lastMessageText: {
    color: colors.textSecondary,
  },
  conversationHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: `1px solid ${colors.border}`,
    flexWrap: 'wrap',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    color: colors.text,
    transition: 'all 0.2s',
  },
  conversationInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  userName: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: colors.text,
  },
  ticketId: {
    fontSize: '13px',
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  statusActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  statusButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  progressButton: {
    color: '#f59e0b',
    backgroundColor: '#fef3c7',
  },
  resolveButton: {
    color: '#22c55e',
    backgroundColor: '#dcfce7',
  },
  closeButton: {
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
  },
  evaluationBanner: {
    backgroundColor: '#f0fdf4',
    border: `2px solid ${colors.primary}`,
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '24px',
  },
  evaluationContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  evaluationHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  evaluationTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: colors.text,
  },
  evaluationCommentText: {
    fontSize: '14px',
    color: colors.textSecondary,
    fontStyle: 'italic',
    margin: 0,
  },
  messagesContainer: {
    backgroundColor: '#fafafa',
    borderRadius: '12px',
    padding: '24px',
    minHeight: '400px',
    maxHeight: '600px',
    overflowY: 'auto',
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  messageWrapper: {
    display: 'flex',
    width: '100%',
  },
  messageBubble: {
    maxWidth: '70%',
    padding: '12px 16px',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  adminMessage: {
    backgroundColor: colors.primary,
    color: 'white',
    alignSelf: 'flex-end',
  },
  userMessage: {
    backgroundColor: 'white',
    color: colors.text,
    border: `1px solid ${colors.border}`,
    alignSelf: 'flex-start',
  },
  messageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  messageSender: {
    fontSize: '12px',
    fontWeight: '600',
    opacity: 0.9,
  },
  messageText: {
    fontSize: '14px',
    lineHeight: '1.5',
    margin: '4px 0',
  },
  messageTime: {
    fontSize: '11px',
    opacity: 0.7,
    alignSelf: 'flex-end',
  },
  inputForm: {
    display: 'flex',
    gap: '12px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '14px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    outline: 'none',
  },
  sendButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: colors.primary,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  closedMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    backgroundColor: '#f0fdf4',
    border: `2px solid ${colors.primary}`,
    borderRadius: '12px',
  },
  closedTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: colors.text,
    margin: '0 0 4px 0',
  },
  closedSubtitle: {
    fontSize: '14px',
    color: colors.textSecondary,
    margin: 0,
  },
};

export default AdminSupportTicketsPage;
