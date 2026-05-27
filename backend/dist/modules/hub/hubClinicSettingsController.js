"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchHubClinicSettings = exports.getHubClinicSettings = void 0;
exports.getOrCreateHubClinicSettings = getOrCreateHubClinicSettings;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const uuidStr = zod_1.z.string().uuid();
const patchSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    pet_puppy_max_months: zod_1.z.number().int().min(1).max(24),
})
    .strict();
/** Garante linha de settings por clínica (default 8 meses). */
async function getOrCreateHubClinicSettings(clinicId) {
    const { data: row, error: selErr } = await supabase_1.supabaseAdmin
        .from('hub_clinic_settings')
        .select('pet_puppy_max_months')
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (!selErr && row) {
        return { pet_puppy_max_months: Number(row.pet_puppy_max_months) || 8 };
    }
    const { data: ins, error: insErr } = await supabase_1.supabaseAdmin
        .from('hub_clinic_settings')
        .insert({ clinic_id: clinicId })
        .select('pet_puppy_max_months')
        .single();
    if (insErr || !ins) {
        return { pet_puppy_max_months: 8 };
    }
    return { pet_puppy_max_months: Number(ins.pet_puppy_max_months) || 8 };
}
const getHubClinicSettings = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const settings = await getOrCreateHubClinicSettings(parsed.data);
        return res.json({ settings });
    }
    catch (e) {
        console.error('[hub_clinic_settings] get', e);
        return res.status(500).json({ error: 'Erro ao carregar configurações' });
    }
};
exports.getHubClinicSettings = getHubClinicSettings;
const patchHubClinicSettings = async (req, res) => {
    try {
        const body = patchSchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, pet_puppy_max_months } = body.data;
        await getOrCreateHubClinicSettings(clinic_id);
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_clinic_settings')
            .update({ pet_puppy_max_months })
            .eq('clinic_id', clinic_id);
        if (error) {
            console.error('[hub_clinic_settings] patch', error);
            return res.status(500).json({ error: error.message });
        }
        const settings = await getOrCreateHubClinicSettings(clinic_id);
        return res.json({ settings });
    }
    catch (e) {
        console.error('[hub_clinic_settings] patch', e);
        return res.status(500).json({ error: 'Erro ao gravar configurações' });
    }
};
exports.patchHubClinicSettings = patchHubClinicSettings;
