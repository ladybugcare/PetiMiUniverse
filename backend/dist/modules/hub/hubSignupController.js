"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postHubOnboardingClinic = exports.postHubSignup = void 0;
const zod_1 = require("zod");
const crypto_1 = __importDefault(require("crypto"));
const supabase_js_1 = require("../../config/supabase.js");
const cnpjUtils_js_1 = require("../../utils/cnpjUtils.js");
const auditLog_js_1 = require("../../utils/auditLog.js");
const errorHandler_js_1 = require("../../middleware/errorHandler.js");
const errors_js_1 = require("../../utils/errors.js");
const hubServiceGroupsController_js_1 = require("./hubServiceGroupsController.js");
function resolveHubWebUrl() {
    const raw = process.env.HUB_WEB_URL?.trim() ||
        process.env.VITE_HUB_WEB_URL?.trim() ||
        process.env.FRONTEND_URL?.trim();
    if (!raw) {
        throw new errors_js_1.ValidationError('HUB_WEB_URL não configurada no servidor');
    }
    return raw.replace(/\/$/, '');
}
const hubSignupBodySchema = zod_1.z.object({
    full_name: zod_1.z.string().trim().min(2).max(200),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8).max(128),
    phone: zod_1.z.string().trim().max(30).optional().nullable(),
});
const clinicBlockSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(300),
    cnpj: zod_1.z.string().trim().min(14).max(20),
    address: zod_1.z.string().trim().min(3).max(500),
    city: zod_1.z.string().trim().min(2).max(120),
    state: zod_1.z.string().trim().min(2).max(2),
    phone: zod_1.z.string().trim().max(30).optional().nullable(),
    description: zod_1.z.string().trim().max(2000).optional().nullable(),
});
const unitBlockSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(300),
    nickname: zod_1.z.string().trim().min(1).max(100),
    address: zod_1.z.string().trim().min(3).max(500),
    city: zod_1.z.string().trim().min(2).max(120),
    state: zod_1.z.string().trim().min(2).max(2),
    phone: zod_1.z.string().trim().max(30).optional().nullable(),
    is_main: zod_1.z.boolean().optional().default(true),
    technical_manager: zod_1.z.string().trim().min(2).max(200),
});
const hubOnboardingBodySchema = zod_1.z.object({
    clinic: clinicBlockSchema,
    unit: unitBlockSchema,
});
async function ensureClinicUserForSignup(userId) {
    const { data: existing, error: fetchError } = await supabase_js_1.supabaseAdmin
        .from('clinic_users')
        .select('id, status, clinic_id, role')
        .eq('user_id', userId)
        .maybeSingle();
    if (fetchError)
        throw fetchError;
    if (!existing) {
        const { error: insertError } = await supabase_js_1.supabaseAdmin.from('clinic_users').insert({
            id: crypto_1.default.randomUUID(),
            user_id: userId,
            clinic_id: null,
            unit_id: null,
            role: 'CADMIN',
            status: 'pending_clinic',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        if (insertError)
            throw insertError;
        return;
    }
    if (existing.clinic_id)
        return;
    const { error: updateError } = await supabase_js_1.supabaseAdmin
        .from('clinic_users')
        .update({
        clinic_id: null,
        unit_id: null,
        role: 'CADMIN',
        status: 'pending_clinic',
        updated_at: new Date().toISOString(),
    })
        .eq('id', existing.id);
    if (updateError)
        throw updateError;
}
/** POST /api/hub/signup — cadastro da pessoa (admin futuro da clínica). */
exports.postHubSignup = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const parsed = hubSignupBodySchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errors_js_1.ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const { full_name, email, password, phone } = parsed.data;
    const hubWebUrl = resolveHubWebUrl();
    const emailRedirectTo = `${hubWebUrl}/email-confirmed`;
    const isLocalEnv = hubWebUrl.includes('localhost') || hubWebUrl.includes('127.0.0.1');
    const { data: authData, error: authError } = await supabase_js_1.supabaseAdmin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: isLocalEnv,
        user_metadata: {
            role: 'clinic',
            name: full_name,
            full_name,
            phone: phone?.trim() || null,
        },
    });
    if (authError || !authData?.user) {
        const msg = authError?.message || 'Erro ao criar usuário';
        if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
            return res.status(409).json({ error: 'Este e-mail já está registado.' });
        }
        return res.status(400).json({ error: msg });
    }
    const userId = authData.user.id;
    try {
        if (!isLocalEnv) {
            await supabase_js_1.supabaseAdmin.auth.admin.generateLink({
                type: 'signup',
                email: email.trim().toLowerCase(),
                password,
                options: { redirectTo: emailRedirectTo },
            });
        }
        await ensureClinicUserForSignup(userId);
    }
    catch (e) {
        await supabase_js_1.supabaseAdmin.auth.admin.deleteUser(userId);
        throw e;
    }
    res.status(201).json({
        success: true,
        message: isLocalEnv
            ? 'Conta criada. Pode iniciar sessão.'
            : 'Conta criada. Confirme o e-mail para continuar.',
        user_id: userId,
        email_confirmed: isLocalEnv,
        needs_onboarding: true,
    });
});
/** POST /api/hub/onboarding/clinic — clínica + primeira unidade (transação lógica). */
exports.postHubOnboardingClinic = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const parsed = hubOnboardingBodySchema.safeParse(req.body);
    if (!parsed.success) {
        throw new errors_js_1.ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const userId = req.user.id;
    const userEmail = req.user.email || null;
    const { clinic: clinicInput, unit: unitInput } = parsed.data;
    const clinicCnpj = (0, cnpjUtils_js_1.normalizeCNPJ)(clinicInput.cnpj);
    if (!clinicCnpj || clinicCnpj.length !== 14) {
        throw new errors_js_1.ValidationError('CNPJ inválido');
    }
    const { data: clinicUser, error: clinicUserError } = await supabase_js_1.supabaseAdmin
        .from('clinic_users')
        .select('id, role, clinic_id, status')
        .eq('user_id', userId)
        .eq('role', 'CADMIN')
        .maybeSingle();
    if (clinicUserError || !clinicUser) {
        return res.status(403).json({ error: 'Sem permissão para concluir o cadastro da clínica.' });
    }
    if (clinicUser.clinic_id) {
        return res.status(400).json({ error: 'Cadastro da clínica já foi concluído.' });
    }
    const { data: cnpjTaken } = await supabase_js_1.supabaseAdmin
        .from('clinics')
        .select('id')
        .eq('cnpj', clinicCnpj)
        .maybeSingle();
    if (cnpjTaken) {
        return res.status(409).json({ error: 'CNPJ já registado noutra clínica.' });
    }
    const finalClinicId = userId;
    const { data: newClinic, error: createClinicError } = await supabase_js_1.supabaseAdmin
        .from('clinics')
        .insert({
        id: finalClinicId,
        name: clinicInput.name,
        cnpj: clinicCnpj,
        address: clinicInput.address,
        city: clinicInput.city,
        state: clinicInput.state.toUpperCase(),
        phone: clinicInput.phone?.trim() || null,
        description: clinicInput.description?.trim() || null,
        email: userEmail,
        status: 'pending_unit',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    })
        .select()
        .single();
    if (createClinicError) {
        if (createClinicError.code === '23505') {
            return res.status(409).json({ error: 'Clínica ou CNPJ já existente.' });
        }
        return res.status(500).json({ error: 'Erro ao criar clínica.' });
    }
    const nickname = unitInput.nickname.trim();
    const { data: existingNick } = await supabase_js_1.supabaseAdmin
        .from('units')
        .select('id')
        .eq('clinic_id', finalClinicId)
        .eq('nickname', nickname)
        .maybeSingle();
    if (existingNick) {
        await supabase_js_1.supabaseAdmin.from('clinics').delete().eq('id', finalClinicId);
        return res.status(400).json({ error: 'Já existe uma unidade com este apelido.' });
    }
    const { data: unit, error: unitError } = await supabase_js_1.supabaseAdmin
        .from('units')
        .insert({
        clinic_id: finalClinicId,
        name: unitInput.name,
        nickname,
        address: unitInput.address,
        city: unitInput.city,
        state: unitInput.state.toUpperCase(),
        phone: unitInput.phone?.trim() || null,
        is_main: unitInput.is_main !== false,
        technical_manager: unitInput.technical_manager.trim(),
        status: 'active',
    })
        .select()
        .single();
    if (unitError) {
        await supabase_js_1.supabaseAdmin.from('clinics').delete().eq('id', finalClinicId);
        return res.status(500).json({ error: 'Erro ao criar unidade.' });
    }
    await supabase_js_1.supabaseAdmin
        .from('clinics')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', finalClinicId);
    const nowIso = new Date().toISOString();
    const { data: updatedCu, error: updateCuError } = await supabase_js_1.supabaseAdmin
        .from('clinic_users')
        .update({
        clinic_id: finalClinicId,
        unit_id: unit.id,
        status: 'active',
        first_login_completed_at: nowIso,
        onboarding_state: {
            last_step: 'unit',
            completed: true,
            completed_at: nowIso,
            source: 'hub_onboarding',
        },
        updated_at: nowIso,
    })
        .eq('id', clinicUser.id)
        .select()
        .single();
    if (updateCuError || !updatedCu) {
        await supabase_js_1.supabaseAdmin.from('units').delete().eq('id', unit.id);
        await supabase_js_1.supabaseAdmin.from('clinics').delete().eq('id', finalClinicId);
        return res.status(500).json({ error: 'Erro ao vincular utilizador à clínica.' });
    }
    try {
        await (0, hubServiceGroupsController_js_1.ensureDefaultGroupJobFunctions)(finalClinicId);
    }
    catch (bootstrapErr) {
        console.warn('[hub_onboarding] ensureDefaultGroupJobFunctions', bootstrapErr);
    }
    const metadata = (0, auditLog_js_1.extractRequestMetadata)(req);
    await (0, auditLog_js_1.createAuditLog)({
        user_id: userId,
        clinic_id: finalClinicId,
        unit_id: unit.id,
        action: 'HUB_ONBOARDING_CLINIC',
        entity_type: 'unit',
        entity_id: unit.id,
        new_values: { clinic: newClinic, unit },
        ...metadata,
    });
    res.status(201).json({
        clinic: newClinic,
        unit,
        clinicUser: updatedCu,
        message: 'Clínica e unidade registadas com sucesso.',
    });
});
