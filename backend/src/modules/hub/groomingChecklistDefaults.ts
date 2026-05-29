/** Itens padrão do checklist operacional (merge com `hub_grooming_sessions.checklist`). */
export type GroomingChecklistTemplateItem = {
  key: string;
  label: string;
  default_checked?: boolean;
};

export const GROOMING_CHECKLIST_DEFAULT_ITEMS: GroomingChecklistTemplateItem[] = [
  { key: 'nails', label: 'Unhas cortadas' },
  { key: 'ears', label: 'Ouvidos limpos' },
  { key: 'teeth', label: 'Higiene bucal / dentes' },
  { key: 'dryer_ok', label: 'Secador / térmica ok' },
  { key: 'coat_brushed', label: 'Pelagem escovada / finalizada' },
];

export function mergeGroomingChecklistState(
  sessionChecklist: Record<string, { done?: boolean } | unknown> | null | undefined,
  templateItems: GroomingChecklistTemplateItem[],
): Array<{ key: string; label: string; done: boolean }> {
  const raw = sessionChecklist && typeof sessionChecklist === 'object' ? sessionChecklist : {};
  return templateItems.map((t) => {
    const cell = raw[t.key] as { done?: boolean } | undefined;
    const done = Boolean(cell?.done);
    return { key: t.key, label: t.label, done };
  });
}
