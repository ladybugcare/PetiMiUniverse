import React from 'react';
import { HubLoading } from './HubLoading';
import { formatDueDateShort } from '../pages/finance/dueDateTone';
import type { ProfileFinanceSummary } from '../pages/finance/profileFinanceSummary';
import '../pages/clientes/clientes.css';
import '../pages/finance/hub-finance-page.css';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export type ProfileFinanceSummaryCardProps = {
  summary: ProfileFinanceSummary | null;
  loading?: boolean;
  /** Texto do empty state quando não há movimento. */
  emptyLabel?: string;
  onOpenFinanceiro: () => void;
  onCharge?: (() => void) | null;
  chargeLabel?: string;
};

/**
 * Card compacto do Resumo: saldo + semáforo + próximo vencimento.
 * Não lista comandas/recebíveis (isso fica na aba Financeiro).
 */
export const ProfileFinanceSummaryCard: React.FC<ProfileFinanceSummaryCardProps> = ({
  summary,
  loading = false,
  emptyLabel = 'Nenhum movimento financeiro ainda.',
  onOpenFinanceiro,
  onCharge = null,
  chargeLabel = 'Cobrar',
}) => {
  if (loading || !summary) {
    return (
      <div className="hub-fin-summary">
        <HubLoading variant="inline" label="Carregando resumo financeiro…" size="sm" />
      </div>
    );
  }

  if (!summary.hasActivity && summary.outstandingTotal <= 0) {
    return <div className="hub-clientes__empty-state">{emptyLabel}</div>;
  }

  const hasDebt = summary.outstandingTotal > 0;
  const chips = [
    { key: 'overdue', count: summary.overdueCount, label: 'Vencidos', className: 'hub-due-tone hub-due-tone--overdue' },
    { key: 'soon', count: summary.soonCount, label: 'Próximos', className: 'hub-due-tone hub-due-tone--soon' },
    { key: 'ok', count: summary.okCount, label: 'A vencer', className: 'hub-due-tone hub-due-tone--ok' },
  ].filter((c) => c.count > 0);

  return (
    <div className={`hub-fin-summary${hasDebt ? '' : ' hub-fin-summary--clear'}`}>
      <div className="hub-fin-summary__top">
        <div className="hub-fin-summary__balance">
          <span className="hub-fin-summary__balance-label">{hasDebt ? 'Em aberto' : 'Em dia'}</span>
          <span className="hub-fin-summary__balance-value">{formatBrl(summary.outstandingTotal)}</span>
        </div>
        <div className="hub-fin-summary__actions">
          {hasDebt && onCharge ? (
            <button type="button" className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm" onClick={onCharge}>
              {chargeLabel}
            </button>
          ) : null}
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm" onClick={onOpenFinanceiro}>
            Ver financeiro
          </button>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="hub-fin-summary__chips" aria-label="Situação dos vencimentos">
          {chips.map((c) => (
            <span key={c.key} className={c.className}>
              {c.count} {c.label}
            </span>
          ))}
          {summary.noDueCount > 0 ? (
            <span className="hub-dayboard__badge hub-dayboard__badge--none">
              {summary.noDueCount} sem venc.
            </span>
          ) : null}
        </div>
      ) : null}

      {summary.nextDue ? (
        <div className="hub-fin-summary__next">
          <span className="hub-fin-summary__next-label">Próximo</span>
          <span className="hub-fin-summary__next-title">{summary.nextDue.title}</span>
          <span className="hub-fin-summary__next-meta">
            <span className={`hub-due-tone hub-due-tone--${summary.nextDue.tone}`}>
              {formatDueDateShort(summary.nextDue.dueDate)}
            </span>
            <span aria-hidden> · </span>
            <span>{formatBrl(summary.nextDue.amount)}</span>
          </span>
        </div>
      ) : null}

      {summary.openComandasCount > 0 ? (
        <p className="hub-fin-summary__hint">
          {summary.openComandasCount === 1
            ? '1 comanda aberta'
            : `${summary.openComandasCount} comandas abertas`}
          {summary.openComandasTotal > 0 ? ` · ${formatBrl(summary.openComandasTotal)} ainda sem recebível` : ''}
        </p>
      ) : null}
    </div>
  );
};

export default ProfileFinanceSummaryCard;
