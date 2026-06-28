import { apiRequest } from '@petimi/web-core';

const base = '/api/hub/comandas';

export type HubComandaOriginType = 'appointment' | 'grooming_session' | 'quote' | 'encounter' | 'manual' | 'boarding_reservation';

export type CancellationResolution = 'refund' | 'customer_credit' | 'keep_billing';

export type HubComandaManualLine = {
  description: string;
  quantity?: number;
  unit_amount: number;
  pet_id?: string | null;
};

export type HubComandaItem = {
  id: string;
  clinic_id: string;
  comanda_id: string;
  pet_id: string | null;
  /** Nome do pet (enriquecido pelo backend). */
  pet_name?: string | null;
  item_kind: string;
  hub_service_type_id?: string | null;
  description: string;
  quantity: number;
  unit_amount: number;
  discount_amount: number;
  line_total: number;
  service_date?: string | null;
  origin_type?: string | null;
  origin_id?: string | null;
  sort_order: number;
};

export type HubComandaDetailResponse = {
  comanda: Record<string, unknown>;
  items: HubComandaItem[];
  open_item_ids: string[];
  invoiced_item_ids: string[];
  paid_total?: number;
  balance_due?: number;
  operational_complete?: boolean;
};

export type HubComandaOpenBody = {
  clinic_id: string;
  origin_type: HubComandaOriginType;
  /** Obrigatório exceto para `origin_type: 'manual'`. */
  origin_id?: string;
  guardian_id?: string;
  unit_id?: string | null;
  manual_lines?: HubComandaManualLine[];
  hub_case_id?: string | null;
  hub_encounter_id?: string | null;
};

