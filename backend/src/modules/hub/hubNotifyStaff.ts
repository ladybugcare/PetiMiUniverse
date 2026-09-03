/**
 * Notificações operacionais internas do Hub direcionadas por área operacional / papel.
 *
 * Reusa a tabela `notifications` e o helper `createNotification` do sistema Vet:
 * aqui só resolvemos **quem** deve receber cada aviso, evitando broadcast para
 * toda a unidade.
 */
import { supabaseAdmin } from '../../config/supabase';
import { createNotification } from '../../controllers/notificationsController';
import { sanitizeOperationalAreas, type HubOperationalArea } from '../../utils/operationalAreas';

/** Tipos de notificação interna do Hub (equipe, nunca o tutor). */
export type HubStaffNotificationType =
  | 'hub_pet_ready'
  | 'hub_pet_on_the_way'
  | 'hub_payment_due'
  | 'hub_cancellation_pending'
  | 'hub_stock_alert'
  | 'hub_boarding_checkin'
  | 'hub_boarding_checkout';

/** Papéis de governança que acompanham tudo que é crítico na unidade. */
export const HUB_MANAGER_ROLES = ['CADMIN', 'CMANAGER'] as const;

/**
 * Papéis que equivalem a áreas operacionais mesmo sem marcação na Equipe.
 * Ex.: CFINANCE recebe o que o financeiro e o caixa recebem.
 */
const ROLE_IMPLICIT_AREAS: Record<string, readonly HubOperationalArea[]> = {
  CFINANCE: ['financeiro', 'caixa'],
  CASSISTANT: ['recepcao'],
};

export type HubNotifyCandidate = {
  user_id: string | null | undefined;
  role?: string | null;
  operational_areas?: string[] | null;
};

export type HubNotifyTargetFilter = {
  /** Recebe quem tiver ao menos uma destas áreas. */
  areas?: readonly HubOperationalArea[];
  /** Recebe quem tiver um destes papéis. */
  roles?: readonly string[];
  /** Inclui CADMIN / CMANAGER da unidade (default true — eventos críticos). */
  includeManagers?: boolean;
  /** Não notificar quem disparou o evento. */
  excludeUserIds?: readonly string[];
};

function normalizeRole(role: string | null | undefined): string {
  return String(role ?? '').trim().toUpperCase();
}

/**
 * Resolve os `user_id` que devem receber o aviso (papel OU interseção de áreas),
 * já sem duplicados. Função pura para permitir teste sem banco.
 */
export function resolveNotificationTargets(
  candidates: readonly HubNotifyCandidate[],
  filter: HubNotifyTargetFilter,
): string[] {
  const wantedAreas = new Set<string>(filter.areas ?? []);
  const wantedRoles = new Set<string>((filter.roles ?? []).map(normalizeRole));
  const includeManagers = filter.includeManagers !== false;
  const excluded = new Set<string>(filter.excludeUserIds ?? []);

  const out: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const userId = String(candidate.user_id ?? '').trim();
    if (!userId || seen.has(userId) || excluded.has(userId)) continue;

    const role = normalizeRole(candidate.role);
    const areas = new Set<string>([
      ...sanitizeOperationalAreas(candidate.operational_areas ?? []),
      ...(ROLE_IMPLICIT_AREAS[role] ?? []),
    ]);

    const byRole = wantedRoles.has(role);
    const byArea = [...wantedAreas].some((area) => areas.has(area));
    const byManager = includeManagers && (HUB_MANAGER_ROLES as readonly string[]).includes(role);

    if (!byRole && !byArea && !byManager) continue;

    seen.add(userId);
    out.push(userId);
  }

  return out;
}

/** Carrega a equipe com acesso ao Hub (opcionalmente escopada à unidade do evento). */
async function fetchHubStaffCandidates(
  clinicId: string,
  unitId?: string | null,
): Promise<HubNotifyCandidate[]> {
  let staffQuery = supabaseAdmin
    .from('hub_staff_members')
    .select('clinic_user_id')
    .eq('clinic_id', clinicId)
    .eq('has_hub_access', true)
    .eq('active', true)
    .not('clinic_user_id', 'is', null)
    .is('deleted_at', null);

  // Quem não tem unidade padrão atende a clínica toda — segue recebendo.
  if (unitId) {
    staffQuery = staffQuery.or(`default_unit_id.eq.${unitId},default_unit_id.is.null`);
  }

  const { data: staff, error: staffErr } = await staffQuery;
  if (staffErr) throw staffErr;

  const clinicUserIds = [
    ...new Set((staff ?? []).map((s) => s.clinic_user_id as string).filter(Boolean)),
  ];
  if (!clinicUserIds.length) return [];

  const { data: clinicUsers, error: cuErr } = await supabaseAdmin
    .from('clinic_users')
    .select('user_id, role, operational_areas')
    .in('id', clinicUserIds)
    .eq('status', 'active');
  if (cuErr) throw cuErr;

  return (clinicUsers ?? []) as HubNotifyCandidate[];
}

export type HubNotifyStaffOptions = HubNotifyTargetFilter & {
  clinicId: string;
  unitId?: string | null;
  type: HubStaffNotificationType;
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
};

/**
 * Notifica a equipe do Hub conforme área operacional / papel.
 * Nunca lança: falha de notificação não deve quebrar o fluxo de negócio.
 *
 * @returns quantidade de notificações criadas.
 */
export async function hubNotifyStaff(opts: HubNotifyStaffOptions): Promise<number> {
  try {
    if (!opts.clinicId) return 0;

    const candidates = await fetchHubStaffCandidates(opts.clinicId, opts.unitId);
    const targets = resolveNotificationTargets(candidates, {
      areas: opts.areas,
      roles: opts.roles,
      includeManagers: opts.includeManagers,
      excludeUserIds: opts.excludeUserIds,
    });
    if (!targets.length) return 0;

    await Promise.all(
      targets.map((userId) =>
        createNotification({
          user_id: userId,
          type: opts.type,
          title: opts.title,
          message: opts.message,
          link: opts.link,
          entity_type: opts.entityType,
          entity_id: opts.entityId,
        }),
      ),
    );
    return targets.length;
  } catch (e) {
    console.error('hubNotifyStaff', opts.type, e);
    return 0;
  }
}
