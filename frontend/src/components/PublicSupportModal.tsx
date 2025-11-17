import React, { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { supportTicketsApi } from '../services/supportTicketsApi';
import { validateEmail } from '../utils/validators';
import Alert from './Alert';
import colors from '../styles/colors';

interface PublicSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PublicSupportModal: React.FC<PublicSupportModalProps> = ({ isOpen, onClose }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState<'success' | 'error'>('success');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validações
    if (!name.trim()) {
      setError('Nome é obrigatório');
      return;
    }

    if (name.trim().length < 3) {
      setError('Nome deve ter pelo menos 3 caracteres');
      return;
    }

    if (!email.trim()) {
      setError('Email é obrigatório');
      return;
    }

    if (!validateEmail(email.trim())) {
      setError('Email inválido');
      return;
    }

    if (!message.trim()) {
      setError('Mensagem é obrigatória');
      return;
    }

    if (message.trim().length < 10) {
      setError('Mensagem deve ter pelo menos 10 caracteres');
      return;
    }

    try {
      setLoading(true);
      setError('');

      await supportTicketsApi.createPublic({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
      });

      setSuccess(true);
      setAlertMessage('Mensagem enviada com sucesso! Nossa equipe entrará em contato em breve.');
      setAlertType('success');
      setShowAlert(true);
      
      // Limpar campos
      setName('');
      setEmail('');
      setMessage('');
      
      // Fechar modal após 2 segundos
      setTimeout(() => {
        setSuccess(false);
        setShowAlert(false);
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Error creating public support ticket:', err);
      setError(err.message || 'Erro ao enviar mensagem. Tente novamente.');
      setAlertMessage(err.message || 'Erro ao enviar mensagem. Tente novamente.');
      setAlertType('error');
      setShowAlert(true);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setName('');
      setEmail('');
      setMessage('');
      setError('');
      setSuccess(false);
      setShowAlert(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div style={styles.overlay} onClick={handleClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.headerLeft}>
              <MessageCircle size={24} color={colors.primary} />
              <h2 style={styles.title}>Falar com o Suporte</h2>
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
                Preencha os campos abaixo para entrar em contato com nossa equipe de suporte.
              </p>

              {error && (
                <div style={styles.errorMessage}>
                  {error}
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>Nome *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  style={styles.input}
                  disabled={loading}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  style={styles.input}
                  disabled={loading}
                  required
                />
              </div>

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
                <p style={styles.hint}>
                  Mínimo de 10 caracteres
                </p>
              </div>

              {/* Actions */}
              <div style={styles.actions}>
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
                  disabled={loading}
                >
                  {loading ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <Alert
        isOpen={showAlert}
        onClose={() => setShowAlert(false)}
        message={alertMessage}
        type={alertType}
      />
    </>
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
    borderRadius: '12px',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: `1px solid ${colors.border}`,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: colors.text,
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
    color: colors.textSecondary,
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  },
  form: {
    padding: '24px',
  },
  description: {
    fontSize: '14px',
    color: colors.textSecondary,
    marginBottom: '20px',
    lineHeight: '1.5',
  },
  errorMessage: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '14px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: colors.text,
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'vertical',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  hint: {
    fontSize: '12px',
    color: colors.textSecondary,
    marginTop: '4px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
  cancelButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '500',
    color: colors.text,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  submitButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#ffffff',
    backgroundColor: colors.primary,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  successMessage: {
    padding: '40px 24px',
    textAlign: 'center',
  },
  successIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: '#d1fae5',
    color: '#10b981',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    fontWeight: 'bold',
    margin: '0 auto 16px',
  },
  successTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: colors.text,
    marginBottom: '8px',
  },
  successText: {
    fontSize: '14px',
    color: colors.textSecondary,
    lineHeight: '1.5',
  },
};

export default PublicSupportModal;

