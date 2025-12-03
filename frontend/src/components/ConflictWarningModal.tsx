import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import colors from '../styles/colors';

interface Conflict {
  conflicting_application_id: string;
  conflicting_demand_id: string;
  conflicting_demand_title: string;
  conflicting_date: string;
  conflicting_start_time: string;
  conflicting_end_time: string;
}

interface ConflictWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  conflicts: Conflict[];
  title?: string;
  message?: string;
}

const ConflictWarningModal: React.FC<ConflictWarningModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  conflicts,
  title = 'Conflito de Horário Detectado',
  message = 'Você já tem uma demanda aprovada no mesmo horário. Deseja continuar mesmo assim?',
}) => {
  if (!isOpen) return null;

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    return time.substring(0, 5); // HH:MM
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={styles.headerContent}>
            <AlertTriangle size={24} style={{ color: '#f59e0b' }} />
            <h2 style={styles.title}>{title}</h2>
          </div>
          <button onClick={onClose} style={styles.closeButton}>
            <X size={20} />
          </button>
        </div>

        <div style={styles.content}>
          <p style={styles.message}>{message}</p>

          {conflicts.length > 0 && (
            <div style={styles.conflictsList}>
              <h3 style={styles.conflictsTitle}>Demandas Conflitantes:</h3>
              {conflicts.map((conflict, index) => (
                <div key={index} style={styles.conflictItem}>
                  <div style={styles.conflictHeader}>
                    <strong style={styles.conflictTitle}>{conflict.conflicting_demand_title}</strong>
                  </div>
                  <div style={styles.conflictDetails}>
                    <span style={styles.conflictDate}>
                      {formatDate(conflict.conflicting_date)}
                    </span>
                    <span style={styles.conflictTime}>
                      {formatTime(conflict.conflicting_start_time)}
                      {conflict.conflicting_end_time && ` - ${formatTime(conflict.conflicting_end_time)}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={styles.warningBox}>
            <AlertTriangle size={16} style={{ color: '#f59e0b', marginRight: '8px' }} />
            <span style={styles.warningText}>
              Se você continuar, a aplicação conflitante será automaticamente rejeitada.
            </span>
          </div>
        </div>

        <div style={styles.footer}>
          <button onClick={onClose} style={styles.cancelButton}>
            Cancelar
          </button>
          <button onClick={onConfirm} style={styles.confirmButton}>
            Continuar Mesmo Assim
          </button>
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
    padding: '20px',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
    borderBottom: '1px solid #e5e5e5',
  },
  headerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
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
    color: '#737373',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  },
  content: {
    padding: '24px',
  },
  message: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#262626',
    marginBottom: '20px',
    lineHeight: '1.5',
  },
  conflictsList: {
    marginBottom: '20px',
  },
  conflictsTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '12px',
  },
  conflictItem: {
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
    border: '1px solid #e5e5e5',
  },
  conflictHeader: {
    marginBottom: '8px',
  },
  conflictTitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    color: '#262626',
  },
  conflictDetails: {
    display: 'flex',
    gap: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#737373',
  },
  conflictDate: {
    fontWeight: '500',
  },
  conflictTime: {
    fontWeight: '500',
  },
  warningBox: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#fef3c7',
    borderRadius: '8px',
    border: '1px solid #fbbf24',
  },
  warningText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#92400e',
    lineHeight: '1.5',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '24px',
    borderTop: '1px solid #e5e5e5',
  },
  cancelButton: {
    padding: '10px 20px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#262626',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  confirmButton: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};

export default ConflictWarningModal;

