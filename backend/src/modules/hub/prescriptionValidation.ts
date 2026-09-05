import { createHash, randomBytes } from 'node:crypto';

export const VALIDATION_CODE_REGEX = /^RX-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const DEFAULT_PRESCRIPTION_DISCLAIMERS: string[] = [
  'Documento gerado pelo PetMi Hub para validação de autenticidade. Não substitui assinatura qualificada ICP-Brasil.',
  'A dispensação de medicamentos é de responsabilidade do profissional emitente e da farmácia, conforme legislação vigente.',
  'Medicamentos controlados ou antimicrobianos podem exigir documentação adicional; consulte a farmácia.',
];

export type PrescriptionSnapshotClinic = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

export type PrescriptionSnapshotPet = {
  id: string;
  name: string;
  species: string | null;
  breed: string | null;
  birth_date?: string | null;
};

export type PrescriptionSnapshotGuardian = {
  id: string | null;
  full_name: string;
  phone?: string | null;
  tax_id?: string | null;
  id_doc_number?: string | null;
  street?: string | null;
  street_number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
};

export type PrescriptionSnapshotMedication = {
  medication_name: string;
  presentation: string | null;
  concentration: string | null;
  quantity: string | null;
  posology: string | null;
  duration: string | null;
  instructions: string | null;
  administration: string | null;
  use_route: string | null;
};

export type PrescriptionSnapshot = {
  version: 1;
  prescription_id: string;
  document_version: number;
  clinic: PrescriptionSnapshotClinic;
  pet: PrescriptionSnapshotPet;
  guardian: PrescriptionSnapshotGuardian;
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
    use_route: (item.use_route as string | null | undefined) ?? null,
  };
}

export function formatAgeFromBirthDate(birthDate: string | null | undefined, now = new Date()): string {
  if (!birthDate) return 'Não informado';
  const d = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'Não informado';
  let years = now.getFullYear() - d.getFullYear();
  let months = now.getMonth() - d.getMonth();
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return 'Não informado';
  if (years === 0) return months === 1 ? '1 mês' : `${Math.max(months, 0)} meses`;
  if (months === 0) return years === 1 ? '1 ano' : `${years} anos`;
  return `${years} ano${years > 1 ? 's' : ''}, ${months} ${months === 1 ? 'mês' : 'meses'}`;
}

export function formatGuardianAddress(g: PrescriptionSnapshotGuardian): string {
  const line1 = [g.street, g.street_number].filter(Boolean).join(', ').trim();
  const line2 = [g.district, g.city, g.state].filter(Boolean).join(', ').trim();
  const parts = [line1, line2, g.postal_code?.trim()].filter(Boolean);
  return parts.length ? parts.join(' — ') : 'Não informado';
}

export function formatClinicAddress(c: PrescriptionSnapshotClinic): string {
  const parts = [c.address?.trim(), [c.city, c.state].filter(Boolean).join(' - ')].filter(Boolean);
  return parts.join(', ') || '';
}

export function formatTaxIdDisplay(taxId: string | null | undefined): string {
  const digits = String(taxId ?? '').replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return taxId?.trim() || 'Não informado';
}

export function formatMedicationQuantityLine(med: PrescriptionSnapshotMedication): string {
  return [med.quantity, med.presentation].filter(Boolean).join(' ').trim();
}

export function formatMedicationInstructions(med: PrescriptionSnapshotMedication): string {
  const bits = [
    med.posology,
    med.duration ? `durante ${med.duration}` : null,
    med.concentration ? `(${med.concentration})` : null,
    med.instructions,
  ].filter(Boolean);
  return bits.join(' ').trim();
}

