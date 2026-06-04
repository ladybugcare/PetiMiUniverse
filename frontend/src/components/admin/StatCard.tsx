import React from 'react';
import GrowthIndicator from './GrowthIndicator';
import colors from '../../styles/colors';

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
      e.currentTarget.style.transform = 'translateY(-3px)';
      e.currentTarget.style.boxShadow = '0 12px 28px rgba(42, 39, 38, 0.08)';
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onClick) {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 1px 3px rgba(42, 39, 38, 0.06)';
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
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div
        style={{
          ...styles.statIcon,
          backgroundColor: `${color}14`,
        }}
      >
        {React.cloneElement(icon, { size: 34, color })}
      </div>
      <div style={styles.statContent}>
        <h3 style={styles.statValue}>{value}</h3>
        <p style={styles.statLabel}>{label}</p>
        {subtext && (
          <div style={styles.statSubtext}>
            <span>{subtext}</span>
            {growth !== undefined && growth !== 0 && <GrowthIndicator growth={growth} />}
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  statCard: {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderLeft: '4px solid',
    borderRadius: '14px',
    padding: '22px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    boxShadow: '0 1px 3px rgba(42, 39, 38, 0.06)',
  },
  statCardClickable: {
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  statIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '56px',
    height: '56px',
    borderRadius: '12px',
    flexShrink: 0,
  },
  statContent: {
    flex: 1,
    minWidth: 0,
  },
  statValue: {
    fontSize: 'clamp(1.5rem, 4vw, 2rem)',
    fontWeight: 800,
    color: colors.text,
    margin: 0,
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
  },
  statLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: colors.textSecondary,
    margin: 0,
    marginTop: '6px',
    lineHeight: 1.35,
  },
  statSubtext: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '10px',
    fontSize: '12px',
    color: colors.textMuted,
  },
};

export default StatCard;
