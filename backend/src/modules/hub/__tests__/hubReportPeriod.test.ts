import {
  REPORT_TIMEZONE,
  reportDayEndIso,
  reportDayStartIso,
  ymdSaoPauloFromIso,
} from '../hubReportPeriod';
import { aggregateCardFeeTotals } from '../hubCardMachineFees';
import { computeHistoricalTicketAverage } from '../hubReportCommercialNet';

describe('hubReportPeriod (P1-04)', () => {
  it('bounds America/Sao_Paulo para YMD 2026-03-14', () => {
    expect(REPORT_TIMEZONE).toBe('America/Sao_Paulo');
    expect(reportDayStartIso('2026-03-14')).toBe('2026-03-14T03:00:00.000Z');
    expect(reportDayEndIso('2026-03-14')).toBe('2026-03-15T02:59:59.999Z');
  });

  it('pagamento 22h BRT entra no dia civil SP (regressão UTC)', () => {
    // 22:00 BRT em 14/mar = 15/mar 01:00Z
    const paymentIso = '2026-03-15T01:00:00.000Z';
    const from = reportDayStartIso('2026-03-14');
    const to = reportDayEndIso('2026-03-14');
    expect(paymentIso >= from && paymentIso <= to).toBe(true);

    // Corte UTC antigo colocaria o pagamento no dia 15
    const utcFrom = '2026-03-14T00:00:00.000Z';
    const utcTo = '2026-03-14T23:59:59.999Z';
    expect(paymentIso >= utcFrom && paymentIso <= utcTo).toBe(false);

    expect(ymdSaoPauloFromIso(paymentIso)).toBe('2026-03-14');
  });

  it('recebido bruto mantém amount; taxa e líquido são informativos', () => {
    const rows = [
      { payment_method: 'pix', amount: 40, card_fee_amount: null, net_amount: null },
      {
        payment_method: 'credit_card',
        amount: 100,
        card_fee_amount: 3.5,
        net_amount: 96.5,
      },
    ];
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const fees = aggregateCardFeeTotals(rows);
    const nonCard = rows
      .filter((r) => r.payment_method !== 'credit_card' && r.payment_method !== 'debit_card')
      .reduce((s, r) => s + r.amount, 0);
    const netAfter = nonCard + fees.card_net_total + fees.card_without_fee_gross_total;

    expect(total).toBe(140);
    expect(fees.card_fee_total).toBe(3.5);
    expect(netAfter).toBe(136.5);
    // KPI principal não é reduzido pela taxa
    expect(total).toBeGreaterThan(netAfter);
  });

  it('ticket do dia da venda não muda com devolução no dia seguinte', () => {
    const saleDay = [
      {
        id: 'rec-1',
        unit_id: 'u1',
        created_at: '2026-03-14T15:00:00.000Z',
        status: 'partially_paid',
        original_amount: 100,
        net_amount_at_sale: 100,
        final_amount: 60,
        returned_amount: 40,
      },
    ];
    const ticket = computeHistoricalTicketAverage(saleDay);
    expect(ticket.sales_count).toBe(1);
    expect(ticket.total_at_sale).toBe(100);
    expect(ticket.ticket_average).toBe(100);
  });
});
