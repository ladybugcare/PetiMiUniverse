import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

export type FinancialAdjustmentPendingBadgeProps = {
  pending: boolean;
  showCaixaLink?: boolean;
};

/** Badge somente leitura: cancelamento operacional com ajuste financeiro pendente no Caixa. */
export function FinancialAdjustmentPendingBadge({ pending, showCaixaLink = false }: FinancialAdjustmentPendingBadgeProps) {
  if (!pending) return null;
  return (
    <p className="hub-finance-adjustment-badge" role="status">
      <AlertCircle size={14} strokeWidth={1.75} aria-hidden />
      <span>Ajuste financeiro pendente</span>
      {showCaixaLink ? (
        <Link to="/hub/financeiro/caixa" className="hub-clientes__link hub-finance-adjustment-badge__link">
          Ver no Caixa
        </Link>
      ) : null}
    </p>
  );
}
