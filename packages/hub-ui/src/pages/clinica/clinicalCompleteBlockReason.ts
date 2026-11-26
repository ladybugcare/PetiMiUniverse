/**
 * Bloqueios para finalizar atendimento clínico.
 *
 * Espelha a UX de `needsIdentification`: banner + botão desabilitado +
 * mensagem clara. Lista vazia de receita/exame/encaminhamento NÃO é bloqueio
 * de finalização (ver clinicalIssueBlockReason).
 */

export const NEEDS_IDENTIFICATION_COMPLETE_HINT =
  'Para finalizar, associe tutor e pet ao atendimento — ou vincule um caso clínico com pet/tutor cadastrado.';

export const NEEDS_CLINICAL_CONTENT_COMPLETE_HINT =
  'Para finalizar, registre a queixa principal ou o SOAP (anamnese, exame físico ou diagnóstico).';

export type ClinicalCompleteEncounterBits = {
  guardian_id?: string | null;
  pet_id?: string | null;
  hub_case_id?: string | null;
  chief_complaint?: string | null;
  summary_notes?: string | null;
  anamnesis?: Record<string, unknown> | null;
  physical_exam?: Record<string, unknown> | null;
  diagnosis?: Record<string, unknown> | null;
};

function hasNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulValue(item));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) => hasMeaningfulValue(item));
  }
  return false;
}

/** Queixa, resumo ou qualquer campo SOAP preenchido. */
export function hasMinimumClinicalContent(encounter: ClinicalCompleteEncounterBits): boolean {
  if (hasNonEmptyText(encounter.chief_complaint) || hasNonEmptyText(encounter.summary_notes)) {
    return true;
  }
  if (hasMeaningfulValue(encounter.anamnesis)) return true;
  if (hasMeaningfulValue(encounter.physical_exam)) return true;
  if (hasMeaningfulValue(encounter.diagnosis)) return true;
  return false;
}

export function hasBillingIdentity(encounter: ClinicalCompleteEncounterBits): boolean {
  return !!(encounter.guardian_id && encounter.pet_id) || !!encounter.hub_case_id;
}

/**
 * Motivo de bloqueio de finalização (identificação ou conteúdo clínico mínimo).
 * Retorna null quando pode finalizar.
 */
export function resolveEncounterCompleteBlockReason(
  encounter: ClinicalCompleteEncounterBits,
): string | null {
  if (!hasBillingIdentity(encounter)) {
    return NEEDS_IDENTIFICATION_COMPLETE_HINT;
  }
  if (!hasMinimumClinicalContent(encounter)) {
    return NEEDS_CLINICAL_CONTENT_COMPLETE_HINT;
  }
  return null;
}
