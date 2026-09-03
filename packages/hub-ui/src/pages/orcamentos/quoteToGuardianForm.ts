import type { HubQuote, HubQuoteProspectEmbed } from '../../api/hubQuotesApi';
import { formatBrPhoneFromApi } from '../../utils/formatBrPhone';
import { formatBrTaxIdFromApi } from '../../utils/formatBrTaxId';
import { emptyGuardianForm, type GuardianFormValues } from '../clientes/GuardianCreateForm';

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? x[0] ?? null : x;
}

/** Dados do prospect do orçamento → valores do formulário de novo tutor (fluxo guiado). */
export function quoteProspectToGuardianFormValues(quote: HubQuote, prospect: HubQuoteProspectEmbed): GuardianFormValues {
  const refShort = quote.id.slice(0, 8).toUpperCase();
  return {
    ...emptyGuardianForm,
    full_name: prospect.full_name?.trim() || '',
    phone: formatBrPhoneFromApi(prospect.phone),
    email: (prospect.email ?? '').trim(),
    tax_id: formatBrTaxIdFromApi(prospect.tax_id),
    lead_source: 'Orçamento',
    notes: `Orçamento #${refShort}`,
  };
}

export function prospectFromQuote(quote: HubQuote): HubQuoteProspectEmbed | null {
  return embedOne(quote.prospect);
}
