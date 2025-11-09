import React from 'react';
import { GrowthTrend } from '../../services/statisticsApi';
import colors from '../../styles/colors';

interface GrowthChartProps {
  trends: GrowthTrend[];
}

const GrowthChart: React.FC<GrowthChartProps> = ({ trends }) => {
  // Format data for chart - show last 30 days or all if less
  const chartData = trends.slice(-30).map((trend) => ({
    date: new Date(trend.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    Clínicas: trend.clinics,
    Veterinários: trend.vets,
    Freelancers: trend.freelancers,
    Demandas: trend.demands,
  }));

  // Calculate max value for scaling
  const maxValue = Math.max(
    ...chartData.map((d) => Math.max(d.Clínicas, d.Veterinários, d.Freelancers, d.Demandas)),
    1
  );

  const barHeight = 200;

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Crescimento Mensal</h3>
      <div style={styles.chartContainer}>
        <div style={styles.chartWrapper}>
          {/* Y-axis labels */}
          <div style={styles.yAxis}>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <div key={ratio} style={styles.yAxisLabel}>
                {Math.round(maxValue * ratio)}
              </div>
            ))}
          </div>

          {/* Chart area */}
          <div style={styles.chartArea}>
            {/* Grid lines */}
            <div style={styles.grid}>
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                <div
                  key={ratio}
                  style={{
                    ...styles.gridLine,
                    bottom: `${ratio * 100}%`,
                  }}
                />
              ))}
            </div>

            {/* Bars */}
            <div style={styles.barsContainer}>
              {chartData.map((data, index) => (
                <div key={index} style={styles.barGroup}>
                  <div style={styles.bars}>
                    <div
                      style={{
                        ...styles.bar,
                        height: `${(data.Clínicas / maxValue) * barHeight}px`,
                        backgroundColor: '#7c3aed',
                      }}
                      title={`Clínicas: ${data.Clínicas}`}
                    />
                    <div
                      style={{
                        ...styles.bar,
                        height: `${(data.Veterinários / maxValue) * barHeight}px`,
                        backgroundColor: '#3b82f6',
                      }}
                      title={`Veterinários: ${data.Veterinários}`}
                    />
                    <div
                      style={{
                        ...styles.bar,
                        height: `${(data.Freelancers / maxValue) * barHeight}px`,
                        backgroundColor: '#8b5cf6',
                      }}
                      title={`Freelancers: ${data.Freelancers}`}
                    />
                    <div
                      style={{
                        ...styles.bar,
                        height: `${(data.Demandas / maxValue) * barHeight}px`,
                        backgroundColor: '#10b981',
                      }}
                      title={`Demandas: ${data.Demandas}`}
                    />
                  </div>
                  <div style={styles.xAxisLabel}>{data.date}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={styles.legend}>
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendColor, backgroundColor: '#7c3aed' }} />
            <span>Clínicas</span>
          </div>
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendColor, backgroundColor: '#3b82f6' }} />
            <span>Veterinários</span>
          </div>
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendColor, backgroundColor: '#8b5cf6' }} />
            <span>Freelancers</span>
          </div>
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendColor, backgroundColor: '#10b981' }} />
            <span>Demandas</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    marginTop: '32px',
    marginBottom: '32px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  chartContainer: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '24px',
  },
  chartWrapper: {
    display: 'flex',
    gap: '16px',
    marginBottom: '24px',
  },
  yAxis: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '220px',
    fontSize: '12px',
    color: '#737373',
    minWidth: '40px',
  },
  yAxisLabel: {
    textAlign: 'right',
    paddingRight: '8px',
  },
  chartArea: {
    flex: 1,
    position: 'relative',
    height: '220px',
  },
  grid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '1px',
    backgroundColor: '#e5e5e5',
    borderTop: '1px dashed #e5e5e5',
  },
  barsContainer: {
    display: 'flex',
    gap: '4px',
    alignItems: 'flex-end',
    height: '100%',
    paddingTop: '20px',
  },
  barGroup: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  bars: {
    display: 'flex',
    gap: '2px',
    alignItems: 'flex-end',
    height: '200px',
    width: '100%',
  },
  bar: {
    flex: 1,
    minHeight: '2px',
    borderRadius: '4px 4px 0 0',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
  },
  xAxisLabel: {
    fontSize: '10px',
    color: '#737373',
    textAlign: 'center',
    marginTop: '4px',
    transform: 'rotate(-45deg)',
    transformOrigin: 'center',
    whiteSpace: 'nowrap',
  },
  legend: {
    display: 'flex',
    justifyContent: 'center',
    gap: '24px',
    flexWrap: 'wrap',
    paddingTop: '16px',
    borderTop: '1px solid #e5e5e5',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#262626',
  },
  legendColor: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
  },
};

export default GrowthChart;

