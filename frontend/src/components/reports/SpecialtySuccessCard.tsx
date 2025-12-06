import React, { useState } from 'react';
import ProgressBar from './ProgressBar';
import colors from '../../styles/colors';

interface SpecialtySuccessCardProps {
  specialty: string;
  created: number;
  filled: number;
  successRate: number;
  isTopPerformer?: boolean;
}

const SpecialtySuccessCard: React.FC<SpecialtySuccessCardProps> = ({
  specialty,
  created,
  filled,
  successRate,
  isTopPerformer = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Determine color based on success rate
  const getProgressColor = (): string => {
      if (isTopPerformer) {
        return colors.brand.primary[500];
      }
    if (successRate >= 80) {
      return colors.success[500]
    }
    if (successRate >= 50) {
      return colors.warning[500]
    }
    return colors.error[500];
  };

  const progressColor = getProgressColor();

  return (
    <div
      style={{
        ...styles.card,
        ...(isTopPerformer ? styles.topPerformerCard : {}),
        ...(isHovered ? styles.cardHover : {}),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="article"
      aria-label={`Especialidade ${specialty}: ${created} posições criadas, ${filled} preenchidas, taxa de sucesso de ${successRate.toFixed(1)}%`}
    >
      <div style={styles.header}>
        <h4 style={styles.specialtyName} title={specialty}>
          {specialty}
        </h4>
        {isTopPerformer && (
          <span style={styles.topPerformerBadge}>Top Performer</span>
        )}
      </div>

      <div style={styles.metricsRow}>
        <div style={styles.metric}>
          <span style={styles.metricLabel}>Criadas:</span>
          <span style={styles.metricValue}>{created}</span>
        </div>
        <div style={styles.metric}>
          <span style={styles.metricLabel}>Preenchidas:</span>
          <span style={styles.metricValue}>{filled}</span>
        </div>
      </div>

      <div style={styles.successRateContainer}>
        <div style={styles.successRateHeader}>
          <span style={styles.successRateLabel}>Taxa de Sucesso:</span>
          <span
            style={{
              ...styles.successRateValue,
              color: progressColor,
            }}
          >
            {successRate.toFixed(1)}%
          </span>
        </div>
        <ProgressBar
          value={successRate}
          maxValue={100}
          color={progressColor}
          animated={true}
        />
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  card: {
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    transition: 'all 0.2s ease',
    cursor: 'default',
  },
  cardHover: {
    transform: 'scale(1.02)',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  topPerformerCard: {
    border: `2px solid ${colors.brand.primary[500]}`,
    backgroundColor: colors.brand.primary[500],
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  specialtyName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  topPerformerBadge: {
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  metricsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  },
  metricLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#737373',
  },
  metricValue: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#262626',
  },
  successRateContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  successRateHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successRateLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#737373',
  },
  successRateValue: {
    fontSize: '18px',
    fontWeight: '700',
  },
};

export default SpecialtySuccessCard;

