export const PET_CLINICAL_FLAG_OPTIONS: { key: string; label: string }[] = [
  { key: 'allergy', label: 'Alergia' },
  { key: 'cardiac', label: 'Cardiopata' },
  { key: 'aggressive', label: 'Agressivo' },
  { key: 'diabetic', label: 'Diabético' },
  { key: 'epileptic', label: 'Epiléptico' },
  { key: 'other', label: 'Outro' },
];

const LABEL_BY_KEY = new Map(PET_CLINICAL_FLAG_OPTIONS.map((o) => [o.key, o.label]));

export function clinicalFlagLabel(key: string, custom?: string | null): string {
  const trimmed = custom?.trim();
  if (trimmed && trimmed !== LABEL_BY_KEY.get(key)) return trimmed;
  return LABEL_BY_KEY.get(key) ?? key;
}

export function defaultClinicalFlagLabel(key: string): string {
  return LABEL_BY_KEY.get(key) ?? key;
}

export function neuteredLabel(value: boolean | null | undefined): string {
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  return '—';
}
