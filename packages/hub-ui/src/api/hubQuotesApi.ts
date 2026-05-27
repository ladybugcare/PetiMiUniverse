import { apiRequest, getApiBaseUrl, getSupabase } from '@petimi/web-core';

const basePath = '/api/hub/quotes';

export type HubQuoteStatus =
  | 'draft'
  | 'sent'
  | 'awaiting_return'
  | 'accepted'
  | 'expired'
  | 'cancelled';

export type HubQuoteDiscountKind = 'percent' | 'fixed';
export type HubQuoteSizeTier = 'mini' | 'pequeno' | 'medio' | 'grande' | 'gigante';
export type HubQuotePetSex = 'M' | 'F' | 'U';

/** Opção explícita na matriz (creche, clínica, leva e traz). */
export type HubQuotePricingVariant = {
  period?: 'full_day' | 'half_day';
  consult_type?: 'padrao' | 'retorno';
  km_tier_index?: number;
};

export interface HubQuoteProspectEmbed {
  id: string;
  full_name: string;
  tax_id: string | null;
  phone: string;
  email?: string | null;
}

export interface HubQuotePet {
  id: string;
  quote_id: string;
  display_name: string | null;
  species: string;
  breed: string;
  size_tier: HubQuoteSizeTier;
  coat_type: string | null;
  age_months: number | null;
  sex: HubQuotePetSex | null;
  sort_order: number;
  created_at: string;
}

export interface HubQuoteLinePet {
  id: string;
  line_id: string;
  quote_pet_id: string;
  unit_price: number;
  applied_porte: string | null;
  applied_coat_type: string | null;
  sort_order: number;
}

/** Dados do tipo de serviço quando a API inclui embed (PDF / detalhe completo). */
export interface HubQuoteLineServiceEmbed {
  name: string;
  service_group: string;
  description: string | null;
}

export interface HubQuoteLine {
  id: string;
  quote_id: string;
  hub_service_type_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
  sort_order: number;
  created_at: string;
  /** Período, tipo de consulta ou faixa km escolhidos na UI. */
  pricing_variant?: HubQuotePricingVariant | null;
  line_pets?: HubQuoteLinePet[];
  hub_service_types?: HubQuoteLineServiceEmbed | HubQuoteLineServiceEmbed[] | null;
}

export interface HubQuote {
  id: string;
  clinic_id: string;
  prospect_id: string;
  unit_id: string | null;
  status: HubQuoteStatus;
  notes: string | null;
  client_notes: string | null;
  total_amount: number;
  subtotal_amount: number;
  discount_kind: HubQuoteDiscountKind | null;
  discount_value: number;
  valid_days: number;
  public_token: string | null;
  currency: string;
  sent_at: string | null;
  expires_at: string | null;
  guardian_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
  prospect?: HubQuoteProspectEmbed | HubQuoteProspectEmbed[];
  pets?: HubQuotePet[];
  lines?: HubQuoteLine[];
  /** Presente quando o backend inclui embed (ex.: mesmo select do PDF). */
  clinic?: { name: string | null } | { name: string | null }[] | null;
}

export interface HubQuotePetInput {
  client_id?: string;
  display_name?: string | null;
  species: string;
  breed: string;
  size_tier: HubQuoteSizeTier;
  coat_type?: string | null;
  age_months?: number | null;
  sex?: HubQuotePetSex | null;
  sort_order?: number;
}

export interface HubQuoteLinePetInput {
  pet_client_id?: string;
  pet_index?: number;
  unit_price: number;
  applied_porte?: string | null;
  applied_coat_type?: string | null;
  sort_order?: number;
}

export interface HubQuoteLineInput {
  hub_service_type_id?: string | null;
  description?: string | null;
  quantity?: number;
  unit_price?: number;
  discount_amount?: number;
  sort_order?: number;
  /** Persistido em `hub_quote_lines.pricing_variant`. */
  pricing_variant?: HubQuotePricingVariant | null;
  line_pets?: HubQuoteLinePetInput[];
}

export interface HubQuoteSuggestPriceResponse {
  unit_price: number;
  cost: number;
  applied_porte: string | null;
  applied_coat_type: string | null;
  /** Variante efetivamente aplicada (eco do backend). */
  pricing_variant?: HubQuotePricingVariant | null;
  default_duration_minutes: number | null;
  warning?: string;
}

function qClinic(clinicId: string): string {
  return new URLSearchParams({ clinic_id: clinicId }).toString();
}

