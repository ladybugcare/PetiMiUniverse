/**
 * Bloqueios de emissão de documentos clínicos (receita / exame / encaminhamento).
 *
 * Seção vazia NÃO é bloqueio de UI: é estado normal. Tratar vazio como erro
 * (“Adicione X antes de gerar…”) gerava avisos/modais assustadores sem o
 * usuário ter pedido emitir — inclusive ao finalizar o atendimento.
 */

export const EMPTY_PRESCRIPTION_ISSUE_HINT =
  'Adicione ao menos um medicamento antes de gerar a receita.';
export const EMPTY_EXAM_ISSUE_HINT =
  'Adicione ao menos um exame antes de gerar o documento.';
export const EMPTY_REFERRAL_ISSUE_HINT =
  'Adicione ao menos um encaminhamento antes de gerar o documento.';

export type ClinicalIssueEncounterBits = {
  pet_id?: string | null;
  hub_staff_member_id?: string | null;
};

/** Bloqueios reais (pet/vet/somente-leitura). Retorna null se a lista estiver vazia. */
export function resolveContentIssueBlockReason(
  encounter: ClinicalIssueEncounterBits,
  hasContent: boolean,
  opts?: { readOnly?: boolean; readOnlyMessage?: string },
): string | null {
  if (!hasContent) return null;
  if (opts?.readOnly) {
    return opts.readOnlyMessage ?? 'Atendimento somente leitura — não é possível emitir.';
  }
  if (!encounter.pet_id) return 'Vincule um pet ao atendimento antes de emitir.';
  if (!encounter.hub_staff_member_id) {
    return 'Defina o veterinário responsável no atendimento antes de emitir.';
  }
  return null;
}

export function resolvePrescriptionIssueBlockReason(opts: {
  readOnly: boolean;
  hasItems: boolean;
  encounter: ClinicalIssueEncounterBits;
}): string | null {
  return resolveContentIssueBlockReason(opts.encounter, opts.hasItems, {
    readOnly: opts.readOnly,
    readOnlyMessage: 'Atendimento somente leitura — não é possível emitir receita.',
  });
}

export function resolveExamIssueBlockReason(
  encounter: ClinicalIssueEncounterBits,
  examCount: number,
): string | null {
  return resolveContentIssueBlockReason(encounter, examCount > 0);
}

export function resolveReferralIssueBlockReason(
  encounter: ClinicalIssueEncounterBits,
  referralCount: number,
): string | null {
  return resolveContentIssueBlockReason(encounter, referralCount > 0);
}
