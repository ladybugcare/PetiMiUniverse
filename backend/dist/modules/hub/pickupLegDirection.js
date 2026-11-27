"use strict";
/**
 * Direção de pernas L&T antes de existir hub_pickup_stops.
 * Paradas explícitas sempre ganham; sem parada, usa ordem entre irmãos e o horário do pai.
 *
 * Vínculo durável ainda ausente: na criação de `pickup_route` o papel before/after
 * (`with_pickup_route_*`) não é persistido em hub_appointments — só o horário.
 * Menor evolução: gravar `pickup_direction` ('pickup'|'delivery') no insert da perna.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferPickupLegDirection = inferPickupLegDirection;
exports.resolveDirectionsForParentLegs = resolveDirectionsForParentLegs;
function inferPickupLegDirection(opts) {
    const explicit = opts.explicitDirection;
    if (explicit === 'pickup' || explicit === 'delivery' || explicit === 'clinic_return') {
        return explicit;
    }
    const legStarts = opts.legStartsAt ?? null;
    if (!legStarts)
        return null;
    const siblings = opts.siblingLegStartsAts
        .filter((s) => Boolean(s))
        .slice()
        .sort((a, b) => a.localeCompare(b));
    if (siblings.length >= 2) {
        return legStarts === siblings[0] ? 'pickup' : 'delivery';
    }
    const parentStarts = opts.parentStartsAt ?? null;
    if (parentStarts) {
        return legStarts < parentStarts ? 'pickup' : 'delivery';
    }
    return null;
}
/** Aplica inferência em lote para pernas do mesmo pai. */
function resolveDirectionsForParentLegs(legs, parentStartsAt) {
    const siblingStarts = legs.map((l) => l.starts_at ?? null);
    return legs.map((leg) => {
        const inferred = inferPickupLegDirection({
            explicitDirection: leg.direction,
            legStartsAt: leg.starts_at,
            siblingLegStartsAts: siblingStarts,
            parentStartsAt,
        });
        return { ...leg, direction: inferred };
    });
}
