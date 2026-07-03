import { getApiBaseUrl } from '@petimi/web-core';

export const SPECIALIST_REFERRAL_CODE_REGEX = /^RF-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export type HubPublicSpecialistReferralItem = {
  referral_id: string;
  specialty: string;
  specialist_name: string | null;
  specialist_contact: string | null;
  referral_reason: string;
  clinical_summary: string | null;
  priority: 'routine' | 'urgent';
  notes: string | null;
};

export type HubPublicSpecialistReferralPayload = {
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
  referrals: HubPublicSpecialistReferralItem[];
  disclaimers: string[];
};

export function normalizeSpecialistReferralCodeInput(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!SPECIALIST_REFERRAL_CODE_REGEX.test(code)) return null;
  return code;
}

export function publicSpecialistReferralPdfUrl(publicToken: string): string {
  return `${getApiBaseUrl()}/api/public/encaminhamentos/${encodeURIComponent(publicToken)}/pdf`;
}

export async function fetchPublicSpecialistReferralByToken(
  token: string,
): Promise<HubPublicSpecialistReferralPayload> {
  const r = await fetch(`${getApiBaseUrl()}/api/public/encaminhamentos/${encodeURIComponent(token.trim())}`);
  const data = (await r.json().catch(() => ({}))) as {
    specialist_referral?: HubPublicSpecialistReferralPayload;
    error?: string;
  };
  if (!r.ok) throw new Error(data.error || 'Não foi possível carregar o encaminhamento');
  if (!data.specialist_referral) throw new Error('Resposta inválida da API');
  return data.specialist_referral;
}

export async function fetchPublicSpecialistReferralByCode(code: string): Promise<HubPublicSpecialistReferralPayload> {
  const normalized = normalizeSpecialistReferralCodeInput(code);
  if (!normalized) throw new Error('Código inválido. Use o formato RF-XXXX-XXXX.');
  const q = new URLSearchParams({ code: normalized });
  const r = await fetch(`${getApiBaseUrl()}/api/public/encaminhamentos/validate?${q}`);
  const data = (await r.json().catch(() => ({}))) as {
    specialist_referral?: HubPublicSpecialistReferralPayload;
    error?: string;
  };
  if (!r.ok) throw new Error(data.error || 'Não foi possível validar');
  if (!data.specialist_referral) throw new Error('Resposta inválida da API');
  return data.specialist_referral;
}
