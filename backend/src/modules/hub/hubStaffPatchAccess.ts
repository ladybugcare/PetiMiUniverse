import { PlanEntitlementError, ValidationError } from '../../utils/errors.js';
import { assertAccessAllowsMutation, loadEntitlements } from './hubEntitlements.js';

/**
 * Campos operacionais: full + soft_lock; bloqueados em read_history.
 * `email` = contato do profissional (auth/convite usam hub_access_email).
 * `service_type_ids` = serviços que o profissional executa (não concede login Hub).
 */
export const STAFF_PATCH_OPS_FIELDS = new Set([
  'full_name',
  'display_name',
  'photo_url',
  'phone',
  'whatsapp_phone',
  'email',
  'birth_date',
  'job_title',
  'professional_kind',
  'specialties',
  'crmv',
  'crmv_uf',
  'internal_notes',
  'accepts_appointments',
  'available_days',
  'work_hours',
  'break_minutes',
  'agenda_color',
  'service_type_ids',
]);

/**
 * Catálogo / capacidade / acesso: somente full.
 * `default_unit_id` altera escopo de convite e notificações → tratado como capacidade.
 */
export const STAFF_PATCH_CATALOG_FIELDS = new Set([
  'has_hub_access',
  'hub_access_email',
  'hub_access_role',
  'operational_areas',
  'active',
  'affiliation',
  'default_unit_id',
]);

/** Metadado obrigatório — não classifica acesso. */
const STAFF_PATCH_META_FIELDS = new Set(['clinic_id']);

export type StaffPatchFieldKind = 'ops' | 'catalog' | 'meta' | 'unknown';

export function classifyStaffPatchField(field: string): StaffPatchFieldKind {
  if (STAFF_PATCH_META_FIELDS.has(field)) return 'meta';
  if (STAFF_PATCH_OPS_FIELDS.has(field)) return 'ops';
  if (STAFF_PATCH_CATALOG_FIELDS.has(field)) return 'catalog';
  return 'unknown';
}

export type StaffPatchAccessClass = {
  opsFields: string[];
  catalogFields: string[];
  unknownFields: string[];
  /** true se exige access_mode full (qualquer campo catálogo). */
  requiresFullAccess: boolean;
};

export function classifyStaffPatchBody(body: Record<string, unknown>): StaffPatchAccessClass {
  const opsFields: string[] = [];
  const catalogFields: string[] = [];
  const unknownFields: string[] = [];

  for (const key of Object.keys(body)) {
    const kind = classifyStaffPatchField(key);
    if (kind === 'meta') continue;
    if (kind === 'ops') opsFields.push(key);
    else if (kind === 'catalog') catalogFields.push(key);
    else unknownFields.push(key);
  }

  return {
    opsFields,
    catalogFields,
    unknownFields,
    requiresFullAccess: catalogFields.length > 0,
  };
}

/**
 * Enforce soft-lock no PATCH de staff.
 * - Campos desconhecidos → VALIDATION_ERROR
 * - Qualquer catálogo → somente full
 * - Só ops → full ou soft_lock
 * - read_history → sempre bloqueia mutação
 */
export async function assertStaffPatchAllowedByAccessMode(
  clinicId: string,
  body: Record<string, unknown>,
): Promise<StaffPatchAccessClass> {
  const classified = classifyStaffPatchBody(body);

  if (classified.unknownFields.length > 0) {
    throw new ValidationError(
      `Campos não permitidos no PATCH de equipe: ${classified.unknownFields.join(', ')}`,
      { fields: classified.unknownFields },
    );
  }

  const hasMutation = classified.opsFields.length > 0 || classified.catalogFields.length > 0;
  if (!hasMutation) {
    return classified;
  }

  const snap = await loadEntitlements(clinicId);

  if (classified.requiresFullAccess) {
    assertAccessAllowsMutation(snap, {});
  } else {
    assertAccessAllowsMutation(snap, { allowSoftLockWrite: true });
  }

  return classified;
}
