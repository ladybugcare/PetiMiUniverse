"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HUB_NOTIFICATION_PREF_CATEGORIES = void 0;
exports.hubNotificationCategoryForType = hubNotificationCategoryForType;
exports.defaultHubNotificationPrefs = defaultHubNotificationPrefs;
exports.isHubNotificationPrefCategory = isHubNotificationPrefCategory;
exports.filterTargetsByPrefOptOut = filterTargetsByPrefOptOut;
exports.loadDisabledPrefUserIds = loadDisabledPrefUserIds;
exports.getHubNotificationPrefsForUser = getHubNotificationPrefsForUser;
exports.upsertHubNotificationPrefs = upsertHubNotificationPrefs;
exports.userBelongsToClinic = userBelongsToClinic;
/**
 * Preferências de notificações in-app do Hub (Meu perfil).
 *
 * Categorias de produto → tipos emitidos por hubNotifyEvents.
 * Opt-out: ausência de linha em hub_notification_prefs = ligado.
 */
const supabase_1 = require("../../config/supabase");
exports.HUB_NOTIFICATION_PREF_CATEGORIES = ['acoes', 'operacao', 'alertas'];
const TYPE_TO_CATEGORY = {
    hub_grooming_extra_request: 'acoes',
    hub_cancellation_pending: 'acoes',
    hub_payment_due: 'acoes',
    hub_pet_ready: 'operacao',
    hub_pet_on_the_way: 'operacao',
    hub_pet_arrived: 'operacao',
    hub_boarding_checkin: 'operacao',
    hub_boarding_checkout: 'operacao',
    hub_stock_alert: 'alertas',
    hub_series_ending_soon: 'alertas',
};
function hubNotificationCategoryForType(type) {
    return TYPE_TO_CATEGORY[type];
}
function defaultHubNotificationPrefs() {
    return { acoes: true, operacao: true, alertas: true };
}
function isHubNotificationPrefCategory(value) {
    return (typeof value === 'string' &&
        exports.HUB_NOTIFICATION_PREF_CATEGORIES.includes(value));
}
/**
 * Filtra destinatários que desligaram a categoria do tipo.
 * Sem linha / falha de leitura = mantém o usuário (opt-out seguro).
 */
function filterTargetsByPrefOptOut(targets, category, disabledUserIds) {
    if (!targets.length || disabledUserIds.size === 0)
        return [...targets];
    return targets.filter((userId) => !disabledUserIds.has(userId));
}
/** Carrega user_ids com a categoria explicitamente desligada nesta clínica. */
async function loadDisabledPrefUserIds(clinicId, category, userIds) {
    const unique = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))];
    if (!clinicId || !unique.length)
        return new Set();
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_notification_prefs')
        .select('user_id')
        .eq('clinic_id', clinicId)
        .eq('category', category)
        .eq('enabled', false)
        .in('user_id', unique);
    if (error) {
        console.error('loadDisabledPrefUserIds', category, error);
        return new Set();
    }
    return new Set((data ?? []).map((row) => String(row.user_id)).filter(Boolean));
}
async function getHubNotificationPrefsForUser(userId, clinicId) {
    const prefs = defaultHubNotificationPrefs();
    if (!userId || !clinicId)
        return prefs;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_notification_prefs')
        .select('category, enabled')
        .eq('user_id', userId)
        .eq('clinic_id', clinicId);
    if (error)
        throw error;
    for (const row of data ?? []) {
        if (!isHubNotificationPrefCategory(row.category))
            continue;
        prefs[row.category] = row.enabled !== false;
    }
    return prefs;
}
async function upsertHubNotificationPrefs(userId, clinicId, categories) {
    const rows = exports.HUB_NOTIFICATION_PREF_CATEGORIES.map((category) => ({
        user_id: userId,
        clinic_id: clinicId,
        category,
        enabled: categories[category] !== false,
        updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase_1.supabaseAdmin.from('hub_notification_prefs').upsert(rows, {
        onConflict: 'user_id,clinic_id,category',
    });
    if (error)
        throw error;
    return {
        acoes: categories.acoes !== false,
        operacao: categories.operacao !== false,
        alertas: categories.alertas !== false,
    };
}
/** Confirma que o usuário autenticado pertence à clínica (clinic_users ativo). */
async function userBelongsToClinic(userId, clinicId) {
    if (!userId || !clinicId)
        return false;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('clinic_users')
        .select('id')
        .eq('user_id', userId)
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .maybeSingle();
    if (error) {
        console.error('userBelongsToClinic', error);
        return false;
    }
    return Boolean(data?.id);
}
