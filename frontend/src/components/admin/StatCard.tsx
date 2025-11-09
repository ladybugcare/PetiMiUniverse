import React from 'react';
import { LucideIcon } from 'lucide-react';
import GrowthIndicator from './GrowthIndicator';

interface StatCardProps {
  icon: React.ReactElement<{ size?: number; color?: string }>;
  value: number | string;
  label: string;
  color: string;
  onClick?: () => void;
  subtext?: string | null;
  growth?: number;
}

const StatCard: React.FC<StatCardProps> = ({
  icon,
  value,
  label,
  color,
  onClick,
  subtext,
  growth,
}) => {
  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onClick) {
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.boxShadow = `0 10px 25px ${color}25`;
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onClick) {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
    }
  };

  return (
    <div
      style={{
        ...styles.statCard,
        ...(onClick ? styles.statCardClickable : {}),
        borderLeftColor: color,
      }}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div style={styles.statIcon}>
        {React.cloneElement(icon, { size: 36, color })}
      </div>
      <div style={styles.statContent}>
        <h3 style={styles.statValue}>{value}</h3>
        <p style={styles.statLabel}>{label}</p>
        {subtext && (
          <div style={styles.statSubtext}>
            <span>{subtext}</span>
            {growth !== undefined && growth !== 0 && (
              <GrowthIndicator growth={growth} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  statCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderLeft: '4px solid',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  statCardClickable: {
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
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
    color: '#262626',
    margin: 0,
  },
  statLabel: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
    marginTop: '4px',
  },
  statSubtext: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
    fontSize: '12px',
    color: '#737373',
  },
};

export default StatCard;

