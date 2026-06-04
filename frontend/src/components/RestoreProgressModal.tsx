import React from 'react';
import IconWrapper from './IconWrapper';
import { RotateCcw, Play } from 'lucide-react';
import colors from '../styles/colors';

export interface RestoreProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  onStartOver: () => void;
  currentStep: number;
  totalSteps: number;
  progressPercent: number;
}

const RestoreProgressModal: React.FC<RestoreProgressModalProps> = ({
  isOpen,
  onClose,
  onContinue,
  onStartOver,
  currentStep,
  totalSteps,
  progressPercent,
}) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={styles.overlay} onClick={handleBackdropClick}>
      <div style={styles.modal}>
        {/* Icon */}
        <div style={styles.iconContainer}>
          <IconWrapper icon={Play} size={32} color={colors.brand.primary[500]} />
        </div>

        {/* Content */}
        <div style={styles.content}>
          <h3 style={styles.title}>Continuar de onde parou?</h3>
          <p style={styles.message}>
            Você tem um onboarding em andamento. Deseja continuar do passo {currentStep} de {totalSteps}?
          </p>
          <div style={styles.progressInfo}>
            <div style={styles.progressBarContainer}>
              <div 
                style={{
                  ...styles.progressBar,
                  width: `${progressPercent}%`,
                }}
              />
            </div>
            <span style={styles.progressText}>
              Progresso: {progressPercent}%
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button
            onClick={onStartOver}
            style={styles.startOverButton}
            title="Começar do zero"
          >
            <IconWrapper icon={RotateCcw} size={18} />
            <span>Começar do Zero</span>
          </button>
          <button
            onClick={onContinue}
            style={styles.continueButton}
            title="Continuar"
          >
            <IconWrapper icon={Play} size={18} />
            <span>Continuar</span>
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
    maxWidth: '480px',
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
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: '12px',
    margin: '0 0 12px 0',
  },
  message: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '15px',
    color: '#525252',
    lineHeight: '1.6',
    margin: '0 0 16px 0',
  },
  progressInfo: {
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    marginTop: '8px',
  },
  progressBarContainer: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.brand.primary[500],
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: colors.brand.primary[500],
  },
  actions: {
    display: 'flex',
    gap: '12px',
    width: '100%',
  },
  startOverButton: {
    flex: 1,
    padding: '12px 24px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: '#ffffff',
    color: '#525252',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  continueButton: {
    flex: 1,
    padding: '12px 24px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
};

export default RestoreProgressModal;

