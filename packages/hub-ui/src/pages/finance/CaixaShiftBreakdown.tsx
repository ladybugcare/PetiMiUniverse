import React, { useMemo } from 'react';
import type { HubCashSessionSummary } from '../../api/hubFinancialApi';
import { HUB_PAYMENT_METHOD_LABELS, paymentMethodLabel } from '../../utils/hubPaymentMethods';
import { serviceGroupLabel } from '../../utils/serviceTypeSlug';
import type { HubPaymentMethod } from '../../api/hubFinancialApi';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function sectorLabel(group: string): string {
  if (group === 'produtos') return 'Produtos';
  if (group === 'nao_alocado_financeiro') return 'Não alocado (financeiro)';
  return serviceGroupLabel(group);
}

const METHOD_ORDER: HubPaymentMethod[] = [
  'pix',
  'cash',
  'debit_card',
  'credit_card',
  'transfer',
  'payment_link',
  'customer_credit',
];

export type CaixaShiftBreakdownProps = {
  summary: HubCashSessionSummary['summary'] | null | undefined;
  /** Métodos aceitos na clínica — usados para ordenar/mostrar zeros opcionais. */
  acceptedMethods?: HubPaymentMethod[];
  /** Se true, omite métodos com total 0. Default true. */
  hideZeroMethods?: boolean;
  compact?: boolean;
};

/**
 * Resumo padrão de PDV: recebido por forma de pagamento + por setor no período do turno.
 */
export const CaixaShiftBreakdown: React.FC<CaixaShiftBreakdownProps> = ({
  summary,
  acceptedMethods,
  hideZeroMethods = true,
  compact = false,
}) => {
  const methodRows = useMemo(() => {
    const totals = summary?.shift_totals_by_method ?? summary?.totals_by_method ?? {};
    const known = acceptedMethods?.length
      ? acceptedMethods
      : METHOD_ORDER.filter((m) => m in HUB_PAYMENT_METHOD_LABELS);
    const seen = new Set<string>();
    const rows: Array<{ key: string; label: string; total: number }> = [];
    for (const method of known) {
      seen.add(method);
      const total = Number(totals[method] ?? 0);
      if (hideZeroMethods && Math.abs(total) < 0.009) continue;
      rows.push({ key: method, label: paymentMethodLabel(method), total });
    }
    for (const [method, raw] of Object.entries(totals)) {
      if (seen.has(method)) continue;
      const total = Number(raw ?? 0);
      if (hideZeroMethods && Math.abs(total) < 0.009) continue;
      rows.push({ key: method, label: paymentMethodLabel(method), total });
    }
    return rows;
  }, [summary, acceptedMethods, hideZeroMethods]);

  const sectorRows = summary?.shift_by_sector ?? [];
  const receivedTotal =
    summary?.shift_received_total != null
      ? Number(summary.shift_received_total)
      : methodRows.reduce((acc, row) => acc + row.total, 0);

  if (!summary) return null;
  if (methodRows.length === 0 && sectorRows.length === 0) {
    return (
      <p
        style={{
          margin: compact ? '8px 0 0' : '0 0 16px',
          fontSize: 13,
          color: '#888',
        }}
      >
        Nenhum recebimento no período deste turno.
      </p>
    );
  }

  const sectionTitleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    padding: compact ? '4px 0' : '6px 0',
    fontSize: 13,
    borderBottom: '1px solid #f0f0f0',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 12 : 16,
      }}
    >
      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 6,
          }}
        >
          <h3 style={sectionTitleStyle}>Por forma de pagamento</h3>
          <strong style={{ fontSize: 13, color: '#065f46' }}>{formatBrl(receivedTotal)}</strong>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {methodRows.map((row) => (
            <li key={row.key} style={rowStyle}>
              <span style={{ color: '#444' }}>{row.label}</span>
              <strong style={{ color: '#1a1a1a', fontVariantNumeric: 'tabular-nums' }}>
                {formatBrl(row.total)}
              </strong>
            </li>
          ))}
        </ul>
      </section>

      {sectorRows.length > 0 ? (
        <section>
          <h3 style={{ ...sectionTitleStyle, marginBottom: 6 }}>Por setor</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sectorRows.map((row) => (
              <li key={row.service_group} style={rowStyle}>
                <span style={{ color: '#444' }}>
                  {sectorLabel(row.service_group)}
                  <span style={{ color: '#999', marginLeft: 6, fontSize: 12 }}>
                    {row.share_pct.toFixed(0)}%
                  </span>
                </span>
                <strong style={{ color: '#1a1a1a', fontVariantNumeric: 'tabular-nums' }}>
                  {formatBrl(row.total)}
                </strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};
