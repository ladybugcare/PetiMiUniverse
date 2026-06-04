import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './HubModal.css';

export type HubModalSize = 'lg' | 'xl';

export type HubModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: HubModalSize;
  /** Conteúdo do rodapé (botões de ação). */
  footer?: React.ReactNode;
  /** Conteúdo lateral direito (aside). */
  aside?: React.ReactNode;
  children?: React.ReactNode;
};

export const HubModal: React.FC<HubModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  size = 'lg',
  footer,
  aside,
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className="hub-modal__overlay"
      onClick={handleOverlayClick}
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      <div
        ref={dialogRef}
        className={`hub-modal__card hub-modal__card--${size}`}
      >
        {/* Header */}
        <div className="hub-modal__header">
          <div className="hub-modal__header-text">
            <h2 className="hub-modal__title">{title}</h2>
            {subtitle && <p className="hub-modal__subtitle">{subtitle}</p>}
          </div>
          <button
            className="hub-modal__close"
            onClick={onClose}
            aria-label="Fechar"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="hub-modal__body">
          <div className={`hub-modal__main${aside ? ' hub-modal__main--with-aside' : ''}`}>
            {children}
          </div>
          {aside && <aside className="hub-modal__aside">{aside}</aside>}
        </div>

        {/* Footer */}
        {footer && <div className="hub-modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
