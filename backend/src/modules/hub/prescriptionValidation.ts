import { createHash, randomBytes } from 'node:crypto';

export const VALIDATION_CODE_REGEX = /^RX-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const DEFAULT_PRESCRIPTION_DISCLAIMERS: string[] = [
  'Documento gerado pelo PetMi Hub para validação de autenticidade. Não substitui assinatura qualificada ICP-Brasil.',
  'A dispensação de medicamentos é de responsabilidade do profissional emitente e da farmácia, conforme legislação vigente.',
  'Medicamentos controlados ou antimicrobianos podem exigir documentação adicional; consulte a farmácia.',
];

export type PrescriptionSnapshotMedication = {
  medication_name: string;
  presentation: string | null;
  concentration: string | null;
  quantity: string | null;
  posology: string | null;
  duration: string | null;
  instructions: string | null;
  administration: string | null;
};

export type PrescriptionSnapshot = {
  version: 1;
  prescription_id: string;
  document_version: number;
  clinic: { id: string; name: string };
  pet: { id: string; name: string; species: string | null; breed: string | null };
  guardian: { id: string | null; full_name: string };
  veterinarian: {
    id: string | null;
    full_name: string;
    crmv: string | null;
    crmv_uf: string | null;
  };
  medications: PrescriptionSnapshotMedication[];
  notes: string | null;
  issued_at: string;
  disclaimers: string[];
};

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export function generateValidationCode(): string {
  const part = () =>
    Array.from({ length: 4 }, () => CROCKFORD[randomBytes(1)[0]! % CROCKFORD.length]).join('');
  return `RX-${part()}-${part()}`;
}

export function generatePublicToken(): string {
  return randomBytes(24).toString('base64url');
}

function sortObjectKeys(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  return sorted;
}

export function canonicalizeSnapshot(snapshot: PrescriptionSnapshot): string {
  return JSON.stringify(sortObjectKeys(snapshot));
}

export function computeContentHash(snapshot: PrescriptionSnapshot): string {
  return createHash('sha256').update(canonicalizeSnapshot(snapshot)).digest('hex');
}

export function truncateContentHash(hash: string, edge = 8): string {
  if (hash.length <= edge * 2 + 1) return hash;
  return `${hash.slice(0, edge)}…${hash.slice(-edge)}`;
}

export function maskPublicToken(token: string): string {
  if (token.length <= 10) return '***';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export function resolvePrescriptionPublicUrl(publicToken: string): string {
  const base =
    process.env.HUB_WEB_URL?.trim() ||
    process.env.VITE_HUB_WEB_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    'http://localhost:3002';
  return `${base.replace(/\/$/, '')}/receita/${publicToken}`;
}

export function computeDocumentStatus(doc: {
  revoked_at?: string | null;
  expires_at?: string | null;
}): 'valid' | 'revoked' | 'expired' {
  if (doc.revoked_at) return 'revoked';
  if (doc.expires_at && new Date(doc.expires_at).getTime() < Date.now()) return 'expired';
  return 'valid';
}

export function normalizeMedicationItem(item: Record<string, unknown>): PrescriptionSnapshotMedication {
  return {
    medication_name: String(item.medication_name ?? ''),
    presentation: (item.presentation as string | null | undefined) ?? null,
    concentration:
      (item.concentration as string | null | undefined) ??
      (item.dosage as string | null | undefined) ??
      null,
    quantity: (item.quantity as string | null | undefined) ?? null,
    posology:
      (item.posology as string | null | undefined) ??
      (item.frequency as string | null | undefined) ??
      null,
    duration: (item.duration as string | null | undefined) ?? null,
    instructions: (item.instructions as string | null | undefined) ?? null,
    administration: (item.administration as string | null | undefined) ?? null,
  };
}

export function buildPrescriptionSnapshot(input: {
  prescriptionId: string;
  documentVersion: number;
  issuedAt: string;
  notes?: string | null;
  clinic: { id: string; name: string };
  pet: { id: string; name: string; species?: string | null; breed?: string | null };
  guardian: { id: string | null; full_name: string };
  veterinarian: {
    id: string | null;
    full_name: string;
    crmv?: string | null;
    crmv_uf?: string | null;
  };
  items: Record<string, unknown>[];
  customDisclaimer?: string | null;
}): PrescriptionSnapshot {
  const disclaimers = [...DEFAULT_PRESCRIPTION_DISCLAIMERS];
  const extra = input.customDisclaimer?.trim();
  if (extra) disclaimers.push(extra);

  return {
    version: 1,
    prescription_id: input.prescriptionId,
    document_version: input.documentVersion,
    clinic: { id: input.clinic.id, name: input.clinic.name },
    pet: {
      id: input.pet.id,
      name: input.pet.name,
      species: input.pet.species ?? null,
      breed: input.pet.breed ?? null,
    },
    guardian: { id: input.guardian.id, full_name: input.guardian.full_name },
    veterinarian: {
      id: input.veterinarian.id,
      full_name: input.veterinarian.full_name,
      crmv: input.veterinarian.crmv ?? null,
      crmv_uf: input.veterinarian.crmv_uf ?? null,
    },
    medications: [...input.items]
      .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0))
      .map(normalizeMedicationItem),
    notes: input.notes ?? null,
    issued_at: input.issuedAt,
    disclaimers,
  };
}

