import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import { 
  BarChart2, 
  ClipboardList, 
  FileText,
  ShoppingCart,
  MessageCircle,
  User, 
  LogOut,
  Clock,
  CheckCircle,
  XCircle,
  Building2,
  AlertCircle,
  Users,
  Send,
  ArrowLeft,
  Star
} from 'lucide-react';
import { 
  supportTicketsApi, 
  SupportTicket, 
  TicketMessage 
} from '../services/supportTicketsApi';
import { EvaluationModal } from '../components/EvaluationModal';
import { SuccessModal } from '../components/SuccessModal';
import colors from '../styles/colors';

const MySupportTicketsPage: React.FC = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'clinic' | 'vet'>('clinic');
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user') || '');
    setUser(userData);
    setUserRole(userData?.user_metadata?.role || userData?.role);
    loadTickets();
  }, []);

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
      const userData = JSON.parse(localStorage.getItem('user') || '');
      const userId = userData?.id;
      
      if (userId) {
        const result = await supportTicketsApi.getUserTickets(userId);
        setTickets(result.tickets);
      }
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
      
      // Marcar mensagens como lidas
      const userId = user?.id;
      if (userId) {
        await supportTicketsApi.markMessagesAsRead(ticketId, userId);
        // Atualizar contagem de não lidos
        loadTickets();
      }
    } catch (error: any) {
      console.error('Error loading messages:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !selectedTicket || !user) return;
    
    if (newMessage.trim().length < 5) {
      alert('A mensagem deve ter pelo menos 5 caracteres');
      return;
    }

    try {
      setSending(true);
      await supportTicketsApi.addMessage(selectedTicket.id, {
        sender_id: user.id,
        sender_role: 'user',
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

  const handleEvaluate = async (rating: number, comment?: string) => {
    if (!selectedTicket) return;

    try {
      setEvaluating(true);
      await supportTicketsApi.evaluateTicket(selectedTicket.id, {
        rating,
        comment,
      });
      
      setShowEvaluationModal(false);
      
      // Atualizar ticket selecionado
      const result = await supportTicketsApi.getUserTickets(user.id);
      const updatedTicket = result.tickets.find(t => t.id === selectedTicket.id);
      if (updatedTicket) {
        setSelectedTicket(updatedTicket);
      }
      
      loadTickets();
      setSuccessMessage('Obrigado pela sua avaliação! O ticket foi marcado como resolvido.');
      setShowSuccessModal(true);
    } catch (error: any) {
      console.error('Error evaluating ticket:', error);
      setErrorMessage(error.message || 'Erro ao avaliar ticket');
      setShowErrorModal(true);
    } finally {
      setEvaluating(false);
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

  // Menu items baseado no papel do usuário
  const getMenuItems = (): MenuItem[] => {
    if (userRole === 'clinic') {
      return [
        { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={20} color={colors.primary} />, action: 'navigate', path: '/clinic-dashboard' },
        { id: 'demandas', label: 'Demandas', icon: <ClipboardList size={20} color={colors.primary} />, action: 'navigate', path: '/demands' },
        { id: 'marketplace', label: 'Marketplace', icon: <ShoppingCart size={20} color={colors.primary} />, action: 'navigate', path: '/marketplace' },
        { id: 'units', label: 'Unidades', icon: <Building2 size={20} color={colors.primary} />, action: 'navigate', path: '/units' },
        { id: 'users', label: 'Usuários', icon: <Users size={20} color={colors.primary} />, action: 'navigate', path: '/users' },
        { id: 'support', label: 'Meus Tickets', icon: <MessageCircle size={20} color={colors.primary} />, action: 'navigate', path: '/my-support-tickets' },
        { id: 'perfil', label: 'Perfil', icon: <User size={20} color={colors.primary} />, action: 'navigate', path: '/clinic-profile' },
        { id: 'logout', label: 'Sair', icon: <LogOut size={20} color={colors.primary} />, action: 'logout' },
      ];
    } else {
      return [
        { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={20} color={colors.primary} />, action: 'navigate', path: '/vet-dashboard' },
        { id: 'demandas', label: 'Demandas', icon: <ClipboardList size={20} color={colors.primary} />, action: 'navigate', path: '/demands' },
        { id: 'candidaturas', label: 'Minhas Candidaturas', icon: <FileText size={20} color={colors.primary} />, action: 'navigate', path: '/my-applications' },
        { id: 'marketplace', label: 'Marketplace', icon: <ShoppingCart size={20} color={colors.primary} />, action: 'navigate', path: '/marketplace' },
        { id: 'support', label: 'Meus Tickets', icon: <MessageCircle size={20} color={colors.primary} />, action: 'navigate', path: '/my-support-tickets' },
        { id: 'perfil', label: 'Meu Perfil', icon: <User size={20} color={colors.primary} />, action: 'navigate', path: '/vet-profile' },
        { id: 'logout', label: 'Sair', icon: <LogOut size={20} color={colors.primary} />, action: 'logout' },
      ];
    }
  };

  const getStatusBadge = (status: SupportTicket['status']) => {
    const statusConfig: { [key: string]: { label: string; icon: React.ReactNode; color: string; bgColor: string } } = {
      open: { label: 'Aberto', icon: <AlertCircle size={14} />, color: '#ef4444', bgColor: '#fee2e2' },
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

  const renderStars = (rating: number) => {
    return (
      <div style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={18}
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
        pageName="Meus Tickets de Suporte"
        menuItems={getMenuItems()}
      >
        <div style={styles.container}>
          <div style={styles.header}>
            <div>
              <h1 style={styles.title}>Meus Tickets de Suporte</h1>
              <p style={styles.subtitle}>
                Acompanhe suas solicitações de suporte e respostas da equipe
              </p>
            </div>
          </div>

          {loading ? (
            <div style={styles.loading}>Carregando tickets...</div>
          ) : tickets.length === 0 ? (
            <div style={styles.emptyState}>
              <MessageCircle size={64} color="#a3a3a3" />
              <p style={styles.emptyText}>Nenhum ticket encontrado</p>
              <p style={styles.emptyHint}>
                Você ainda não enviou nenhuma solicitação de suporte. 
                Clique no botão de suporte no cabeçalho para enviar uma mensagem.
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
                      {getStatusBadge(ticket.status)}
                      {ticket.unread_count && ticket.unread_count > 0 && (
                        <span style={styles.unreadBadge}>
                          {ticket.unread_count} nova{ticket.unread_count > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <span style={styles.ticketDate}>
                      {new Date(ticket.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </span>
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
                        {ticket.last_message.sender_role === 'admin' ? 'Equipe' : 'Você'}:
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
      menuItems={getMenuItems()}
    >
      <div style={styles.container}>
        {/* Header da conversação */}
        <div style={styles.conversationHeader}>
          <button onClick={handleCloseTicket} style={styles.backButton}>
            <ArrowLeft size={20} />
            <span>Voltar</span>
          </button>
          <div style={styles.conversationInfo}>
            {getStatusBadge(selectedTicket.status)}
            <span style={styles.ticketId}>Ticket #{selectedTicket.id.substring(0, 8)}</span>
          </div>
        </div>

        {/* Avaliação (se existir) */}
        {selectedTicket.evaluation && (
          <div style={styles.evaluationBanner}>
            <div style={styles.evaluationContent}>
              <div style={styles.evaluationHeader}>
                <CheckCircle size={20} color={colors.primary} />
                <span style={styles.evaluationTitle}>Ticket Avaliado e Resolvido</span>
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
            const isUser = message.sender_role === 'user';
            return (
              <div
                key={message.id}
                style={{
                  ...styles.messageWrapper,
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    ...styles.messageBubble,
                    ...(isUser ? styles.userMessage : styles.adminMessage),
                  }}
                >
                  <div style={styles.messageHeader}>
                    <span style={styles.messageSender}>
                      {isUser ? 'Você' : 'Equipe PetiVet'}
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
          <>
            {/* Botão de avaliar */}
            <div style={styles.evaluateButtonContainer}>
              <button
                onClick={() => setShowEvaluationModal(true)}
                style={styles.evaluateButton}
              >
                <CheckCircle size={18} />
                Marcar como Resolvido
              </button>
            </div>

            {/* Input de mensagem */}
            <form onSubmit={handleSendMessage} style={styles.inputForm}>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Digite sua mensagem..."
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
          </>
        ) : (
          <div style={styles.closedMessage}>
            <CheckCircle size={24} color={colors.primary} />
            <div>
              <p style={styles.closedTitle}>Ticket resolvido e avaliado</p>
              <p style={styles.closedSubtitle}>
                Crie um novo ticket se precisar de ajuda novamente
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal de avaliação */}
      <EvaluationModal
        isOpen={showEvaluationModal}
        onClose={() => setShowEvaluationModal(false)}
        onSubmit={handleEvaluate}
        isLoading={evaluating}
      />

      {/* Modal de sucesso */}
      <SuccessModal
        isOpen={showSuccessModal}
        message={successMessage}
        onClose={() => setShowSuccessModal(false)}
      />

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
    marginBottom: '32px',
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
    maxWidth: '500px',
    marginLeft: 'auto',
    marginRight: 'auto',
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
    alignItems: 'center',
    marginBottom: '12px',
  },
  ticketMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusBadge: {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '600',
    borderRadius: '16px',
    display: 'inline-flex',
    alignItems: 'center',
  },
  unreadBadge: {
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#ffffff',
    backgroundColor: '#ef4444',
    borderRadius: '12px',
  },
  ticketDate: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: colors.textSecondary,
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
  },
  ticketId: {
    fontSize: '13px',
    color: colors.textSecondary,
    fontFamily: 'monospace',
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
  userMessage: {
    backgroundColor: colors.primary,
    color: 'white',
    alignSelf: 'flex-end',
  },
  adminMessage: {
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
  evaluateButtonContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  evaluateButton: {
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

export default MySupportTicketsPage;
