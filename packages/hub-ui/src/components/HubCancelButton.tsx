import React from 'react';
import { X } from 'lucide-react';
import './HubCancelButton.css';

export type HubCancelButtonProps = {
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  'aria-label'?: string;
};

/**
 * Botão de cancelar / descartar — ícone X e estilo vermelho (design system Hub).
 * Use em rodapés de wizard, modais e fluxos com ação destrutiva de saída.
 */
export const HubCancelButton: React.FC<HubCancelButtonProps> = ({
  children = 'Cancelar',
  onClick,
  disabled = false,
  type = 'button',
  className = '',
  'aria-label': ariaLabel,
}) => {
  return (
    <button
      type={type}
      className={`hub-cancel-btn ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? (typeof children === 'string' ? children : 'Cancelar')}
    >
      <X size={18} strokeWidth={2} aria-hidden />
      <span>{children}</span>
    </button>
  );
};

export default HubCancelButton;
