import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

export const careLocationKindSchema = z.enum(['own_unit', 'partner_clinic']);
export type CareLocationKind = z.infer<typeof careLocationKindSchema>;

export type ResolvedCareLocation = {
  care_location_kind: CareLocationKind;
  hub_partner_clinic_id: string | null;
  unit_id: string | null;
};

/** Campos opcionais de local de atendimento em create/patch. */
export const careLocationBodyFields = {
  care_location_kind: careLocationKindSchema.optional(),
  hub_partner_clinic_id: z.string().uuid().optional().nullable(),
};

export async function assertPartnerClinicInClinic(
  clinicId: string,
  partnerClinicId: string,
  opts?: { requireActive?: boolean },
): Promise<{ id: string; name: string; is_active: boolean } | null> {
  let q = supabaseAdmin
    .from('hub_partner_clinics')
    .select('id, name, is_active')
    .eq('id', partnerClinicId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null);

  if (opts?.requireActive !== false) {
    q = q.eq('is_active', true);
  }

  const { data } = await q.maybeSingle();
  return data as { id: string; name: string; is_active: boolean } | null;
}

/**
 * Resolve e valida care_location.
 * - own_unit: partner null; unit_id deve existir (exceto allowNullUnit).
 * - partner_clinic: partner obrigatório no tenant; unit_id pode ser origem administrativa (nullable).
 */
export async function resolveCareLocation(params: {
  clinicId: string;
  care_location_kind?: CareLocationKind | null;
  hub_partner_clinic_id?: string | null;
  /** unit_id efetivo já resolvido pelo caller (ou null). */
  unit_id: string | null;
  existing?: {
    care_location_kind?: CareLocationKind | null;
    hub_partner_clinic_id?: string | null;
  };
  allowNullUnit?: boolean;
  requireActivePartner?: boolean;
}): Promise<{ ok: true; value: ResolvedCareLocation } | { ok: false; error: string }> {
  const kind: CareLocationKind =
    params.care_location_kind ??
    params.existing?.care_location_kind ??
    'own_unit';

  const partnerId =
    params.hub_partner_clinic_id !== undefined
      ? params.hub_partner_clinic_id
      : (params.existing?.hub_partner_clinic_id ?? null);

  const unitId = params.unit_id;

  if (kind === 'own_unit') {
    if (partnerId) {
      return { ok: false, error: 'Unidade própria não deve ter clínica parceira associada.' };
    }
    if (!unitId && !params.allowNullUnit) {
      return { ok: false, error: 'Informe a unidade própria do atendimento.' };
    }
    return {
      ok: true,
      value: {
        care_location_kind: 'own_unit',
        hub_partner_clinic_id: null,
        unit_id: unitId,
      },
    };
  }

  if (!partnerId) {
    return { ok: false, error: 'Selecione a clínica parceira.' };
  }

  const partner = await assertPartnerClinicInClinic(params.clinicId, partnerId, {
    requireActive: params.requireActivePartner !== false,
  });
  if (!partner) {
    return { ok: false, error: 'Clínica parceira inválida ou inativa.' };
  }

  return {
    ok: true,
    value: {
      care_location_kind: 'partner_clinic',
      hub_partner_clinic_id: partnerId,
      unit_id: unitId,
    },
  };
}

export async function loadPartnerClinicMap(
  clinicId: string,
  partnerIds: string[],
): Promise<Map<string, { id: string; name: string }>> {
  const unique = [...new Set(partnerIds.filter(Boolean))];
  const map = new Map<string, { id: string; name: string }>();
  if (unique.length === 0) return map;
  const { data } = await supabaseAdmin
    .from('hub_partner_clinics')
    .select('id, name')
    .eq('clinic_id', clinicId)
    .in('id', unique);
  for (const row of data ?? []) {
    const r = row as { id: string; name: string };
    map.set(r.id, r);
  }
  return map;
}
