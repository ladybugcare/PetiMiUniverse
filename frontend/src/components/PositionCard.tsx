import React from 'react';
import { colors } from '../styles/colors';

interface PositionCardProps {
  position: {
    id: string;
    title: string;
    specialty: string;
    total_slots: number;
    filled_slots: number;
    available_slots: number;
    individual_payment: number;
    demand_date: string;
    start_time: string;
    end_time: string;
    demand_description?: string;
    category: string;
    application_status?: string | null;
  };
  onApply?: (positionId: string) => void;
  onCancel?: (positionId: string) => void;
  loading?: boolean;
}

const PositionCard: React.FC<PositionCardProps> = ({
  position,
  onApply,
  onCancel,
  loading = false,
}) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = () => {
    switch (position.application_status) {
      case 'pending':
        return (
          <span style={{ ...styles.badge, ...styles.badgePending }}>
            ⏳ Candidatura Pendente
          </span>
        );
      case 'accepted':
        return (
          <span style={{ ...styles.badge, ...styles.badgeAccepted }}>
            ✅ Aceito
          </span>
        );
      case 'rejected':
        return (
          <span style={{ ...styles.badge, ...styles.badgeRejected }}>
            ❌ Rejeitado
          </span>
        );
      case 'inactive_accepted_other_position':
        return (
          <span style={{ ...styles.badge, ...styles.badgeInactive }}>
            ℹ️ Aceito em outra posição desta demanda
          </span>
        );
      case 'inactive_time_conflict':
        return (
          <span style={{ ...styles.badge, ...styles.badgeInactive }}>
            ⚠️ Conflito de horário
          </span>
        );
      case 'cancelled_by_vet':
        return (
          <span style={{ ...styles.badge, ...styles.badgeCancelled }}>
            🚫 Cancelada
          </span>
        );
      default:
        return null;
    }
  };

  const getProgressPercentage = () => {
    return (position.filled_slots / position.total_slots) * 100;
  };

  const canApply = !position.application_status && position.available_slots > 0;
  const canCancel = position.application_status === 'pending';

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h3 style={styles.title}>{position.title}</h3>
        {getStatusBadge()}
      </div>

      <div style={styles.specialty}>
        <span style={styles.icon}>👨‍⚕️</span>
        <strong>Posição:</strong> {position.specialty}
      </div>

      {position.demand_description && (
        <p style={styles.description}>{position.demand_description}</p>
      )}

      <div style={styles.slots}>
        <div style={styles.slotsHeader}>
          <strong>Vagas:</strong>
          <span style={styles.slotsCount}>
            {position.available_slots} de {position.total_slots} disponíveis
          </span>
        </div>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${getProgressPercentage()}%`,
            }}
          />
        </div>
      </div>

      <div style={styles.infoRow}>
        <div style={styles.infoItem}>
          <span style={styles.icon}>📅</span>
          <span>{formatDate(position.demand_date)}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.icon}>⏰</span>
          <span>
            {position.start_time} - {position.end_time}
          </span>
        </div>
      </div>

      <div style={styles.payment}>
        <span style={styles.icon}>💰</span>
        <strong>R$ {position.individual_payment.toFixed(2)}</strong>
        <span style={styles.paymentLabel}>por profissional</span>
      </div>

      <div style={styles.actions}>
        {canApply && onApply && (
          <button
            onClick={() => onApply(position.id)}
            style={styles.applyButton}
            disabled={loading}
          >
            {loading ? 'Processando...' : 'Candidatar-se →'}
          </button>
        )}
        {canCancel && onCancel && (
          <button
            onClick={() => onCancel(position.id)}
            style={styles.cancelButton}
            disabled={loading}
          >
            Cancelar Candidatura
          </button>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
    transition: 'all 0.3s ease',
    cursor: 'default',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
    gap: '12px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
    flex: 1,
  },
  badge: {
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  badgePending: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  badgeAccepted: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
  },
  badgeRejected: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  badgeInactive: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
  },
  badgeCancelled: {
    backgroundColor: '#ede9fe',
    color: colors.brand.primary[800],
  },
  specialty: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '16px',
    color: '#525252',
    marginBottom: '12px',
  },
  description: {
    fontSize: '14px',
    color: '#737373',
    marginBottom: '16px',
    lineHeight: '1.6',
  },
  slots: {
    marginBottom: '16px',
  },
  slotsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    fontSize: '14px',
  },
  slotsCount: {
    color: colors.brand.primary[500],
    fontWeight: '600',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.brand.primary[500],
    transition: 'width 0.3s ease',
  },
  infoRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  infoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    color: '#525252',
  },
  icon: {
    fontSize: '16px',
  },
  payment: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: '#faf5ff',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  paymentLabel: {
    fontSize: '13px',
    color: '#737373',
  },
  actions: {
    display: 'flex',
    gap: '12px',
  },
  applyButton: {
    flex: 1,
    padding: '12px 24px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  cancelButton: {
    flex: 1,
    padding: '12px 24px',
    backgroundColor: '#ffffff',
    color: '#dc2626',
    border: '1px solid #dc2626',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};

export default PositionCard;

