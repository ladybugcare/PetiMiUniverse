import { getApiBaseUrl } from '@petimi/web-core';

export const EXAM_ORDER_CODE_REGEX = /^EX-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export type HubPublicExamOrderItem = {
  exam_id: string;
  exam_type: string;
  lab_kind: 'internal' | 'external';
  lab_name: string | null;
  external_lab_name: string | null;
  clinical_indication: string | null;
  fasting_required: boolean;
  collection_instructions: string | null;
  urgency: 'routine' | 'urgent' | null;
  notes: string | null;
};

export type HubPublicExamOrderPayload = {
  status: 'valid' | 'revoked' | 'expired';
  validation_code: string;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoke_reason?: string | null;
  content_hash_short: string;
  document_version: number;
  scope: 'single' | 'encounter_bundle';
  clinic: { name: string };
  pet: { id: string; name: string; species: string | null; breed: string | null };
  guardian: { id: string | null; full_name: string };
  veterinarian: { id: string | null; full_name: string; crmv: string | null; crmv_uf: string | null };
  exams: HubPublicExamOrderItem[];
  disclaimers: string[];
};

export function normalizeExamOrderCodeInput(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!EXAM_ORDER_CODE_REGEX.test(code)) return null;
  return code;
}

export function publicExamOrderPdfUrl(publicToken: string): string {
  return `${getApiBaseUrl()}/api/public/exam-orders/${encodeURIComponent(publicToken)}/pdf`;
}

export async function fetchPublicExamOrderByToken(token: string): Promise<HubPublicExamOrderPayload> {
  const r = await fetch(`${getApiBaseUrl()}/api/public/exam-orders/${encodeURIComponent(token.trim())}`);
  const data = (await r.json().catch(() => ({}))) as { exam_order?: HubPublicExamOrderPayload; error?: string };
  if (!r.ok) throw new Error(data.error || 'Não foi possível carregar a solicitação');
  if (!data.exam_order) throw new Error('Resposta inválida da API');
  return data.exam_order;
}

export async function fetchPublicExamOrderByCode(code: string): Promise<HubPublicExamOrderPayload> {
  const normalized = normalizeExamOrderCodeInput(code);
  if (!normalized) throw new Error('Código inválido. Use o formato EX-XXXX-XXXX.');
  const q = new URLSearchParams({ code: normalized });
  const r = await fetch(`${getApiBaseUrl()}/api/public/exam-orders/validate?${q}`);
  const data = (await r.json().catch(() => ({}))) as { exam_order?: HubPublicExamOrderPayload; error?: string };
  if (!r.ok) throw new Error(data.error || 'Não foi possível validar');
  if (!data.exam_order) throw new Error('Resposta inválida da API');
  return data.exam_order;
}
