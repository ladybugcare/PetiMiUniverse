import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import IconWrapper from './IconWrapper';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  showCancel?: boolean;
}

const Alert: React.FC<AlertProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  confirmText = 'OK',
  cancelText = 'Cancelar',
  onConfirm,
  showCancel = false,
}) => {
  if (!isOpen) return null;

  const getIconAndColor = () => {
    switch (type) {
      case 'success':
        return { icon: <IconWrapper icon={CheckCircle} size={32} />, color: '#10b981', bgColor: '#d1fae5' };
      case 'error':
        return { icon: <IconWrapper icon={XCircle} size={32} />, color: '#ef4444', bgColor: '#fee2e2' };
      case 'warning':
        return { icon: <IconWrapper icon={AlertTriangle} size={32} />, color: '#f59e0b', bgColor: '#fef3c7' };
      case 'info':
      default:
        return { icon: <IconWrapper icon={Info} size={32} />, color: '#7c3aed', bgColor: '#ede9fe' };
    }
  };

  const { icon, color, bgColor } = getIconAndColor();

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  // Prevenir fechamento ao clicar no backdrop - só fecha com botão OK
  const handleBackdropClick = (e: React.MouseEvent) => {
    // Não fazer nada - não permitir fechar ao clicar no backdrop
    e.stopPropagation();
  };

  const handleModalClick = (e: React.MouseEvent) => {
    // Prevenir que cliques no modal fechem o alerta
    e.stopPropagation();
  };

  return (
    <div style={styles.overlay} onClick={handleBackdropClick}>
      <div style={styles.modal} onClick={handleModalClick}>
        {/* Icon */}
        <div
          style={{
            ...styles.iconContainer,
            backgroundColor: bgColor,
            color: color,
          }}
        >
          <span style={styles.icon}>{icon}</span>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {title && <h3 style={styles.title}>{title}</h3>}
          <p style={styles.message}>{message}</p>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          {showCancel && (
            <button onClick={onClose} style={{ ...styles.button, ...styles.cancelButton }}>
              {cancelText}
            </button>
          )}
          <button
            onClick={handleConfirm}
            style={{
              ...styles.button,
              ...styles.confirmButton,
              backgroundColor: color,
            }}
          >
            {confirmText}
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
    zIndex: 10000,
    padding: '16px',
    animation: 'fadeIn 0.2s ease',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '440px',
    width: '100%',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    animation: 'slideUp 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
  },
  iconContainer: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: '32px',
    fontWeight: 'bold',
  },
  content: {
    textAlign: 'center',
    width: '100%',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '8px',
    margin: '0 0 8px 0',
  },
  message: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '15px',
    color: '#525252',
    lineHeight: '1.6',
    margin: 0,
  },
  actions: {
    display: 'flex',
    gap: '12px',
    width: '100%',
  },
  button: {
    flex: 1,
    padding: '12px 24px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  confirmButton: {
    backgroundColor: '#7c3aed',
    color: '#ffffff',
  },
  cancelButton: {
    backgroundColor: '#fafafa',
    color: '#525252',
    border: '1px solid #e5e5e5',
  },
};

export default Alert;

