import { BEHAVIOR_TAG_LABELS, CLINICAL_FLAG_LABELS } from './hubPetHealthProfile';

function preferenceTagsFromNotes(notes?: string | null): Array<{ key: string; label: string }> {
  if (!notes?.trim()) return [];
  const n = notes.toLowerCase();
  const out: Array<{ key: string; label: string }> = [];
  if (
    n.includes('sem secador') ||
    n.includes('não usa secador') ||
    n.includes('nao usa secador') ||
    n.includes('não gosta de secador')
  ) {
    out.push({ key: 'no_dryer', label: 'Sem secador' });
  }
  return out;
}

/** Tags para cards / drawer (flags clínicas + comportamento + heurística em notas). */
export function buildGroomingDisplayTags(
  flags: Array<{ flag_key: string; label: string }>,
  petNotes?: string | null,
  behaviorTags?: string[] | null,
): Array<{ key: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ key: string; label: string }> = [];

  const push = (key: string, label: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, label });
  };

  for (const f of flags) {
    const fallback = CLINICAL_FLAG_LABELS[f.flag_key as keyof typeof CLINICAL_FLAG_LABELS];
    push(f.flag_key, fallback ?? String(f.label || f.flag_key));
  }
  for (const tag of behaviorTags ?? []) {
    const t = String(tag || '').trim();
    if (!t) continue;
    push(`behavior:${t}`, BEHAVIOR_TAG_LABELS[t] ?? t);
  }
  for (const pref of preferenceTagsFromNotes(petNotes)) {
    push(pref.key, pref.label);
  }
  return out;
}
