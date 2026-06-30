/** Texto e links para envio de comanda / cobrança (WhatsApp, cópia). */
import { buildWhatsappLink } from '../../utils/whatsappLink';
import { paymentMethodLabel as paymentMethodLabelFromUtil } from '../../utils/hubPaymentMethods';

export function guardianFirstName(fullName: string | undefined | null): string {
  const t = (fullName ?? '').trim();
  if (!t) return 'cliente';
  return t.split(/\s+/)[0] ?? t;
}

export function formatBrlLabel(amount: number): string {
  return Number(amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDueDateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function buildWhatsAppMessageComandaLinkVariant(
  firstName: string,
  publicLink: string,
  totalLabel: string,
): string {
  return [
    `Olá, ${firstName}! 😊`,
    '',
    'Segue a comanda com os serviços dos seus pets:',
    publicLink,
    '',
    `Total: ${totalLabel}.`,
    'Qualquer dúvida, é só me chamar! 🧡',
  ].join('\n');
}

export function buildWhatsAppMessageComandaPdfVariant(
  firstName: string,
  publicLink: string,
  totalLabel: string,
): string {
  return [
    `Olá, ${firstName}! 😊`,
    '',
    'Segue o PDF da comanda com os serviços dos seus pets.',
    '',
    'Você também pode visualizar online:',
    publicLink,
    '',
    `Total: ${totalLabel}.`,
    'Qualquer dúvida, é só me chamar! 🧡',
  ].join('\n');
}

function dueDateMessageLine(dueDateLabel: string): string | null {
  return dueDateLabel !== '—' ? `Vencimento: ${dueDateLabel}.` : null;
}

/** Mensagem de cobrança (financeiro) — variante com link. */
export function buildWhatsAppMessageChargeLinkVariant(
  firstName: string,
  publicLink: string,
  amountLabel: string,
  dueDateLabel: string,
): string {
  return [
    `Olá, ${firstName}! 😊`,
    '',
    `Segue a cobrança de ${amountLabel} com os detalhes dos serviços:`,
    publicLink,
    '',
    dueDateMessageLine(dueDateLabel),
    'Qualquer dúvida, é só me chamar! 🧡',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Mensagem de cobrança (financeiro) — variante com PDF. */
export function buildWhatsAppMessageChargePdfVariant(
  firstName: string,
  publicLink: string,
  amountLabel: string,
  dueDateLabel: string,
): string {
  return [
    `Olá, ${firstName}! 😊`,
    '',
    'Segue o PDF da cobrança com o resumo dos serviços.',
    '',
    'Você também pode visualizar os detalhes e pagar online:',
    publicLink,
    '',
    `Valor em aberto: ${amountLabel}.`,
    dueDateMessageLine(dueDateLabel),
    'Qualquer dúvida, é só me chamar! 🧡',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildWhatsAppMessageChargePending(
  firstName: string,
  amountLabel: string,
  dueDateLabel: string,
  publicLink: string,
): string {
  return [
    `Olá, ${firstName}! 😊`,
    '',
    `Passando para lembrar da cobrança de ${amountLabel}.`,
    dueDateMessageLine(dueDateLabel),
    '',
    'Para ver os detalhes e pagar, acesse:',
    publicLink,
    '',
    'Qualquer dúvida, é só me chamar! 🧡',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildWhatsAppMessagePaymentReceipt(
  firstName: string,
  amountLabel: string,
  methodLabel: string,
): string {
  return [
    `Olá, ${firstName}! 😊`,
    '',
    `Confirmamos o recebimento de ${amountLabel} via ${methodLabel}.`,
    '',
    'O comprovante em PDF pode ser enviado em seguida, se precisar.',
    '',
    'Obrigado pela confiança! 🧡',
  ].join('\n');
}

export function waMeUrlWithText(phone: string | undefined | null, message: string): string | null {
  return buildWhatsappLink(phone, message);
}

export function waMeBaseUrl(phone: string | undefined | null): string | null {
  return buildWhatsappLink(phone, '');
}

export function paymentMethodLabel(method: string): string {
  return paymentMethodLabelFromUtil(method);
}
