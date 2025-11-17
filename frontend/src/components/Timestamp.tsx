import React from 'react';

interface TimestampProps {
  date: string;
  format?: 'short' | 'long' | 'relative';
  style?: React.CSSProperties;
}

export const Timestamp: React.FC<TimestampProps> = ({ date, format = 'short', style }) => {
  const formatTimestamp = (dateString: string, formatType: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (formatType === 'relative') {
      if (diffMins < 1) return 'Agora';
      if (diffMins < 60) return `${diffMins}m atrás`;
      if (diffHours < 24) return `${diffHours}h atrás`;
      if (diffDays < 7) return `${diffDays}d atrás`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}sem atrás`;
      if (diffDays < 365) return `${Math.floor(diffDays / 30)}meses atrás`;
      return `${Math.floor(diffDays / 365)}anos atrás`;
    }

    if (formatType === 'short') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const messageDate = new Date(date);
      messageDate.setHours(0, 0, 0, 0);

      if (messageDate.getTime() === today.getTime()) {
        return date.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        });
      }

      if (diffDays < 7) {
        return date.toLocaleDateString('pt-BR', {
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
      }

      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    // long format
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <span style={{ ...styles.timestamp, ...style }}>
      {formatTimestamp(date, format)}
    </span>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  timestamp: {
    fontSize: '12px',
    color: '#737373',
    fontFamily: 'Inter, sans-serif',
  },
};

export default Timestamp;




