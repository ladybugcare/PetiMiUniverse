import {
  addDaysIso,
  computeSnapshotHash,
  resolveClinicalPublicUrl,
  resolveValidityDays,
  type ClinicalDocumentScope,
  type ClinicalPartySnapshot,
} from './clinicalDocumentValidation';

export const EXAM_ORDER_CODE_REGEX = /^EX-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export const DEFAULT_EXAM_ORDER_DISCLAIMERS: string[] = [
  'Documento gerado pelo PetMi Hub para validação de autenticidade. Não substitui guias oficiais de convênios ou laboratórios.',
  'A realização dos exames é de responsabilidade do laboratório indicado e do tutor, conforme orientação veterinária.',
  'Este documento não garante aceitação por convênios ou laboratórios externos.',
];

export type ExamOrderSnapshotItem = {
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

export type ExamOrderSnapshot = {
  version: 1;
  hub_encounter_id: string;
  document_version: number;
  scope: ClinicalDocumentScope;
  clinic: ClinicalPartySnapshot['clinic'];
  pet: ClinicalPartySnapshot['pet'];
  guardian: ClinicalPartySnapshot['guardian'];
  veterinarian: ClinicalPartySnapshot['veterinarian'];
  exams: ExamOrderSnapshotItem[];
  issued_at: string;
  disclaimers: string[];
};

export function normalizeExamOrderValidationCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (!EXAM_ORDER_CODE_REGEX.test(code)) return null;
  return code;
}

export function resolveExamOrderPublicUrl(publicToken: string): string {
  return resolveClinicalPublicUrl('/solicitacao-exame/', publicToken);
}

export function mapExamRowToSnapshotItem(row: Record<string, unknown>): ExamOrderSnapshotItem {
  return {
    exam_id: String(row.id),
    exam_type: String(row.exam_type ?? '—'),
    lab_kind: (row.lab_kind as 'internal' | 'external') ?? 'internal',
    lab_name: (row.lab_name as string | null) ?? null,
    external_lab_name: (row.external_lab_name as string | null) ?? null,
    clinical_indication: (row.clinical_indication as string | null) ?? null,
    fasting_required: Boolean(row.fasting_required),
    collection_instructions: (row.collection_instructions as string | null) ?? null,
    urgency: (row.urgency as 'routine' | 'urgent' | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  };
}

export function buildExamOrderSnapshot(opts: {
  encounterId: string;
  documentVersion: number;
  scope: ClinicalDocumentScope;
  issuedAt: string;
  parties: ClinicalPartySnapshot;
  exams: ExamOrderSnapshotItem[];
  customDisclaimer?: string | null;
}): ExamOrderSnapshot {
  const disclaimers = [...DEFAULT_EXAM_ORDER_DISCLAIMERS];
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
    exams: opts.exams,
    issued_at: opts.issuedAt,
    disclaimers,
  };
}

export function computeExamOrderContentHash(snapshot: ExamOrderSnapshot): string {
  return computeSnapshotHash(snapshot);
}

export function resolveExamOrderValidityDays(defaults: Record<string, unknown>): number {
  return resolveValidityDays(defaults, 30);
}
