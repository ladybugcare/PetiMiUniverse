import React, { useState } from 'react';
import { Star, AlertTriangle } from 'lucide-react';
import { colors } from '../styles/colors';

interface EvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment?: string) => Promise<void>;
  isLoading?: boolean;
}

export const EvaluationModal: React.FC<EvaluationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
}) => {
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (rating === 0) {
      setError('Por favor, selecione uma avaliação');
      return;
    }

    try {
      await onSubmit(rating, comment || undefined);
      // Reset form
      setRating(0);
      setComment('');
      setError('');
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar avaliação');
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setRating(0);
      setComment('');
      setError('');
      onClose();
    }
  };

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Avaliar Atendimento</h2>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={styles.body}>
          <p style={styles.question}>Seu problema foi resolvido?</p>

          {/* Stars */}
          <div style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                style={styles.starButton}
                disabled={isLoading}
              >
                <Star
                  size={40}
                  fill={
                    star <= (hoveredRating || rating)
                      ? colors.brand.primary[500]
                      : 'transparent'
                  }
                  color={
                    star <= (hoveredRating || rating)
                      ? colors.brand.primary[500]
                      : colors.textSecondary
                  }
                />
              </button>
            ))}
          </div>

          {/* Comment */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>
              Comentário (opcional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Conte-nos mais sobre sua experiência..."
              maxLength={500}
              rows={4}
              style={styles.textarea}
              disabled={isLoading}
            />
            <span style={styles.charCount}>{comment.length}/500</span>
          </div>

          {/* Warning */}
          <div style={styles.warning}>
            <AlertTriangle size={18} color={colors.warning[500]} />
            <span style={styles.warningText}>
              Após avaliar, não será possível enviar mais mensagens neste ticket.
            </span>
          </div>

          {/* Error */}
          {error && (
            <div style={styles.error}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={styles.actions}>
            <button
              type="button"
              onClick={handleClose}
              style={{
                ...styles.button,
                ...styles.cancelButton,
              }}
              disabled={isLoading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={{
                ...styles.button,
                ...styles.submitButton,
                opacity: isLoading ? 0.6 : 1,
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
              disabled={isLoading}
            >
              {isLoading ? 'Enviando...' : 'Avaliar e Fechar'}
            </button>
          </div>
        </form>
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
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
  },
  header: {
    padding: '24px',
    borderBottom: `1px solid ${colors.border}`,
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: '600',
    color: colors.text,
  },
  body: {
    padding: '24px',
  },
  question: {
    fontSize: '18px',
    fontWeight: '500',
    color: colors.text,
    marginBottom: '20px',
    textAlign: 'center',
  },
  starsContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '24px',
  },
  starButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    transition: 'transform 0.2s',
  },
  inputGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: colors.text,
    marginBottom: '8px',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    resize: 'vertical',
    fontFamily: 'inherit',
    outline: 'none',
  },
  charCount: {
    display: 'block',
    fontSize: '12px',
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: '4px',
  },
  warning: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    backgroundColor: '#FFF4E5',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  warningText: {
    fontSize: '14px',
    color: colors.text,
    flex: 1,
  },
  error: {
    padding: '12px',
    backgroundColor: '#FEE',
    color: '#C33',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  button: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '500',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.3s',
  },
  cancelButton: {
    backgroundColor: colors.border,
    color: colors.text,
  },
  submitButton: {
    backgroundColor: colors.brand.primary[500],
    color: 'white',
  },
};

