import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import AdminReportedMessage from '../components/AdminReportedMessage';
import AdminConversationView from '../components/AdminConversationView';
import AdminMessagesStats from '../components/AdminMessagesStats';
import { 
  BarChart2, 
  Building2, 
  Stethoscope, 
  ClipboardList, 
  Users, 
  Settings,
  MessageCircle,
  Shield,
  AlertTriangle,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { messagesApi } from '../services/messagesApi';
import { useAlert } from '../hooks/useAlert';
import colors from '../styles/colors';

type TabType = 'reported' | 'tickets' | 'stats';

const AdminMessagesPage: React.FC = () => {
  const navigate = useNavigate();
  const { showError, showSuccess } = useAlert();
  const [activeTab, setActiveTab] = useState<TabType>('reported');
  const [reportedMessages, setReportedMessages] = useState<any[]>([]);
  const [ticketConversations, setTicketConversations] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<{
    id: string;
    context: 'report' | 'support_ticket';
    ticketId?: string;
  } | null>(null);

  const menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <BarChart2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin-dashboard',
    },
    {
      id: 'clinics',
      label: 'Clínicas',
      icon: <Building2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/clinics',
    },
    {
      id: 'vets',
      label: 'Veterinários',
      icon: <Stethoscope size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/vets',
    },
    {
      id: 'demands',
      label: 'Demandas',
      icon: <ClipboardList size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/demands',
    },
    {
      id: 'messages',
      label: 'Moderação de Mensagens',
      icon: <Shield size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/messages',
    },
    {
      id: 'support',
      label: 'Tickets de Suporte',
      icon: <MessageCircle size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/support-tickets',
    },
    {
      id: 'users',
      label: 'Usuários',
      icon: <Users size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/users',
    },
    {
      id: 'settings',
      label: 'Configurações',
      icon: <Settings size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/settings',
    },
  ];

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      if (activeTab === 'reported') {
        await loadReportedMessages();
      } else if (activeTab === 'tickets') {
        await loadTicketConversations();
      } else if (activeTab === 'stats') {
        await loadStats();
      }
    } catch (error: any) {
      console.error('Error loading data:', error);
      showError('Erro ao carregar dados: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadReportedMessages = async () => {
    try {
      const result = await apiRequest('/api/messages/admin/reported');
      setReportedMessages(result.reports || []);
    } catch (error: any) {
      console.error('Error loading reported messages:', error);
      throw error;
    }
  };

  const loadTicketConversations = async () => {
    try {
      // Buscar tickets abertos que podem ter conversas vinculadas
      const ticketsResult = await apiRequest('/support/tickets?status=open');
      const tickets = ticketsResult.tickets || [];
      
      // Por enquanto, apenas mostrar lista de tickets
      // Em produção, buscar conversas vinculadas a cada ticket
      setTicketConversations(tickets);
    } catch (error: any) {
      console.error('Error loading ticket conversations:', error);
      throw error;
    }
  };

  const loadStats = async () => {
    try {
      // Buscar estatísticas agregadas
      const conversationsResult = await messagesApi.getMyConversations();
      const conversations = conversationsResult.conversations || [];
      
      // Calcular estatísticas
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      // Contar conversas por tipo
      const clinicVet = conversations.filter(
        (c) => c.participant1_type === 'clinic' && c.participant2_type === 'vet'
      ).length;
      const clinicFreelancer = conversations.filter(
        (c) => c.participant1_type === 'clinic' && c.participant2_type === 'freelancer'
      ).length;

      setStats({
        total_conversations: conversations.length,
        messages_today: 0, // Seria necessário buscar mensagens
        messages_week: 0, // Seria necessário buscar mensagens
        conversations_by_type: {
          clinic_vet: clinicVet,
          clinic_freelancer: clinicFreelancer,
        },
      });
    } catch (error: any) {
      console.error('Error loading stats:', error);
      throw error;
    }
  };

  const handleViewConversation = (conversationId: string, context: 'report' | 'support_ticket', ticketId?: string) => {
    setSelectedConversation({ id: conversationId, context, ticketId });
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await apiRequest(`/api/messages/admin/messages/${messageId}`, {
        method: 'DELETE',
      });
      showSuccess('Mensagem deletada com sucesso');
      await loadReportedMessages();
    } catch (error: any) {
      showError('Erro ao deletar mensagem: ' + error.message);
      throw error;
    }
  };

  const handleResolveReport = async (reportId: string) => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      await apiRequest(`/api/messages/admin/reports/${reportId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'resolved',
          reviewed_by: user.id,
        }),
      });
      showSuccess('Reporte resolvido com sucesso');
      await loadReportedMessages();
    } catch (error: any) {
      showError('Erro ao resolver reporte: ' + error.message);
    }
  };

  return (
    <DashboardLayout pageName="Moderação de Mensagens" menuItems={menuItems}>
      <div style={styles.container}>
        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            onClick={() => setActiveTab('reported')}
            style={{
              ...styles.tab,
              ...(activeTab === 'reported' ? styles.tabActive : {}),
            }}
          >
            <AlertTriangle size={18} />
            Reportadas
            {reportedMessages.length > 0 && (
              <span style={styles.tabBadge}>{reportedMessages.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('tickets')}
            style={{
              ...styles.tab,
              ...(activeTab === 'tickets' ? styles.tabActive : {}),
            }}
          >
            <FileText size={18} />
            Vinculadas a Tickets
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            style={{
              ...styles.tab,
              ...(activeTab === 'stats' ? styles.tabActive : {}),
            }}
          >
            <TrendingUp size={18} />
            Estatísticas
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {loading ? (
            <div style={styles.loading}>Carregando...</div>
          ) : activeTab === 'reported' ? (
            <div style={styles.reportedList}>
              {reportedMessages.length === 0 ? (
                <div style={styles.emptyState}>
                  <Shield size={64} color={colors.neutral[400]} />
                  <p style={styles.emptyText}>Nenhuma mensagem reportada</p>
                </div>
              ) : (
                reportedMessages.map((report) => (
                  <AdminReportedMessage
                    key={report.id}
                    report={report}
                    onViewConversation={(conversationId) =>
                      handleViewConversation(conversationId, 'report')
                    }
                    onDeleteMessage={handleDeleteMessage}
                    onResolveReport={handleResolveReport}
                  />
                ))
              )}
            </div>
          ) : activeTab === 'tickets' ? (
            <div style={styles.ticketsList}>
              {ticketConversations.length === 0 ? (
                <div style={styles.emptyState}>
                  <FileText size={64} color={colors.neutral[400]} />
                  <p style={styles.emptyText}>
                    Nenhum ticket aberto com conversas vinculadas
                  </p>
                </div>
              ) : (
                <div style={styles.infoBox}>
                  <p style={styles.infoText}>
                    💡 Quando um usuário menciona uma conversa em um ticket de suporte, você pode acessá-la diretamente do ticket.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <AdminMessagesStats stats={stats} />
          )}
        </div>

        {/* Modal de visualização de conversa */}
        {selectedConversation && (
          <AdminConversationView
            conversationId={selectedConversation.id}
            context={selectedConversation.context}
            ticketId={selectedConversation.ticketId}
            onClose={() => setSelectedConversation(null)}
            onDeleteMessage={handleDeleteMessage}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    borderBottom: `2px solid ${colors.border}`,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
    color: colors.textSecondary,
    transition: 'all 0.2s',
    position: 'relative',
    marginBottom: '-2px',
  },
  tabActive: {
    color: colors.primary,
    borderBottomColor: colors.primary,
  },
  tabBadge: {
    backgroundColor: colors.danger,
    color: '#ffffff',
    borderRadius: '12px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: '600',
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    minHeight: '400px',
  },
  loading: {
    textAlign: 'center',
    padding: '48px',
    fontSize: '16px',
    color: colors.textSecondary,
  },
  reportedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  ticketsList: {
    display: 'flex',
    flexDirection: 'column',
  },
  infoBox: {
    padding: '20px',
    backgroundColor: colors.infoLight,
    borderRadius: '8px',
    border: `1px solid ${colors.info}`,
  },
  infoText: {
    fontSize: '14px',
    color: colors.text,
    fontFamily: 'Inter, sans-serif',
    margin: 0,
    lineHeight: '1.5',
  },
  emptyState: {
    textAlign: 'center',
    padding: '64px 24px',
  },
  emptyText: {
    marginTop: '16px',
    fontSize: '16px',
    color: colors.textSecondary,
    fontFamily: 'Inter, sans-serif',
  },
};

export default AdminMessagesPage;

