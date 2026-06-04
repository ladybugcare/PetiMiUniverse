"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHubCommissionPreview = exports.deleteHubCommissionRule = exports.patchHubCommissionRule = exports.postHubCommissionRule = exports.listHubCommissionRules = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const uuidStr = zod_1.z.string().uuid();
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
const basisSchema = zod_1.z.enum(['percent_of_sale', 'fixed_per_sale']);
const listRulesQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    include_inactive: zod_1.z.enum(['true', 'false']).optional(),
})
    .strict();
const listHubCommissionRules = async (req, res) => {
    try {
        const parsed = listRulesQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id obrigatório (UUID)' });
        }
        const { clinic_id, include_inactive } = parsed.data;
        let q = supabase_1.supabaseAdmin
            .from('hub_commission_rules')
            .select(`
        *,
        hub_service_types ( id, name, code, service_group, active )
      `)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });
        if (include_inactive !== 'true') {
            q = q.eq('active', true);
        }
        const { data, error } = await q;
        if (error) {
            if (String(error.message || '').includes('hub_commission_rules')) {
                return res.status(503).json({
                    error: 'Tabela hub_commission_rules não encontrada. Aplique create_hub_commission_rules.sql.',
                });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.json({ rules: data ?? [] });
    }
    catch (e) {
        console.error('listHubCommissionRules', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubCommissionRules = listHubCommissionRules;
const upsertRuleBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    hub_service_type_id: uuidStr,
    basis: basisSchema,
    rate: zod_1.z.number().nonnegative(),
    notes: zod_1.z.string().trim().max(2000).optional().nullable(),
    active: zod_1.z.boolean().optional(),
})
    .strict();
const postHubCommissionRule = async (req, res) => {
    try {
        const parsed = upsertRuleBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, hub_service_type_id, basis, rate, notes, active } = parsed.data;
        if (basis === 'percent_of_sale' && rate > 100) {
            return res.status(400).json({ error: 'Percentagem não pode exceder 100' });
        }
        const { data: st, error: stErr } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select('id, clinic_id')
            .eq('id', hub_service_type_id)
            .maybeSingle();
        if (stErr || !st || st.clinic_id !== clinic_id) {
            return res.status(400).json({ error: 'Tipo de serviço inválido para esta clínica' });
        }
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('hub_commission_rules')
            .select('id')
            .eq('clinic_id', clinic_id)
            .eq('hub_service_type_id', hub_service_type_id)
            .is('deleted_at', null)
            .maybeSingle();
        const row = {
            clinic_id,
            hub_service_type_id,
            basis,
            rate: round2(rate),
            notes: notes ?? null,
            active: active ?? true,
        };
        if (existing?.id) {
            const { data, error } = await supabase_1.supabaseAdmin
                .from('hub_commission_rules')
                .update(row)
                .eq('id', existing.id)
                .select(`*, hub_service_types ( id, name, code, service_group, active )`)
                .single();
            if (error)
                return res.status(500).json({ error: error.message });
            return res.json({ rule: data });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_commission_rules')
            .insert(row)
            .select(`*, hub_service_types ( id, name, code, service_group, active )`)
            .single();
        if (error) {
            if (String(error.message || '').includes('hub_commission_rules')) {
                return res.status(503).json({
                    error: 'Tabela hub_commission_rules não encontrada. Aplique create_hub_commission_rules.sql.',
                });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.status(201).json({ rule: data });
    }
    catch (e) {
        console.error('postHubCommissionRule', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubCommissionRule = postHubCommissionRule;
const patchRuleBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    basis: basisSchema.optional(),
    rate: zod_1.z.number().nonnegative().optional(),
    notes: zod_1.z.string().trim().max(2000).optional().nullable(),
    active: zod_1.z.boolean().optional(),
})
    .strict();
const patchHubCommissionRule = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = patchRuleBodySchema.safeParse(req.body);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos' });
        }
        const { clinic_id, basis, rate, notes, active } = parsed.data;
        const { data: rule, error: rErr } = await supabase_1.supabaseAdmin
            .from('hub_commission_rules')
            .select('id, clinic_id, basis')
            .eq('id', idParsed.data)
            .is('deleted_at', null)
            .maybeSingle();
        if (rErr || !rule || rule.clinic_id !== clinic_id)
            return res.status(404).json({ error: 'Regra não encontrada' });
        const nextBasis = basis ?? rule.basis;
        const nextRate = rate !== undefined ? round2(rate) : undefined;
        if (nextBasis === 'percent_of_sale' && nextRate !== undefined && nextRate > 100) {
            return res.status(400).json({ error: 'Percentagem não pode exceder 100' });
        }
        const patch = {};
        if (basis !== undefined)
            patch.basis = basis;
        if (rate !== undefined)
            patch.rate = nextRate;
        if (notes !== undefined)
            patch.notes = notes;
        if (active !== undefined)
            patch.active = active;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_commission_rules')
            .update(patch)
            .eq('id', idParsed.data)
            .select(`*, hub_service_types ( id, name, code, service_group, active )`)
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ rule: data });
    }
    catch (e) {
        console.error('patchHubCommissionRule', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.patchHubCommissionRule = patchHubCommissionRule;
const deleteRuleQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
})
    .strict();