export function buildPrescriptionSnapshot(input: {
  prescriptionId: string;
  documentVersion: number;
  issuedAt: string;
  notes?: string | null;
  clinic: PrescriptionSnapshotClinic;
  pet: PrescriptionSnapshotPet;
  guardian: PrescriptionSnapshotGuardian;
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
    clinic: {
      id: input.clinic.id,
      name: input.clinic.name,
      phone: input.clinic.phone ?? null,
      email: input.clinic.email ?? null,
      address: input.clinic.address ?? null,
      city: input.clinic.city ?? null,
      state: input.clinic.state ?? null,
    },
    pet: {
      id: input.pet.id,
      name: input.pet.name,
      species: input.pet.species ?? null,
      breed: input.pet.breed ?? null,
      birth_date: input.pet.birth_date ?? null,
    },
    guardian: {
      id: input.guardian.id,
      full_name: input.guardian.full_name,
      phone: input.guardian.phone ?? null,
      tax_id: input.guardian.tax_id ?? null,
      id_doc_number: input.guardian.id_doc_number ?? null,
      street: input.guardian.street ?? null,
      street_number: input.guardian.street_number ?? null,
      district: input.guardian.district ?? null,
      city: input.guardian.city ?? null,
      state: input.guardian.state ?? null,
      postal_code: input.guardian.postal_code ?? null,
    },
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

export function snapshotToPdfView(
  snapshot: PrescriptionSnapshot,
  opts?: { expires_at?: string | null },
): {
  id: string;
  clinic_id: string;
  prescribed_at: string;
  expires_at: string | null;
  notes: string | null;
  items: Array<{
    medication_name: string;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
    instructions: string | null;
    presentation: string | null;
    concentration: string | null;
    quantity: string | null;
    posology: string | null;
    administration: string | null;
    use_route: string | null;
    order_index: number;
  }>;
  clinic: PrescriptionSnapshotClinic;
  pet: PrescriptionSnapshotPet;
  guardian: PrescriptionSnapshotGuardian;
  staff: { full_name: string; crmv: string | null; crmv_uf: string | null };
} {
  return {
    id: snapshot.prescription_id,
    clinic_id: snapshot.clinic.id,
    prescribed_at: snapshot.issued_at,
    expires_at: opts?.expires_at ?? null,
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
      administration: med.administration,
      use_route: med.use_route,
      order_index: idx,
    })),
    clinic: snapshot.clinic,
    pet: snapshot.pet,
    guardian: snapshot.guardian,
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
  clinic: PrescriptionSnapshotClinic;
  pet: PrescriptionSnapshotPet;
  guardian: PrescriptionSnapshotGuardian;
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
  const clinic = embedOne(
    clinicEmbed as PrescriptionSnapshotClinic | null,
  ) ?? {
    id: String(rx.clinic_id),
    name: 'Clínica veterinária',
  };
  const petRow = embedOne(petEmbed as PrescriptionSnapshotPet | null);
  const guardianRow = embedOne(guardianEmbed as PrescriptionSnapshotGuardian | null);
  const staffRow = embedOne(
    staffEmbed as { id: string; full_name: string; crmv?: string | null; crmv_uf?: string | null } | null,
  );

  return {
    prescription: rx,
    items,
    clinic: {
      id: clinic.id,
      name: clinic.name,
      phone: clinic.phone ?? null,
      email: clinic.email ?? null,
      address: clinic.address ?? null,
      city: clinic.city ?? null,
      state: clinic.state ?? null,
    },
    pet: {
      id: petRow?.id ?? String(rx.pet_id),
      name: petRow?.name ?? '—',
      species: petRow?.species ?? null,
      breed: petRow?.breed ?? null,
      birth_date: petRow?.birth_date ?? null,
    },
    guardian: {
      id: (guardianRow?.id ?? (rx.guardian_id as string | null) ?? null) as string | null,
      full_name: guardianRow?.full_name ?? fallbackGuardianName,
      phone: guardianRow?.phone ?? null,
      tax_id: guardianRow?.tax_id ?? null,
      id_doc_number: guardianRow?.id_doc_number ?? null,
      street: guardianRow?.street ?? null,
      street_number: guardianRow?.street_number ?? null,
      district: guardianRow?.district ?? null,
      city: guardianRow?.city ?? null,
      state: guardianRow?.state ?? null,
      postal_code: guardianRow?.postal_code ?? null,
    },
    veterinarian: {
      id: (staffRow?.id ?? (rx.hub_staff_member_id as string | null) ?? null) as string | null,
      full_name: staffRow?.full_name ?? 'Veterinário responsável',
      crmv: staffRow?.crmv ?? null,
      crmv_uf: staffRow?.crmv_uf ?? null,
    },
  };
}
