import React from 'react';
import colors from '../styles/colors';

interface LoadingOverlayProps {
  visible: boolean;
  label?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ visible, label = 'Carregando...' }) => {
  if (!visible) return null;

  return (
    <div style={styles.backdrop} aria-busy="true" aria-live="polite" role="status">
      <div style={styles.card}>
        <div style={styles.spinner} />
        <span style={styles.text}>{label}</span>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(17, 17, 17, 0.28)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 18px',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    boxShadow: '0 10px 30px rgba(124, 58, 237, 0.18)',
    border: '1px solid #ede9fe',
  },
  spinner: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: '3px solid #ede9fe',
    borderTopColor: colors.primary,
    animation: 'spin 0.9s linear infinite',
  },
  text: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    color: '#4b5563',
    fontWeight: 600,
  },
};

export default LoadingOverlay;




