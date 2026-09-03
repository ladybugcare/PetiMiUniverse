"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteHubPartnerClinic = exports.patchHubPartnerClinic = exports.createHubPartnerClinic = exports.listHubPartnerClinics = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubCareLocation_1 = require("./hubCareLocation");
const uuidStr = zod_1.z.string().uuid();
const optionalTrim = (max) => zod_1.z.string().trim().max(max).optional().nullable();
const createSchema = zod_1.z.object({
    clinic_id: uuidStr,
    name: zod_1.z.string().trim().min(1).max(200),
    phone: optionalTrim(40),
    notes: optionalTrim(2000),
    is_active: zod_1.z.boolean().optional().default(true),
    postal_code: optionalTrim(16),
    state: optionalTrim(2),
    city: optionalTrim(120),
    district: optionalTrim(120),
    street: optionalTrim(200),
    street_number: optionalTrim(32),
    complement: optionalTrim(120),
    /** Legado — aceito, mas preferir street. */
    address_line: optionalTrim(400),
});
const patchSchema = zod_1.z.object({
    clinic_id: uuidStr,
    name: zod_1.z.string().trim().min(1).max(200).optional(),
    phone: optionalTrim(40),
    notes: optionalTrim(2000),
    is_active: zod_1.z.boolean().optional(),
    postal_code: optionalTrim(16),
    state: optionalTrim(2),
    city: optionalTrim(120),
    district: optionalTrim(120),
    street: optionalTrim(200),
    street_number: optionalTrim(32),
    complement: optionalTrim(120),
    address_line: optionalTrim(400),
});
const PARTNER_SELECT = 'id, clinic_id, name, phone, notes, is_active, postal_code, state, city, district, street, street_number, complement, address_line, created_at, updated_at';
const listHubPartnerClinics = async (req, res) => {
    try {
        const clinicId = req.query.clinic_id;
        if (!uuidStr.safeParse(clinicId).success) {
            return res.status(400).json({ error: 'clinic_id inválido' });
        }
        const includeInactive = req.query.include_inactive === 'true';
        let q = supabase_1.supabaseAdmin
            .from('hub_partner_clinics')
            .select(PARTNER_SELECT)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .order('name', { ascending: true });
        if (!includeInactive)
            q = q.eq('is_active', true);
        const { data, error } = await q;
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ partner_clinics: data ?? [] });
    }
    catch (e) {
        console.error('[partner_clinics] list', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubPartnerClinics = listHubPartnerClinics;
const createHubPartnerClinic = async (req, res) => {
    try {
        const parsed = createSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, ...fields } = parsed.data;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_partner_clinics')
            .insert({ clinic_id, ...fields })
            .select(PARTNER_SELECT)
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        return res.status(201).json({ partner_clinic: data });
    }
    catch (e) {
        console.error('[partner_clinics] create', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.createHubPartnerClinic = createHubPartnerClinic;
const patchHubPartnerClinic = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const body = patchSchema.safeParse(req.body);
        if (!idParsed.success || !body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error?.flatten() });
        }
        const { clinic_id, ...fields } = body.data;
        const existing = await (0, hubCareLocation_1.assertPartnerClinicInClinic)(clinic_id, idParsed.data, {
            requireActive: false,
        });
        if (!existing)
            return res.status(404).json({ error: 'Clínica parceira não encontrada' });
        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ error: 'Nada para atualizar' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_partner_clinics')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', idParsed.data)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .select(PARTNER_SELECT)
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ partner_clinic: data });
    }
    catch (e) {
        console.error('[partner_clinics] patch', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.patchHubPartnerClinic = patchHubPartnerClinic;
const deleteHubPartnerClinic = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const clinicId = req.query.clinic_id;
        if (!idParsed.success || !uuidStr.safeParse(clinicId).success) {
            return res.status(400).json({ error: 'Parâmetros inválidos' });
        }
        const existing = await (0, hubCareLocation_1.assertPartnerClinicInClinic)(clinicId, idParsed.data, {
            requireActive: false,
        });
        if (!existing)
            return res.status(404).json({ error: 'Clínica parceira não encontrada' });
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_partner_clinics')
            .update({ deleted_at: new Date().toISOString(), is_active: false })
            .eq('id', idParsed.data)
            .eq('clinic_id', clinicId);
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ deleted: true });
    }
    catch (e) {
        console.error('[partner_clinics] delete', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.deleteHubPartnerClinic = deleteHubPartnerClinic;
