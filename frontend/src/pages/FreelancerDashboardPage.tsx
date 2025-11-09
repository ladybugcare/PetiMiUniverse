import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import LoadingOverlay from '../components/LoadingOverlay';
import { MenuItem } from '../components/DashboardSidebar';
import FloatingActionButton from '../components/FloatingActionButton';
import { BarChart2, ClipboardList, FileText, MessageSquare, Star, User, LogOut, ShoppingCart, Clock, CheckCircle, Building2, Bell, Lock, Smartphone, Globe, MessageCircle, Settings, AlertCircle } from 'lucide-react';
import IconWrapper from '../components/IconWrapper';
import { useAuth } from '../AuthContext';
import { getUserRole, getDashboardPathForRole } from '../utils/authHelpers';
import { useAlert } from '../hooks/useAlert';
import colors from '../styles/colors';

const FreelancerDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const { showWarning } = useAlert();
  const [activeSection, setActiveSection] = useState('resumo');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [freelancerStatus, setFreelancerStatus] = useState<{
    needsOnboarding?: boolean;
    isApproved?: boolean;
    approvalStatus?: string;
  } | null>(null);

  // Check authentication and freelancer status
  useEffect(() => {
    // Aguardar carregamento da autenticação
    if (authLoading) return;
    
    // Se não há usuário, redirecionar para login
    if (!user) {
      navigate('/login', { replace: true });
      setCheckingAuth(false);
      return;
    }
    
    // Usar getUserRole() para detecção robusta da role
    const userRole = getUserRole(user);
    
    // Se não for FREELANCER, redirecionar para dashboard apropriado
    if (userRole !== 'FREELANCER') {
      const dashboardPath = getDashboardPathForRole(userRole);
      console.log('[FreelancerDashboardPage] Usuário não é FREELANCER, redirecionando para:', dashboardPath);
      navigate(dashboardPath, { replace: true });
      setCheckingAuth(false);
      return;
    }

    // Verificar status do freelancer do localStorage (vem do login)
    const freelancerOnboardingStr = localStorage.getItem('freelancerOnboarding');
    if (freelancerOnboardingStr && freelancerOnboardingStr.trim() !== '') {
      try {
        const freelancerOnboarding = JSON.parse(freelancerOnboardingStr);
        
        // REGRA CRÍTICA: Se onboarding já foi completado, NUNCA redirecionar para onboarding
        if (freelancerOnboarding.onboardingCompleted === true) {
          setFreelancerStatus({
            needsOnboarding: false, // Forçar false se já completou
            isApproved: freelancerOnboarding.isApproved ?? false,
            approvalStatus: freelancerOnboarding.approvalStatus ?? 'pending',
          });
          // Não redirecionar, permitir acesso ao dashboard
        } else {
          setFreelancerStatus({
            needsOnboarding: freelancerOnboarding.needsOnboarding ?? true,
            isApproved: freelancerOnboarding.isApproved ?? false,
            approvalStatus: freelancerOnboarding.approvalStatus ?? 'pending',
          });

          // Se precisa completar onboarding, redirecionar
          if (freelancerOnboarding.needsOnboarding !== false) {
            navigate('/freelancer-onboarding', { replace: true });
            return;
          }
        }
      } catch (e) {
        console.error('Erro ao parsear freelancerOnboarding:', e);
        // Se der erro, verificar no backend antes de redirecionar
        // Por enquanto, assumir que precisa fazer onboarding
        navigate('/freelancer-onboarding', { replace: true });
        return;
      }
    } else {
      // Se não tem dados no localStorage, verificar no backend antes de redirecionar
      // Por enquanto, redirecionar para onboarding
      navigate('/freelancer-onboarding', { replace: true });
      return;
    }
    
    setCheckingAuth(false);
  }, [navigate, user, authLoading]);

  // Verificar se está aprovado
  const isApproved = freelancerStatus?.isApproved ?? false;

  // Floating Action Button options
  const fabOptions = [
    {
      id: 'view-demands',
      label: 'Ver Demandas',
      icon: <IconWrapper icon={ClipboardList} size={20} color="#ffffff" />,
      path: isApproved ? '/demands' : undefined,
      color: '#7c3aed',
      disabled: !isApproved,
    },
    {
      id: 'create-listing',
      label: 'Criar Anúncio',
      icon: <IconWrapper icon={ShoppingCart} size={20} color="#ffffff" />,
      path: '/marketplace/create',
      color: '#10b981',
    },
  ];

  const menuItems: MenuItem[] = [
    {
      id: 'resumo',
      label: 'Meu Resumo',
      icon: <BarChart2 size={20} color={colors.primary} />,
      action: 'section',
      sectionId: 'resumo',
    },
    // Só incluir o item de demandas se estiver aprovado
    ...(isApproved ? [{
      id: 'demandas',
      label: 'Demandas Disponíveis',
      icon: <IconWrapper icon={ClipboardList} size={20} color={colors.primary} />,
      action: 'navigate' as const,
      path: '/demands',
    }] : []),
    {
      id: 'candidaturas',
      label: 'Minhas Candidaturas',
      icon: <IconWrapper icon={FileText} size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/my-applications',
    },
    {
      id: 'mensagens',
      label: 'Mensagens',
      icon: <IconWrapper icon={MessageSquare} size={20} color={colors.primary} />,
      action: 'section',
      sectionId: 'mensagens',
    },
    {
      id: 'avaliacoes',
      label: 'Minhas Avaliações',
      icon: <IconWrapper icon={Star} size={20} color={colors.primary} />,
      action: 'section',
      sectionId: 'avaliacoes',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: <IconWrapper icon={ShoppingCart} size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'support',
      label: 'Meus Tickets',
      icon: <IconWrapper icon={MessageCircle} size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/my-support-tickets',
    },
    {
      id: 'perfil',
      label: 'Meu Perfil',
      icon: <IconWrapper icon={User} size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/freelancer-profile',
    },
    {
      id: 'configuracoes',
      label: 'Configurações',
      icon: <IconWrapper icon={Settings} size={20} color={colors.primary} />,
      action: 'section',
      sectionId: 'configuracoes',
    },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'resumo':
        return <ResumoSection />;
      case 'mensagens':
        return <MensagensSection />;
      case 'avaliacoes':
        return <AvaliacoesSection />;
      case 'configuracoes':
        return <ConfiguracoesSection />;
      default:
        return <ResumoSection />;
    }
  };

  // Mostrar aviso se não estiver aprovado
  const renderApprovalWarning = () => {
    if (isApproved || checkingAuth) return null;

    const approvalStatus = freelancerStatus?.approvalStatus;
    let message = '';
    let title = '';

    if (approvalStatus === 'pending_approval') {
      title = 'Cadastro em Análise';
      message = 'Seu cadastro está em análise pela nossa equipe. Você receberá um e-mail assim que for aprovado. Enquanto isso, você pode explorar o marketplace.';
    } else if (approvalStatus === 'rejected') {
      title = 'Cadastro Rejeitado';
      message = 'Seu cadastro foi rejeitado. Verifique seu e-mail para mais informações ou entre em contato com o suporte.';
    } else {
      title = 'Aguardando Aprovação';
      message = 'Seu cadastro precisa ser aprovado antes de você poder ver e se candidatar às demandas.';
    }

    return (
      <div style={styles.warningBanner}>
        <div style={styles.warningContent}>
          <AlertCircle size={24} style={styles.warningIcon} />
          <div style={styles.warningText}>
            <strong style={styles.warningTitle}>{title}</strong>
            <p style={styles.warningMessage}>{message}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <DashboardLayout
        pageName="Dashboard do Freelancer"
        menuItems={menuItems}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      >
        <div style={styles.container}>
          {renderApprovalWarning()}
          {renderContent()}
        </div>
      </DashboardLayout>
      <FloatingActionButton options={fabOptions} />
      <LoadingOverlay visible={checkingAuth} />
    </>
  );
};

