import React from 'react';
import colors from '../../styles/colors';

interface PendingCardProps {
  icon: React.ReactElement<{ size?: number; color?: string }>;
  title: string;
  description: string;
  count?: number;
  highlight?: boolean;
  onClick?: () => void;
  iconColor?: string;
}

const PendingCard: React.FC<PendingCardProps> = ({
  icon,
  title,
  description,
  count,
  highlight = false,
  onClick,
  iconColor = colors.brand.primary[500],
}) => {
  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onClick) {
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.boxShadow = `0 10px 25px ${iconColor}25`;
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
        ...styles.pendingCard,
        ...(onClick ? styles.statCardClickable : {}),
        ...(highlight ? styles.pendingCardHighlight : {}),
      }}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div style={styles.pendingIcon}>
        {React.cloneElement(icon, { size: 32, color: iconColor })}
        {count !== undefined && count > 0 && (
          <span style={styles.badge}>{count}</span>
        )}
      </div>
      <div style={styles.pendingContent}>
        <h4 style={styles.pendingTitle}>{title}</h4>
        <p style={styles.pendingText}>{description}</p>
      </div>
      {onClick && <div style={styles.pendingArrow}>→</div>}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  pendingCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  statCardClickable: {
    cursor: 'pointer',
  },
  pendingCardHighlight: {
    borderColor: colors.brand.primary[500],
    borderWidth: '2px',
    backgroundColor: colors.brand.primary[500] || '#f5f3ff',
  },
  pendingIcon: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    backgroundColor: colors.error[500] || '#ef4444',
    color: '#ffffff',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: '700',
  },
  pendingContent: {
    flex: 1,
  },
  pendingTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '4px',
  },
  pendingText: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  pendingArrow: {
    fontSize: '20px',
    color: colors.brand.primary[500],
    fontWeight: '600',
  },
};

export default PendingCard;

