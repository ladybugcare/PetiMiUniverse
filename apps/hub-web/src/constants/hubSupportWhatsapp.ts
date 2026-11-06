import { buildWhatsappLink } from '@petimi/hub-ui';

/**
 * Número do WhatsApp de suporte PetMi Hub (fase beta).
 *
 * Configure em `VITE_HUB_SUPPORT_WHATSAPP_PHONE` (somente dígitos, com DDI 55).
 * Ex.: `5511999999999` — NÃO há número real versionado no repositório;
 * defina o valor nos secrets/env de cada ambiente.
 */
export const HUB_SUPPORT_WHATSAPP_PHONE =
  (import.meta.env.VITE_HUB_SUPPORT_WHATSAPP_PHONE as string | undefined)?.trim() || '';

/** Mensagem pré-preenchida alinhada à fase beta (bugs, feedbacks ou elogios). */
export const HUB_SUPPORT_WHATSAPP_MESSAGE =
  'Olá! Estou no PetMi Hub (beta) e quero enviar um feedback (bug, sugestão ou elogio):';

/** Link wa.me click-to-chat, ou `null` se o número não estiver configurado/válido. */
export function getHubSupportWhatsappHref(): string | null {
  return buildWhatsappLink(HUB_SUPPORT_WHATSAPP_PHONE || null, HUB_SUPPORT_WHATSAPP_MESSAGE);
}
