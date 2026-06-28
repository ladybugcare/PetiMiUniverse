import { z } from 'zod';

export const HUB_PAYMENT_METHODS = [
  'pix',
  'cash',
  'credit_card',
  'debit_card',
  'transfer',
  'payment_link',
  'customer_credit',
] as const;

export type HubPaymentMethod = (typeof HUB_PAYMENT_METHODS)[number];

export const hubPaymentMethodSchema = z.enum(HUB_PAYMENT_METHODS);

export const HUB_PAYMENT_METHOD_LABELS: Record<HubPaymentMethod, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  transfer: 'Transferência',
  payment_link: 'Link de pagamento',
  customer_credit: 'Crédito do tutor',
};

const acceptedPaymentMethodsSchema = z
  .array(hubPaymentMethodSchema)
  .min(1, 'Selecione pelo menos uma forma de pagamento')
  .refine((arr) => new Set(arr).size === arr.length, 'Formas de pagamento duplicadas');

export const patchPaymentMethodSettingsSchema = z
  .object({
    clinic_id: z.string().uuid(),
    accepted_payment_methods: acceptedPaymentMethodsSchema,
  })
  .strict();

/** Fallback para lista completa se vazio ou inválido. */
export function normalizeAcceptedPaymentMethods(raw: unknown): HubPaymentMethod[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...HUB_PAYMENT_METHODS];
  }
  const valid = new Set<string>(HUB_PAYMENT_METHODS);
  const filtered = raw.filter((m): m is HubPaymentMethod => typeof m === 'string' && valid.has(m));
  return filtered.length > 0 ? filtered : [...HUB_PAYMENT_METHODS];
}

export class PaymentMethodNotAcceptedError extends Error {
  readonly statusCode = 400;

  constructor(method: string) {
    const label = HUB_PAYMENT_METHOD_LABELS[method as HubPaymentMethod] ?? method;
    super(`Forma de pagamento "${label}" não está habilitada para esta clínica.`);
    this.name = 'PaymentMethodNotAcceptedError';
  }
}

export async function getAcceptedPaymentMethods(
  getSettings: (clinicId: string) => Promise<{ accepted_payment_methods?: unknown }>,
  clinicId: string,
): Promise<HubPaymentMethod[]> {
  const settings = await getSettings(clinicId);
  return normalizeAcceptedPaymentMethods(settings.accepted_payment_methods);
}

export function assertPaymentMethodInList(
  method: string,
  accepted: HubPaymentMethod[],
): void {
  if (!accepted.includes(method as HubPaymentMethod)) {
    throw new PaymentMethodNotAcceptedError(method);
  }
}
