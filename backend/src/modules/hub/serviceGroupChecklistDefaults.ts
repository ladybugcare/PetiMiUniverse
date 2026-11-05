/** Itens padrão de checklist operacional por grupo de serviço. */
export type ChecklistTemplateItem = {
  key: string;
  label: string;
  default_checked?: boolean;
};

/** Default enxuto do salão; higiene bucal fica só se a clínica incluir no template. */
export const BANHO_TOSA_CHECKLIST_DEFAULT_ITEMS: ChecklistTemplateItem[] = [
  { key: 'nails', label: 'Unhas cortadas' },
  { key: 'ears', label: 'Ouvidos limpos' },
  { key: 'dryer_ok', label: 'Secador / térmica ok' },
  { key: 'coat_brushed', label: 'Pelagem escovada / finalizada' },
];

/** Alias legado (Banho & Tosa). */
export const GROOMING_CHECKLIST_DEFAULT_ITEMS = BANHO_TOSA_CHECKLIST_DEFAULT_ITEMS;

export type GroomingChecklistTemplateItem = ChecklistTemplateItem;

export const SERVICE_GROUP_CHECKLIST_DEFAULTS: Partial<Record<string, ChecklistTemplateItem[]>> = {
  banho_tosa: BANHO_TOSA_CHECKLIST_DEFAULT_ITEMS,
};

export function hasSystemChecklistDefault(serviceGroupSlug: string): boolean {
  return Boolean(SERVICE_GROUP_CHECKLIST_DEFAULTS[serviceGroupSlug]?.length);
}

/** `dbItems === null` → sem override no banco (usa default do sistema ou lista vazia). */
export function resolveChecklistTemplateItems(
  serviceGroupSlug: string,
  dbItems: ChecklistTemplateItem[] | null,
): ChecklistTemplateItem[] {
  if (dbItems !== null) return dbItems;
  return SERVICE_GROUP_CHECKLIST_DEFAULTS[serviceGroupSlug] ?? [];
}

export function mergeChecklistState(
  sessionChecklist: Record<string, { done?: boolean } | unknown> | null | undefined,
  templateItems: ChecklistTemplateItem[],
): Array<{ key: string; label: string; done: boolean }> {
  const raw = sessionChecklist && typeof sessionChecklist === 'object' ? sessionChecklist : {};
  return templateItems.map((t) => {
    const cell = raw[t.key] as { done?: boolean } | undefined;
    if (cell !== undefined && cell !== null && typeof cell === 'object' && 'done' in cell) {
      return { key: t.key, label: t.label, done: Boolean(cell.done) };
    }
    return { key: t.key, label: t.label, done: Boolean(t.default_checked) };
  });
}

/** Alias legado (Banho & Tosa). */
export const mergeGroomingChecklistState = mergeChecklistState;

export function parseChecklistTemplateItems(raw: unknown): ChecklistTemplateItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
    .map((x) => ({
      key: String(x.key ?? '').trim(),
      label: String(x.label || x.key || '').trim(),
      default_checked: Boolean(x.default_checked),
    }))
    .filter((x) => x.key && x.label);
}

/** União estável por `key` (primeira ocorrência preserva label/ordem). */
export function unionChecklistTemplateItems(
  lists: ChecklistTemplateItem[][],
): ChecklistTemplateItem[] {
  const seen = new Set<string>();
  const result: ChecklistTemplateItem[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (!item.key || seen.has(item.key)) continue;
      seen.add(item.key);
      result.push(item);
    }
  }
  return result;
}

/**
 * Resolve checklist da sessão:
 * - por tipo: `checklist_items` do tipo se não-null; senão herda o template do grupo;
 * - união dos itens (dedupe por `key`);
 * - sem tipos associados → só o template do grupo.
 */
export function resolveSessionChecklistTemplate(opts: {
  groupTemplate: ChecklistTemplateItem[];
  serviceTypeOverrides: Array<ChecklistTemplateItem[] | null | undefined>;
}): ChecklistTemplateItem[] {
  if (opts.serviceTypeOverrides.length === 0) return opts.groupTemplate;
  const perService = opts.serviceTypeOverrides.map((items) =>
    Array.isArray(items) ? items : opts.groupTemplate,
  );
  return unionChecklistTemplateItems(perService);
}
