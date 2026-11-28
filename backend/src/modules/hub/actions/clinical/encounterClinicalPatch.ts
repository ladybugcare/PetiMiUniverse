import { supabaseAdmin } from '../../../../config/supabase';

export type ClinicalSoapPatch = {
  chief_complaint?: string | null;
  anamnesis?: Record<string, unknown>;
  physical_exam?: Record<string, unknown>;
};

export type ApplyClinicalPatchResult =
  | {
      ok: true;
      encounterId: string;
      petId: string | null;
      status: string;
      anamnesis: Record<string, unknown>;
      physical_exam: Record<string, unknown>;
      chief_complaint: string | null;
    }
  | { ok: false; status: 'not_found' | 'invalid_state' | 'error'; message: string };

function mergeJson(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const base = existing && typeof existing === 'object' ? { ...existing } : {};
  if (!patch) return base;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    // Não sobrescreve com null/undefined silenciosamente campos existentes a menos que explícito
    if (v === null && base[k] !== undefined) continue;
    if (Array.isArray(v)) {
      const prev = Array.isArray(base[k]) ? (base[k] as unknown[]) : [];
      base[k] = [...new Set([...prev.map(String), ...v.map(String)])];
      continue;
    }
    base[k] = v;
  }
  return base;
}

/** Aplica patch SOAP em encounter aberto — mesma persistência do Hub (merge JSONB). */
export async function applyEncounterClinicalPatch(opts: {
  clinicId: string;
  encounterId: string;
  patch: ClinicalSoapPatch;
  actorUserId?: string | null;
  source?: string;
}): Promise<ApplyClinicalPatchResult> {
  const { data: existing, error } = await supabaseAdmin
    .from('hub_encounters')
    .select('id, pet_id, status, anamnesis, physical_exam, chief_complaint, unit_id')
    .eq('id', opts.encounterId)
    .eq('clinic_id', opts.clinicId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { ok: false, status: 'error', message: error.message };
  if (!existing) return { ok: false, status: 'not_found', message: 'Atendimento não encontrado' };

  const status = String(existing.status || '');
  if (status === 'completed' || status === 'cancelled') {
    return {
      ok: false,
      status: 'invalid_state',
      message: 'Não é permitido alterar atendimento finalizado ou cancelado por esta integração.',
    };
  }
  if (status !== 'waiting' && status !== 'in_progress') {
    return {
      ok: false,
      status: 'invalid_state',
      message: `Atendimento em status ${status} não aceita este patch.`,
    };
  }

  const nextAnamnesis = mergeJson(
    existing.anamnesis as Record<string, unknown> | null,
    opts.patch.anamnesis,
  );
  const nextExam = mergeJson(
    existing.physical_exam as Record<string, unknown> | null,
    opts.patch.physical_exam,
  );

  const update: Record<string, unknown> = {
    anamnesis: nextAnamnesis,
    physical_exam: nextExam,
    updated_at: new Date().toISOString(),
  };
  if (opts.patch.chief_complaint !== undefined && opts.patch.chief_complaint !== null) {
    update.chief_complaint = opts.patch.chief_complaint;
  }

  const { data: updated, error: upErr } = await supabaseAdmin
    .from('hub_encounters')
    .update(update)
    .eq('id', opts.encounterId)
    .eq('clinic_id', opts.clinicId)
    .is('deleted_at', null)
    .select('id, pet_id, status, anamnesis, physical_exam, chief_complaint')
    .maybeSingle();

  if (upErr) return { ok: false, status: 'error', message: upErr.message };
  if (!updated) return { ok: false, status: 'not_found', message: 'Atendimento não encontrado' };

  return {
    ok: true,
    encounterId: updated.id as string,
    petId: (updated.pet_id as string | null) ?? null,
    status: String(updated.status),
    anamnesis: (updated.anamnesis as Record<string, unknown>) ?? {},
    physical_exam: (updated.physical_exam as Record<string, unknown>) ?? {},
    chief_complaint: (updated.chief_complaint as string | null) ?? null,
  };
}

export async function findOpenEncounterByPetName(opts: {
  clinicId: string;
  unitId: string;
  petName: string;
}): Promise<
  | { kind: 'one'; encounterId: string; petId: string; petName: string; status: string }
  | { kind: 'homonyms'; pets: Array<{ petId: string; petName: string; encounterId: string }> }
  | { kind: 'none' }
  | { kind: 'error'; message: string }
> {
  const { normalizePetName } = await import('../../voice/normalizePetName');
  const normalized = normalizePetName(opts.petName);

  const { data: pets, error: petErr } = await supabaseAdmin
    .from('hub_pets')
    .select('id, name')
    .eq('clinic_id', opts.clinicId)
    .is('deleted_at', null)
    .limit(200);
  if (petErr) return { kind: 'error', message: petErr.message };

  const matchedPets = (pets ?? []).filter(
    (p) => normalizePetName(String((p as { name: string }).name || '')) === normalized,
  );
  if (matchedPets.length === 0) return { kind: 'none' };

  const results: Array<{ petId: string; petName: string; encounterId: string; status: string }> = [];
  for (const p of matchedPets) {
    const petId = (p as { id: string }).id;
    const petName = String((p as { name: string }).name || '');
    const { data: enc, error } = await supabaseAdmin
      .from('hub_encounters')
      .select('id, status, unit_id')
      .eq('clinic_id', opts.clinicId)
      .eq('pet_id', petId)
      .in('status', ['waiting', 'in_progress'])
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(5);
    if (error) return { kind: 'error', message: error.message };
    const inUnit = (enc ?? []).filter(
      (e) => !e.unit_id || e.unit_id === opts.unitId,
    );
    if (inUnit[0]) {
      results.push({
        petId,
        petName,
        encounterId: inUnit[0].id as string,
        status: String(inUnit[0].status),
      });
    }
  }

  if (results.length === 0) return { kind: 'none' };
  if (results.length > 1) {
    return {
      kind: 'homonyms',
      pets: results.map((r) => ({
        petId: r.petId,
        petName: r.petName,
        encounterId: r.encounterId,
      })),
    };
  }
  const one = results[0]!;
  return {
    kind: 'one',
    encounterId: one.encounterId,
    petId: one.petId,
    petName: one.petName,
    status: one.status,
  };
}
