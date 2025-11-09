import React from 'react';
import { TrendingUp, AlertTriangle, Clock, Building, Info } from 'lucide-react';
import { SystemInsight } from '../../services/statisticsApi';
import colors from '../../styles/colors';

interface SystemInsightsProps {
  insights: SystemInsight[];
}

const SystemInsights: React.FC<SystemInsightsProps> = ({ insights }) => {
  const getIcon = (iconName: string) => {
    const iconProps = { size: 24 };
    switch (iconName) {
      case 'trending-up':
        return <TrendingUp {...iconProps} />;
      case 'alert-triangle':
        return <AlertTriangle {...iconProps} />;
      case 'clock':
        return <Clock {...iconProps} />;
      case 'building':
        return <Building {...iconProps} />;
      default:
        return <Info {...iconProps} />;
    }
  };

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'positive':
        return {
          borderColor: '#10b981',
          backgroundColor: '#f0fdf4',
          iconColor: '#10b981',
        };
      case 'warning':
        return {
          borderColor: '#f59e0b',
          backgroundColor: '#fffbeb',
          iconColor: '#f59e0b',
        };
      case 'info':
        return {
          borderColor: '#3b82f6',
          backgroundColor: '#eff6ff',
          iconColor: '#3b82f6',
        };
      default:
        return {
          borderColor: '#e5e5e5',
          backgroundColor: '#fafafa',
          iconColor: '#737373',
        };
    }
  };

  if (insights.length === 0) {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.grid}>
        {insights.map((insight, index) => {
          const typeStyles = getTypeStyles(insight.type);
          return (
            <div
              key={index}
              style={{
                ...styles.card,
                borderLeftColor: typeStyles.borderColor,
                backgroundColor: typeStyles.backgroundColor,
              }}
            >
              <div style={{ ...styles.icon, color: typeStyles.iconColor }}>
                {getIcon(insight.icon)}
              </div>
              <div style={styles.content}>
                <h4 style={styles.cardTitle}>{insight.title}</h4>
                <p style={styles.cardMessage}>{insight.message}</p>
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
    marginTop: '32px',
    marginBottom: '32px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '16px',
  },
  card: {
    border: '1px solid #e5e5e5',
    borderLeft: '4px solid',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
  },
  icon: {
    flexShrink: 0,
  },
  content: {
    flex: 1,
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '8px',
  },
  cardMessage: {
    fontSize: '14px',
    color: '#525252',
    margin: 0,
    lineHeight: '1.5',
  },
};

export default SystemInsights;

