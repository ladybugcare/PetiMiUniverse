import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

export type FinancialAdjustmentPendingBadgeProps = {
  pending: boolean;
  showFinanceLink?: boolean;
};

/** Badge somente leitura: cancelamento operacional com ajuste pendente no Financeiro. */
export function FinancialAdjustmentPendingBadge({
  pending,
  showFinanceLink = false,
}: FinancialAdjustmentPendingBadgeProps) {
  if (!pending) return null;
  return (
    <p className="hub-finance-adjustment-badge" role="status">
      <AlertCircle size={14} strokeWidth={1.75} aria-hidden />
      <span>Ajuste financeiro pendente</span>
      {showFinanceLink ? (
        <Link
          to="/hub/financeiro?tab=adjustments"
          className="hub-clientes__link hub-finance-adjustment-badge__link"
        >
          Ver no Financeiro
        </Link>
      ) : null}
    </p>
  );
}