const deleteHubCommissionRule = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = deleteRuleQuerySchema.safeParse(req.query);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'clinic_id obrigatório na query' });
        }
        const { clinic_id } = parsed.data;
        const { data: rule, error: rErr } = await supabase_1.supabaseAdmin
            .from('hub_commission_rules')
            .select('id, clinic_id')
            .eq('id', idParsed.data)
            .is('deleted_at', null)
            .maybeSingle();
        if (rErr || !rule || rule.clinic_id !== clinic_id)
            return res.status(404).json({ error: 'Regra não encontrada' });
        const now = new Date().toISOString();
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_commission_rules')
            .update({ deleted_at: now, active: false })
            .eq('id', idParsed.data);
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('deleteHubCommissionRule', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.deleteHubCommissionRule = deleteHubCommissionRule;
const previewQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    receivable_id: uuidStr,
})
    .strict();
const getHubCommissionPreview = async (req, res) => {
    try {
        const parsed = previewQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id e receivable_id obrigatórios' });
        }
        const { clinic_id, receivable_id } = parsed.data;
        const { data: rec, error: recErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, clinic_id, final_amount')
            .eq('id', receivable_id)
            .maybeSingle();
        if (recErr || !rec || rec.clinic_id !== clinic_id)
            return res.status(404).json({ error: 'Recebível não encontrado' });
        const { data: lines, error: lnErr } = await supabase_1.supabaseAdmin
            .from('hub_receivable_lines')
            .select('id, hub_service_type_id, description, quantity, line_total')
            .eq('receivable_id', receivable_id)
            .order('sort_order', { ascending: true });
        if (lnErr)
            return res.status(500).json({ error: lnErr.message });
        const { data: rules, error: ruErr } = await supabase_1.supabaseAdmin
            .from('hub_commission_rules')
            .select('hub_service_type_id, basis, rate, active')
            .eq('clinic_id', clinic_id)
            .eq('active', true)
            .is('deleted_at', null);
        if (ruErr) {
            if (String(ruErr.message || '').includes('hub_commission_rules')) {
                return res.status(503).json({
                    error: 'Tabela hub_commission_rules não encontrada. Aplique create_hub_commission_rules.sql.',
                });
            }
            return res.status(500).json({ error: ruErr.message });
        }
        const ruleByService = new Map();
        for (const r of rules ?? []) {
            const sid = r.hub_service_type_id;
            if (sid)
                ruleByService.set(sid, { basis: String(r.basis), rate: Number(r.rate ?? 0) });
        }
        const out = [];
        let total = 0;
        for (const ln of lines ?? []) {
            const lineTotal = round2(Number(ln.line_total ?? 0));
            const stId = ln.hub_service_type_id ?? null;
            const rule = stId ? ruleByService.get(stId) : undefined;
            let commission = 0;
            let basis = null;
            let rate = null;
            if (rule && stId) {
                basis = rule.basis;
                rate = rule.rate;
                if (rule.basis === 'percent_of_sale') {
                    commission = round2(lineTotal * (rule.rate / 100));
                }
                else {
                    commission = round2(Math.min(rule.rate, lineTotal));
                }
            }
            total = round2(total + commission);
            out.push({
                line_id: ln.id,
                description: String(ln.description ?? ''),
                line_total: lineTotal,
                hub_service_type_id: stId,
                basis,
                rate,
                commission_amount: commission,
            });
        }
        return res.json({
            receivable_id,
            receivable_final_amount: Number(rec.final_amount ?? 0),
            lines: out,
            total_commission: total,
        });
    }
    catch (e) {
        console.error('getHubCommissionPreview', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubCommissionPreview = getHubCommissionPreview;
