"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicChargeBundlePdf = exports.getPublicChargeBundle = exports.getHubChargeBundlePdf = exports.patchHubChargeBundleMarkSent = exports.getHubChargeBundle = exports.listHubChargeBundles = exports.postHubChargeBundle = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubChargeBundlePdf_1 = require("./hubChargeBundlePdf");
const hubChargeBundlesService_1 = require("./hubChargeBundlesService");
const uuidStr = zod_1.z.string().uuid();
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
const createBundleSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    guardian_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    receivable_ids: zod_1.z.array(uuidStr).min(1).max(30),
    due_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    notes: zod_1.z.string().trim().max(4000).optional().nullable(),
})
    .strict();
const listBundlesQuerySchema = zod_1.z.object({
    clinic_id: uuidStr,
    guardian_id: uuidStr.optional(),
    status: zod_1.z.enum(['open', 'partially_paid', 'paid', 'cancelled']).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
const markSentSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
})
    .strict();
async function loadBundlePdfPayload(bundleId, clinicId) {
    const detail = await (0, hubChargeBundlesService_1.buildChargeBundleDetail)(bundleId, clinicId);
    if (!detail)
        throw new Error('NOT_FOUND');
    const { data: clinicRow } = await supabase_1.supabaseAdmin
        .from('clinics')
        .select('name, photo_url')
        .eq('id', clinicId)
        .maybeSingle();
    return {
        id: detail.id,
        due_date: detail.due_date ?? null,
        total_amount: Number(detail.total_amount ?? 0),
        balance_due: Number(detail.balance_due ?? 0),
        guardian: detail.guardian,
        clinic: clinicRow
            ? { name: clinicRow.name, photo_url: clinicRow.photo_url }
            : null,
        items: (detail.items ?? []).map((it) => ({
            title: String(it.title ?? 'Cobrança'),
            pet_names: it.pet_names ?? [],
            due_date: it.due_date ?? null,
            balance_amount: Number(it.balance_amount ?? 0),
        })),
        notes: detail.notes ?? null,
    };
}
/** POST /finance/charge-bundles */
const postHubChargeBundle = async (req, res) => {
    try {
        const parsed = createBundleSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, guardian_id, unit_id, receivable_ids, due_date, notes } = parsed.data;
        const userId = req.user?.id ?? null;
        const uniqueIds = [...new Set(receivable_ids)];
        const { data: receivables, error: rErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, guardian_id, status, final_amount')
            .eq('clinic_id', clinic_id)
            .in('id', uniqueIds)
            .is('deleted_at', null);
        if (rErr)
            return res.status(500).json({ error: rErr.message });
        if ((receivables ?? []).length !== uniqueIds.length) {
            return res.status(404).json({ error: 'Um ou mais recebíveis não foram encontrados' });
        }
        for (const rec of receivables ?? []) {
            if (String(rec.guardian_id) !== guardian_id) {
                return res.status(409).json({ error: 'Todos os recebíveis devem ser do mesmo tutor.' });
            }
            const st = String(rec.status ?? '');
            if (!['pending', 'partially_paid'].includes(st)) {
                return res.status(409).json({ error: 'Só é possível agrupar recebíveis pendentes ou parcialmente pagos.' });
            }
        }
        let total = 0;
        for (const rid of uniqueIds) {
            total = round2(total + (await (0, hubChargeBundlesService_1.receivableBalanceAmount)(rid, clinic_id)));
        }
        if (total <= 0) {
            return res.status(409).json({ error: 'Não há saldo em aberto nos recebíveis selecionados.' });
        }
        const publicToken = await (0, hubChargeBundlesService_1.generateChargeBundlePublicToken)();
        const { data: bundle, error: insErr } = await supabase_1.supabaseAdmin
            .from('hub_charge_bundles')
            .insert({
            clinic_id,
            guardian_id,
            unit_id: unit_id ?? null,
            due_date: due_date ?? null,
            public_token: publicToken,
            notes: notes ?? null,
            status: 'open',
            total_amount: total,
            created_by_user_id: userId,
        })
            .select('id')
            .single();
        if (insErr || !bundle) {
            console.error('postHubChargeBundle insert', insErr);
            return res.status(500).json({ error: insErr?.message || 'Erro ao criar lote' });
        }
        const bundleId = bundle.id;
        const itemRows = uniqueIds.map((receivable_id, idx) => ({
            bundle_id: bundleId,
            receivable_id,
            sort_order: idx,
        }));
        const { error: itemsErr } = await supabase_1.supabaseAdmin.from('hub_charge_bundle_items').insert(itemRows);
        if (itemsErr) {
            await supabase_1.supabaseAdmin.from('hub_charge_bundles').delete().eq('id', bundleId);
            return res.status(500).json({ error: itemsErr.message });
        }
        const detail = await (0, hubChargeBundlesService_1.buildChargeBundleDetail)(bundleId, clinic_id);
        return res.status(201).json({ bundle: detail });
    }
    catch (e) {
        console.error('postHubChargeBundle', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubChargeBundle = postHubChargeBundle;
/** GET /finance/charge-bundles */
const listHubChargeBundles = async (req, res) => {
    try {
        const parsed = listBundlesQuerySchema.safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, guardian_id, status, limit = 50 } = parsed.data;
        let q = supabase_1.supabaseAdmin
            .from('hub_charge_bundles')
            .select('id, clinic_id, guardian_id, unit_id, due_date, status, total_amount, created_at, sent_at, cancelled_at')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (guardian_id)
            q = q.eq('guardian_id', guardian_id);
        if (status)
            q = q.eq('status', status);
        const { data, error } = await q;
        if (error)
            return res.status(500).json({ error: error.message });
        const bundles = await Promise.all((data ?? []).map(async (row) => {
            const detail = await (0, hubChargeBundlesService_1.buildChargeBundleDetail)(row.id, clinic_id);
            return detail ?? row;
        }));
        return res.json({ bundles });
    }
    catch (e) {
        console.error('listHubChargeBundles', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubChargeBundles = listHubChargeBundles;
/** GET /finance/charge-bundles/:id */
const getHubChargeBundle = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        if (!id.success || !clinic.success) {
            return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
        }
        const detail = await (0, hubChargeBundlesService_1.buildChargeBundleDetail)(id.data, clinic.data);
        if (!detail)
            return res.status(404).json({ error: 'Lote não encontrado' });
        return res.json({ bundle: detail });
    }
    catch (e) {
        console.error('getHubChargeBundle', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubChargeBundle = getHubChargeBundle;
/** PATCH /finance/charge-bundles/:id/mark-sent */
const patchHubChargeBundleMarkSent = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const parsed = markSentSchema.safeParse(req.body);
        if (!id.success || !parsed.success)
            return res.status(400).json({ error: 'Dados inválidos' });
        const now = new Date().toISOString();
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_charge_bundles')
            .update({ sent_at: now })
            .eq('id', id.data)
            .eq('clinic_id', parsed.data.clinic_id)
            .is('deleted_at', null)
            .select('id, sent_at')
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!data)
            return res.status(404).json({ error: 'Lote não encontrado' });
        return res.json({ bundle: data });
    }
    catch (e) {
        console.error('patchHubChargeBundleMarkSent', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.patchHubChargeBundleMarkSent = patchHubChargeBundleMarkSent;
/** GET /finance/charge-bundles/:id/pdf */
const getHubChargeBundlePdf = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        if (!id.success || !clinic.success) {
            return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
        }
        const payload = await loadBundlePdfPayload(id.data, clinic.data);
        await (0, hubChargeBundlePdf_1.streamChargeBundlePdf)(res, payload);
    }
    catch (e) {
        if (e?.message === 'NOT_FOUND')
            return res.status(404).json({ error: 'Lote não encontrado' });
        console.error('getHubChargeBundlePdf', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubChargeBundlePdf = getHubChargeBundlePdf;
/** GET /public/charge-bundles/:token */
const getPublicChargeBundle = async (req, res) => {
    try {
        const token = String(req.params.token || '').trim();
        if (!token)
            return res.status(400).json({ error: 'Token inválido' });
        const { data: bundle, error } = await supabase_1.supabaseAdmin
            .from('hub_charge_bundles')
            .select('id, clinic_id, guardian_id, due_date, status, total_amount, notes, public_token, cancelled_at, deleted_at')
            .eq('public_token', token)
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!bundle || bundle.deleted_at || bundle.cancelled_at) {
            return res.status(404).json({ error: 'Cobrança não encontrada' });
        }
        const detail = await (0, hubChargeBundlesService_1.buildChargeBundleDetail)(bundle.id, bundle.clinic_id);
        if (!detail)
            return res.status(404).json({ error: 'Cobrança não encontrada' });
        const { data: clinicRow } = await supabase_1.supabaseAdmin
            .from('clinics')
            .select('name, photo_url')
            .eq('id', bundle.clinic_id)
            .maybeSingle();
        const { guardian, items, balance_due, paid_amount, due_date, total_amount, notes } = detail;
        return res.json({
            bundle: {
                id: detail.id,
                due_date,
                total_amount,
                balance_due,
                paid_amount,
                notes,
                clinic: clinicRow
                    ? {
                        name: clinicRow.name,
                        photo_url: clinicRow.photo_url ?? null,
                    }
                    : null,
                guardian,
                items,
            },
        });
    }
    catch (e) {
        console.error('getPublicChargeBundle', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getPublicChargeBundle = getPublicChargeBundle;
/** GET /public/charge-bundles/:token/pdf */
const getPublicChargeBundlePdf = async (req, res) => {
    try {
        const token = String(req.params.token || '').trim();
        if (!token)
            return res.status(400).json({ error: 'Token inválido' });
        const { data: bundle } = await supabase_1.supabaseAdmin
            .from('hub_charge_bundles')
            .select('id, clinic_id, cancelled_at, deleted_at')
            .eq('public_token', token)
            .maybeSingle();
        if (!bundle || bundle.deleted_at || bundle.cancelled_at) {
            return res.status(404).json({ error: 'Cobrança não encontrada' });
        }
        const payload = await loadBundlePdfPayload(bundle.id, bundle.clinic_id);
        await (0, hubChargeBundlePdf_1.streamChargeBundlePdf)(res, payload);
    }
    catch (e) {
        if (e?.message === 'NOT_FOUND')
            return res.status(404).json({ error: 'Cobrança não encontrada' });
        console.error('getPublicChargeBundlePdf', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getPublicChargeBundlePdf = getPublicChargeBundlePdf;
