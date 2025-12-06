import React from 'react';
import IconWrapper from './IconWrapper';
import { LogOut, Save, X } from 'lucide-react';
import colors from '../styles/colors';

export interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAndExit: () => void;
  onExitWithoutSaving: () => void;
  currentStep: number;
  totalSteps: number;
}

const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  onClose,
  onSaveAndExit,
  onExitWithoutSaving,
  currentStep,
  totalSteps,
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
          <IconWrapper icon={LogOut} size={32} color={colors.warning[500]} />
        </div>

        {/* Content */}
        <div style={styles.content}>
          <h3 style={styles.title}>Deseja salvar seu progresso?</h3>
          <p style={styles.message}>
            Você está no passo {currentStep} de {totalSteps} do onboarding.
            Se sair sem salvar, precisará preencher tudo novamente.
          </p>
          <div style={styles.progressInfo}>
            <span style={styles.progressText}>
              Progresso: {Math.round((currentStep / totalSteps) * 100)}%
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button
            onClick={onClose}
            style={styles.cancelButton}
            title="Cancelar"
          >
            <IconWrapper icon={X} size={18} />
            <span>Cancelar</span>
          </button>
          <button
            onClick={onExitWithoutSaving}
            style={styles.exitButton}
            title="Sair sem salvar"
          >
            <IconWrapper icon={LogOut} size={18} />
            <span>Sair sem Salvar</span>
          </button>
          <button
            onClick={onSaveAndExit}
            style={styles.saveButton}
            title="Salvar e sair"
          >
            <IconWrapper icon={Save} size={18} />
            <span>Salvar e Sair</span>
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
    backgroundColor: '#fef3c7',
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
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    marginTop: '8px',
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
    flexDirection: 'column',
  },
  cancelButton: {
    padding: '12px 24px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: '#fafafa',
    color: '#525252',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  exitButton: {
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
  saveButton: {
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

export default LogoutConfirmModal;