export const hubQuotesApi = {
  async list(clinicId: string, status?: HubQuoteStatus): Promise<{ quotes: HubQuote[] }> {
    const sp = new URLSearchParams({ clinic_id: clinicId });
    if (status) sp.set('status', status);
    return apiRequest(`${basePath}?${sp}`) as Promise<{ quotes: HubQuote[] }>;
  },

  async get(id: string, clinicId: string): Promise<{ quote: HubQuote }> {
    return apiRequest(`${basePath}/${id}?${qClinic(clinicId)}`) as Promise<{ quote: HubQuote }>;
  },

  async create(payload: {
    clinic_id: string;
    prospect_id?: string;
    prospect?: { full_name: string; tax_id: string; phone: string; email?: string | null };
    unit_id?: string | null;
    notes?: string | null;
    client_notes?: string | null;
    total_amount?: number;
    discount_kind?: HubQuoteDiscountKind | null;
    discount_value?: number;
    valid_days?: number;
    expires_at?: string | null;
    pets?: HubQuotePetInput[];
    lines?: HubQuoteLineInput[];
  }): Promise<{ quote: HubQuote }> {
    return apiRequest(basePath, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ quote: HubQuote }>;
  },

  async patch(
    id: string,
    payload: {
      clinic_id: string;
      unit_id?: string | null;
      notes?: string | null;
      client_notes?: string | null;
      total_amount?: number;
      discount_kind?: HubQuoteDiscountKind | null;
      discount_value?: number;
      valid_days?: number;
      expires_at?: string | null;
      pets?: HubQuotePetInput[];
      lines?: HubQuoteLineInput[];
    }
  ): Promise<{ quote: HubQuote }> {
    return apiRequest(`${basePath}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ quote: HubQuote }>;
  },

  async remove(id: string, clinicId: string): Promise<void> {
    await apiRequest(`${basePath}/${id}?${qClinic(clinicId)}`, { method: 'DELETE' });
  },

  async send(id: string, clinicId: string): Promise<{ quote: Partial<HubQuote> }> {
    return apiRequest(`${basePath}/${id}/send?${qClinic(clinicId)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    }) as Promise<{ quote: Partial<HubQuote> }>;
  },

  async awaitingReturn(id: string, clinicId: string): Promise<{ quote: Partial<HubQuote> }> {
    return apiRequest(`${basePath}/${id}/awaiting-return?${qClinic(clinicId)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    }) as Promise<{ quote: Partial<HubQuote> }>;
  },

  async cancel(id: string, clinicId: string): Promise<{ quote: Partial<HubQuote> }> {
    return apiRequest(`${basePath}/${id}/cancel?${qClinic(clinicId)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    }) as Promise<{ quote: Partial<HubQuote> }>;
  },

  async duplicate(id: string, clinicId: string): Promise<{ quote: HubQuote }> {
    return apiRequest(`${basePath}/${id}/duplicate?${qClinic(clinicId)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    }) as Promise<{ quote: HubQuote }>;
  },

  /** Volta a rascunho para permitir edição (só o PATCH de rascunho altera linhas/pets). */
  async reopenDraft(id: string, clinicId: string): Promise<{ quote: HubQuote }> {
    return apiRequest(`${basePath}/${id}/reopen-draft?${qClinic(clinicId)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    }) as Promise<{ quote: HubQuote }>;
  },

  async ensurePublicToken(id: string, clinicId: string): Promise<{ public_token: string }> {
    return apiRequest(`${basePath}/${id}/public-token?${qClinic(clinicId)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    }) as Promise<{ public_token: string }>;
  },

  async convert(
    id: string,
    payload: {
      clinic_id: string;
      link_to_guardian_id?: string;
      guardian?: { full_name?: string; notes?: string | null };
    }
  ): Promise<{ quote: Partial<HubQuote>; guardian_id: string }> {
    return apiRequest(`${basePath}/${id}/convert`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ quote: Partial<HubQuote>; guardian_id: string }>;
  },

  /** Fecha orçamento após criar tutor e pets manualmente (wizard), com mapa quote_pet → hub_pet. */
  async finalizeManualConversion(
    id: string,
    payload: {
      clinic_id: string;
      guardian_id: string;
      manual_pet_links: { quote_pet_id: string; hub_pet_id: string }[];
    }
  ): Promise<{ quote: Partial<HubQuote>; guardian_id: string }> {
    return apiRequest(`${basePath}/${id}/finalize-manual-conversion`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ quote: Partial<HubQuote>; guardian_id: string }>;
  },

  async suggestPrice(payload: {
    clinic_id: string;
    hub_service_type_id: string;
    pet: { size_tier: HubQuoteSizeTier; coat_type?: string | null; birth_date?: string | null };
    pricing_variant?: HubQuotePricingVariant | null;
  }): Promise<HubQuoteSuggestPriceResponse> {
    return apiRequest(`${basePath}/suggest-price`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<HubQuoteSuggestPriceResponse>;
  },

  pdfUrl(id: string, clinicId: string): string {
    return `${basePath}/${id}/pdf?${qClinic(clinicId)}`;
  },

  publicLink(token: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/orcamento/${token}`;
  },
};

async function fetchHubQuotePdfBlob(quoteId: string, clinicId: string): Promise<Blob> {
  const token = (await getSupabase().auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');
  const url = `${getApiBaseUrl()}${basePath}/${encodeURIComponent(quoteId)}/pdf?${new URLSearchParams({ clinic_id: clinicId })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string })?.error || 'Falha ao gerar PDF');
  }
  return res.blob();
}

/** Abre o PDF autenticado (blob) — `window.open` na URL da API não envia Bearer. */
export async function openHubQuotePdf(quoteId: string, clinicId: string): Promise<void> {
  const blob = await fetchHubQuotePdfBlob(quoteId, clinicId);
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
}

/** Descarrega o PDF com nome de ficheiro sugerido (Bearer na API). */
export async function downloadHubQuotePdf(quoteId: string, clinicId: string): Promise<void> {
  const blob = await fetchHubQuotePdfBlob(quoteId, clinicId);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `orcamento-${quoteId.slice(0, 8)}.pdf`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
}
