import React, { useState } from 'react';
import colors from '../../styles/colors';

interface SpecialtyHireCardProps {
  specialty: string;
  count: number;
  percentage: number;
  isTopHired?: boolean;
}

const SpecialtyHireCard: React.FC<SpecialtyHireCardProps> = ({
  specialty,
  count,
  percentage,
  isTopHired = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{
        ...styles.card,
        ...(isTopHired ? styles.topHiredCard : {}),
        ...(isHovered ? styles.cardHover : {}),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="article"
      aria-label={`Especialidade ${specialty}: ${count} profissionais contratados, ${percentage.toFixed(1)}% do total`}
    >
      <div style={styles.header}>
        <h4 style={styles.specialtyName} title={specialty}>
          {specialty}
        </h4>
        {isTopHired && (
          <span style={styles.topHiredBadge}>Mais Contratada</span>
        )}
      </div>

      <div style={styles.metricsRow}>
        <div style={styles.metric}>
          <span style={styles.metricLabel}>Profissionais:</span>
          <span style={styles.metricValue}>{count}</span>
        </div>
        <div style={styles.metric}>
          <span style={styles.metricLabel}>Percentual:</span>
          <span style={{ ...styles.metricValue, color: colors.brand.primary[500]}}>
            {percentage.toFixed(1)}%
          </span>
        </div>
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
  topHiredCard: {
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
  topHiredBadge: {
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
};

export default SpecialtyHireCard;

