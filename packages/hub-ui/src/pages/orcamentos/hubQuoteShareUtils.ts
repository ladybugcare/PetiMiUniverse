/** Texto e links para envio de orçamento (WhatsApp, cópia). */

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

/** Base `https://wa.me/...` sem texto (só número internacional). */
export function waMeBaseUrl(phone: string): string | null {
  const d = phone.replace(/\D/g, '');
  if (d.length < 10) return null;
  const n = d.length <= 11 && !d.startsWith('55') ? `55${d}` : d;
  return `https://wa.me/${n}`;
}

/** Abre conversa com mensagem pré-preenchida; retorna null se telefone inválido. */
export function waMeUrlWithText(phone: string | undefined | null, message: string): string | null {
  if (!phone?.trim()) return null;
  const base = waMeBaseUrl(phone);
  if (!base) return null;
  return `${base}?text=${encodeURIComponent(message)}`;
}
