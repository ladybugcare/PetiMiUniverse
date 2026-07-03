import {
  computeDocumentStatus,
  truncateContentHash,
  type PrescriptionSnapshot,
  VALIDATION_CODE_REGEX,
} from './prescriptionValidation';

export type PublicPrescriptionPayload = {
  status: 'valid' | 'revoked' | 'expired';
  validation_code: string;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  content_hash_short: string;
  document_version: number;
  clinic: { name: string };
  pet: { name: string; species: string | null; breed: string | null };
  guardian: { full_name: string };
  veterinarian: {
    full_name: string;
    crmv: string | null;
    crmv_uf: string | null;
  };
  medications: PrescriptionSnapshot['medications'];
  notes: string | null;
  disclaimers: string[];
};

export function normalizeValidationCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (!VALIDATION_CODE_REGEX.test(code)) return null;
  return code;
}

export function isPlausiblePublicToken(token: string): boolean {
  const t = token.trim();
  return t.length >= 16 && t.length <= 64 && /^[A-Za-z0-9_-]+$/.test(t);
}

export function buildPublicPrescriptionPayload(
  doc: Record<string, unknown>,
): PublicPrescriptionPayload | null {
  const snapshot = doc.snapshot as PrescriptionSnapshot | null | undefined;
  if (!snapshot?.medications?.length) return null;

  const contentHash = String(doc.content_hash ?? '');
  const status = computeDocumentStatus({
    revoked_at: doc.revoked_at as string | null,
    expires_at: doc.expires_at as string | null,
  });

  return {
    status,
    validation_code: String(doc.validation_code ?? ''),
    issued_at: String(doc.issued_at ?? snapshot.issued_at),
    expires_at: (doc.expires_at as string | null) ?? null,
    revoked_at: (doc.revoked_at as string | null) ?? null,
    content_hash_short: contentHash ? truncateContentHash(contentHash) : '—',
    document_version: Number(doc.version_no ?? snapshot.document_version ?? 1),
    clinic: { name: snapshot.clinic.name },
    pet: {
      name: snapshot.pet.name,
      species: snapshot.pet.species,
      breed: snapshot.pet.breed,
    },
    guardian: { full_name: snapshot.guardian.full_name },
    veterinarian: {
      full_name: snapshot.veterinarian.full_name,
      crmv: snapshot.veterinarian.crmv,
      crmv_uf: snapshot.veterinarian.crmv_uf,
    },
    medications: snapshot.medications,
    notes: snapshot.notes,
    disclaimers: snapshot.disclaimers ?? [],
  };
}
