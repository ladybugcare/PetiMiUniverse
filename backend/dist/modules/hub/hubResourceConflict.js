"use strict";
/** Conflito de recurso entre dois horários já sabidamente sobrepostos. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isResourceScheduleConflict = isResourceScheduleConflict;
function isResourceScheduleConflict(candidate, other) {
    if (other.releasedAt)
        return false;
    if (String(candidate.unitId ?? '') !== String(other.unitId ?? ''))
        return false;
    const id1 = candidate.hubResourceId || null;
    const id2 = other.hubResourceId || null;
    if (id1 && id2)
        return id1 === id2;
    const label1 = normalizeResourceLabel(candidate.resourceLabel);
    const label2 = normalizeResourceLabel(other.resourceLabel);
    if (!label1 || !label2)
        return false;
    return label1 === label2;
}
function normalizeResourceLabel(label) {
    const trimmed = label?.trim() ?? '';
    if (!trimmed || trimmed === '—')
        return null;
    return trimmed;
}
