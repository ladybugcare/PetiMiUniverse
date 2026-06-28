import type { HubPaymentMethod } from '../api/hubFinancialApi';

export const ALL_HUB_PAYMENT_METHODS: HubPaymentMethod[] = [
  'pix',
  'cash',
  'credit_card',
  'debit_card',
  'transfer',
  'payment_link',
  'customer_credit',
];

export const HUB_PAYMENT_METHOD_LABELS: Record<HubPaymentMethod, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  transfer: 'Transferência',
  payment_link: 'Link de pagamento',
  customer_credit: 'Crédito do tutor',
};

export function paymentMethodLabel(method: string): string {
  return HUB_PAYMENT_METHOD_LABELS[method as HubPaymentMethod] ?? method;
}

export function filterEnabledPaymentMethods(
  enabled: HubPaymentMethod[],
): HubPaymentMethod[] {
  const set = new Set(enabled);
  return ALL_HUB_PAYMENT_METHODS.filter((m) => set.has(m));
}

export function defaultPaymentMethod(enabled: HubPaymentMethod[]): HubPaymentMethod {
  const filtered = filterEnabledPaymentMethods(enabled);
  return filtered[0] ?? 'pix';
}
