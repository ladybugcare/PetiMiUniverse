"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateChargeBundlePublicToken = generateChargeBundlePublicToken;
exports.receivableBalanceAmount = receivableBalanceAmount;
exports.aggregateBundleBalance = aggregateBundleBalance;
exports.syncChargeBundleStatusForReceivable = syncChargeBundleStatusForReceivable;
exports.buildChargeBundleDetail = buildChargeBundleDetail;
const node_crypto_1 = require("node:crypto");
const supabase_1 = require("../../config/supabase");
const PAYABLE_STATUSES = new Set(['pending', 'partially_paid']);
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
async function generateChargeBundlePublicToken() {
    for (let i = 0; i < 8; i++) {
        const token = (0, node_crypto_1.randomBytes)(24).toString('base64url');
        const { data } = await supabase_1.supabaseAdmin
            .from('hub_charge_bundles')
            .select('id')
            .eq('public_token', token)
            .maybeSingle();
        if (!data)
            return token;
    }
    throw new Error('Não foi possível gerar token público único');
}
async function receivableBalanceAmount(receivableId, clinicId) {
    const { data: rec, error } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('id, clinic_id, final_amount, status')
        .eq('id', receivableId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!rec)
        throw new Error('Recebível não encontrado');
    const status = String(rec.status ?? '');
    if (status === 'paid' || status === 'cancelled' || status === 'refunded')
        return 0;
    const { data: payments } = await supabase_1.supabaseAdmin
        .from('hub_payments')
        .select('amount')
        .eq('receivable_id', receivableId)
        .eq('clinic_id', clinicId);
    const paid = round2((payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0));
    return round2(Math.max(0, Number(rec.final_amount ?? 0) - paid));
}
async function aggregateBundleBalance(bundleId, clinicId) {
    const { data: bundle, error: bErr } = await supabase_1.supabaseAdmin
        .from('hub_charge_bundles')
        .select('id, clinic_id, status, total_amount, cancelled_at')
        .eq('id', bundleId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (bErr)
        throw new Error(bErr.message);
    if (!bundle)
        throw new Error('NOT_FOUND');
    if (bundle.cancelled_at || bundle.status === 'cancelled') {
        return {
            balance_due: 0,
            paid_amount: 0,
            total_amount: Number(bundle.total_amount ?? 0),
            status: 'cancelled',
        };
    }
    const { data: items, error: iErr } = await supabase_1.supabaseAdmin
        .from('hub_charge_bundle_items')
        .select('receivable_id')
        .eq('bundle_id', bundleId);
    if (iErr)
        throw new Error(iErr.message);
    const receivableIds = (items ?? []).map((r) => r.receivable_id).filter(Boolean);
    if (!receivableIds.length) {
        return {
            balance_due: 0,
            paid_amount: 0,
            total_amount: Number(bundle.total_amount ?? 0),
            status: 'paid',
        };
    }
    let balanceDue = 0;
    let paidOnBundle = 0;
    let openCount = 0;
    let partialCount = 0;
    let paidCount = 0;
    for (const rid of receivableIds) {
        const { data: rec } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('final_amount, status')
            .eq('id', rid)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        if (!rec)
            continue;
        const finalAmt = Number(rec.final_amount ?? 0);
        const balance = await receivableBalanceAmount(rid, clinicId);
        balanceDue = round2(balanceDue + balance);
        paidOnBundle = round2(paidOnBundle + Math.max(0, finalAmt - balance));
        const st = String(rec.status ?? '');
        if (st === 'paid')
            paidCount += 1;
        else if (st === 'partially_paid')
            partialCount += 1;
        else if (PAYABLE_STATUSES.has(st))
            openCount += 1;
    }
    let status = 'open';
    if (balanceDue <= 0.009)
        status = 'paid';
    else if (partialCount > 0 || (paidCount > 0 && openCount > 0))
        status = 'partially_paid';
    return {
        balance_due: balanceDue,
        paid_amount: paidOnBundle,
        total_amount: Number(bundle.total_amount ?? 0),
        status,
    };
}
/** Atualiza status agregado do lote após pagamento de um recebível vinculado. */
async function syncChargeBundleStatusForReceivable(receivableId, clinicId) {
    try {
        const { data: links, error: linkErr } = await supabase_1.supabaseAdmin
            .from('hub_charge_bundle_items')
            .select('bundle_id')
            .eq('receivable_id', receivableId);
        if (linkErr)
            throw linkErr;
        const bundleIds = [...new Set((links ?? []).map((r) => r.bundle_id).filter(Boolean))];
        if (!bundleIds.length)
            return;
        const { data: bundles } = await supabase_1.supabaseAdmin
            .from('hub_charge_bundles')
            .select('id, cancelled_at, deleted_at')
            .in('id', bundleIds)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null);
        for (const bundle of bundles ?? []) {
            if (bundle.cancelled_at)
                continue;
            const agg = await aggregateBundleBalance(bundle.id, clinicId);
            await supabase_1.supabaseAdmin
                .from('hub_charge_bundles')
                .update({ status: agg.status })
                .eq('id', bundle.id)
                .eq('clinic_id', clinicId);
        }
    }
    catch (e) {
        console.error('syncChargeBundleStatusForReceivable', receivableId, e);
    }
}
async function buildChargeBundleDetail(bundleId, clinicId) {
    const { data: bundle, error: bErr } = await supabase_1.supabaseAdmin
        .from('hub_charge_bundles')
        .select('*')
        .eq('id', bundleId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (bErr)
        throw new Error(bErr.message);
    if (!bundle)
        return null;
    const { data: itemRows, error: iErr } = await supabase_1.supabaseAdmin
        .from('hub_charge_bundle_items')
        .select('receivable_id, sort_order')
        .eq('bundle_id', bundleId)
        .order('sort_order', { ascending: true });
    if (iErr)
        throw new Error(iErr.message);
    const receivableIds = (itemRows ?? []).map((r) => r.receivable_id);
    const items = [];
    if (receivableIds.length) {
        const { data: receivables } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, final_amount, due_date, status, notes, source_type, lines:hub_receivable_lines(description, pet_id, sort_order)')
            .in('id', receivableIds)
            .eq('clinic_id', clinicId);
        const byId = new Map((receivables ?? []).map((r) => [r.id, r]));
        const petIds = new Set();
        for (const rec of receivables ?? []) {
            for (const ln of (rec.lines ?? [])) {
                if (ln.pet_id)
                    petIds.add(String(ln.pet_id));
            }
        }
        const petNameById = new Map();
        if (petIds.size) {
            const { data: pets } = await supabase_1.supabaseAdmin.from('hub_pets').select('id, name').in('id', [...petIds]);
            for (const p of pets ?? [])
                petNameById.set(p.id, String(p.name ?? ''));
        }
        for (const row of itemRows ?? []) {
            const rid = row.receivable_id;
            const rec = byId.get(rid);
            if (!rec)
                continue;
            const lines = [...(rec.lines ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            const petNames = [
                ...new Set(lines
                    .map((ln) => (ln.pet_id ? petNameById.get(String(ln.pet_id)) : null))
                    .filter(Boolean)),
            ];
            const petIds = [
                ...new Set(lines.map((ln) => (ln.pet_id ? String(ln.pet_id) : null)).filter(Boolean)),
            ];
            const title = lines.map((ln) => String(ln.description ?? '').trim()).filter(Boolean).slice(0, 2).join(', ') ||
                `Cobrança ${rid.slice(0, 8)}`;
            const balance = await receivableBalanceAmount(rid, clinicId);
            items.push({
                receivable_id: rid,
                sort_order: Number(row.sort_order ?? 0),
                title,
                balance_amount: balance,
                final_amount: Number(rec.final_amount ?? 0),
                due_date: rec.due_date ?? null,
                status: String(rec.status ?? ''),
                pet_names: petNames,
                pet_ids: petIds,
            });
        }
    }
    const [{ data: guardian }, { data: unit }, agg] = await Promise.all([
        supabase_1.supabaseAdmin
            .from('hub_guardians')
            .select('id, full_name, phone, email')
            .eq('id', bundle.guardian_id)
            .eq('clinic_id', clinicId)
            .maybeSingle(),
        bundle.unit_id
            ? supabase_1.supabaseAdmin.from('units').select('id, name, nickname').eq('id', bundle.unit_id).maybeSingle()
            : Promise.resolve({ data: null }),
        aggregateBundleBalance(bundleId, clinicId),
    ]);
    if (agg.status !== bundle.status && !bundle.cancelled_at) {
        await supabase_1.supabaseAdmin
            .from('hub_charge_bundles')
            .update({ status: agg.status })
            .eq('id', bundleId)
            .eq('clinic_id', clinicId);
    }
    return {
        ...bundle,
        status: agg.status,
        guardian,
        unit,
        items,
        balance_due: agg.balance_due,
        paid_amount: agg.paid_amount,
    };
}
