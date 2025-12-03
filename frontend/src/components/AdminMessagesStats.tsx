import React from 'react';
import { MessageSquare, TrendingUp, Users } from 'lucide-react';
import colors from '../styles/colors';

interface AdminMessagesStatsProps {
  stats: {
    total_conversations?: number;
    messages_today?: number;
    messages_week?: number;
    conversations_by_type?: {
      clinic_vet?: number;
      clinic_freelancer?: number;
    };
  };
}

export const AdminMessagesStats: React.FC<AdminMessagesStatsProps> = ({ stats }) => {
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Estatísticas de Mensagens</h2>
      
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statIcon}>
            <MessageSquare size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.total_conversations || 0}</h3>
            <p style={styles.statLabel}>Conversas Ativas</p>
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statIcon}>
            <TrendingUp size={24} color={colors.success} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.messages_today || 0}</h3>
            <p style={styles.statLabel}>Mensagens Hoje</p>
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statIcon}>
            <TrendingUp size={24} color={colors.info} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.messages_week || 0}</h3>
            <p style={styles.statLabel}>Mensagens Esta Semana</p>
          </div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statIcon}>
            <Users size={24} color={colors.secondary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>
              {stats.conversations_by_type?.clinic_vet || 0} / {stats.conversations_by_type?.clinic_freelancer || 0}
            </h3>
            <p style={styles.statLabel}>Clínica-Vet / Clínica-Freela</p>
          </div>
        </div>
      </div>

      <div style={styles.note}>
        <p style={styles.noteText}>
          ⚠️ Estas são apenas estatísticas agregadas. O conteúdo das mensagens não é acessível sem motivo específico (reporte ou ticket de suporte).
        </p>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '24px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: `1px solid ${colors.border}`,
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: colors.text,
    margin: '0 0 24px 0',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: `1px solid ${colors.border}`,
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
    fontSize: '24px',
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'Poppins, sans-serif',
    margin: '0 0 4px 0',
  },
  statLabel: {
    fontSize: '13px',
    color: colors.textSecondary,
    fontFamily: 'Inter, sans-serif',
    margin: 0,
  },
  note: {
    padding: '16px',
    backgroundColor: colors.warningLight,
    borderRadius: '8px',
    border: `1px solid ${colors.warning}`,
  },
  noteText: {
    fontSize: '13px',
    color: colors.text,
    fontFamily: 'Inter, sans-serif',
    margin: 0,
    lineHeight: '1.5',
  },
};

export default AdminMessagesStats;





