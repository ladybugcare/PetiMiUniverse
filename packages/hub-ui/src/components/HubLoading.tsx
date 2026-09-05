import React from 'react';
import { Loader2 } from 'lucide-react';
import './HubLoading.css';

export type HubLoadingVariant = 'inline' | 'block' | 'overlay' | 'banner';

export type HubLoadingSize = 'sm' | 'md' | 'lg';

const ICON_SIZE: Record<HubLoadingSize, number> = {
  sm: 16,
  md: 20,
  lg: 28,
};

export type HubLoadingProps = {
  /** Texto visível ao lado ou abaixo do ícone. */
  label?: string;
  /** Exibe só o spinner (mantém texto para leitor de tela). */
  hideLabel?: boolean;
  /** inline — linha compacta; block — substitui a área vazia; overlay — cobre o pai; banner — chip sobre o conteúdo. */
  variant?: HubLoadingVariant;
  size?: HubLoadingSize;
  className?: string;
};

/**
 * Indicador de carregamento padronizado do Hub.
 * Use `block` só na primeira carga; `banner` ou `overlay` quando o conteúdo já está na tela.
 */
export const HubLoading: React.FC<HubLoadingProps> = ({
  label = 'Carregando…',
  hideLabel = false,
  variant = 'block',
  size = 'md',
  className = '',
}) => {
  const showLabel = !hideLabel && Boolean(label);
  const rootClass = ['hub-loading', `hub-loading--${variant}`, `hub-loading--${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass} role="status" aria-live="polite" aria-busy="true">
      <Loader2 className="hub-loading__icon" size={ICON_SIZE[size]} strokeWidth={2} aria-hidden />
      {showLabel ? <span className="hub-loading__label">{label}</span> : null}
      {!showLabel ? <span className="hub-loading__sr-only">{label}</span> : null}
    </div>
  );
};

export function HubRefreshingBanner({
  show,
  label = 'Atualizando…',
}: {
  show: boolean;
  label?: string;
}) {
  if (!show) return null;
  return <HubLoading variant="banner" label={label} />;
}

export default HubLoading;
