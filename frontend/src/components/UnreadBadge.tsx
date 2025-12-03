import React from 'react';
import colors from '../styles/colors';

interface UnreadBadgeProps {
  count: number;
  style?: React.CSSProperties;
}

export const UnreadBadge: React.FC<UnreadBadgeProps> = ({ count, style }) => {
  if (count === 0) return null;

  const displayCount = count > 99 ? '99+' : count.toString();

  return (
    <div
      style={{
        ...styles.badge,
        ...style,
      }}
    >
      {displayCount}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  badge: {
    backgroundColor: colors.primary,
    color: '#ffffff',
    borderRadius: '12px',
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
    minWidth: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

export default UnreadBadge;





