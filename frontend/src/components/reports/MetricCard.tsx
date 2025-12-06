import React from 'react';
import { LucideIcon } from 'lucide-react';
import MetricTooltip from './MetricTooltip';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import colors from '../../styles/colors';

interface Trend {
  value: number; // percentual de mudança
  isPositive: boolean; // true se aumento é positivo para essa métrica
}

interface MetricCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tooltip?: string;
  trend?: Trend | null;
  color: string;
  formatValue?: (value: number) => string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  icon: Icon,
  tooltip,
  trend,
  color,
  formatValue,
}) => {
  const formattedValue = typeof value === 'number' 
    ? (formatValue ? formatValue(value) : value.toString())
    : value;

  const getTrendDisplay = () => {
    if (!trend) return null;

    const { value: trendValue, isPositive } = trend;
    const absValue = Math.abs(trendValue);
    
    // Se mudança é muito pequena (< 0.1%), considerar estável
    if (absValue < 0.1) {
      return (
        <div style={styles.trendContainer}>
          <Minus size={14} color="#737373" />
          <span style={styles.trendTextNeutral}>0.0%</span>
        </div>
      );
    }

    const isPositiveTrend = isPositive ? trendValue > 0 : trendValue < 0;
    const trendColor = isPositiveTrend ? colors.success[500]: colors.error[500];
    const TrendIcon = isPositiveTrend ? ArrowUp : ArrowDown;

    return (
      <div style={styles.trendContainer}>
        <TrendIcon size={14} color={trendColor} />
        <span style={{ ...styles.trendText, color: trendColor }}>
          {trendValue > 0 ? '+' : ''}{trendValue.toFixed(1)}%
        </span>
      </div>
    );
  };

  const valueElement = (
    <h3 style={{ ...styles.value, color }}>
      {formattedValue}
    </h3>
  );

  return (
    <div style={styles.card}>
      <div style={styles.iconContainer}>
        <Icon size={24} color={color} />
      </div>
      <div style={styles.content}>
        {tooltip ? (
          <MetricTooltip text={tooltip}>
            {valueElement}
          </MetricTooltip>
        ) : (
          valueElement
        )}
        {getTrendDisplay()}
        <p style={styles.label}>{label}</p>
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
    alignItems: 'center',
    gap: '16px',
    position: 'relative',
    overflow: 'visible',
    minHeight: '100px',
  },
  iconContainer: {
    flexShrink: 0,
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  value: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
    lineHeight: '1.2',
  },
  trendContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginTop: '2px',
  },
  trendText: {
    fontSize: '12px',
    fontWeight: '600',
  },
  trendTextNeutral: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#737373',
  },
  label: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
    marginTop: '4px',
  },
};

export default MetricCard;

