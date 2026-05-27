import type { HubQuote, HubQuoteProspectEmbed } from '../../api/hubQuotesApi';
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
    phone: prospect.phone?.trim() || '',
    email: (prospect.email ?? '').trim(),
    tax_id: (prospect.tax_id ?? '').trim(),
    lead_source: 'Orçamento',
    notes: `Orçamento #${refShort}`,
  };
}

export function prospectFromQuote(quote: HubQuote): HubQuoteProspectEmbed | null {
  return embedOne(quote.prospect);
}
