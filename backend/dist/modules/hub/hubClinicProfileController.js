"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchHubUnitProfile = exports.patchHubClinicProfile = exports.postHubUnit = void 0;
const zod_1 = require("zod");
const supabase_js_1 = require("../../config/supabase.js");
const authMiddleware_js_1 = require("../../middleware/authMiddleware.js");
const errorHandler_js_1 = require("../../middleware/errorHandler.js");
const errors_js_1 = require("../../utils/errors.js");
const uuidStr = zod_1.z.string().uuid();
const CLINIC_EDIT_ROLES = new Set(['CADMIN', 'CMANAGER']);
async function userCanEditClinicProfile(userId, clinicId) {
    if (userId === clinicId)
        return true;
    const { data } = await supabase_js_1.supabaseAdmin
        .from('clinic_users')
        .select('role')
        .eq('user_id', userId)
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .maybeSingle();
    return !!data?.role && CLINIC_EDIT_ROLES.has(String(data.role).toUpperCase());
}
async function userCanCreateClinicUnit(userId, clinicId) {
    if (userId === clinicId)
        return true;
    return (0, authMiddleware_js_1.checkPermission)(userId, clinicId, 'unit.create');
}
const patchClinicBodySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(300).optional(),
    phone: zod_1.z.string().trim().max(30).optional().nullable(),
    address: zod_1.z.string().trim().min(3).max(500).optional(),
    city: zod_1.z.string().trim().min(2).max(120).optional(),
    state: zod_1.z.string().trim().min(2).max(2).optional(),
    description: zod_1.z.string().trim().max(2000).optional().nullable(),
});
const patchUnitBodySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(300).optional(),
    nickname: zod_1.z.string().trim().min(1).max(100).optional(),
    address: zod_1.z.string().trim().min(3).max(500).optional(),
    city: zod_1.z.string().trim().min(2).max(120).optional(),
    state: zod_1.z.string().trim().min(2).max(2).optional(),
    phone: zod_1.z.string().trim().max(30).optional().nullable(),
    technical_manager: zod_1.z.string().trim().min(2).max(200).optional(),
    is_main: zod_1.z.boolean().optional(),
});
const createUnitBodySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(300),
    nickname: zod_1.z.string().trim().min(1).max(100),
    address: zod_1.z.string().trim().min(3).max(500),
    city: zod_1.z.string().trim().min(2).max(120),
    state: zod_1.z.string().trim().min(2).max(2),
    phone: zod_1.z.string().trim().max(30).optional().nullable(),
    technical_manager: zod_1.z.string().trim().min(2).max(200),
    is_main: zod_1.z.boolean().optional(),
});
/** POST /api/hub/units?clinic_id=... */
exports.postHubUnit = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!clinicParsed.success) {
        throw new errors_js_1.ValidationError('clinic_id inválido na query');
    }
    const bodyParsed = createUnitBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
        throw new errors_js_1.ValidationError(bodyParsed.error.issues.map((i) => i.message).join('; '));
    }
    const clinicId = clinicParsed.data;
    const userId = req.user.id;
    const hasAccess = await (0, authMiddleware_js_1.checkClinicAccess)(userId, clinicId);
    if (!hasAccess) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    const canCreate = await userCanCreateClinicUnit(userId, clinicId);
    if (!canCreate) {
        return res.status(403).json({ error: 'Sem permissão para criar unidades.' });
    }
    const payload = bodyParsed.data;
    const nickname = payload.nickname.trim();
    const state = payload.state.toUpperCase();
    const { data: nickConflict } = await supabase_js_1.supabaseAdmin
        .from('units')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('nickname', nickname)
        .maybeSingle();
    if (nickConflict) {
        return res.status(400).json({ error: 'Já existe uma unidade com este apelido.' });
    }
    const isMain = payload.is_main === true;
    if (isMain) {
        await supabase_js_1.supabaseAdmin
            .from('units')
            .update({ is_main: false, updated_at: new Date().toISOString() })
            .eq('clinic_id', clinicId);
    }
    const { data: unit, error } = await supabase_js_1.supabaseAdmin
        .from('units')
        .insert({
        clinic_id: clinicId,
        name: payload.name,
        nickname,
        address: payload.address,
        city: payload.city,
        state,
        phone: payload.phone?.trim() || null,
        technical_manager: payload.technical_manager.trim(),
        is_main: isMain,
        status: 'active',
    })
        .select()
        .single();
    if (error || !unit) {
        return res.status(500).json({ error: 'Erro ao criar unidade.' });
    }
    res.status(201).json({ unit });
});
/** PATCH /api/hub/clinic/profile?clinic_id=... */
exports.patchHubClinicProfile = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!clinicParsed.success) {
        throw new errors_js_1.ValidationError('clinic_id inválido na query');
    }
    const bodyParsed = patchClinicBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
        throw new errors_js_1.ValidationError(bodyParsed.error.issues.map((i) => i.message).join('; '));
    }
    const clinicId = clinicParsed.data;
    const userId = req.user.id;
    const hasAccess = await (0, authMiddleware_js_1.checkClinicAccess)(userId, clinicId);
    if (!hasAccess) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    const canEdit = await userCanEditClinicProfile(userId, clinicId);
    if (!canEdit) {
        return res.status(403).json({ error: 'Sem permissão para editar o perfil da clínica.' });
    }
    const payload = bodyParsed.data;
    if (Object.keys(payload).length === 0) {
        throw new errors_js_1.ValidationError('Nenhum campo para atualizar');
    }
    const update = {
        updated_at: new Date().toISOString(),
    };
    if (payload.name !== undefined)
        update.name = payload.name;
    if (payload.phone !== undefined)
        update.phone = payload.phone?.trim() || null;
    if (payload.address !== undefined)
        update.address = payload.address;
    if (payload.city !== undefined)
        update.city = payload.city;
    if (payload.state !== undefined)
        update.state = payload.state.toUpperCase();
    if (payload.description !== undefined)
        update.description = payload.description?.trim() || null;
    const { data: clinic, error } = await supabase_js_1.supabaseAdmin
        .from('clinics')
        .update(update)
        .eq('id', clinicId)
        .select()
        .single();
    if (error || !clinic) {
        return res.status(500).json({ error: 'Erro ao atualizar clínica.' });
    }
    res.json({ clinic });
});
/** PATCH /api/hub/units/:unitId?clinic_id=... */
exports.patchHubUnitProfile = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const unitParsed = uuidStr.safeParse(req.params.unitId);
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!unitParsed.success) {
        throw new errors_js_1.ValidationError('unitId inválido');
    }
    if (!clinicParsed.success) {
        throw new errors_js_1.ValidationError('clinic_id inválido na query');
    }
    const bodyParsed = patchUnitBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
        throw new errors_js_1.ValidationError(bodyParsed.error.issues.map((i) => i.message).join('; '));
    }
    const unitId = unitParsed.data;
    const clinicId = clinicParsed.data;
    const userId = req.user.id;
    const hasAccess = await (0, authMiddleware_js_1.checkClinicAccess)(userId, clinicId);
    if (!hasAccess) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    const canEdit = await userCanEditClinicProfile(userId, clinicId);
    if (!canEdit) {
        return res.status(403).json({ error: 'Sem permissão para editar a unidade.' });
    }
    const { data: existing, error: fetchErr } = await supabase_js_1.supabaseAdmin
        .from('units')
        .select('id, clinic_id')
        .eq('id', unitId)
        .maybeSingle();
    if (fetchErr || !existing) {
        return res.status(404).json({ error: 'Unidade não encontrada.' });
    }
    if (existing.clinic_id !== clinicId) {
        return res.status(403).json({ error: 'Unidade não pertence a esta clínica.' });
    }
    const payload = bodyParsed.data;
    if (Object.keys(payload).length === 0) {
        throw new errors_js_1.ValidationError('Nenhum campo para atualizar');
    }
    if (payload.nickname !== undefined) {
        const nickname = payload.nickname.trim();
        const { data: nickConflict } = await supabase_js_1.supabaseAdmin
            .from('units')
            .select('id')
            .eq('clinic_id', clinicId)
            .eq('nickname', nickname)
            .neq('id', unitId)
            .maybeSingle();
        if (nickConflict) {
            return res.status(400).json({ error: 'Já existe uma unidade com este apelido.' });
        }
    }
    const update = {
        updated_at: new Date().toISOString(),
    };
    if (payload.name !== undefined)
        update.name = payload.name;
    if (payload.nickname !== undefined)
        update.nickname = payload.nickname.trim();
    if (payload.address !== undefined)
        update.address = payload.address;
    if (payload.city !== undefined)
        update.city = payload.city;
    if (payload.state !== undefined)
        update.state = payload.state.toUpperCase();
    if (payload.phone !== undefined)
        update.phone = payload.phone?.trim() || null;
    if (payload.technical_manager !== undefined)
        update.technical_manager = payload.technical_manager.trim();
    if (payload.is_main !== undefined)
        update.is_main = payload.is_main;
    if (payload.is_main === true) {
        await supabase_js_1.supabaseAdmin
            .from('units')
            .update({ is_main: false, updated_at: new Date().toISOString() })
            .eq('clinic_id', clinicId)
            .neq('id', unitId);
    }
    const { data: unit, error } = await supabase_js_1.supabaseAdmin
        .from('units')
        .update(update)
        .eq('id', unitId)
        .select()
        .single();
    if (error || !unit) {
        return res.status(500).json({ error: 'Erro ao atualizar unidade.' });
    }
    res.json({ unit });
});
