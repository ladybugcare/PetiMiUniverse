import React, { useState } from 'react';
import { MessageCircle, X, Send, Upload, Paperclip } from 'lucide-react';
import { supportTicketsApi } from '../services/supportTicketsApi';
import PriorityBadge from './PriorityBadge';
import colors from '../styles/colors';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CategoryType = 'técnico' | 'financeiro' | 'conta_perfil' | 'demanda' | 'marketplace' | 'outro';
type PriorityType = 'baixa' | 'normal' | 'alta' | 'urgente';

const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<CategoryType>('outro');
  const [priority, setPriority] = useState<PriorityType>('normal');
  const [attachments, setAttachments] = useState<string[]>([]);
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

      const user = JSON.parse(localStorage.getItem('user') || '');
      const userId = user?.id;
      let userRole = user?.user_metadata?.role || user?.role;

      if (!userId || !userRole) {
        setError('Erro ao identificar usuário. Por favor, faça login novamente.');
        return;
      }

      // Normalizar role para lowercase (admin, clinic, vet, freelancer)
      userRole = String(userRole).toLowerCase();

      await supportTicketsApi.create({
        user_id: userId,
        user_role: userRole as 'clinic' | 'vet' | 'freelancer' | 'admin',
        message: message.trim(),
        category,
        priority,
        attachments,
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
      setCategory('outro');
      setPriority('normal');
      setAttachments([]);
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
            {}
            <MessageCircle size={24} color={colors.brand.primary[500]} />
            <h2 style={styles.title}>Suporte</h2>
          </div>
          <button
            onClick={handleClose}
            style={styles.closeButton}
            disabled={loading}
          >
            {}
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

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Categoria *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CategoryType)}
                  style={styles.select}
                  disabled={loading}
                >
                  <option value="técnico">Técnico</option>
                  <option value="financeiro">Financeiro</option>
                  <option value="conta_perfil">Conta/Perfil</option>
                  <option value="demanda">Demanda</option>
                  <option value="marketplace">Marketplace</option>
                  <option value="outro">Outro</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Prioridade *</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as PriorityType)}
                  style={styles.select}
                  disabled={loading}
                >
                  <option value="baixa">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
                <div style={styles.priorityBadgeContainer}>
                  <PriorityBadge priority={priority} />
                </div>
              </div>
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
              <div style={styles.charCount}>
                {message.length} / min. 10 caracteres
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Anexos (opcional)</label>
              <div style={styles.uploadArea}>
                <input
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    // Por enquanto, apenas armazenar nomes dos arquivos
                    // Em produção, fazer upload para Supabase Storage
                    setAttachments(files.map(f => f.name));
                  }}
                  style={styles.fileInput}
                  disabled={loading}
                />
                <div style={styles.uploadHint}>
                  <Paperclip size={16} />
                  <span>Clique para anexar imagens ou documentos</span>
                </div>
              </div>
              {attachments.length > 0 && (
                <div style={styles.attachmentsList}>
                  {attachments.map((att, idx) => (
                    <span key={idx} style={styles.attachmentTag}>
                      {att}
                    </span>
                  ))}
                </div>
              )}
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
                    {}
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
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '24px',
  },
  select: {
    width: '100%',
    padding: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    outline: 'none',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  },
  priorityBadgeContainer: {
    marginTop: '8px',
  },
  uploadArea: {
    border: `2px dashed ${colors.border}`,
    borderRadius: '8px',
    padding: '24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  fileInput: {
    display: 'none',
  },
  uploadHint: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontSize: '14px',
    color: colors.textSecondary,
    fontFamily: 'Inter, sans-serif',
  },
  attachmentsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '12px',
  },
  attachmentTag: {
    padding: '6px 12px',
    backgroundColor: colors.brand.primary[500],
    color: colors.brand.primary[500],
    borderRadius: '16px',
    fontSize: '12px',
    fontFamily: 'Inter, sans-serif',
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
    backgroundColor: colors.brand.primary[500],
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

