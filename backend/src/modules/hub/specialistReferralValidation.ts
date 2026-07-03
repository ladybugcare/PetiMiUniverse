import {
  computeSnapshotHash,
  resolveClinicalPublicUrl,
  resolveValidityDays,
  type ClinicalDocumentScope,
  type ClinicalPartySnapshot,
} from './clinicalDocumentValidation';

export const SPECIALIST_REFERRAL_CODE_REGEX = /^RF-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export const DEFAULT_SPECIALIST_REFERRAL_DISCLAIMERS: string[] = [
  'Documento gerado pelo PetMi Hub para validação de autenticidade. Não substitui documentos regulatórios específicos.',
  'O encaminhamento é uma orientação clínica; a consulta com especialista depende de disponibilidade e critérios do profissional destino.',
  'Este documento não garante agendamento ou aceitação pelo especialista indicado.',
];

export type SpecialistReferralSnapshotItem = {
  referral_id: string;
  specialty: string;
  specialist_name: string | null;
  specialist_contact: string | null;
  referral_reason: string;
  clinical_summary: string | null;
  priority: 'routine' | 'urgent';
  notes: string | null;
};

export type SpecialistReferralSnapshot = {
  version: 1;
  hub_encounter_id: string;
  document_version: number;
  scope: ClinicalDocumentScope;
  clinic: ClinicalPartySnapshot['clinic'];
  pet: ClinicalPartySnapshot['pet'];
  guardian: ClinicalPartySnapshot['guardian'];
  veterinarian: ClinicalPartySnapshot['veterinarian'];
  referrals: SpecialistReferralSnapshotItem[];
  issued_at: string;
  disclaimers: string[];
};

export function normalizeSpecialistReferralValidationCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (!SPECIALIST_REFERRAL_CODE_REGEX.test(code)) return null;
  return code;
}

export function resolveSpecialistReferralPublicUrl(publicToken: string): string {
  return resolveClinicalPublicUrl('/encaminhamento/', publicToken);
}

export function mapReferralRowToSnapshotItem(row: Record<string, unknown>): SpecialistReferralSnapshotItem {
  return {
    referral_id: String(row.id),
    specialty: String(row.specialty ?? '—'),
    specialist_name: (row.specialist_name as string | null) ?? null,
    specialist_contact: (row.specialist_contact as string | null) ?? null,
    referral_reason: String(row.referral_reason ?? '—'),
    clinical_summary: (row.clinical_summary as string | null) ?? null,
    priority: (row.priority as 'routine' | 'urgent') ?? 'routine',
    notes: (row.notes as string | null) ?? null,
  };
}

export function buildSpecialistReferralSnapshot(opts: {
  encounterId: string;
  documentVersion: number;
  scope: ClinicalDocumentScope;
  issuedAt: string;
  parties: ClinicalPartySnapshot;
  referrals: SpecialistReferralSnapshotItem[];
  customDisclaimer?: string | null;
}): SpecialistReferralSnapshot {
  const disclaimers = [...DEFAULT_SPECIALIST_REFERRAL_DISCLAIMERS];
  if (opts.customDisclaimer?.trim()) disclaimers.push(opts.customDisclaimer.trim());
  return {
    version: 1,
    hub_encounter_id: opts.encounterId,
    document_version: opts.documentVersion,
    scope: opts.scope,
    clinic: opts.parties.clinic,
    pet: opts.parties.pet,
    guardian: opts.parties.guardian,
    veterinarian: opts.parties.veterinarian,
    referrals: opts.referrals,
    issued_at: opts.issuedAt,
    disclaimers,
  };
}

export function computeSpecialistReferralContentHash(snapshot: SpecialistReferralSnapshot): string {
  return computeSnapshotHash(snapshot);
}

export function resolveSpecialistReferralValidityDays(defaults: Record<string, unknown>): number {
  return resolveValidityDays(defaults, 30);
}
