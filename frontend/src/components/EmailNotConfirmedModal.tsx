import React, { useState, useEffect } from 'react';
import { X, Mail, AlertCircle, CheckCircle } from 'lucide-react';
import colors from '../styles/colors';

interface EmailNotConfirmedModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  onResendEmail: (email: string) => Promise<void>;
}

const EmailNotConfirmedModal: React.FC<EmailNotConfirmedModalProps> = ({
  isOpen,
  onClose,
  email,
  onResendEmail,
}) => {
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    try {
      setResending(true);
      setSuccessMessage('');
      await onResendEmail(email);
      setSuccessMessage('Email de confirmação reenviado! Verifique sua caixa de entrada.');
      setCooldown(60); // 60 segundos de cooldown
    } catch (error: any) {
      setSuccessMessage('');
      console.error('Erro ao reenviar email:', error);
    } finally {
      setResending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.iconContainer}>
            <AlertCircle size={32} color={colors.warning} />
          </div>
          <button
            onClick={onClose}
            style={styles.closeButton}
            aria-label="Fechar modal"
          >
            <X size={20} />
          </button>
        </div>

        <div style={styles.content}>
          <h2 style={styles.title}>Email Não Confirmado</h2>
          <p style={styles.message}>
            Seu email ainda não foi confirmado. Para fazer login, você precisa confirmar seu email primeiro.
          </p>
          <p style={styles.emailText}>
            <strong>Email:</strong> {email}
          </p>

          {successMessage && (
            <div style={styles.successBox}>
              <CheckCircle size={20} color={colors.success} />
              <span style={styles.successText}>{successMessage}</span>
            </div>
          )}

          <div style={styles.actions}>
            <button
              onClick={handleResend}
              disabled={resending || cooldown > 0}
              style={{
                ...styles.resendButton,
                ...((resending || cooldown > 0) ? styles.buttonDisabled : {}),
              }}
            >
              <Mail size={18} />
              {cooldown > 0
                ? `Aguarde ${cooldown}s`
                : resending
                ? 'Reenviando...'
                : 'Reenviar Email de Confirmação'}
            </button>
            <button
              onClick={onClose}
              style={styles.closeModalButton}
            >
              Fechar
            </button>
          </div>

          <p style={styles.hint}>
            Verifique sua caixa de entrada e pasta de spam. O link de confirmação pode ter expirado.
          </p>
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
    backgroundColor: colors.surface,
    borderRadius: '16px',
    maxWidth: '500px',
    width: '100%',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    position: 'relative',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px 24px 0 24px',
  },
  iconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    color: colors.textSecondary,
    transition: 'background-color 0.2s',
  },
  content: {
    padding: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: colors.text,
    marginBottom: '12px',
    marginTop: '16px',
  },
  message: {
    fontSize: '16px',
    color: colors.textSecondary,
    lineHeight: '1.6',
    marginBottom: '16px',
  },
  emailText: {
    fontSize: '14px',
    color: colors.text,
    marginBottom: '20px',
    padding: '12px',
    backgroundColor: colors.neutral[50],
    borderRadius: '8px',
  },
  successBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    backgroundColor: colors.successLight,
    borderRadius: '8px',
    marginBottom: '20px',
    border: `1px solid ${colors.success}`,
  },
  successText: {
    fontSize: '14px',
    color: '#059669',
    fontWeight: '500',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
  },
  resendButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: colors.primary,
    color: colors.surface,
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  closeModalButton: {
    padding: '12px 24px',
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  hint: {
    fontSize: '13px',
    color: colors.textMuted,
    textAlign: 'center',
    margin: 0,
    fontStyle: 'italic',
  },
};

export default EmailNotConfirmedModal;

