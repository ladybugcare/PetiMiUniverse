import { buildWhatsappLink } from '../../utils/whatsappLink';
import { renderClinicalShareTemplate } from '../../utils/hubMessageTemplates';

export function buildExamOrderWhatsAppMessage(opts: {
  tutorName?: string | null;
  petName?: string | null;
  publicLink: string;
  templateOverrides?: Record<string, string>;
}): string {
  return renderClinicalShareTemplate('exam_order_share', {
    tutor: opts.tutorName,
    pet: opts.petName,
    link: opts.publicLink,
  }, opts.templateOverrides);
}

export function openExamOrderWhatsApp(phone: string | undefined | null, message: string): string | null {
  return buildWhatsappLink(phone, message);
}
