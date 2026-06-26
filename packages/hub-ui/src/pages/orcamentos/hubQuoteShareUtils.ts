/** Texto e links para envio de orçamento (WhatsApp, cópia). */
import { buildWhatsappLink } from '../../utils/whatsappLink';

export function prospectFirstName(fullName: string | undefined | null): string {
  const t = (fullName ?? '').trim();
  if (!t) return 'cliente';
  return t.split(/\s+/)[0] ?? t;
}

export function formatQuoteValidUntil(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function buildWhatsAppMessageLinkVariant(firstName: string, publicLink: string, validUntil: string): string {
  return [
    `Olá, ${firstName}! 😊`,
    '',
    'Segue o orçamento dos serviços dos seus pets:',
    publicLink,
    '',
    `Válido até ${validUntil}.`,
    'Qualquer dúvida, é só me chamar! 🧡',
  ].join('\n');
}

export function buildWhatsAppMessagePdfVariant(firstName: string, publicLink: string, validUntil: string): string {
  return [
    `Olá, ${firstName}! 😊`,
    '',
    'Segue o PDF do orçamento dos serviços dos seus pets.',
    '',
    'Você também pode visualizar online:',
    publicLink,
    '',
    `Válido até ${validUntil}.`,
    'Qualquer dúvida, é só me chamar! 🧡',
  ].join('\n');
}

/** Abre conversa com mensagem pré-preenchida; retorna null se telefone inválido. */
export function waMeUrlWithText(phone: string | undefined | null, message: string): string | null {
  return buildWhatsappLink(phone, message);
}
