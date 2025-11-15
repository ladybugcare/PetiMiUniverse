import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface MetricTooltipProps {
  text: string;
  children: React.ReactNode;
}

const MetricTooltip: React.FC<MetricTooltipProps> = ({ text, children }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<'top' | 'bottom' | 'left' | 'right'>('top');
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showTooltip && containerRef.current && tooltipRef.current) {
      const container = containerRef.current.getBoundingClientRect();
      const tooltip = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Check if tooltip would overflow on the right
      if (container.left + container.width / 2 + tooltip.width / 2 > viewportWidth - 10) {
        // Position to the left
        setTooltipPosition('left');
      }
      // Check if tooltip would overflow on the left
      else if (container.left + container.width / 2 - tooltip.width / 2 < 10) {
        // Position to the right
        setTooltipPosition('right');
      }
      // Check if tooltip would overflow on top
      else if (container.top - tooltip.height - 8 < 10) {
        // Position to the bottom
        setTooltipPosition('bottom');
      }
      // Default to top
      else {
        setTooltipPosition('top');
      }
    }
  }, [showTooltip]);

  const getTooltipStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      backgroundColor: '#1f2937',
      color: '#ffffff',
      padding: '8px 12px',
      borderRadius: '6px',
      fontSize: '12px',
      zIndex: 1000,
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      maxWidth: '300px',
      wordWrap: 'break-word',
      whiteSpace: 'normal',
    };

    switch (tooltipPosition) {
      case 'bottom':
        return {
          ...baseStyle,
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: '8px',
        };
      case 'left':
        return {
          ...baseStyle,
          right: '100%',
          top: '50%',
          transform: 'translateY(-50%)',
          marginRight: '8px',
        };
      case 'right':
        return {
          ...baseStyle,
          left: '100%',
          top: '50%',
          transform: 'translateY(-50%)',
          marginLeft: '8px',
        };
      default: // 'top'
        return {
          ...baseStyle,
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '8px',
        };
    }
  };

  const getArrowStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      width: 0,
      height: 0,
    };

    switch (tooltipPosition) {
      case 'bottom':
        return {
          ...baseStyle,
          top: '-4px',
          left: '50%',
          transform: 'translateX(-50%)',
          borderLeft: '4px solid transparent',
          borderRight: '4px solid transparent',
          borderBottom: '4px solid #1f2937',
        };
      case 'left':
        return {
          ...baseStyle,
          right: '-4px',
          top: '50%',
          transform: 'translateY(-50%)',
          borderTop: '4px solid transparent',
          borderBottom: '4px solid transparent',
          borderLeft: '4px solid #1f2937',
        };
      case 'right':
        return {
          ...baseStyle,
          left: '-4px',
          top: '50%',
          transform: 'translateY(-50%)',
          borderTop: '4px solid transparent',
          borderBottom: '4px solid transparent',
          borderRight: '4px solid #1f2937',
        };
      default: // 'top'
        return {
          ...baseStyle,
          bottom: '-4px',
          left: '50%',
          transform: 'translateX(-50%)',
          borderLeft: '4px solid transparent',
          borderRight: '4px solid transparent',
          borderTop: '4px solid #1f2937',
        };
    }
  };

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {children}
      <div style={styles.iconWrapper}>
        <HelpCircle size={14} color="#737373" />
      </div>
      {showTooltip && (
        <div ref={tooltipRef} style={getTooltipStyle()}>
          <div style={getArrowStyle()} />
          <p style={styles.tooltipText}>{text}</p>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  iconWrapper: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'help',
  },
  tooltipText: {
    margin: 0,
    lineHeight: '1.4',
  },
};

export default MetricTooltip;
