import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import FloatingActionButton from '../components/FloatingActionButton';

const VetDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('resumo');

  // Check authentication
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userRole = user?.user_metadata?.role || user?.role;
    
    if (!user || !user.id) {
      navigate('/login');
      return;
    }
    
    if (userRole !== 'vet') {
      navigate('/clinic-dashboard');
    }
  }, [navigate]);

  // Floating Action Button options
  const fabOptions = [
    {
      id: 'view-demands',
      label: 'Ver Demandas',
      icon: '📋',
      path: '/demands',
      color: '#7c3aed',
    },
    {
      id: 'create-listing',
      label: 'Criar Anúncio',
      icon: '🛒',
      path: '/marketplace/create',
      color: '#10b981',
    },
  ];

  const menuItems: MenuItem[] = [
    {
      id: 'resumo',
      label: 'Meu Resumo',
      icon: '📊',
      action: 'section',
      sectionId: 'resumo',
    },
    {
      id: 'demandas',
      label: 'Demandas Disponíveis',
      icon: '📋',
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'candidaturas',
      label: 'Minhas Candidaturas',
      icon: '📝',
      action: 'navigate',
      path: '/my-applications',
    },
    {
      id: 'mensagens',
      label: 'Mensagens',
      icon: '💬',
      action: 'section',
      sectionId: 'mensagens',
    },
    {
      id: 'avaliacoes',
      label: 'Minhas Avaliações',
      icon: '⭐',
      action: 'section',
      sectionId: 'avaliacoes',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: '🛒',
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'perfil',
      label: 'Meu Perfil',
      icon: '👤',
      action: 'navigate',
      path: '/profile',
    },
    {
      id: 'configuracoes',
      label: 'Configurações',
      icon: '⚙️',
      action: 'section',
      sectionId: 'configuracoes',
    },
    {
      id: 'logout',
      label: 'Sair',
      icon: '🚪',
      action: 'logout',
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

  return (
    <>
      <DashboardLayout
        pageName="Dashboard do Veterinário"
        menuItems={menuItems}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        notificationCount={5}
      >
        <div style={styles.container}>
          {renderContent()}
        </div>
      </DashboardLayout>
      <FloatingActionButton options={fabOptions} />
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
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const vetId = user.id;

        // Import statisticsApi and demandsApi dynamically
        const { statisticsApi } = await import('../services/statisticsApi');
        const { demandsApi } = await import('../services/demandsApi');

        // Fetch vet statistics
        const { stats: vetStats } = await statisticsApi.getVetStats(vetId);
        setStats(vetStats);

        // Fetch available opportunities
        const { demands } = await demandsApi.getOpen('vet');
        setOpportunities(demands.slice(0, 3));
      } catch (error) {
        console.error('Error loading vet data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Meu Resumo Profissional</h2>
      <div style={styles.cardsGrid}>
        <DashboardCard
          title="Candidaturas Ativas"
          value={stats.totalApplications.toString()}
          icon="📝"
          color="#7c3aed"
          bgColor="#ede9fe"
        />
        <DashboardCard
          title="Trabalhos em Andamento"
          value={stats.activeJobs.toString()}
          icon="⏳"
          color="#0ea5e9"
          bgColor="#e0f2fe"
        />
        <DashboardCard
          title="Trabalhos Concluídos"
          value={stats.completedJobs.toString()}
          icon="✅"
          color="#22c55e"
          bgColor="#dcfce7"
        />
        <DashboardCard
          title="Avaliação Média"
          value={stats.averageRating.toFixed(1)}
          icon="⭐"
          color="#f59e0b"
          bgColor="#fef3c7"
        />
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
                icon="🏥"
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
        message="Olá Dr(a)! Gostaríamos de discutir mais detalhes sobre a cirurgia agendada."
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
        <div style={styles.stars}>⭐⭐⭐⭐⭐</div>
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
        icon="🔔"
        title="Notificações"
        description="Gerencie suas preferências de notificação"
      />
      <SettingCard
        icon="🔒"
        title="Privacidade"
        description="Controle quem pode ver seu perfil"
      />
      <SettingCard
        icon="📱"
        title="Preferências"
        description="Personalize sua experiência"
      />
      <SettingCard
        icon="🌐"
        title="Idioma"
        description="Português (Brasil)"
      />
    </div>
  </div>
);

// Utility Components
interface DashboardCardProps {
  title: string;
  value: string;
  icon: string;
  color: string;
  bgColor: string;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, value, icon, color, bgColor }) => (
  <div style={styles.dashboardCard}>
    <div style={{ ...styles.cardIcon, backgroundColor: bgColor, color }}>
      <span style={{ fontSize: '32px' }}>{icon}</span>
    </div>
    <div style={styles.cardContent}>
      <h3 style={{ ...styles.cardTitle, color: '#737373' }}>{title}</h3>
      <p style={{ ...styles.cardValue, color }}>{value}</p>
    </div>
  </div>
);

interface OpportunityItemProps {
  icon: string;
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
        {'⭐'.repeat(rating)}
      </div>
    </div>
    <p style={styles.reviewComment}>{comment}</p>
    <span style={styles.reviewDate}>{date}</span>
  </div>
);

interface SettingCardProps {
  icon: string;
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

// Styles
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
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '40px',
  },
  dashboardCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  cardIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    margin: '0 0 8px 0',
  },
  cardValue: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '32px',
    fontWeight: '700',
    margin: 0,
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
  statusBadge: {
    padding: '6px 12px',
    borderRadius: '20px',
    color: '#ffffff',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: '600',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '32px',
  },
  statCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  statValue: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '36px',
    fontWeight: '700',
    color: '#7c3aed',
  },
  statLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
  },
  stars: {
    fontSize: '20px',
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
    fontSize: '16px',
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
};

export default VetDashboardPage;

