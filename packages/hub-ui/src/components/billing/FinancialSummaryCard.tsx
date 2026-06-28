import React from 'react';

function fmtBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface FinancialSummaryRow {
  label: string;
  value: number;
}

export interface FinancialSummaryCardProps {
  subtotal: number;
  discountAmount: number;
  total: number;
  /** Linhas extras antes do subtotal (ex.: por pet no orçamento). */
  extraRows?: FinancialSummaryRow[];
  /** Slot para renderizar controle de desconto dentro do card. */
  discountControl?: React.ReactNode;
  title?: string;
}

/**
 * Card de resumo financeiro reutilizável: subtotal, desconto, total.
 * Usa as classes CSS do módulo de orçamentos (hub-orcamento-novo__*).
 */
export const FinancialSummaryCard: React.FC<FinancialSummaryCardProps> = ({
  subtotal,
  discountAmount,
  total,
  extraRows,
  discountControl,
  title = 'Resumo financeiro',
}) => {
  return (
    <div className="hub-orcamento-novo__card">
      <h3 className="hub-orcamento-novo__card-title">{title}</h3>

      {extraRows && extraRows.length > 0 && (
        <div className="hub-orcamento-novo__summary-section">
          {extraRows.map((row) => (
            <div key={row.label} className="hub-orcamento-novo__summary-row">
              <span>{row.label}</span>
              <span>{fmtBrl(row.value)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="hub-orcamento-novo__summary-row">
        <span>Subtotal</span>
        <span>{fmtBrl(subtotal)}</span>
      </div>

      {discountControl ? (
        <div style={{ margin: '8px 0' }}>{discountControl}</div>
      ) : null}

      {discountAmount > 0 && (
        <div className="hub-orcamento-novo__summary-row hub-orcamento-novo__summary-row--discount">
          <span>Desconto</span>
          <span>−{fmtBrl(discountAmount)}</span>
        </div>
      )}

      <div className="hub-orcamento-novo__summary-row hub-orcamento-novo__summary-row--total">
        <span>Total</span>
        <span>{fmtBrl(total)}</span>
      </div>
    </div>
  );
};
