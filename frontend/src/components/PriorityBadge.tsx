import React from 'react';
import colors from '../styles/colors';

interface PriorityBadgeProps {
  priority: 'baixa' | 'normal' | 'alta' | 'urgente';
  style?: React.CSSProperties;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, style }) => {
  const priorityConfig = {
    urgente: {
      label: 'Urgente',
      color: '#ef4444',
      bgColor: '#fee2e2',
    },
    alta: {
      label: 'Alta',
      color: '#f59e0b',
      bgColor: '#fef3c7',
    },
    normal: {
      label: 'Normal',
      color: '#3b82f6',
      bgColor: '#dbeafe',
    },
    baixa: {
      label: 'Baixa',
      color: '#6b7280',
      bgColor: '#f3f4f6',
    },
  };

  const config = priorityConfig[priority] || priorityConfig.normal;

  return (
    <span
      style={{
        ...styles.badge,
        color: config.color,
        backgroundColor: config.bgColor,
        ...style,
      }}
    >
      {config.label}
    </span>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  badge: {
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
    display: 'inline-block',
  },
};

export default PriorityBadge;





