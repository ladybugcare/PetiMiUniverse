"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supabase_1 = require("../config/supabase");
const rateLimiter_js_1 = require("../middleware/rateLimiter.js");
const router = express_1.default.Router();
// Login (com rate limiting mais restritivo)
router.post('/login', rateLimiter_js_1.authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        const { data, error } = await supabase_1.supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) {
            return res.status(401).json({ error: error.message });
        }
        const { user, session } = data;
        let onboarding = null;
        let clinicUserRecord = null;
        const userRole = user?.user_metadata?.role || user?.role;
        const allowedRolesForOnboarding = ['CADMIN', 'CMANAGER'];
        let clinicStatus = null;
        let clinicUserStatus = null;
        try {
            if (user) {
                const { data: clinicUser, error: clinicUserError, } = await supabase_1.supabaseAdmin
                    .from('clinic_users')
                    .select('id, clinic_id, user_id, role, status, unit_id, first_login_at, first_login_completed_at, onboarding_state')
                    .eq('user_id', user.id)
                    .in('role', allowedRolesForOnboarding)
                    .order('created_at', { ascending: true })
                    .limit(1)
                    .maybeSingle();
                clinicUserRecord = clinicUser;
                const clinicUserRole = clinicUser?.role;
                clinicUserStatus = clinicUser?.status;
                // ✅ clinic_id pode ser NULL (usuário ainda não criou clínica)
                const clinicId = clinicUser?.clinic_id || null;
                const isEligibleClinicUser = clinicUserRole ? allowedRolesForOnboarding.includes(clinicUserRole) : false;
                const isClinicOwner = userRole === 'clinic';
                // ✅ Ajustar: considerar usuários sem clínica (clinic_id NULL)
                if ((isEligibleClinicUser || isClinicOwner) && clinicUser) {
                    // Garantir que first_login_at seja registrado na primeira autenticação
                    if (!clinicUser.first_login_at) {
                        const updateData = { first_login_at: new Date().toISOString() };
                        // Só adicionar clinic_id na query se não for NULL
                        if (clinicId) {
                            await supabase_1.supabaseAdmin
                                .from('clinic_users')
                                .update(updateData)
                                .eq('user_id', user.id)
                                .eq('clinic_id', clinicId);
                        }
                        else {
                            await supabase_1.supabaseAdmin
                                .from('clinic_users')
                                .update(updateData)
                                .eq('user_id', user.id)
                                .is('clinic_id', null);
                        }
                    }
                    let hasUnits = false;
                    let clinicStatusValue = null;
                    // ✅ Só buscar clinic e units se clinic_id não for NULL
                    if (clinicId) {
                        // Buscar status da clínica
                        const { data: clinic, error: clinicError, } = await supabase_1.supabaseAdmin
                            .from('clinics')
                            .select('status')
                            .eq('id', clinicId)
                            .maybeSingle();
                        if (clinicError) {
                            console.error('[AUTH] Erro ao buscar clínica:', clinicError.message);
                        }
                        // Contar unidades cadastradas
                        const { count: unitCount, error: unitsError, } = await supabase_1.supabaseAdmin
                            .from('units')
                            .select('id', { count: 'exact', head: true })
                            .eq('clinic_id', clinicId);
                        if (unitsError) {
                            console.error('[AUTH] Erro ao contar unidades:', unitsError.message);
                        }
                        hasUnits = (unitCount ?? 0) > 0;
                        clinicStatusValue = clinic?.status || null;
                    }
                    else {
                        // ✅ Se clinic_id é NULL, usuário precisa criar clínica (primeira unidade)
                        clinicStatusValue = null;
                        hasUnits = false;
                    }
                    const firstLoginCompletedAt = clinicUser?.first_login_completed_at || null;
                    const firstLoginAt = clinicUser?.first_login_at || null;
                    // ✅ needsOnboarding se:
                    // - clinic_id é NULL (não tem clínica ainda)
                    // - clinic_status é 'pending_unit' (tem clínica mas não tem unidade)
                    // - não tem unidades
                    const needsOnboarding = !clinicId || clinicStatusValue === 'pending_unit' || !hasUnits;
                    const shouldCompleteFirstUnit = needsOnboarding && (isEligibleClinicUser || isClinicOwner);
                    onboarding = {
                        clinicId, // Pode ser null
                        clinicStatus: clinicStatusValue,
                        hasUnits,
                        isFirstLogin: !firstLoginCompletedAt,
                        needsOnboarding,
                        shouldCompleteFirstUnit,
                        firstLoginAt,
                        firstLoginCompletedAt,
                        onboardingState: clinicUser?.onboarding_state || {},
                        clinicUserRole: clinicUserRole || (isClinicOwner ? 'CADMIN' : null),
                        clinicUserStatus,
                    };
                }
            }
        }
        catch (onboardingError) {
            console.error('[AUTH] Falha ao compor dados de onboarding:', onboardingError);
        }
        if (userRole === 'clinic' && clinicStatus === 'inactive') {
            return res.status(403).json({
                error: 'Conta da clínica inativada. Entre em contato com o suporte para reativação.',
            });
        }
        if (clinicUserStatus === 'inactive') {
            return res.status(403).json({
                error: 'Seu acesso como membro da clínica foi inativado. Solicite reativação ao administrador.',
            });
        }
        const clinicUserPayload = clinicUserRecord
            ? {
                id: clinicUserRecord.id,
                clinic_id: clinicUserRecord.clinic_id,
                user_id: clinicUserRecord.user_id,
                role: clinicUserRecord.role,
                status: clinicUserRecord.status,
                unit_id: clinicUserRecord.unit_id,
                first_login_at: clinicUserRecord.first_login_at,
                first_login_completed_at: clinicUserRecord.first_login_completed_at,
                onboarding_state: clinicUserRecord.onboarding_state,
            }
            : null;
        res.json({
            user,
            session,
            onboarding,
            clinicUser: clinicUserPayload,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Signup (com rate limiting mais restritivo)
router.post('/signup', rateLimiter_js_1.authLimiter, async (req, res) => {
    try {
        const { email, password, name, role } = req.body;
        const { data, error } = await supabase_1.supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name,
                    role,
                }
            }
        });
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        res.json({
            user: data.user,
            session: data.session
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
