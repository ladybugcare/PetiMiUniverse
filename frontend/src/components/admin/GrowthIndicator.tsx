import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface GrowthIndicatorProps {
  growth: number;
  showIcon?: boolean;
}

const GrowthIndicator: React.FC<GrowthIndicatorProps> = ({ growth, showIcon = true }) => {
  const isPositive = growth > 0;
  const isNegative = growth < 0;
  const isNeutral = growth === 0;

  const color = isPositive ? '#10b981' : isNegative ? '#ef4444' : '#737373';
  const formattedGrowth = Math.abs(growth).toFixed(1);

  return (
    <div style={{ ...styles.container, color }}>
      {showIcon && (
        <>
          {isPositive && <TrendingUp size={14} style={styles.icon} />}
          {isNegative && <TrendingDown size={14} style={styles.icon} />}
          {isNeutral && <Minus size={14} style={styles.icon} />}
        </>
      )}
      <span style={styles.text}>
        {isPositive ? '+' : ''}{formattedGrowth}%
      </span>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    fontWeight: '600',
  },
  icon: {
    flexShrink: 0,
  },
  text: {
    lineHeight: 1,
  },
};

export default GrowthIndicator;

