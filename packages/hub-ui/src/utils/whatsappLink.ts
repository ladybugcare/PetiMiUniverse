/**
 * Cria um link wa.me (click-to-chat) sem custo — sem API paga, sem provedor.
 * O operador ainda precisa clicar para enviar; não há envio automático.
 */

/**
 * Normaliza telefone BR, adiciona DDI 55 e valida mínimo de 10 dígitos.
 * Retorna `null` se o número for inválido ou ausente.
 */
export function normalizeBrPhone(phoneBR: string | null | undefined): string | null {
  if (!phoneBR?.trim()) return null;
  const digits = phoneBR.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
}

/**
 * Monta `https://wa.me/<numero>?text=<mensagem>`.
 * - Telefone inválido ou ausente → retorna `null` (o chamador deve desabilitar o botão).
 * - Mensagem vazia → retorna só o link base (conversa livre, sem texto pré-preenchido).
 */
export function buildWhatsappLink(phoneBR: string | null | undefined, message: string): string | null {
  const normalized = normalizeBrPhone(phoneBR);
  if (!normalized) return null;
  const base = `https://wa.me/${normalized}`;
  if (!message.trim()) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}
