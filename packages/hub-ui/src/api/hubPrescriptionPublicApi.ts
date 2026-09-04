import { getApiBaseUrl } from '@petimi/web-core';

export const VALIDATION_CODE_REGEX = /^RX-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export type HubPublicPrescriptionMedication = {
  medication_name: string;
  presentation: string | null;
  concentration: string | null;
  quantity: string | null;
  posology: string | null;
  duration: string | null;
  instructions: string | null;
  administration: string | null;
  use_route?: string | null;
};

export type HubPublicPrescriptionStatus = 'valid' | 'revoked' | 'expired';

export type HubPublicPrescriptionPayload = {
  status: HubPublicPrescriptionStatus;
  validation_code: string;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  content_hash_short: string;
  document_version: number;
  clinic: {
    name: string;
    phone?: string | null;
    email?: string | null;
    address_line?: string | null;
  };
  pet: {
    name: string;
    species: string | null;
    breed: string | null;
    age_label?: string;
  };
  guardian: {
    full_name: string;
    phone?: string | null;
    tax_id_display?: string;
    id_doc_number?: string | null;
    address_line?: string;
  };
  veterinarian: {
    full_name: string;
    crmv: string | null;
    crmv_uf: string | null;
  };
  medications: HubPublicPrescriptionMedication[];
  notes: string | null;
  disclaimers: string[];
};

export type HubPublicPrescriptionResponse = {
  prescription: HubPublicPrescriptionPayload;
};

export function normalizeValidationCodeInput(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!VALIDATION_CODE_REGEX.test(code)) return null;
  return code;
}

export function publicPrescriptionPdfUrl(publicToken: string): string {
  return `${getApiBaseUrl()}/api/public/prescriptions/${encodeURIComponent(publicToken)}/pdf`;
}

async function parsePublicPrescriptionResponse(r: Response): Promise<HubPublicPrescriptionPayload> {
  const data = (await r.json().catch(() => ({}))) as HubPublicPrescriptionResponse & { error?: string };
  if (!r.ok) throw new Error(data.error || 'Não foi possível carregar a receita');
  if (!data.prescription) throw new Error('Resposta inválida da API');
  return data.prescription;
}

export async function fetchPublicPrescriptionByToken(token: string): Promise<HubPublicPrescriptionPayload> {
  const t = token.trim();
  if (!t) throw new Error('Link inválido');
  const r = await fetch(`${getApiBaseUrl()}/api/public/prescriptions/${encodeURIComponent(t)}`);
  return parsePublicPrescriptionResponse(r);
}

export async function fetchPublicPrescriptionByCode(code: string): Promise<HubPublicPrescriptionPayload> {
  const normalized = normalizeValidationCodeInput(code);
  if (!normalized) throw new Error('Código inválido. Use o formato RX-XXXX-XXXX.');
  const q = new URLSearchParams({ code: normalized });
  const r = await fetch(`${getApiBaseUrl()}/api/public/prescriptions/validate?${q}`);
  return parsePublicPrescriptionResponse(r);
}
