import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './HubSidePanel.css';

export type HubSidePanelProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Ícone à esquerda do título (ex.: calendário no agendamento). */
  titleIcon?: React.ReactNode;
  subtitle?: string;
  /** Conteúdo do rodapé (botões de ação). */
  footer?: React.ReactNode;
  /** Conteúdo lateral direito (aside), dentro do painel. */
  aside?: React.ReactNode;
  children?: React.ReactNode;
};

/**
 * Painel lateral (metade da tela à direita) com fundo desfocado e escurecido.
 * Mesma composição de conteúdo que {@link HubModal}: corpo principal + aside opcional + footer.
 */
export const HubSidePanel: React.FC<HubSidePanelProps> = ({
  open,
  onClose,
  title,
  titleIcon,
  subtitle,
  footer,
  aside,
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
      className="hub-side-panel__overlay"
      onClick={handleOverlayClick}
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      <div className="hub-side-panel__sheet" onClick={(e) => e.stopPropagation()}>
        <div className="hub-side-panel__header">
          <div className="hub-side-panel__header-text">
            <div className="hub-side-panel__title-row">
              {titleIcon ? (
                <span className="hub-side-panel__title-icon" aria-hidden>
                  {titleIcon}
                </span>
              ) : null}
              <div className="hub-side-panel__title-stack">
                <h2 className="hub-side-panel__title">{title}</h2>
                {subtitle ? <p className="hub-side-panel__subtitle">{subtitle}</p> : null}
              </div>
            </div>
          </div>
          <button
            className="hub-side-panel__close"
            onClick={onClose}
            aria-label="Fechar"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="hub-side-panel__body">
          <div className={`hub-side-panel__main${aside ? ' hub-side-panel__main--with-aside' : ''}`}>
            {children}
          </div>
          {aside && <aside className="hub-side-panel__aside">{aside}</aside>}
        </div>

        {footer && <div className="hub-side-panel__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
