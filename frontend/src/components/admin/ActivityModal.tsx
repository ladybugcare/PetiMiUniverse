import React from 'react';
import { X } from 'lucide-react';
import { RecentActivity } from '../../services/statisticsApi';
import colors from '../../styles/colors';

interface ActivityModalProps {
  activities: RecentActivity[];
  isOpen: boolean;
  onClose: () => void;
  getActivityIcon: (iconName: string, color: string) => React.ReactNode;
  formatTimeAgo: (timestamp: string) => string;
}

const ActivityModal: React.FC<ActivityModalProps> = ({
  activities,
  isOpen,
  onClose,
  getActivityIcon,
  formatTimeAgo,
}) => {
  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Todas as Atividades</h2>
          <button
            style={styles.closeButton}
            onClick={onClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X size={24} color={colors.text} />
          </button>
        </div>
        <div style={styles.modalContent}>
          {activities.length > 0 ? (
            activities.map((activity) => (
              <div key={activity.id} style={styles.activityItem}>
                <div style={styles.activityIcon}>
                  {getActivityIcon(activity.icon, activity.color)}
                </div>
                <div style={styles.activityContent}>
                  <h4 style={styles.activityTitle}>{activity.title}</h4>
                  <p style={styles.activityDescription}>{activity.description}</p>
                </div>
                <div style={styles.activityTime}>{formatTimeAgo(activity.timestamp)}</div>
              </div>
            ))
          ) : (
            <p style={styles.emptyText}>Nenhuma atividade encontrada</p>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '800px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px',
    borderBottom: '1px solid #e5e5e5',
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  },
  modalContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  activityItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    backgroundColor: '#fafafa',
  },
  activityIcon: {
    width: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: '50%',
    flexShrink: 0,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '4px',
  },
  activityDescription: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  activityTime: {
    fontSize: '13px',
    color: '#a3a3a3',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  emptyText: {
    padding: '40px',
    textAlign: 'center',
    color: '#737373',
    fontSize: '16px',
  },
};

export default ActivityModal;

