"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postHubPackage = exports.listHubPackages = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const uuidStr = zod_1.z.string().uuid();
const packageBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    name: zod_1.z.string().trim().min(1).max(200),
    hub_service_type_id: uuidStr.optional().nullable(),
    sessions_total: zod_1.z.number().int().min(1).max(9999),
    price: zod_1.z.number().min(0),
    validity_days: zod_1.z.number().int().min(1).max(3650).optional().nullable(),
    notes: zod_1.z.string().trim().max(2000).optional().nullable(),
})
    .strict();
const listHubPackages = async (req, res) => {
    try {
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success)
            return res.status(400).json({ error: 'clinic_id obrigatório' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_packages')
            .select('*')
            .eq('clinic_id', clinicParsed.data)
            .eq('active', true)
            .order('name', { ascending: true });
        if (error) {
            if (String(error.message || '').includes('hub_packages')) {
                return res.json({ packages: [] });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.json({ packages: data ?? [] });
    }
    catch (e) {
        console.error('listHubPackages', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubPackages = listHubPackages;
const postHubPackage = async (req, res) => {
    try {
        const parsed = packageBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const b = parsed.data;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_packages')
            .insert({
            clinic_id: b.clinic_id,
            name: b.name,
            hub_service_type_id: b.hub_service_type_id ?? null,
            sessions_total: b.sessions_total,
            price: b.price,
            validity_days: b.validity_days ?? null,
            notes: b.notes ?? null,
            active: true,
        })
            .select('*')
            .single();
        if (error) {
            if (String(error.message || '').includes('hub_packages')) {
                return res.status(503).json({ error: 'Tabela hub_packages não encontrada. Aplique create_hub_packages_and_subscriptions.sql.' });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.status(201).json({ package: data });
    }
    catch (e) {
        console.error('postHubPackage', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubPackage = postHubPackage;
