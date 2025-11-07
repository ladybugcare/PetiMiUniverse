import React from 'react';
import { CheckCircle } from 'lucide-react';
import { colors } from '../styles/colors';

interface SuccessModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
}

export const SuccessModal: React.FC<SuccessModalProps> = ({
  isOpen,
  message,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Icon */}
        <div style={styles.iconContainer}>
          // @ts-ignore - Type incompatibility between React 18 and lucide-react
          <CheckCircle size={64} color={colors.primary} />
        </div>

        {/* Message */}
        <p style={styles.message}>{message}</p>

        {/* Button */}
        <button onClick={onClose} style={styles.button}>
          OK
        </button>
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
    zIndex: 2000,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
  },
  iconContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    fontSize: '18px',
    fontWeight: '500',
    color: colors.text,
    margin: 0,
    lineHeight: '1.5',
  },
  button: {
    padding: '12px 48px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#ffffff',
    backgroundColor: colors.primary,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minWidth: '120px',
  },
};

