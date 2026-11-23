import React from 'react';

export type StockReturnStatus = 'pending' | 'partial' | 'returned' | 'unsellable' | 'mixed' | null | undefined;

const LABELS: Record<Exclude<StockReturnStatus, null | undefined>, string> = {
  pending: 'Devolução pendente',
  partial: 'Devolução parcial',
  returned: 'Estoque devolvido',
  unsellable: 'Sem revenda',
  mixed: 'Devolvido (misto)',
};

const CLASS: Record<Exclude<StockReturnStatus, null | undefined>, string> = {
  pending: 'hub-clientes__pill hub-finance-page__pill--warning',
  partial: 'hub-clientes__pill hub-finance-page__pill--warning',
  returned: 'hub-clientes__pill hub-clientes__pill--active',
  unsellable: 'hub-clientes__pill hub-clientes__pill--inactive-alert',
  mixed: 'hub-clientes__pill hub-clientes__pill--active',
};

/** Badge discreto do estado de devolução física de produtos. */
export function ReceivableStockReturnBadge({
  status,
  className,
}: {
  status?: StockReturnStatus;
  className?: string;
}) {
  if (!status) return null;
  return (
    <span
      className={`${CLASS[status]}${className ? ` ${className}` : ''}`}
      title="Situação da mercadoria em relação ao estoque"
    >
      {LABELS[status]}
    </span>
  );
}

export default ReceivableStockReturnBadge;
