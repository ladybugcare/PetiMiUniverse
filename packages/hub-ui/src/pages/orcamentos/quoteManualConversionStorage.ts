/** Estado temporário entre passos do wizard ao fechar orçamento manualmente. */
export type HubManualQuotePetLink = { quote_pet_id: string; hub_pet_id: string };

export type HubManualQuoteConversionState = {
  guardian_id: string;
  links: HubManualQuotePetLink[];
};

export function hubManualQuoteStorageKey(quoteId: string): string {
  return `hubManualQuoteConversion:${quoteId}`;
}

export function readManualQuoteConversion(quoteId: string): HubManualQuoteConversionState | null {
  try {
    const raw = sessionStorage.getItem(hubManualQuoteStorageKey(quoteId));
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return null;
    const guardian_id = (o as { guardian_id?: string }).guardian_id;
    const links = (o as { links?: HubManualQuotePetLink[] }).links;
    if (!guardian_id || !Array.isArray(links)) return null;
    return { guardian_id, links };
  } catch {
    return null;
  }
}

export function writeManualQuoteConversion(quoteId: string, state: HubManualQuoteConversionState): void {
  sessionStorage.setItem(hubManualQuoteStorageKey(quoteId), JSON.stringify(state));
}

export function clearManualQuoteConversion(quoteId: string): void {
  sessionStorage.removeItem(hubManualQuoteStorageKey(quoteId));
}
