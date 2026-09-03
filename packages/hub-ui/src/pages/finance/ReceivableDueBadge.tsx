import React from 'react';
import { formatDueDateShort, resolveDueDateTone, type DueDateTone } from './dueDateTone';

type Props = {
  dueDate?: string | null;
  status?: string | null;
  /** Se true, mostra a data curta no lugar do rótulo relativo quando houver data. */
  showDate?: boolean;
  className?: string;
};

const TONE_CLASS: Record<Exclude<DueDateTone, 'none'>, string> = {
  ok: 'hub-due-tone hub-due-tone--ok',
  soon: 'hub-due-tone hub-due-tone--soon',
  overdue: 'hub-due-tone hub-due-tone--overdue',
};

/**
 * Badge de vencimento: verde (a vencer), amarelo (próximo), vermelho (vencido).
 * Para pago/cancelado/estornado ou sem data, não renderiza tom colorido de prazo.
 */
export function ReceivableDueBadge({ dueDate, status, showDate = true, className }: Props) {
  if (status === 'paid') {
    return <span className={`hub-dayboard__badge hub-dayboard__badge--received${className ? ` ${className}` : ''}`}>Pago</span>;
  }
  if (status === 'partially_paid') {
    const info = resolveDueDateTone(dueDate, { status: 'partially_paid' });
    if (info.tone === 'none') {
      return <span className={`hub-dayboard__badge hub-dayboard__badge--pending${className ? ` ${className}` : ''}`}>Parcial</span>;
    }
    const label = showDate ? `Parcial · ${formatDueDateShort(dueDate)}` : `Parcial · ${info.label}`;
    return <span className={`${TONE_CLASS[info.tone]}${className ? ` ${className}` : ''}`}>{label}</span>;
  }
  if (status === 'cancelled') {
    return <span className={`hub-dayboard__badge hub-dayboard__badge--none${className ? ` ${className}` : ''}`}>Cancelado</span>;
  }
  if (status === 'refunded') {
    return <span className={`hub-dayboard__badge hub-dayboard__badge--none${className ? ` ${className}` : ''}`}>Estornado</span>;
  }

  const info = resolveDueDateTone(dueDate, { status });
  if (info.tone === 'none') {
    return (
      <span className={`hub-dayboard__badge hub-dayboard__badge--pending${className ? ` ${className}` : ''}`}>
        {dueDate ? 'Pendente' : 'Pendente · sem venc.'}
      </span>
    );
  }

  const label = showDate ? formatDueDateShort(dueDate) : info.label;
  return (
    <span className={`${TONE_CLASS[info.tone]}${className ? ` ${className}` : ''}`} title={info.label}>
      {label}
    </span>
  );
}

export default ReceivableDueBadge;
