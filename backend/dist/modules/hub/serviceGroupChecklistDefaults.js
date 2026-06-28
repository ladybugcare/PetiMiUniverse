"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeGroomingChecklistState = exports.SERVICE_GROUP_CHECKLIST_DEFAULTS = exports.GROOMING_CHECKLIST_DEFAULT_ITEMS = exports.BANHO_TOSA_CHECKLIST_DEFAULT_ITEMS = void 0;
exports.hasSystemChecklistDefault = hasSystemChecklistDefault;
exports.resolveChecklistTemplateItems = resolveChecklistTemplateItems;
exports.mergeChecklistState = mergeChecklistState;
exports.parseChecklistTemplateItems = parseChecklistTemplateItems;
exports.BANHO_TOSA_CHECKLIST_DEFAULT_ITEMS = [
    { key: 'nails', label: 'Unhas cortadas' },
    { key: 'ears', label: 'Ouvidos limpos' },
    { key: 'teeth', label: 'Higiene bucal / dentes' },
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
