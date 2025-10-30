import React, { useState } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { supportTicketsApi } from '../services/supportTicketsApi';
import colors from '../styles/colors';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (message.trim().length < 10) {
      setError('A mensagem deve ter pelo menos 10 caracteres');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = user?.id;
      const userRole = user?.user_metadata?.role || user?.role;

      if (!userId || !userRole) {
        setError('Erro ao identificar usuário. Por favor, faça login novamente.');
        return;
      }

      await supportTicketsApi.create({
        user_id: userId,
        user_role: userRole,
        message: message.trim(),
      });

      setSuccess(true);
      setMessage('');
      
      // Fechar modal após 2 segundos
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Error creating support ticket:', err);
      setError(err.message || 'Erro ao enviar mensagem. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setMessage('');
      setError('');
      setSuccess(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <MessageCircle size={24} color={colors.primary} />
            <h2 style={styles.title}>Suporte</h2>
          </div>
          <button
            onClick={handleClose}
            style={styles.closeButton}
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        {success ? (
          <div style={styles.successMessage}>
            <div style={styles.successIcon}>✓</div>
            <h3 style={styles.successTitle}>Mensagem enviada!</h3>
            <p style={styles.successText}>
              Nossa equipe receberá sua mensagem e responderá em breve.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <p style={styles.description}>
              Descreva sua dúvida ou problema. Nossa equipe responderá o mais breve possível.
            </p>

            <div style={styles.formGroup}>
              <label style={styles.label}>Mensagem *</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Descreva sua dúvida ou problema..."
                style={styles.textarea}
                rows={6}
                disabled={loading}
                required
              />
              <div style={styles.charCount}>
                {message.length} / min. 10 caracteres
              </div>
            </div>

            {error && (
              <div style={styles.errorMessage}>
                {error}
              </div>
            )}

            <div style={styles.footer}>
              <button
                type="button"
                onClick={handleClose}
                style={styles.cancelButton}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={styles.submitButton}
                disabled={loading || message.trim().length < 10}
              >
                {loading ? (
                  'Enviando...'
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Send size={18} />
                    <span>Enviar</span>
                  </div>
                )}
              </button>
            </div>
          </form>
        )}
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
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px',
    borderBottom: `1px solid ${colors.border}`,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: colors.text,
    margin: 0,
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    border: 'none',
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'background-color 0.2s',
  },
  form: {
    padding: '24px',
  },
  description: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: colors.textSecondary,
    marginBottom: '24px',
    lineHeight: '1.5',
  },
  formGroup: {
    marginBottom: '24px',
  },
  label: {
    display: 'block',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: colors.text,
    marginBottom: '8px',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    resize: 'vertical',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  charCount: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: colors.textSecondary,
    marginTop: '4px',
  },
  errorMessage: {
    padding: '12px',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '16px',
  },
  footer: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '12px 24px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  submitButton: {
    padding: '12px 24px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    color: '#ffffff',
    backgroundColor: colors.primary,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  successMessage: {
    padding: '48px 24px',
    textAlign: 'center',
  },
  successIcon: {
    width: '64px',
    height: '64px',
    margin: '0 auto 24px',
    backgroundColor: '#dcfce7',
    color: '#22c55e',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    fontWeight: 'bold',
  },
  successTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: colors.text,
    marginBottom: '8px',
  },
  successText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: colors.textSecondary,
    lineHeight: '1.5',
  },
};

export default SupportModal;

