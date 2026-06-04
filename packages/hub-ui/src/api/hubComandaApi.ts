import { apiRequest } from '@petimi/web-core';

const base = '/api/hub/comandas';

export type HubComandaOriginType = 'appointment' | 'grooming_session' | 'quote' | 'encounter';

export type HubComandaItem = {
  id: string;
  clinic_id: string;
  comanda_id: string;
  pet_id: string | null;
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
};

export const hubComandaApi = {
  async openComanda(body: {
    clinic_id: string;
    origin_type: HubComandaOriginType;
    origin_id: string;
  }): Promise<HubComandaDetailResponse> {
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

  async checkout(
    comandaId: string,
    body: {
      clinic_id: string;
      grouping: 'all' | 'by_pet' | 'manual';
      manual_groups?: { item_ids: string[] }[];
      tutor_items_group_index?: number | null;
      action: 'receive_now' | 'leave_pending' | 'cancel';
      due_date?: string | null;
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
  }): Promise<{ comandas: Array<Record<string, unknown>> }> {
    const q = new URLSearchParams({ clinic_id: params.clinic_id });
    if (params.unit_id) q.set('unit_id', params.unit_id);
    if (params.status) q.set('status', params.status);
    return apiRequest(`${base}?${q}`) as Promise<{ comandas: Array<Record<string, unknown>> }>;
  },
};
