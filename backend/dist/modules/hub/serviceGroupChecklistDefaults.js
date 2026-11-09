"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeGroomingChecklistState = exports.SERVICE_GROUP_CHECKLIST_DEFAULTS = exports.GROOMING_CHECKLIST_DEFAULT_ITEMS = exports.BANHO_TOSA_CHECKLIST_DEFAULT_ITEMS = void 0;
exports.hasSystemChecklistDefault = hasSystemChecklistDefault;
exports.resolveChecklistTemplateItems = resolveChecklistTemplateItems;
exports.mergeChecklistState = mergeChecklistState;
exports.parseChecklistTemplateItems = parseChecklistTemplateItems;
exports.unionChecklistTemplateItems = unionChecklistTemplateItems;
exports.resolveSessionChecklistTemplate = resolveSessionChecklistTemplate;
/** Default enxuto do salão; higiene bucal fica só se a clínica incluir no template. */
exports.BANHO_TOSA_CHECKLIST_DEFAULT_ITEMS = [
    { key: 'nails', label: 'Unhas cortadas' },
    { key: 'ears', label: 'Ouvidos limpos' },
    { key: 'dryer_ok', label: 'Secador / térmica ok' },
    { key: 'coat_brushed', label: 'Pelagem escovada / finalizada' },
];
/** Alias legado (Banho & Tosa). */
exports.GROOMING_CHECKLIST_DEFAULT_ITEMS = exports.BANHO_TOSA_CHECKLIST_DEFAULT_ITEMS;
exports.SERVICE_GROUP_CHECKLIST_DEFAULTS = {
    banho_tosa: exports.BANHO_TOSA_CHECKLIST_DEFAULT_ITEMS,
};
function hasSystemChecklistDefault(serviceGroupSlug) {
    return Boolean(exports.SERVICE_GROUP_CHECKLIST_DEFAULTS[serviceGroupSlug]?.length);
}
/** `dbItems === null` → sem override no banco (usa default do sistema ou lista vazia). */
function resolveChecklistTemplateItems(serviceGroupSlug, dbItems) {
    if (dbItems !== null)
        return dbItems;
    return exports.SERVICE_GROUP_CHECKLIST_DEFAULTS[serviceGroupSlug] ?? [];
}
function mergeChecklistState(sessionChecklist, templateItems) {
    const raw = sessionChecklist && typeof sessionChecklist === 'object' ? sessionChecklist : {};
    return templateItems.map((t) => {
        const cell = raw[t.key];
        if (cell !== undefined && cell !== null && typeof cell === 'object' && 'done' in cell) {
            return { key: t.key, label: t.label, done: Boolean(cell.done) };
        }
        return { key: t.key, label: t.label, done: Boolean(t.default_checked) };
    });
}
/** Alias legado (Banho & Tosa). */
exports.mergeGroomingChecklistState = mergeChecklistState;
function parseChecklistTemplateItems(raw) {
    if (!Array.isArray(raw))
        return [];
    return raw
        .filter((x) => Boolean(x && typeof x === 'object'))
        .map((x) => ({
        key: String(x.key ?? '').trim(),
        label: String(x.label || x.key || '').trim(),
        default_checked: Boolean(x.default_checked),
    }))
        .filter((x) => x.key && x.label);
}
/** União estável por `key` (primeira ocorrência preserva label/ordem). */
function unionChecklistTemplateItems(lists) {
    const seen = new Set();
    const result = [];
    for (const list of lists) {
        for (const item of list) {
            if (!item.key || seen.has(item.key))
                continue;
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
function resolveSessionChecklistTemplate(opts) {
    if (opts.serviceTypeOverrides.length === 0)
        return opts.groupTemplate;
    const perService = opts.serviceTypeOverrides.map((items) => Array.isArray(items) ? items : opts.groupTemplate);
    return unionChecklistTemplateItems(perService);
}