export const hubComandaApi = {
  async openComanda(body: HubComandaOpenBody): Promise<HubComandaDetailResponse> {
    return apiRequest(`${base}/open`, { method: 'POST', body: JSON.stringify(body) }) as Promise<HubComandaDetailResponse>;
  },

  async getComandaByOrigin(params: {
    clinic_id: string;
    origin_type: HubComandaOriginType;
    origin_id: string;
  }): Promise<HubComandaDetailResponse> {
    const q = new URLSearchParams(params as unknown as Record<string, string>);
    return apiRequest(`${base}/by-origin?${q}`) as Promise<HubComandaDetailResponse>;
  },

  async getComandaDetail(comandaId: string, clinicId: string): Promise<HubComandaDetailResponse> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${base}/${encodeURIComponent(comandaId)}?${q}`) as Promise<HubComandaDetailResponse>;
  },

  async syncComandaFromOrigin(comandaId: string, clinicId: string): Promise<HubComandaDetailResponse> {
    return apiRequest(`${base}/${encodeURIComponent(comandaId)}/sync-from-origin`, {
      method: 'POST',
      body: JSON.stringify({ clinic_id: clinicId }),
    }) as Promise<HubComandaDetailResponse>;
  },

  async checkout(
    comandaId: string,
    body: {
      clinic_id: string;
      grouping: 'all' | 'by_pet' | 'manual';
      manual_groups?: { item_ids: string[] }[];
      tutor_items_group_index?: number | null;
      action: 'receive_now' | 'leave_pending' | 'cancel';
      due_date?: string | null;
      payment_timing?: 'on_checkout' | 'advance';
      payments?: Array<{
        group_index: number;
        amount: number;
        payment_method:
          | 'pix'
          | 'cash'
          | 'credit_card'
          | 'debit_card'
          | 'transfer'
          | 'payment_link'
          | 'customer_credit';
        cash_session_id?: string | null;
        installments?: number;
      }>;
      waive_reason?: string;
    }
  ): Promise<{ comanda: unknown; receivable_ids: string[]; detail: HubComandaDetailResponse }> {
    return apiRequest(`${base}/${encodeURIComponent(comandaId)}/checkout`, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<{ comanda: unknown; receivable_ids: string[]; detail: HubComandaDetailResponse }>;
  },

  async listComandas(params: {
    clinic_id: string;
    unit_id?: string;
    status?: 'aberta' | 'fechada' | 'cancelada';
    hub_case_id?: string;
    cancellation_pending?: boolean;
    /** Quando true, inclui guardian/pet/paid_total em cada comanda. */
    enrich?: boolean;
  }): Promise<{ comandas: Array<Record<string, unknown>> }> {
    const q = new URLSearchParams({ clinic_id: params.clinic_id });
    if (params.unit_id) q.set('unit_id', params.unit_id);
    if (params.status) q.set('status', params.status);
    if (params.hub_case_id) q.set('hub_case_id', params.hub_case_id);
    if (params.cancellation_pending) q.set('cancellation_pending', 'true');
    if (params.enrich) q.set('enrich', 'true');
    return apiRequest(`${base}?${q}`) as Promise<{ comandas: Array<Record<string, unknown>> }>;
  },

  async getCancellationPendingCount(clinicId: string, unitId?: string): Promise<{ count: number }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (unitId) q.set('unit_id', unitId);
    return apiRequest(`${base}/cancellation-pending-count?${q}`) as Promise<{ count: number }>;
  },

  async listCancellationPending(params: {
    clinic_id: string;
    unit_id?: string;
  }): Promise<{ comandas: Array<Record<string, unknown>> }> {
    return hubComandaApi.listComandas({ ...params, cancellation_pending: true });
  },

  async resolveCancellation(
    comandaId: string,
    body: {
      clinic_id: string;
      resolution: CancellationResolution;
      reason: string;
      cash_session_id?: string | null;
    }
  ): Promise<{ comanda: unknown; detail: HubComandaDetailResponse }> {
    return apiRequest(`${base}/${encodeURIComponent(comandaId)}/resolve-cancellation`, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<{ comanda: unknown; detail: HubComandaDetailResponse }>;
  },

  // ── Itens de comanda (adicionar/editar/remover manualmente) ─────────────

  async addItems(
    comandaId: string,
    body: {
      clinic_id: string;
      items: Array<{
        pet_id?: string | null;
        hub_service_type_id?: string | null;
        hub_inventory_item_id?: string | null;
        description: string;
        quantity?: number;
        unit_amount: number;
        discount_amount?: number;
        item_kind?: 'service' | 'product' | 'fee';
      }>;
    }
  ): Promise<HubComandaDetailResponse> {
    return apiRequest(`${base}/${encodeURIComponent(comandaId)}/items`, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<HubComandaDetailResponse>;
  },

  async patchItem(
    comandaId: string,
    itemId: string,
    body: {
      clinic_id: string;
      description?: string;
      quantity?: number;
      unit_amount?: number;
      discount_amount?: number;
    }
  ): Promise<HubComandaDetailResponse> {
    return apiRequest(`${base}/${encodeURIComponent(comandaId)}/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }) as Promise<HubComandaDetailResponse>;
  },

  async deleteItem(
    comandaId: string,
    itemId: string,
    clinicId: string
  ): Promise<HubComandaDetailResponse> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${base}/${encodeURIComponent(comandaId)}/items/${encodeURIComponent(itemId)}?${q}`, {
      method: 'DELETE',
    }) as Promise<HubComandaDetailResponse>;
  },

  async suggestItemPrice(body: {
    clinic_id: string;
    hub_service_type_id: string;
    pet: { size_tier?: string; birth_date?: string | null; coat_type?: string | null };
  }): Promise<{ unit_price: number; applied_porte: string | null; applied_coat_type: string | null }> {
    return apiRequest(`${base}/suggest-item-price`, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<{ unit_price: number; applied_porte: string | null; applied_coat_type: string | null }>;
  },

  // ── Checkout em conjunto (várias comandas do mesmo tutor) ────────────────

  async checkoutBulk(body: {
    clinic_id: string;
    unit_id?: string | null;
    comanda_ids: string[];
    grouping?: 'all' | 'by_pet';
    action: 'receive_now' | 'leave_pending' | 'cancel';
    due_date?: string | null;
    payment_timing?: 'on_checkout' | 'advance';
    payment_method?: string | null;
    cash_session_id?: string | null;
  }): Promise<{
    results: Array<{ comanda_id: string; receivable_ids: string[]; error?: string }>;
    partial_errors: boolean;
  }> {
    return apiRequest(`${base}/checkout-bulk`, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<{
      results: Array<{ comanda_id: string; receivable_ids: string[]; error?: string }>;
      partial_errors: boolean;
    }>;
  },

  async updateComanda(
    comandaId: string,
    body: {
      clinic_id: string;
      discount_amount?: number;
      notes?: string | null;
    },
  ): Promise<HubComandaDetailResponse> {
    return apiRequest(`${base}/${encodeURIComponent(comandaId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }) as Promise<HubComandaDetailResponse>;
  },
};