// Section Components
const ResumoSection: React.FC = () => {
  const [stats, setStats] = React.useState({
    totalApplications: 0,
    activeJobs: 0,
    completedJobs: 0,
    averageRating: 0,
  });
  const [opportunities, setOpportunities] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const user = JSON.parse(localStorage.getItem('user') || '');
        const freelancerId = user.id;

        // Import statisticsApi and demandsApi dynamically
        const { statisticsApi } = await import('../services/statisticsApi');
        const { demandsApi } = await import('../services/demandsApi');

        // Fetch freelancer statistics (usando mesma API de vet por enquanto)
        try {
          const { stats: freelancerStats } = await statisticsApi.getVetStats(freelancerId);
          setStats(freelancerStats);
        } catch (error) {
          console.error('Error loading freelancer stats:', error);
        }

        // Fetch available opportunities
        const { demands } = await demandsApi.getOpen('freelancer');
        setOpportunities(demands.slice(0, 3));
      } catch (error) {
        console.error('Error loading freelancer data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Meu Resumo Profissional</h2>
      <div style={styles.statsGrid}>
        <div 
          style={{ ...styles.statCard, borderLeftColor: '#7c3aed' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(124, 58, 237, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            <IconWrapper icon={FileText} size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalApplications}</h3>
            <p style={styles.statLabel}>Candidaturas Ativas</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, borderLeftColor: '#0ea5e9' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(14, 165, 233, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            <IconWrapper icon={Clock} size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.activeJobs}</h3>
            <p style={styles.statLabel}>Trabalhos em Andamento</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, borderLeftColor: '#22c55e' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(34, 197, 94, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            <IconWrapper icon={CheckCircle} size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.completedJobs}</h3>
            <p style={styles.statLabel}>Trabalhos Concluídos</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, borderLeftColor: '#f59e0b' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(245, 158, 11, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            <IconWrapper icon={Star} size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.averageRating.toFixed(1)}</h3>
            <p style={styles.statLabel}>Avaliação Média</p>
          </div>
        </div>
      </div>

      <div style={styles.recentActivity}>
        <h3 style={styles.subsectionTitle}>Oportunidades Recentes</h3>
        <div style={styles.activityList}>
          {loading ? (
            <p>Carregando...</p>
          ) : opportunities.length > 0 ? (
            opportunities.map((opportunity) => (
              <OpportunityItem
                key={opportunity.id}
                icon={<Building2 size={20} color="#7c3aed" />}
                title={opportunity.title}
                clinic={opportunity.clinic_id}
                payment={opportunity.payment ? `R$ ${opportunity.payment}` : 'A combinar'}
                urgent={opportunity.category === 'emergency'}
              />
            ))
          ) : (
            <p>Nenhuma oportunidade disponível no momento</p>
          )}
        </div>
      </div>
    </div>
  );
};

const MensagensSection: React.FC = () => (
  <div style={styles.section}>
    <h2 style={styles.sectionTitle}>Mensagens</h2>
    <div style={styles.messagesList}>
      <MessageCard
        sender="Clínica Vida Animal"
        message="Olá! Gostaríamos de discutir mais detalhes sobre o serviço agendado."
        time="Há 15 minutos"
        unread={true}
      />
      <MessageCard
        sender="Clínica Pet Care"
        message="Sua candidatura foi aprovada! Por favor, confirme sua disponibilidade."
        time="Há 1 hora"
        unread={true}
      />
      <MessageCard
        sender="Clínica São Francisco"
        message="Obrigado pelo excelente trabalho realizado!"
        time="Há 2 dias"
        unread={false}
      />
    </div>
  </div>
);

const AvaliacoesSection: React.FC = () => (
  <div style={styles.section}>
    <h2 style={styles.sectionTitle}>Minhas Avaliações</h2>
    <div style={styles.statsRow}>
      <div style={styles.statCard}>
        <span style={styles.statValue}>4.8</span>
        <span style={styles.statLabel}>Média Geral</span>
        <div style={styles.stars}>
          {[...Array(5)].map((_, i) => (
            <Star key={i} size={20} fill="#f59e0b" color="#f59e0b" />
          ))}
        </div>
      </div>
      <div style={styles.statCard}>
        <span style={styles.statValue}>42</span>
        <span style={styles.statLabel}>Total de Avaliações</span>
      </div>
      <div style={styles.statCard}>
        <span style={styles.statValue}>98%</span>
        <span style={styles.statLabel}>Recomendações</span>
      </div>
    </div>
    
    <div style={styles.reviewsList}>
      <ReviewCard
        reviewer="Clínica Vida Animal"
        rating={5}
        comment="Excelente profissional! Demonstrou grande conhecimento técnico e cuidado com os animais."
        date="20/10/2025"
      />
      <ReviewCard
        reviewer="Clínica Pet Care"
        rating={5}
        comment="Muito atencioso e competente. Recomendamos fortemente!"
        date="15/10/2025"
      />
      <ReviewCard
        reviewer="Clínica São Francisco"
        rating={4}
        comment="Bom profissional, pontual e dedicado ao trabalho."
        date="10/10/2025"
      />
    </div>
  </div>
);

const ConfiguracoesSection: React.FC = () => (
  <div style={styles.section}>
    <h2 style={styles.sectionTitle}>Configurações</h2>
    <div style={styles.settingsGrid}>
      <SettingCard
        icon={<IconWrapper icon={Bell} size={28} color="#7c3aed" />}
        title="Notificações"
        description="Gerencie suas preferências de notificação"
      />
      <SettingCard
        icon={<IconWrapper icon={Lock} size={28} color="#7c3aed" />}
        title="Privacidade"
        description="Controle quem pode ver seu perfil"
      />
      <SettingCard
        icon={<IconWrapper icon={Smartphone} size={28} color="#7c3aed" />}
        title="Preferências"
        description="Personalize sua experiência"
      />
      <SettingCard
        icon={<IconWrapper icon={Globe} size={28} color="#7c3aed" />}
        title="Idioma"
        description="Português (Brasil)"
      />
    </div>
  </div>
);

// Utility Components
interface OpportunityItemProps {
  icon: React.ReactNode;
  title: string;
  clinic: string;
  payment: string;
  urgent: boolean;
}

const OpportunityItem: React.FC<OpportunityItemProps> = ({ icon, title, clinic, payment, urgent }) => (
  <div style={styles.opportunityItem}>
    <div style={styles.opportunityIcon}>{icon}</div>
    <div style={styles.opportunityContent}>
      <div style={styles.opportunityHeader}>
        <h4 style={styles.opportunityTitle}>{title}</h4>
        {urgent && <span style={styles.urgentBadge}>Urgente</span>}
      </div>
      <p style={styles.opportunityClinic}>{clinic}</p>
      <p style={styles.opportunityPayment}>{payment}</p>
    </div>
    <button style={styles.applyButton}>Ver Detalhes</button>
  </div>
);

interface MessageCardProps {
  sender: string;
  message: string;
  time: string;
  unread: boolean;
}

const MessageCard: React.FC<MessageCardProps> = ({ sender, message, time, unread }) => (
  <div style={{ ...styles.messageCard, backgroundColor: unread ? '#f0f9ff' : '#ffffff' }}>
    <div style={styles.messageHeader}>
      <h4 style={styles.messageSender}>{sender}</h4>
      <span style={styles.messageTime}>{time}</span>
    </div>
    <p style={styles.messageText}>{message}</p>
    {unread && <span style={styles.unreadBadge}>Nova</span>}
  </div>
);

interface ReviewCardProps {
  reviewer: string;
  rating: number;
  comment: string;
  date: string;
}

const ReviewCard: React.FC<ReviewCardProps> = ({ reviewer, rating, comment, date }) => (
  <div style={styles.reviewCard}>
    <div style={styles.reviewHeader}>
      <h4 style={styles.reviewerName}>{reviewer}</h4>
      <div style={styles.rating}>
        {[...Array(rating)].map((_, i) => (
          <Star key={i} size={16} fill="#f59e0b" color="#f59e0b" />
        ))}
      </div>
    </div>
    <p style={styles.reviewComment}>{comment}</p>
    <span style={styles.reviewDate}>{date}</span>
  </div>
);

interface SettingCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const SettingCard: React.FC<SettingCardProps> = ({ icon, title, description }) => (
  <div style={styles.settingCard}>
    <div style={styles.settingIcon}>{icon}</div>
    <h4 style={styles.settingTitle}>{title}</h4>
    <p style={styles.settingDescription}>{description}</p>
  </div>
);

// Styles (reutilizando os mesmos estilos do VetDashboardPage)
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  section: {
    marginBottom: '40px',
  },
  sectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '28px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '24px',
  },
  subsectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#404040',
    marginBottom: '16px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '24px',
    marginBottom: '40px',
  },
  statCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderLeft: '4px solid',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer',
  },
  statIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statContent: {
    flex: 1,
  },
  statValue: {
    fontSize: '32px',
    fontWeight: '700',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    margin: 0,
  },
  statLabel: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
    marginTop: '4px',
  },
  recentActivity: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  opportunityItem: {
    display: 'flex',
    gap: '16px',
    padding: '16px',
    backgroundColor: '#fafafa',
    borderRadius: '12px',
    alignItems: 'center',
  },
  opportunityIcon: {
    fontSize: '32px',
    minWidth: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
  },
  opportunityContent: {
    flex: 1,
  },
  opportunityHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  opportunityTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  urgentBadge: {
    padding: '2px 8px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: '600',
    borderRadius: '12px',
  },
  opportunityClinic: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
    margin: '0 0 4px 0',
  },
  opportunityPayment: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#7c3aed',
    fontWeight: '600',
    margin: 0,
  },
  applyButton: {
    padding: '8px 16px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  messagesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  messageCard: {
    position: 'relative',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  messageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  messageSender: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  messageTime: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#737373',
  },
  messageText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
    margin: 0,
  },
  unreadBadge: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    padding: '4px 8px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: '600',
    borderRadius: '12px',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '32px',
  },
  stars: {
    display: 'flex',
    gap: '4px',
  },
  reviewsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  reviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  reviewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  reviewerName: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  rating: {
    display: 'flex',
    gap: '2px',
  },
  reviewComment: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
    margin: '0 0 8px 0',
    lineHeight: '1.6',
  },
  reviewDate: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#737373',
  },
  settingsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
  },
  settingCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  settingIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  settingTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: '0 0 8px 0',
  },
  settingDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  warningBanner: {
    backgroundColor: colors.warningLight,
    border: `1px solid ${colors.warning}`,
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '24px',
  },
  warningContent: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  warningIcon: {
    color: colors.warning,
    flexShrink: 0,
    marginTop: '2px',
  },
  warningText: {
    flex: 1,
  },
  warningTitle: {
    display: 'block',
    fontSize: '16px',
    fontWeight: '600',
    color: colors.text,
    marginBottom: '4px',
  },
  warningMessage: {
    fontSize: '14px',
    color: colors.textSecondary,
    margin: 0,
    lineHeight: '1.5',
  },
};

export default FreelancerDashboardPage;

