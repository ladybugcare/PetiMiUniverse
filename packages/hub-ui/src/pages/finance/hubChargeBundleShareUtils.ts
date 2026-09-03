/** Texto e links para envio de cobrança agrupada (lote). */
import {
  formatBrlLabel,
  formatDueDateLabel,
  guardianFirstName,
  waMeUrlWithText,
} from './hubComandaShareUtils';

export { formatBrlLabel, formatDueDateLabel, guardianFirstName, waMeUrlWithText };

function dueDateMessageLine(dueDateLabel: string): string | null {
  return dueDateLabel !== '—' ? `Vencimento: ${dueDateLabel}.` : null;
}

export function buildWhatsAppMessageBundleLinkVariant(
  firstName: string,
  publicLink: string,
  amountLabel: string,
  dueDateLabel: string,
  itemsCount: number,
): string {
  return [
    `Olá, ${firstName}! 😊`,
    '',
    `Segue a cobrança agrupada (${itemsCount} item${itemsCount === 1 ? '' : 'ns'}) com o resumo de tudo que está em aberto:`,
    publicLink,
    '',
    `Total em aberto: ${amountLabel}.`,
    dueDateMessageLine(dueDateLabel),
    'Qualquer dúvida, é só me chamar! 🧡',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildWhatsAppMessageBundlePdfVariant(
  firstName: string,
  publicLink: string,
  amountLabel: string,
  dueDateLabel: string,
  itemsCount: number,
): string {
  return [
    `Olá, ${firstName}! 😊`,
    '',
    `Segue o PDF da cobrança agrupada (${itemsCount} item${itemsCount === 1 ? '' : 'ns'}).`,
    '',
    'Você também pode visualizar online:',
    publicLink,
    '',
    `Total em aberto: ${amountLabel}.`,
    dueDateMessageLine(dueDateLabel),
    'Qualquer dúvida, é só me chamar! 🧡',
  ]
    .filter(Boolean)
    .join('\n');
}
