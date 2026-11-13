/**
 * Preferências de notificações in-app do Hub (Meu perfil).
 *
 * Categorias de produto → tipos emitidos por hubNotifyEvents.
 * Opt-out: ausência de linha em hub_notification_prefs = ligado.
 */
import { supabaseAdmin } from '../../config/supabase';
import type { HubStaffNotificationType } from './hubNotifyStaff';

export const HUB_NOTIFICATION_PREF_CATEGORIES = ['acoes', 'operacao', 'alertas'] as const;
export type HubNotificationPrefCategory = (typeof HUB_NOTIFICATION_PREF_CATEGORIES)[number];

export type HubNotificationPrefsMap = Record<HubNotificationPrefCategory, boolean>;

const TYPE_TO_CATEGORY: Record<HubStaffNotificationType, HubNotificationPrefCategory> = {
  hub_grooming_extra_request: 'acoes',
  hub_cancellation_pending: 'acoes',
  hub_payment_due: 'acoes',
  hub_pet_ready: 'operacao',
  hub_pet_on_the_way: 'operacao',
  hub_pet_arrived: 'operacao',
  hub_boarding_checkin: 'operacao',
  hub_boarding_checkout: 'operacao',
  hub_stock_alert: 'alertas',
};

export function hubNotificationCategoryForType(
  type: HubStaffNotificationType,
): HubNotificationPrefCategory {
  return TYPE_TO_CATEGORY[type];
}

export function defaultHubNotificationPrefs(): HubNotificationPrefsMap {
  return { acoes: true, operacao: true, alertas: true };
}

export function isHubNotificationPrefCategory(value: unknown): value is HubNotificationPrefCategory {
  return (
    typeof value === 'string' &&
    (HUB_NOTIFICATION_PREF_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Filtra destinatários que desligaram a categoria do tipo.
 * Sem linha / falha de leitura = mantém o usuário (opt-out seguro).
 */
export function filterTargetsByPrefOptOut(
  targets: readonly string[],
  category: HubNotificationPrefCategory,
  disabledUserIds: ReadonlySet<string>,
): string[] {
  if (!targets.length || disabledUserIds.size === 0) return [...targets];
  return targets.filter((userId) => !disabledUserIds.has(userId));
}

/** Carrega user_ids com a categoria explicitamente desligada nesta clínica. */
export async function loadDisabledPrefUserIds(
  clinicId: string,
  category: HubNotificationPrefCategory,
  userIds: readonly string[],
): Promise<Set<string>> {
  const unique = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!clinicId || !unique.length) return new Set();

  const { data, error } = await supabaseAdmin
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

export async function getHubNotificationPrefsForUser(
  userId: string,
  clinicId: string,
): Promise<HubNotificationPrefsMap> {
  const prefs = defaultHubNotificationPrefs();
  if (!userId || !clinicId) return prefs;

  const { data, error } = await supabaseAdmin
    .from('hub_notification_prefs')
    .select('category, enabled')
    .eq('user_id', userId)
    .eq('clinic_id', clinicId);

  if (error) throw error;

  for (const row of data ?? []) {
    if (!isHubNotificationPrefCategory(row.category)) continue;
    prefs[row.category] = row.enabled !== false;
  }
  return prefs;
}

export async function upsertHubNotificationPrefs(
  userId: string,
  clinicId: string,
  categories: HubNotificationPrefsMap,
): Promise<HubNotificationPrefsMap> {
  const rows = HUB_NOTIFICATION_PREF_CATEGORIES.map((category) => ({
    user_id: userId,
    clinic_id: clinicId,
    category,
    enabled: categories[category] !== false,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin.from('hub_notification_prefs').upsert(rows, {
    onConflict: 'user_id,clinic_id,category',
  });
  if (error) throw error;

  return {
    acoes: categories.acoes !== false,
    operacao: categories.operacao !== false,
    alertas: categories.alertas !== false,
  };
}

/** Confirma que o usuário autenticado pertence à clínica (clinic_users ativo). */
export async function userBelongsToClinic(userId: string, clinicId: string): Promise<boolean> {
  if (!userId || !clinicId) return false;
  const { data, error } = await supabaseAdmin
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
