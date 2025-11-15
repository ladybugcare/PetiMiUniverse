import React from 'react';
import colors from '../../styles/colors';

interface StatusPieChartProps {
  data: {
    open: number;
    in_progress: number;
    closed: number;
    cancelled: number;
  };
}

const StatusPieChart: React.FC<StatusPieChartProps> = ({ data }) => {
  const total = data.open + data.in_progress + data.closed + data.cancelled;
  
  if (total === 0) {
    return (
      <div style={styles.emptyState}>
        <p style={styles.emptyText}>Nenhum dado disponível</p>
      </div>
    );
  }

  // Calculate percentages and angles
  const openPercent = (data.open / total) * 100;
  const inProgressPercent = (data.in_progress / total) * 100;
  const closedPercent = (data.closed / total) * 100;
  const cancelledPercent = (data.cancelled / total) * 100;

  const openAngle = (openPercent / 100) * 360;
  const inProgressAngle = (inProgressPercent / 100) * 360;
  const closedAngle = (closedPercent / 100) * 360;
  const cancelledAngle = (cancelledPercent / 100) * 360;

  // Donut chart parameters
  const centerX = 125;
  const centerY = 125;
  const outerRadius = 100;
  const innerRadius = 70; // Creates the donut hole

  // Calculate cumulative angles for SVG path
  let currentAngle = -90; // Start at top

  const paths: Array<{ path: string; color: string; angle: number }> = [];

  // Helper function to create donut segment path
  const createDonutPath = (startAngle: number, endAngle: number) => {
    const angleDiff = endAngle - startAngle;
    
    // Handle full circle (360 degrees) - create complete donut ring using two semicircles
    if (Math.abs(angleDiff) >= 360) {
      // For a full circle, create two semicircles that connect
      const startAngleRad = (startAngle * Math.PI) / 180;
      const midAngleRad = ((startAngle + 180) * Math.PI) / 180;
      
      // Outer circle points
      const x1 = centerX + outerRadius * Math.cos(startAngleRad);
      const y1 = centerY + outerRadius * Math.sin(startAngleRad);
      const x2 = centerX + outerRadius * Math.cos(midAngleRad);
      const y2 = centerY + outerRadius * Math.sin(midAngleRad);
      
      // Inner circle points
      const x3 = centerX + innerRadius * Math.cos(midAngleRad);
      const y3 = centerY + innerRadius * Math.sin(midAngleRad);
      const x4 = centerX + innerRadius * Math.cos(startAngleRad);
      const y4 = centerY + innerRadius * Math.sin(startAngleRad);
      
      // Create path: outer semicircle -> line to inner -> inner semicircle -> close
      return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 1 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 1 0 ${x4} ${y4} Z`;
    }
    
    const startAngleRad = (startAngle * Math.PI) / 180;
    const endAngleRad = (endAngle * Math.PI) / 180;
    
    const x1 = centerX + outerRadius * Math.cos(startAngleRad);
    const y1 = centerY + outerRadius * Math.sin(startAngleRad);
    const x2 = centerX + outerRadius * Math.cos(endAngleRad);
    const y2 = centerY + outerRadius * Math.sin(endAngleRad);
    
    const x3 = centerX + innerRadius * Math.cos(endAngleRad);
    const y3 = centerY + innerRadius * Math.sin(endAngleRad);
    const x4 = centerX + innerRadius * Math.cos(startAngleRad);
    const y4 = centerY + innerRadius * Math.sin(startAngleRad);
    
    const largeArc = Math.abs(angleDiff) > 180 ? 1 : 0;
    
    // Path: Move to outer start -> Arc outer (clockwise) -> Line to inner -> Arc inner (counter-clockwise) -> Close
    return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;
  };

  if (openAngle > 0) {
    const startAngle = currentAngle;
    currentAngle += openAngle;
    const endAngle = currentAngle;
    paths.push({ 
      path: createDonutPath(startAngle, endAngle), 
      color: colors.primary, 
      angle: openAngle 
    });
  }

  if (inProgressAngle > 0) {
    const startAngle = currentAngle;
    currentAngle += inProgressAngle;
    const endAngle = currentAngle;
    paths.push({ 
      path: createDonutPath(startAngle, endAngle), 
      color: colors.warning, 
      angle: inProgressAngle 
    });
  }

  if (closedAngle > 0) {
    const startAngle = currentAngle;
    currentAngle += closedAngle;
    const endAngle = currentAngle;
    paths.push({ 
      path: createDonutPath(startAngle, endAngle), 
      color: colors.success, 
      angle: closedAngle 
    });
  }

  if (cancelledAngle > 0) {
    const startAngle = currentAngle;
    currentAngle += cancelledAngle;
    const endAngle = currentAngle;
    paths.push({ 
      path: createDonutPath(startAngle, endAngle), 
      color: colors.danger, 
      angle: cancelledAngle 
    });
  }

  return (
    <div style={styles.container}>
      <div style={styles.chartWrapper}>
        <svg width="250" height="250" viewBox="0 0 250 250" style={styles.svg}>
          {paths.map((item, index) => (
            <path
              key={index}
              d={item.path}
              fill={item.color}
              style={styles.slice}
            />
          ))}
        </svg>
        <div style={styles.centerText}>
          <div style={styles.totalValue}>{total}</div>
          <div style={styles.totalLabel}>Total</div>
        </div>
      </div>
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendColor, backgroundColor: colors.primary }} />
          <div style={styles.legendContent}>
            <span style={styles.legendLabel}>Abertas</span>
            <span style={styles.legendValue}>{data.open} ({openPercent.toFixed(1)}%)</span>
          </div>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendColor, backgroundColor: colors.warning }} />
          <div style={styles.legendContent}>
            <span style={styles.legendLabel}>Em Andamento</span>
            <span style={styles.legendValue}>{data.in_progress} ({inProgressPercent.toFixed(1)}%)</span>
          </div>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendColor, backgroundColor: colors.success }} />
          <div style={styles.legendContent}>
            <span style={styles.legendLabel}>Concluídas</span>
            <span style={styles.legendValue}>{data.closed} ({closedPercent.toFixed(1)}%)</span>
          </div>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendColor, backgroundColor: colors.danger }} />
          <div style={styles.legendContent}>
            <span style={styles.legendLabel}>Canceladas</span>
            <span style={styles.legendValue}>{data.cancelled} ({cancelledPercent.toFixed(1)}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  chartWrapper: {
    position: 'relative',
    width: '250px',
    height: '250px',
  },
  svg: {
    transform: 'rotate(0deg)',
  },
  slice: {
    transition: 'opacity 0.2s ease',
    cursor: 'pointer',
  },
  centerText: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center',
  },
  totalValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#262626',
  },
  totalLabel: {
    fontSize: '14px',
    color: '#737373',
    marginTop: '4px',
  },
  legend: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  legendColor: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
    flexShrink: 0,
  },
  legendContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
  },
  legendLabel: {
    fontSize: '14px',
    color: '#525252',
  },
  legendValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#262626',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '200px',
    width: '100%',
  },
  emptyText: {
    fontSize: '14px',
    color: '#737373',
  },
};

export default StatusPieChart;
