"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GROOMING_CHECKLIST_DEFAULT_ITEMS = void 0;
exports.mergeGroomingChecklistState = mergeGroomingChecklistState;
exports.GROOMING_CHECKLIST_DEFAULT_ITEMS = [
    { key: 'nails', label: 'Unhas cortadas' },
    { key: 'ears', label: 'Ouvidos limpos' },
    { key: 'teeth', label: 'Higiene bucal / dentes' },
    { key: 'dryer_ok', label: 'Secador / térmica ok' },
    { key: 'coat_brushed', label: 'Pelagem escovada / finalizada' },
];
function mergeGroomingChecklistState(sessionChecklist, templateItems) {
    const raw = sessionChecklist && typeof sessionChecklist === 'object' ? sessionChecklist : {};
    return templateItems.map((t) => {
        const cell = raw[t.key];
        const done = Boolean(cell?.done);
        return { key: t.key, label: t.label, done };
    });
}
