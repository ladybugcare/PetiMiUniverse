"use strict";
/**
 * Regras de bloco da agenda (1 grupo por bloco, hotel/creche, recorrência).
 * Usado no create/patch de hub_appointments.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PICKUP_VISIT_RHYTHM_MESSAGE = exports.PICKUP_MUTEX_MESSAGE = exports.BOARDING_SERVICE_GROUPS = void 0;
exports.normalizeServiceGroupSlug = normalizeServiceGroupSlug;
exports.isBoardingServiceGroup = isBoardingServiceGroup;
exports.isHotelServiceGroup = isHotelServiceGroup;
exports.isCrecheServiceGroup = isCrecheServiceGroup;
exports.isLevaTrazServiceGroupSlug = isLevaTrazServiceGroupSlug;
exports.validateHomogeneousServiceGroups = validateHomogeneousServiceGroups;
exports.primaryServiceGroup = primaryServiceGroup;
exports.validateBoardingBlockIsolation = validateBoardingBlockIsolation;
exports.validateHotelNoRecurrence = validateHotelNoRecurrence;
exports.inferAppointmentKindFromServiceGroup = inferAppointmentKindFromServiceGroup;
exports.recurrenceRhythmSignature = recurrenceRhythmSignature;
exports.validatePickupMutex = validatePickupMutex;
exports.validateVisitPickupSameRhythm = validateVisitPickupSameRhythm;
exports.BOARDING_SERVICE_GROUPS = ['hotel', 'creche'];
function normalizeServiceGroupSlug(raw) {
    const s = String(raw ?? '').trim().toLowerCase();
    return s || 'outros';
}
function isBoardingServiceGroup(group) {
    const g = normalizeServiceGroupSlug(group);
    return g === 'hotel' || g === 'creche';
}
function isHotelServiceGroup(group) {
    return normalizeServiceGroupSlug(group) === 'hotel';
}
function isCrecheServiceGroup(group) {
    return normalizeServiceGroupSlug(group) === 'creche';
}
function isLevaTrazServiceGroupSlug(group) {
    return normalizeServiceGroupSlug(group) === 'leva_traz';
}
/** Retorna erro se as linhas principais misturarem service_group. */
function validateHomogeneousServiceGroups(lines, stMap) {
    const groups = new Set();
    for (const line of lines) {
        const st = stMap.get(line.hub_service_type_id);
        groups.add(normalizeServiceGroupSlug(st?.service_group));
    }
    if (groups.size <= 1)
        return null;
    return 'Cada bloco pode ter serviços de apenas um grupo. Separe em outro bloco no dia.';
}
function primaryServiceGroup(hubServiceTypeId, stMap) {
    return normalizeServiceGroupSlug(stMap.get(hubServiceTypeId)?.service_group);
}
/**
 * Fase 0 / transição: hotel/creche não mistura com extra_blocks no mesmo create
 * (até blocos de 1ª classe com séries independentes).
 * Passe allowBoardingWithSiblingBlocks=true após Fase 1+.
 */
function validateBoardingBlockIsolation(opts) {
    if (opts.allowBoardingWithSiblingBlocks)
        return null;
    if (isBoardingServiceGroup(opts.primaryGroup) && opts.extraBlockGroups.length > 0) {
        return 'Hotel e creche não podem compartilhar o agendamento com outro bloco. Use um agendamento separado ou Hotel & Creche → Nova hospedagem.';
    }
    for (const g of opts.extraBlockGroups) {
        if (isBoardingServiceGroup(g)) {
            return 'Hotel e creche devem ser o atendimento principal (ou use Hotel & Creche → Nova hospedagem).';
        }
    }
    return null;
}
function validateHotelNoRecurrence(opts) {
    if (!opts.hasRecurrence)
        return null;
    if (isHotelServiceGroup(opts.primaryGroup)) {
        return 'Hotel não aceita recorrência. Use data de entrada e saída (estadia contínua) ou Hotel & Creche.';
    }
    return null;
}
/** Infere kind a partir do grupo quando o cliente manda standard/omitido. */
function inferAppointmentKindFromServiceGroup(explicitKind, primaryGroup) {
    if (explicitKind && explicitKind !== 'standard')
        return null;
    if (isHotelServiceGroup(primaryGroup))
        return 'hotel_stay';
    if (isCrecheServiceGroup(primaryGroup))
        return 'daycare_block';
    if (isLevaTrazServiceGroupSlug(primaryGroup))
        return 'pickup_route';
    return null;
}
// ─── Leva e Traz: visita × bloco ───────────────────────────────────────────
exports.PICKUP_MUTEX_MESSAGE = 'Não dá para incluir Leva e Traz na visita e em outro bloco ao mesmo tempo.';
exports.PICKUP_VISIT_RHYTHM_MESSAGE = 'Com Leva e Traz da visita, todos os blocos precisam da mesma repetição (ou nenhum). Alinhe as séries ou use L&T em cada bloco.';
function recurrenceRhythmSignature(r) {
    if (!r)
        return 'none';
    const dow = [...(r.days_of_week ?? [])].sort((a, b) => a - b).join(',');
    const end = r.until_date ? `until:${r.until_date}` : `occ:${r.occurrences ?? ''}`;
    const interval = r.kind === 'biweekly' ? 2 : Math.max(1, r.interval_value ?? 1);
    const kind = r.kind === 'biweekly' ? 'weekly' : r.kind ?? 'weekly';
    return `${kind}:${interval}:${dow}:${end}`;
}
/** L&T no pai e em qualquer extra_block no mesmo create. */
function validatePickupMutex(opts) {
    if (opts.visitHasPickup && opts.extrasHavePickup)
        return exports.PICKUP_MUTEX_MESSAGE;
    return null;
}
/** Com L&T da visita, ritmos do pai e dos extras devem coincidir. */
function validateVisitPickupSameRhythm(opts) {
    if (!opts.visitHasPickup)
        return null;
    if (opts.rhythms.length <= 1)
        return null;
    if (new Set(opts.rhythms).size <= 1)
        return null;
    return exports.PICKUP_VISIT_RHYTHM_MESSAGE;
}
