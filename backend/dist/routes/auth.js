"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supabase_1 = require("../config/supabase");
const router = express_1.default.Router();
// Login
router.post('/login', async (req, res) => {
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
        try {
            const userRole = user?.user_metadata?.role || user?.role;
            const allowedRolesForOnboarding = ['CADMIN', 'CMANAGER'];
            if (user) {
                const { data: clinicUser, error: clinicUserError, } = await supabase_1.supabaseAdmin
                    .from('clinic_users')
                    .select('clinic_id, role, status, first_login_at, first_login_completed_at, onboarding_state')
                    .eq('user_id', user.id)
                    .in('role', allowedRolesForOnboarding)
                    .order('created_at', { ascending: true })
                    .limit(1)
                    .maybeSingle();
                const clinicUserRole = clinicUser?.role;
                const clinicUserStatus = clinicUser?.status;
                const clinicId = clinicUser?.clinic_id || (userRole === 'clinic' ? user.id : null);
                const isEligibleClinicUser = clinicUserRole ? allowedRolesForOnboarding.includes(clinicUserRole) : false;
                const isClinicOwner = userRole === 'clinic';
                if (clinicId && (isEligibleClinicUser || isClinicOwner)) {
                    // Garantir que first_login_at seja registrado na primeira autenticação
                    if (clinicUser && !clinicUser.first_login_at) {
                        await supabase_1.supabaseAdmin
                            .from('clinic_users')
                            .update({ first_login_at: new Date().toISOString() })
                            .eq('user_id', user.id)
                            .eq('clinic_id', clinicId);
                    }
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
                    const hasUnits = (unitCount ?? 0) > 0;
                    const clinicStatus = clinic?.status || null;
                    const firstLoginCompletedAt = clinicUser?.first_login_completed_at || null;
                    const firstLoginAt = clinicUser?.first_login_at || null;
                    const needsOnboarding = clinicStatus === 'pending_unit' || !hasUnits;
                    const shouldCompleteFirstUnit = needsOnboarding && (isEligibleClinicUser || isClinicOwner);
                    onboarding = {
                        clinicId,
                        clinicStatus,
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
        res.json({
            user,
            session,
            onboarding,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Signup
router.post('/signup', async (req, res) => {
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
