"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOpenOriginKeysFromParts = resolveOpenOriginKeysFromParts;
exports.collectOpenFinanceiroOriginKeys = collectOpenFinanceiroOriginKeys;
const supabase_1 = require("../../config/supabase");
const MIN_CHARGEABLE = 0.009;
/**
 * Preferir a origem real da comanda quando o recebível aponta para ela.
 * Checkout cria recebíveis com source_type=manual + source_id aleatório; sem isso
 * o day board do Financeiro gera "Cobrança avulsa" órfã sem tutor/pet/serviços.
 */
function resolveOpenOriginKeysFromParts(opts) {
    const keys = new Map();
    for (const r of opts.receivables) {
        if (Number(r.final_amount ?? 0) <= MIN_CHARGEABLE)
            continue;
        let originType = null;
        let originId = null;
        if (r.comanda_id) {
            const c = opts.comandasById.get(r.comanda_id);
            if (c?.origin_type && c.origin_id) {
                originType = c.origin_type;
                originId = c.origin_id;
            }
        }
        if (!originType || !originId) {
            originType = r.source_type;
            originId = r.source_id;
        }
        if (originType && originId) {
            keys.set(`${originType}:${originId}`, { origin_type: originType, origin_id: originId });
        }
    }
    for (const c of opts.handoffs) {
        const originType = c.origin_type;
        const originId = c.origin_id;
        if (!originType || !originId)
            continue;
        const key = `${originType}:${originId}`;
        if (keys.has(key))
            continue;
        if (Number(c.total_amount ?? 0) <= MIN_CHARGEABLE)
            continue;
        keys.set(key, { origin_type: originType, origin_id: originId });
    }
    return [...keys.values()];
}
/** Origens com cobrança em aberto ou enviadas ao financeiro (handoff), sem filtro de data. */
async function collectOpenFinanceiroOriginKeys(clinicId, unitId) {
    let recQ = supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('source_type, source_id, comanda_id, final_amount')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .in('status', ['pending', 'partially_paid']);
    if (unitId)
        recQ = recQ.or(`unit_id.eq.${unitId},unit_id.is.null`);
    const { data: recs, error: recErr } = await recQ;
    if (recErr)
        throw new Error(recErr.message);
    const comandaIds = new Set();
    for (const r of recs ?? []) {
        if (r.comanda_id)
            comandaIds.add(r.comanda_id);
    }
    const comandasById = new Map();
    if (comandaIds.size > 0) {
        const { data: more, error: moreErr } = await supabase_1.supabaseAdmin
            .from('hub_comandas')
            .select('id, origin_type, origin_id')
            .in('id', [...comandaIds]);
        if (moreErr)
            throw new Error(moreErr.message);
        for (const c of more ?? []) {
            comandasById.set(c.id, {
                origin_type: c.origin_type ?? null,
                origin_id: c.origin_id ?? null,
            });
        }
    }
    let handoffQ = supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id, origin_type, origin_id, total_amount')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .neq('status', 'cancelada')
        .not('finance_handoff_at', 'is', null);
    if (unitId)
        handoffQ = handoffQ.or(`unit_id.eq.${unitId},unit_id.is.null`);
    const { data: handoffs, error: handoffErr } = await handoffQ;
    if (handoffErr)
        throw new Error(handoffErr.message);
    return resolveOpenOriginKeysFromParts({
        receivables: (recs ?? []).map((r) => ({
            source_type: r.source_type ?? null,
            source_id: r.source_id ?? null,
            comanda_id: r.comanda_id ?? null,
            final_amount: r.final_amount == null ? null : Number(r.final_amount),
        })),
        handoffs: (handoffs ?? []).map((c) => ({
            origin_type: c.origin_type ?? null,
            origin_id: c.origin_id ?? null,
            total_amount: c.total_amount == null ? null : Number(c.total_amount),
        })),
        comandasById,
    });
}
