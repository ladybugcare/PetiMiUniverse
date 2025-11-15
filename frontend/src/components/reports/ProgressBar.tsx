import React, { useEffect, useState } from 'react';

interface ProgressBarProps {
  value: number;
  maxValue?: number;
  color?: string;
  showLabel?: boolean;
  animated?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  maxValue = 100,
  color,
  showLabel = false,
  animated = true,
}) => {
  const [displayValue, setDisplayValue] = useState(animated ? 0 : value);

  useEffect(() => {
    if (animated) {
      // Animate from 0 to value
      const duration = 600; // 0.6s
      const startTime = Date.now();
      const startValue = 0;
      const endValue = Math.min(value, maxValue);

      const animate = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function: ease-out
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentValue = startValue + (endValue - startValue) * eased;

        setDisplayValue(currentValue);

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    } else {
      setDisplayValue(Math.min(value, maxValue));
    }
  }, [value, maxValue, animated]);

  const percentage = maxValue > 0 ? (displayValue / maxValue) * 100 : 0;
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
  const defaultColor = '#7c3aed'; // colors.primary as fallback

  return (
    <div style={styles.container}>
      {showLabel && (
        <div style={styles.labelContainer}>
          <span style={styles.label}>{clampedPercentage.toFixed(1)}%</span>
        </div>
      )}
      <div style={styles.track}>
        <div
          style={{
            ...styles.fill,
            width: `${clampedPercentage}%`,
            backgroundColor: color || defaultColor,
            transition: animated ? 'width 0.6s ease-out' : 'none',
          }}
          aria-label={`Progress: ${clampedPercentage.toFixed(1)}%`}
          role="progressbar"
          aria-valuenow={clampedPercentage}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100%',
  },
  labelContainer: {
    marginBottom: '8px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  label: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#525252',
  },
  track: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.6s ease-out',
  },
};

export default ProgressBar;

