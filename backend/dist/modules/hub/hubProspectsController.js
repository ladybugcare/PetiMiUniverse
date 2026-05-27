"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchHubProspect = exports.createHubProspect = exports.getHubProspect = exports.listHubProspects = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const uuidStr = zod_1.z.string().uuid();
const PROSPECT_SELECT = 'id, clinic_id, full_name, tax_id, phone, email, created_at, updated_at, deleted_at';
function normalizeTaxId(raw) {
    return String(raw).replace(/\D/g, '');
}
const createProspectBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    full_name: zod_1.z.string().trim().min(1).max(200),
    tax_id: zod_1.z.string().trim().min(1).max(32),
    phone: zod_1.z.string().trim().min(1).max(40),
    email: zod_1.z.string().trim().max(254).optional().nullable(),
})
    .strict();
const patchProspectBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    full_name: zod_1.z.string().trim().min(1).max(200).optional(),
    tax_id: zod_1.z.string().trim().min(1).max(32).optional(),
    phone: zod_1.z.string().trim().min(1).max(40).optional(),
    email: zod_1.z.string().trim().max(254).optional().nullable(),
    /** true = soft delete */
    archived: zod_1.z.boolean().optional(),
})
    .strict();
const listHubProspects = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = parsed.data;
        const qRaw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        const digits = qRaw.replace(/\D/g, '');
        let query = supabase_1.supabaseAdmin
            .from('hub_prospects')
            .select(PROSPECT_SELECT)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .order('full_name', { ascending: true });
        if (qRaw.length > 0) {
            const safe = qRaw.replace(/%/g, '').replace(/"/g, '').slice(0, 80);
            const like = `%${safe}%`;
            const esc = (s) => `"${s.replace(/"/g, '')}"`;
            if (digits.length >= 3) {
                const likeDigits = `%${digits}%`;
                query = query.or(`full_name.ilike.${esc(like)},phone.ilike.${esc(like)},tax_id.ilike.${esc(likeDigits)}`);
            }
            else {
                query = query.or(`full_name.ilike.${esc(like)},phone.ilike.${esc(like)}`);
            }
        }
        const { data, error } = await query;
        if (error) {
            console.error('[hub_prospects] list', error);
            return res.status(500).json({ error: 'Erro ao listar contatos' });
        }
        return res.json({ prospects: data ?? [] });
    }
    catch (e) {
        console.error('[hub_prospects] list', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.listHubProspects = listHubProspects;
const getHubProspect = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        if (!clinicParsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_prospects')
            .select(PROSPECT_SELECT)
            .eq('id', idParsed.data)
            .eq('clinic_id', clinicParsed.data)
            .maybeSingle();
        if (error) {
            console.error('[hub_prospects] get', error);
            return res.status(500).json({ error: 'Erro ao carregar contato' });
        }
        if (!data || data.deleted_at) {
            return res.status(404).json({ error: 'Contato não encontrado' });
        }
        return res.json({ prospect: data });
    }
    catch (e) {
        console.error('[hub_prospects] get', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getHubProspect = getHubProspect;
const createHubProspect = async (req, res) => {
    try {
        const body = createProspectBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, full_name, tax_id, phone, email } = body.data;
        const row = {
            clinic_id,
            full_name: full_name.trim(),
            tax_id: normalizeTaxId(tax_id),
            phone: phone.trim(),
            email: email?.trim() || null,
            deleted_at: null,
        };
        if (!row.tax_id) {
            return res.status(400).json({ error: 'CPF/documento inválido (indique pelo menos os dígitos)' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_prospects')
            .insert([row])
            .select(PROSPECT_SELECT)
            .single();
        if (error) {
            console.error('[hub_prospects] create', error);
            return res.status(500).json({ error: 'Erro ao criar contato' });
        }
        return res.status(201).json({ prospect: data });
    }
    catch (e) {
        console.error('[hub_prospects] create', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.createHubProspect = createHubProspect;
const patchHubProspect = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        if (!idParsed.success) {
            return res.status(400).json({ error: 'id inválido' });
        }
        const body = patchProspectBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, full_name, tax_id, phone, email, archived } = body.data;
        if (full_name === undefined &&
            tax_id === undefined &&
            phone === undefined &&
            email === undefined &&
            archived === undefined) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        }
        const { data: existing, error: exErr } = await supabase_1.supabaseAdmin
            .from('hub_prospects')
            .select('id, clinic_id, deleted_at')
            .eq('id', idParsed.data)
            .maybeSingle();
        if (exErr || !existing || existing.clinic_id !== clinic_id) {
            return res.status(404).json({ error: 'Contato não encontrado' });
        }
        const patch = {};
        if (full_name !== undefined)
            patch.full_name = full_name.trim();
        if (tax_id !== undefined) {
            const n = normalizeTaxId(tax_id);
            if (!n)
                return res.status(400).json({ error: 'CPF/documento inválido' });
            patch.tax_id = n;
        }
        if (phone !== undefined)
            patch.phone = phone.trim();
        if (email !== undefined)
            patch.email = email?.trim() || null;
        if (archived === true)
            patch.deleted_at = new Date().toISOString();
        else if (archived === false)
            patch.deleted_at = null;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_prospects')
            .update(patch)
            .eq('id', idParsed.data)
            .eq('clinic_id', clinic_id)
            .select(PROSPECT_SELECT)
            .single();
        if (error) {
            console.error('[hub_prospects] patch', error);
            return res.status(500).json({ error: 'Erro ao atualizar contato' });
        }
        return res.json({ prospect: data });
    }
    catch (e) {
        console.error('[hub_prospects] patch', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.patchHubProspect = patchHubProspect;
