import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './HubBottomSheet.css';

export type HubBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Resumo curto abaixo do título (ex.: horário · medicamento · dose). */
  summary?: React.ReactNode;
  ariaLabel?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
};

/**
 * Bottom sheet Hub: sobe da base com overlay escurecido.
 * Fecha por Cancelar/Fechar ou Escape — clique no overlay não fecha (mesmo critério do side panel).
 */
export const HubBottomSheet: React.FC<HubBottomSheetProps> = ({
  open,
  onClose,
  title,
  summary,
  ariaLabel,
  footer,
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

  return createPortal(
    <div
      className="hub-bottom-sheet__overlay"
      aria-modal="true"
      role="dialog"
      aria-label={ariaLabel || title}
    >
      <div className="hub-bottom-sheet__sheet">
        <div className="hub-bottom-sheet__grab" aria-hidden />
        <header className="hub-bottom-sheet__header">
          <h2 className="hub-bottom-sheet__title">{title}</h2>
          <button
            type="button"
            className="hub-bottom-sheet__close"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>
        {summary != null && summary !== false && summary !== '' ? (
          <div className="hub-bottom-sheet__summary">{summary}</div>
        ) : null}
        <div className="hub-bottom-sheet__body">{children}</div>
        {footer ? <footer className="hub-bottom-sheet__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
};

export default HubBottomSheet;
