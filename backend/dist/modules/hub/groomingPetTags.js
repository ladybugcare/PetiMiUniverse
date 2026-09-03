"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGroomingDisplayTags = buildGroomingDisplayTags;
const hubPetHealthProfile_1 = require("./hubPetHealthProfile");
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
/** Tags para cards / drawer (flags clínicas + comportamento + heurística em notas). */
function buildGroomingDisplayTags(flags, petNotes, behaviorTags) {
    const seen = new Set();
    const out = [];
    const push = (key, label) => {
        if (seen.has(key))
            return;
        seen.add(key);
        out.push({ key, label });
    };
    for (const f of flags) {
        const fallback = hubPetHealthProfile_1.CLINICAL_FLAG_LABELS[f.flag_key];
        push(f.flag_key, fallback ?? String(f.label || f.flag_key));
    }
    for (const tag of behaviorTags ?? []) {
        const t = String(tag || '').trim();
        if (!t)
            continue;
        push(`behavior:${t}`, hubPetHealthProfile_1.BEHAVIOR_TAG_LABELS[t] ?? t);
    }
    for (const pref of preferenceTagsFromNotes(petNotes)) {
        push(pref.key, pref.label);
    }
    return out;
}
