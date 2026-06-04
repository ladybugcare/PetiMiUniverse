import React from 'react';
import { CheckCircle, X } from 'lucide-react';
import './HubToast.css';

export interface HubToastItemData {
  id: number;
  message: string;
  title?: string;
}

export interface HubToastRegionProps {
  items: HubToastItemData[];
  onDismiss: (id: number) => void;
}

/**
 * Pilha de toasts de sucesso (canto inferior direito). O estado e os timers ficam no consumidor (ex.: AlertProvider).
 */
export const HubToastRegion: React.FC<HubToastRegionProps> = ({ items, onDismiss }) => {
  if (items.length === 0) return null;

  return (
    <div className="hub-toast-region" aria-label="Notificações de sucesso">
      {items.map((item) => (
        <article
          key={item.id}
          className="hub-toast"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="hub-toast__icon-wrap" aria-hidden>
            <CheckCircle size={22} strokeWidth={2.25} />
          </div>
          <div className="hub-toast__body">
            {item.title ? <h3 className="hub-toast__title">{item.title}</h3> : null}
            <p className="hub-toast__message">{item.message}</p>
          </div>
          <button
            type="button"
            className="hub-toast__close"
            onClick={() => onDismiss(item.id)}
            aria-label="Fechar notificação"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </article>
      ))}
    </div>
  );
};

/** Alias do componente de região de toasts (design system). */
export const HubToast = HubToastRegion;

export default HubToastRegion;
