import React, { useState, useEffect } from 'react';
import { statisticsApi } from '../../../services/statisticsApi';
import { demandsApi } from '../../../services/demandsApi';
import { applicationsApi } from '../../../services/applicationsApi';
import { ClipboardList, CheckCircle, MessageSquare, FileText, Star } from 'lucide-react';
import colors from '../../../styles/colors';

interface VetInternalDashboardProps {
  activeSection: string;
}

const VetInternalDashboard: React.FC<VetInternalDashboardProps> = ({ activeSection }) => {
  const renderSection = () => {
    switch (activeSection) {
      case 'resumo':
        return <ResumoSection />;
      case 'mensagens':
        return <MensagensSection />;
      case 'avaliacoes':
        return <AvaliacoesSection />;
      default:
        return <ResumoSection />;
    }
  };

  return <div style={styles.container}>{renderSection()}</div>;
};

const ResumoSection: React.FC = () => {
  const [stats, setStats] = useState({
    availableOpportunities: 0,
    totalApplications: 0,
    completedJobs: 0,
    averageRating: 0,
  });
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const user = JSON.parse(localStorage.getItem('user') || '');
        const vetId = user.id;

        // Fetch vet statistics
        const { stats: vetStats } = await statisticsApi.getVetStats(vetId);
        setStats(vetStats);

        // Fetch available opportunities
        const { demands } = await demandsApi.getOpen('vet');
        setOpportunities(demands.slice(0, 2));
      } catch (error) {
        console.error('Error loading vet internal data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Meu Resumo</h2>

      {/* Stats Cards */}
      <div style={styles.statsGrid}>
        <div 
          style={{ ...styles.statCard, borderLeftColor: colors.brand.primary[500] }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(196, 108, 106, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            <ClipboardList size={24} color={colors.brand.primary[500]} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.availableOpportunities}</h3>
            <p style={styles.statLabel}>Demandas Disponíveis</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, borderLeftColor: '#3b82f6' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            <FileText size={24} color={colors.brand.primary[500]} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalApplications}</h3>
            <p style={styles.statLabel}>Minhas Candidaturas</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, borderLeftColor: '#10b981' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(16, 185, 129, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            <CheckCircle size={24} color={colors.brand.primary[500]} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.completedJobs}</h3>
            <p style={styles.statLabel}>Atendimentos Completos</p>
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
            <Star size={24} color={colors.brand.primary[500]} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.averageRating.toFixed(1)}</h3>
            <p style={styles.statLabel}>Avaliação Média</p>
          </div>
        </div>
      </div>

      {/* Upcoming Schedule */}
      <div style={styles.scheduleSection}>
        <h3 style={styles.subsectionTitle}>Próximos Agendamentos</h3>
        <div style={styles.scheduleList}>
          <ScheduleItem
            date="Hoje, 14:00"
            title="Consulta Geral"
            type="Rotina"
            duration="2h"
          />
          <ScheduleItem
            date="Amanhã, 09:00"
            title="Emergência"
            type="Urgente"
            duration="4h"
          />
          <ScheduleItem
            date="18/11, 10:00"
            title="Cirurgia Programada"
            type="Cirurgia"
            duration="3h"
          />
        </div>
      </div>

      {/* Available Opportunities */}
      <div style={styles.opportunitiesSection}>
        <h3 style={styles.subsectionTitle}>Novas Oportunidades</h3>
        <div style={styles.opportunitiesList}>
          {loading ? (
            <p style={styles.placeholderText}>Carregando...</p>
          ) : opportunities.length > 0 ? (
            opportunities.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                title={opportunity.title}
                date={new Date(opportunity.demand_date).toLocaleDateString('pt-BR')}
                time={`${opportunity.start_time} - ${opportunity.duration_hours}h`}
                payment={opportunity.payment ? `R$ ${opportunity.payment}` : 'A combinar'}
              />
            ))
          ) : (
            <p style={styles.placeholderText}>Nenhuma oportunidade disponível no momento</p>
          )}
        </div>
      </div>
    </div>
  );
};

const MensagensSection: React.FC = () => {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Mensagens</h2>
      <div style={styles.placeholder}>
        <p style={styles.placeholderText}>
          {}
          <MessageSquare size={24} color={colors.brand.primary[500]} style={{ marginRight: '8px', display: 'inline-block', verticalAlign: 'middle' }} />
          Suas mensagens aparecerão aqui
        </p>
      </div>
    </div>
  );
};

