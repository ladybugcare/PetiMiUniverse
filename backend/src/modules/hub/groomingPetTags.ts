const FLAG_LABEL_FALLBACK: Record<string, string> = {
  allergy: 'Alergia',
  aggressive: 'Reativo',
  cardiac: 'Cardiopata',
  diabetic: 'Diabetes',
  epileptic: 'Epilepsia',
};

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

/** Tags para cards / drawer (flags clínicas + heurística em notas do pet). */
export function buildGroomingDisplayTags(
  flags: Array<{ flag_key: string; label: string }>,
  petNotes?: string | null,
): Array<{ key: string; label: string }> {
  const clinical_tags = flags.map((f) => ({
    key: f.flag_key,
    label: FLAG_LABEL_FALLBACK[f.flag_key] ?? String(f.label || f.flag_key),
  }));
  return [...clinical_tags, ...preferenceTagsFromNotes(petNotes)];
}
