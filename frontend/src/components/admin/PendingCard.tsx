import React from 'react';
import { ChevronRight } from 'lucide-react';
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
  iconColor = colors.brand.primary[600],
}) => {
  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onClick) {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = '0 12px 28px rgba(42, 39, 38, 0.08)';
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onClick) {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = highlight
        ? '0 4px 14px rgba(196, 108, 106, 0.12)'
        : '0 1px 3px rgba(42, 39, 38, 0.06)';
    }
  };

  return (
    <div
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
      style={{
        ...styles.pendingCard,
        ...(onClick ? styles.pendingCardInteractive : {}),
        ...(highlight ? styles.pendingCardHighlight : {}),
      }}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        style={{
          ...styles.iconWrap,
          backgroundColor: highlight ? colors.surface : colors.neutral[100],
          borderColor: highlight ? colors.brand.primary[200] : colors.border,
        }}
      >
        {React.cloneElement(icon, { size: 28, color: iconColor })}
        {count !== undefined && count > 0 && <span style={styles.badge}>{count > 99 ? '99+' : count}</span>}
      </div>
      <div style={styles.pendingContent}>
        <h4 style={{ ...styles.pendingTitle, color: highlight ? colors.brand.primary[800] : colors.text }}>
          {title}
        </h4>
        <p style={styles.pendingText}>{description}</p>
      </div>
      {onClick && (
        <div style={styles.chevronWrap} aria-hidden>
          <ChevronRight size={22} color={highlight ? colors.brand.primary[600] : colors.neutral[400]} />
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  pendingCard: {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '14px',
    padding: '18px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
    boxShadow: '0 1px 3px rgba(42, 39, 38, 0.06)',
  },
  pendingCardInteractive: {
    cursor: 'pointer',
  },
  pendingCardHighlight: {
    borderColor: colors.brand.primary[300],
    borderWidth: '1px',
    backgroundColor: colors.brand.primary[50],
    boxShadow: '0 4px 14px rgba(196, 108, 106, 0.12)',
  },
  iconWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '52px',
    height: '52px',
    borderRadius: '12px',
    border: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  badge: {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    backgroundColor: colors.error[500],
    color: colors.surface,
    borderRadius: '999px',
    minWidth: '22px',
    height: '22px',
    padding: '0 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
  },
  pendingContent: {
    flex: 1,
    minWidth: 0,
  },
  pendingTitle: {
    fontSize: '16px',
    fontWeight: 700,
    margin: 0,
    marginBottom: '4px',
    letterSpacing: '-0.02em',
  },
  pendingText: {
    fontSize: '13px',
    color: colors.textSecondary,
    margin: 0,
    lineHeight: 1.45,
  },
  chevronWrap: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
  },
};

export default PendingCard;
