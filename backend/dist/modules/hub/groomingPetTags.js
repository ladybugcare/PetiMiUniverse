"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGroomingDisplayTags = buildGroomingDisplayTags;
const FLAG_LABEL_FALLBACK = {
    allergy: 'Alergia',
    aggressive: 'Reativo',
    cardiac: 'Cardiopata',
    diabetic: 'Diabetes',
    epileptic: 'Epilepsia',
};
function preferenceTagsFromNotes(notes) {
    if (!notes?.trim())
        return [];
    const n = notes.toLowerCase();
    const out = [];
    if (n.includes('sem secador') ||
        n.includes('não usa secador') ||
        n.includes('nao usa secador') ||
        n.includes('não gosta de secador')) {
        out.push({ key: 'no_dryer', label: 'Sem secador' });
    }
    return out;
}
/** Tags para cards / drawer (flags clínicas + heurística em notas do pet). */
function buildGroomingDisplayTags(flags, petNotes) {
    const clinical_tags = flags.map((f) => ({
        key: f.flag_key,
        label: FLAG_LABEL_FALLBACK[f.flag_key] ?? String(f.label || f.flag_key),
    }));
    return [...clinical_tags, ...preferenceTagsFromNotes(petNotes)];
}