const AvaliacoesSection: React.FC = () => {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Minhas Avaliações</h2>

      {/* Rating Summary */}
      <div style={styles.ratingSummary}>
        <div style={styles.ratingScore}>
          <h3 style={styles.scoreValue}>4.8</h3>
          <div style={styles.stars}>⭐⭐⭐⭐⭐</div>
          <p style={styles.scoreLabel}>Baseado em 24 avaliações</p>
        </div>
      </div>

      {/* Reviews List */}
      <div style={styles.reviewsList}>
        <ReviewCard
          rating={5}
          author="Clínica Vet Center"
          date="10/11/2025"
          comment="Excelente profissional, muito atencioso com os animais."
        />
        <ReviewCard
          rating={5}
          author="Pet Care Alphaville"
          date="05/11/2025"
          comment="Pontual e competente. Recomendo!"
        />
        <ReviewCard
          rating={4}
          author="Clínica São Francisco"
          date="01/11/2025"
          comment="Muito bom atendimento, pacientes ficaram tranquilos."
        />
      </div>
    </div>
  );
};

const ScheduleItem: React.FC<{
  date: string;
  title: string;
  type: string;
  duration: string;
}> = ({ date, title, type, duration }) => {
  const typeColors: any = {
    Rotina: '#3b82f6',
    Urgente: '#ef4444',
    Cirurgia: '#f59e0b',
  };

  return (
    <div style={styles.scheduleItem}>
      <div style={styles.scheduleTime}>{date}</div>
      <div style={styles.scheduleContent}>
        <h4 style={styles.scheduleTitle}>{title}</h4>
        <div style={styles.scheduleDetails}>
          <span
            style={{
              ...styles.scheduleType,
              backgroundColor: typeColors[type] || '#6b7280',
            }}
          >
            {type}
          </span>
          <span style={styles.scheduleDuration}>⏱️ {duration}</span>
        </div>
      </div>
    </div>
  );
};

const OpportunityCard: React.FC<{
  title: string;
  date: string;
  time: string;
  payment: string;
}> = ({ title, date, time, payment }) => {
  return (
    <div style={styles.opportunityCard}>
      <h4 style={styles.opportunityTitle}>{title}</h4>
      <div style={styles.opportunityDetails}>
        <span>📅 {date}</span>
        <span>⏰ {time}</span>
        <span style={styles.opportunityPayment}>💰 {payment}</span>
      </div>
      <button style={styles.applyButton}>Candidatar-se</button>
    </div>
  );
};

const ReviewCard: React.FC<{
  rating: number;
  author: string;
  date: string;
  comment: string;
}> = ({ rating, author, date, comment }) => {
  return (
    <div style={styles.reviewCard}>
      <div style={styles.reviewHeader}>
        <div>
          <div style={styles.reviewStars}>{'⭐'.repeat(rating)}</div>
          <h4 style={styles.reviewAuthor}>{author}</h4>
        </div>
        <span style={styles.reviewDate}>{date}</span>
      </div>
      <p style={styles.reviewComment}>{comment}</p>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    fontFamily: 'Inter, sans-serif',
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '28px',
    fontWeight: '700',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    marginBottom: '24px',
  },
  subsectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '24px',
    marginBottom: '32px',
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
    fontSize: '36px',
  },
  statContent: {
    flex: 1,
  },
  statValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
  },
  statLabel: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
    marginTop: '4px',
  },
  scheduleSection: {
    marginBottom: '32px',
  },
  scheduleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  scheduleItem: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    gap: '16px',
  },
  scheduleTime: {
    fontSize: '14px',
    fontWeight: '600',
    color: colors.brand.primary[500],
    minWidth: '120px',
  },
  scheduleContent: {
    flex: 1,
  },
  scheduleTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '8px',
  },
  scheduleDetails: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  scheduleType: {
    padding: '4px 12px',
    borderRadius: '16px',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '600',
  },
  scheduleDuration: {
    fontSize: '13px',
    color: '#737373',
  },
  opportunitiesSection: {
    marginTop: '32px',
  },
  opportunitiesList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },
  opportunityCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
  },
  opportunityTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '12px',
  },
  opportunityDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '14px',
    color: '#737373',
    marginBottom: '16px',
  },
  opportunityPayment: {
    color: '#10b981',
    fontWeight: '600',
  },
  applyButton: {
    width: '100%',
    padding: '10px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  ratingSummary: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '32px',
    textAlign: 'center',
    marginBottom: '24px',
  },
  ratingScore: {},
  scoreValue: {
    fontSize: '48px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
    marginBottom: '8px',
  },
  stars: {
    fontSize: '24px',
    marginBottom: '8px',
  },
  scoreLabel: {
    fontSize: '14px',
    color: '#737373',
  },
  reviewsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  reviewCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
  },
  reviewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  reviewStars: {
    fontSize: '16px',
    marginBottom: '4px',
  },
  reviewAuthor: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  reviewDate: {
    fontSize: '13px',
    color: '#a3a3a3',
  },
  reviewComment: {
    fontSize: '14px',
    color: '#525252',
    lineHeight: '1.6',
  },
  placeholder: {
    backgroundColor: '#fafafa',
    border: '2px dashed #e5e5e5',
    borderRadius: '12px',
    padding: '64px 32px',
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: '18px',
    color: '#525252',
  },
};

export default VetInternalDashboard;

