import type { HubComandaDetailResponse, HubComandaTimelinePayment } from '../../api/hubComandaApi';
import type { HubFinancePayment } from '../../api/hubFinancialApi';

export function mapFinancePaymentToTimeline(payment: HubFinancePayment): HubComandaTimelinePayment | null {
  const status = String(payment.status ?? 'posted');
  if (status !== 'posted' && status !== 'reversed') return null;
  return {
    id: String(payment.id),
    amount: Number(payment.amount ?? 0),
    payment_method: String(payment.payment_method ?? ''),
    status,
    payment_date: String(
      payment.effective_payment_date ?? payment.payment_date ?? payment.created_at ?? '',
    ),
  };
}

/** Prefere `detail.payments` (API nova); senão monta a partir dos detalhes de recebível. */
export function resolveComandaTimelinePayments(
  detail: Pick<HubComandaDetailResponse, 'payments'>,
  receivablePayments: HubFinancePayment[],
): HubComandaTimelinePayment[] {
  if (detail.payments && detail.payments.length > 0) {
    return detail.payments;
  }
  const mapped = receivablePayments
    .map(mapFinancePaymentToTimeline)
    .filter((p): p is HubComandaTimelinePayment => p != null);
  mapped.sort((a, b) => {
    const ta = a.payment_date ? new Date(a.payment_date).getTime() : 0;
    const tb = b.payment_date ? new Date(b.payment_date).getTime() : 0;
    return ta - tb;
  });
  return mapped;
}
