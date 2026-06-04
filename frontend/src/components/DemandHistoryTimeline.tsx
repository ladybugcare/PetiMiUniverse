import React from 'react';
import { CheckCircle, Calendar } from 'lucide-react';
import { colors } from '../styles/colors';

interface DemandHistoryItem {
  id: string;
  clinicName: string;
  title: string;
  specialty?: string;
  completedAt: string;
}

interface DemandHistoryTimelineProps {
  items: DemandHistoryItem[];
  limit?: number;
  showMore?: boolean;
  onShowMore?: () => void;
}

const DemandHistoryTimeline: React.FC<DemandHistoryTimelineProps> = ({ 
  items, 
  limit = 3,
  showMore = false,
  onShowMore
}) => {
  const displayItems = showMore ? items : items.slice(0, limit);
  const hasMore = items.length > limit;

  if (items.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyText}>Nenhuma demanda concluída ainda</p>
      </div>
    );
  }

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div style={styles.container}>
      {displayItems.map((item, index) => (
        <div key={item.id} style={styles.timelineItem}>
          <div style={styles.timelineIcon}>
            <CheckCircle size={16} color="#22c55e" />
          </div>
          <div style={styles.timelineContent}>
            <div style={styles.timelineHeader}>
              <span style={styles.clinicName}>{item.clinicName}</span>
              <span style={styles.date}>
                <Calendar size={12} style={{ marginRight: '4px' }} />
                {formatDate(item.completedAt)}
              </span>
            </div>
            <div style={styles.timelineTitle}>{item.title}</div>
            {item.specialty && (
              <div style={styles.timelineSpecialty}>{item.specialty}</div>
            )}
          </div>
        </div>
      ))}
      {hasMore && !showMore && onShowMore && (
        <button onClick={onShowMore} style={styles.showMoreButton}>
          Ver mais ({items.length - limit} restantes)
        </button>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  timelineItem: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  },
  timelineIcon: {
    flexShrink: 0,
    marginTop: '2px',
  },
  timelineContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  timelineHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  clinicName: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    color: '#262626',
  },
  date: {
    display: 'flex',
    alignItems: 'center',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#737373',
  },
  timelineTitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#262626',
    fontWeight: '500',
  },
  timelineSpecialty: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#737373',
    fontStyle: 'italic',
  },
  showMoreButton: {
    padding: '8px 16px',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: '500',
    color: colors.brand.primary[500],
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    alignSelf: 'flex-start',
  },
  empty: {
    padding: '24px',
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
};

export default DemandHistoryTimeline;

