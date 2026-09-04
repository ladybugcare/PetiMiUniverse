const GENERIC_CASE_TITLE_RE =
  /^(atendimento avulso|consulta|caso clínico|atendimento clínico)(\s*[—–-]\s*\d{2}\/\d{2}\/\d{4})?$/i;

export function isGenericClinicalCaseTitle(title?: string | null): boolean {
  const t = (title ?? '').trim();
  return t.length === 0 || GENERIC_CASE_TITLE_RE.test(t);
}

/** Título visível: se o gravado for genérico, usa a queixa/resumo do atendimento. */
export function clinicalCaseDisplayTitle(
  title?: string | null,
  fallbacks: Array<string | null | undefined> = [],
): string {
  const stored = title?.trim() ?? '';
  if (stored && !isGenericClinicalCaseTitle(stored)) return stored;
  for (const raw of fallbacks) {
    const t = raw?.trim();
    if (t && !isGenericClinicalCaseTitle(t)) return t;
  }
  return stored || 'Caso clínico';
}

export function clinicalCaseTitleFallbacks(
  encounters: Array<{
    hub_case_id?: string | null;
    chief_complaint?: string | null;
    summary_notes?: string | null;
  }>,
  caseId?: string,
): string[] {
  return encounters
    .filter((e) => !caseId || !e.hub_case_id || e.hub_case_id === caseId)
    .flatMap((e) => [e.chief_complaint, e.summary_notes]);
}
