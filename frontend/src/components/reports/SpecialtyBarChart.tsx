import React, { useState, useRef, useEffect } from 'react';
import colors from '../../styles/colors';

interface SpecialtyBarChartProps {
  data: Array<{
    specialty: string;
    count: number;
  }>;
  totalDemands?: number; // Total de demandas para cálculo de percentual
}

const SpecialtyBarChart: React.FC<SpecialtyBarChartProps> = ({ data, totalDemands }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPositions, setTooltipPositions] = useState<{ [key: number]: React.CSSProperties }>({});
  const tooltipRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // Calcular posição dos tooltips após render
  useEffect(() => {
    if (hoveredIndex !== null) {
      const tooltip = tooltipRefs.current[hoveredIndex];
      if (tooltip) {
        const rect = tooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const newPositions: { [key: number]: React.CSSProperties } = {};

        // Se tooltip está muito à direita, ajustar para esquerda
        if (rect.right > viewportWidth - 10) {
          newPositions[hoveredIndex] = {
            left: 'auto',
            right: '0',
            transform: 'none',
          };
        }
        // Se tooltip está muito à esquerda, ajustar para direita
        else if (rect.left < 10) {
          newPositions[hoveredIndex] = {
            left: '0',
            right: 'auto',
            transform: 'none',
          };
        }
        // Se tooltip está muito acima, posicionar abaixo
        else if (rect.top < 10) {
          newPositions[hoveredIndex] = {
            bottom: 'auto',
            top: '100%',
            marginTop: '8px',
            marginBottom: '0',
          };
        }
        // Posição padrão (centro acima)
        else {
          newPositions[hoveredIndex] = {};
        }

        setTooltipPositions(newPositions);
      }
    }
  }, [hoveredIndex]);

  if (!data || data.length === 0) {
    return (
      <div style={styles.emptyState}>
        <p style={styles.emptyText}>Nenhum dado disponível</p>
      </div>
    );
  }

  // Calcular totais e percentuais
  const totalSpecialties = data.reduce((sum, item) => sum + item.count, 0);
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const barWidth = 100; // Percentual máximo (100% para barras proporcionais)

  // Calcular percentuais (em relação ao total das especialidades mostradas)
  const dataWithPercentages = data.map(item => ({
    ...item,
    percentage: totalSpecialties > 0 ? (item.count / totalSpecialties) * 100 : 0,
  }));

  return (
    <div style={styles.container}>
        <div style={styles.chartArea}>
        {dataWithPercentages.map((item, index) => {
          const widthPercent = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
          const isHovered = hoveredIndex === index;
          
              return (
            <div
              key={item.specialty}
              style={styles.barRow}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Label à esquerda */}
              <div style={styles.labelContainer}>
                <span style={styles.labelText} title={item.specialty}>
                  {item.specialty}
                </span>
              </div>

              {/* Barra horizontal */}
              <div style={styles.barContainer}>
                    <div
                      style={{
                        ...styles.bar,
                    width: `${widthPercent}%`,
                    backgroundColor: index === 0 ? colors.brand.primary[500]: 
                                    index === 1 ? colors.brand.primary[100] : 
                                    index === 2 ? colors.brand.primary[300] : '#c4b5fd',
                    transform: isHovered ? 'scaleY(1.05)' : 'scaleY(1)',
                    boxShadow: isHovered ? '0 4px 8px rgba(196, 108, 106, 0.3)' : 'none',
                      }}
                >
                  {/* Tooltip no hover */}
                  {isHovered && (
                    <div 
                      ref={(el) => { tooltipRefs.current[index] = el; }}
                      style={{
                        ...styles.tooltip,
                        ...(tooltipPositions[index] || {}),
                      }}
                    >
                      <div style={styles.tooltipArrow} />
                      <div style={styles.tooltipContent}>
                        <div style={styles.tooltipTitle}>{item.specialty}</div>
                        <div style={styles.tooltipRow}>
                          <span>Posições:</span>
                          <strong>{item.count}</strong>
                        </div>
                        <div style={styles.tooltipRow}>
                          <span>Percentual:</span>
                          <strong>{item.percentage.toFixed(1)}%</strong>
                        </div>
                      </div>
                  </div>
                  )}
                </div>
              </div>

              {/* Valor e percentual à direita */}
              <div style={styles.valueContainer}>
                <span style={styles.barValue}>{item.count}</span>
                <span style={styles.barPercentage}>({item.percentage.toFixed(1)}%)</span>
              </div>
                </div>
              );
            })}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  chartArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '8px 0',
  },
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    position: 'relative',
    minHeight: '40px',
    overflow: 'visible',
  },
  labelContainer: {
    minWidth: '150px',
    maxWidth: '200px',
    display: 'flex',
    alignItems: 'center',
    paddingRight: '12px',
    flexShrink: 0,
  },
  labelText: {
    fontSize: '13px',
    color: '#525252',
    fontWeight: '500',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
  },
  barContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    minHeight: '32px',
    position: 'relative',
    minWidth: 0,
    overflow: 'hidden',
  },
  bar: {
    height: '28px',
    minWidth: '4px',
    borderRadius: '4px',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    position: 'relative',
  },
  valueContainer: {
    minWidth: '70px',
    maxWidth: '90px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
    paddingLeft: '12px',
    flexShrink: 0,
  },
  barValue: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#262626',
  },
  barPercentage: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#737373',
  },
  tooltip: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: '8px',
    backgroundColor: '#1f2937',
    color: '#ffffff',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '12px',
    zIndex: 1000,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    minWidth: '180px',
    pointerEvents: 'none',
  },
  tooltipArrow: {
    position: 'absolute',
    bottom: '-6px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '6px solid transparent',
    borderRight: '6px solid transparent',
    borderTop: '6px solid #1f2937',
  },
  tooltipContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  tooltipTitle: {
    fontWeight: '600',
    fontSize: '13px',
    marginBottom: '4px',
    color: '#ffffff',
  },
  tooltipRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    fontSize: '12px',
    color: '#e5e7eb',
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

export default SpecialtyBarChart;