export function snapshotToPdfView(snapshot: PrescriptionSnapshot): {
  id: string;
  clinic_id: string;
  prescribed_at: string;
  notes: string | null;
  items: Array<{
    medication_name: string;
    dosage?: string | null;
    frequency?: string | null;
    duration?: string | null;
    instructions?: string | null;
    presentation?: string | null;
    concentration?: string | null;
    quantity?: string | null;
    posology?: string | null;
    order_index?: number;
  }>;
  clinic: { name: string };
  pet: { name: string; species: string | null; breed: string | null };
  guardian: { full_name: string };
  staff: { full_name: string; crmv: string | null; crmv_uf: string | null };
} {
  return {
    id: snapshot.prescription_id,
    clinic_id: snapshot.clinic.id,
    prescribed_at: snapshot.issued_at,
    notes: snapshot.notes,
    items: snapshot.medications.map((med, idx) => ({
      medication_name: med.medication_name,
      presentation: med.presentation,
      concentration: med.concentration,
      quantity: med.quantity,
      posology: med.posology,
      dosage: med.concentration,
      frequency: med.posology,
      duration: med.duration,
      instructions: med.instructions,
      order_index: idx,
    })),
    clinic: { name: snapshot.clinic.name },
    pet: {
      name: snapshot.pet.name,
      species: snapshot.pet.species,
      breed: snapshot.pet.breed,
    },
    guardian: { full_name: snapshot.guardian.full_name },
    staff: {
      full_name: snapshot.veterinarian.full_name,
      crmv: snapshot.veterinarian.crmv,
      crmv_uf: snapshot.veterinarian.crmv_uf,
    },
  };
}

export function resolvePrescriptionValidityDays(
  prescriptionDefaults: Record<string, unknown> | null | undefined,
): number {
  const raw = prescriptionDefaults?.validity_days;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 365) return Math.floor(n);
  return 30;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export type LoadedPrescriptionIssueContext = {
  prescription: Record<string, unknown>;
  items: Record<string, unknown>[];
  clinic: { id: string; name: string };
  pet: { id: string; name: string; species: string | null; breed: string | null };
  guardian: { id: string | null; full_name: string };
  veterinarian: {
    id: string | null;
    full_name: string;
    crmv: string | null;
    crmv_uf: string | null;
  };
};

export function mapLoadedIssueContext(
  rx: Record<string, unknown>,
  items: Record<string, unknown>[],
  clinicEmbed: unknown,
  petEmbed: unknown,
  guardianEmbed: unknown,
  staffEmbed: unknown,
  fallbackGuardianName = 'Tutor não informado',
): LoadedPrescriptionIssueContext {
  const clinic = embedOne(clinicEmbed as { id: string; name: string } | null) ?? {
    id: String(rx.clinic_id),
    name: 'Clínica veterinária',
  };
  const petRow = embedOne(
    petEmbed as { id: string; name: string; species?: string | null; breed?: string | null } | null,
  );
  const guardianRow = embedOne(guardianEmbed as { id: string; full_name: string } | null);
  const staffRow = embedOne(
    staffEmbed as { id: string; full_name: string; crmv?: string | null; crmv_uf?: string | null } | null,
  );

  return {
    prescription: rx,
    items,
    clinic: { id: clinic.id, name: clinic.name },
    pet: {
      id: petRow?.id ?? String(rx.pet_id),
      name: petRow?.name ?? '—',
      species: petRow?.species ?? null,
      breed: petRow?.breed ?? null,
    },
    guardian: {
      id: (guardianRow?.id ?? (rx.guardian_id as string | null) ?? null) as string | null,
      full_name: guardianRow?.full_name ?? fallbackGuardianName,
    },
    veterinarian: {
      id: (staffRow?.id ?? (rx.hub_staff_member_id as string | null) ?? null) as string | null,
      full_name: staffRow?.full_name ?? 'Veterinário responsável',
      crmv: staffRow?.crmv ?? null,
      crmv_uf: staffRow?.crmv_uf ?? null,
    },
  };
}
