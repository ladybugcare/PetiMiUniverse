"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentSignups = void 0;
const supabase_js_1 = require("../../config/supabase.js");
function normalizeProduct(source) {
    const value = String(source || '')
        .trim()
        .toLowerCase();
    if (value === 'hub' || value === 'hub_onboarding')
        return 'hub';
    if (value === 'shift' || value === 'shift_onboarding')
        return 'shift';
    if (value === 'hub_invitation')
        return 'unknown';
    return 'unknown';
}
function resolveClinic(clinics) {
    if (!clinics)
        return null;
    return Array.isArray(clinics) ? clinics[0] || null : clinics;
}
/**
 * Lista cadastros recentes de clínicas (CADMIN) do Hub e do Shift.
 * GET /admin/signups?product=all|hub|shift&limit=50
 */
const getRecentSignups = async (req, res) => {
    try {
        const requesterRole = req.user?.role?.toLowerCase();
        if (requesterRole !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        const productFilter = String(req.query.product || 'all').toLowerCase();
        const rawLimit = Number(req.query.limit);
        const limit = Number.isFinite(rawLimit)
            ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200)
            : 50;
        const { data, error } = await supabase_js_1.supabaseAdmin
            .from('clinic_users')
            .select(`
        id,
        user_id,
        clinic_id,
        role,
        status,
        name,
        email,
        phone,
        onboarding_state,
        created_at,
        clinics:clinic_id (
          id,
          name,
          email,
          cnpj,
          status,
          created_at
        )
      `)
            .eq('role', 'CADMIN')
            .order('created_at', { ascending: false })
            .limit(Math.min(limit * 3, 300));
        if (error) {
            console.error('[getRecentSignups]', error);
            return res.status(500).json({ error: 'Erro ao listar cadastros recentes' });
        }
        const rows = (data || []);
        const clinicIds = Array.from(new Set(rows
            .map((row) => row.clinic_id)
            .filter((id) => Boolean(id))));
        const hubClinicIds = new Set();
        if (clinicIds.length > 0) {
            const { data: subscriptions } = await supabase_js_1.supabaseAdmin
                .from('clinic_hub_subscriptions')
                .select('clinic_id')
                .in('clinic_id', clinicIds);
            for (const sub of subscriptions || []) {
                if (sub.clinic_id)
                    hubClinicIds.add(String(sub.clinic_id));
            }
        }
        const missingEmailUserIds = rows
            .filter((row) => !row.email)
            .map((row) => row.user_id);
        const authEmailByUserId = new Map();
        const authNameByUserId = new Map();
        await Promise.all(missingEmailUserIds.slice(0, 40).map(async (userId) => {
            try {
                const { data: authData } = await supabase_js_1.supabaseAdmin.auth.admin.getUserById(userId);
                const email = authData?.user?.email;
                if (email)
                    authEmailByUserId.set(userId, email);
                const meta = authData?.user?.user_metadata || {};
                const metaName = meta.full_name || meta.name;
                if (metaName)
                    authNameByUserId.set(userId, String(metaName));
            }
            catch {
                // ignora falha pontual de Auth
            }
        }));
        const signups = rows
            .map((row) => {
            const source = row.onboarding_state?.source;
            let product = normalizeProduct(source);
            // Convites de staff não são “novas contas” de produto
            if (String(source || '').toLowerCase() === 'hub_invitation') {
                return null;
            }
            // Heurística para contas antigas sem source explícito
            if (product === 'unknown') {
                if (row.clinic_id && hubClinicIds.has(row.clinic_id)) {
                    product = 'hub';
                }
                else if (row.clinic_id) {
                    // Clínica concluída sem assinatura Hub → fluxo legado do Shift
                    product = 'shift';
                }
                // pending_clinic sem source permanece unknown (evita misturar Hub/Shift)
            }
            const clinic = resolveClinic(row.clinics);
            const onboardingCompleted = Boolean(row.onboarding_state?.completed) || Boolean(row.clinic_id);
            return {
                id: row.id,
                user_id: row.user_id,
                product,
                name: row.name || authNameByUserId.get(row.user_id) || null,
                email: row.email || authEmailByUserId.get(row.user_id) || clinic?.email || null,
                phone: row.phone || null,
                status: row.status || 'unknown',
                onboarding_completed: onboardingCompleted,
                created_at: row.created_at,
                clinic: clinic
                    ? {
                        id: clinic.id,
                        name: clinic.name,
                        email: clinic.email,
                        cnpj: clinic.cnpj,
                        status: clinic.status,
                        created_at: clinic.created_at,
                    }
                    : null,
            };
        })
            .filter((item) => item !== null)
            .filter((item) => {
            if (productFilter === 'hub' || productFilter === 'shift') {
                return item.product === productFilter;
            }
            return true;
        })
            .slice(0, limit);
        return res.status(200).json({
            signups,
            count: signups.length,
            product: productFilter === 'hub' || productFilter === 'shift' ? productFilter : 'all',
        });
    }
    catch (error) {
        console.error('[getRecentSignups] unexpected', error);
        return res.status(500).json({
            error: error?.message || 'Erro inesperado ao listar cadastros',
        });
    }
};
exports.getRecentSignups = getRecentSignups;
