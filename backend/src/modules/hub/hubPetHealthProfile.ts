import { supabaseAdmin } from '../../config/supabase';

export const PROFILE_SOURCES = ['wizard', 'clinic', 'grooming', 'boarding', 'pets_form'] as const;
export type HubPetProfileSource = (typeof PROFILE_SOURCES)[number];

export const CLINICAL_FLAG_KEYS = ['allergy', 'cardiac', 'aggressive', 'diabetic', 'epileptic', 'other'] as const;
export type HubClinicalFlagKey = (typeof CLINICAL_FLAG_KEYS)[number];

export const CLINICAL_FLAG_LABELS: Record<HubClinicalFlagKey, string> = {
  allergy: 'Alergia',
  cardiac: 'Cardiopata',
  aggressive: 'Agressivo',
  diabetic: 'Diabético',
  epileptic: 'Epiléptico',
  other: 'Outro',
};

export const BEHAVIOR_TAG_LABELS: Record<string, string> = {
  agressivo_pessoas: 'Agressivo c/ pessoas',
  agressivo_animais: 'Agressivo c/ animais',
  morde: 'Morde',
  ansioso: 'Ansioso / nervoso',
  fugitivo: 'Fugitivo',
  sedacao: 'Precisa de sedação',
  def_visual: 'Deficiência visual',
  def_auditiva: 'Deficiência auditiva',
  idoso: 'Idoso (cuidado especial)',
  filhote: 'Filhote',
};

const FICHA_SOURCES = new Set<HubPetProfileSource>(['wizard', 'clinic', 'pets_form']);

export function isFichaSource(source: HubPetProfileSource): boolean {
  return FICHA_SOURCES.has(source);
}

export function resolveProfileSource(raw?: string | null): HubPetProfileSource {
  if (raw && (PROFILE_SOURCES as readonly string[]).includes(raw)) {
    return raw as HubPetProfileSource;
  }
  return 'pets_form';
}

export function resolveTagsMode(
  source: HubPetProfileSource,
  requested?: 'replace' | 'union' | null,
): 'replace' | 'union' {
  if (!isFichaSource(source)) return 'union';
  return requested ?? 'replace';
}

export function defaultFlagLabel(flagKey: string, label?: string | null): string {
  const trimmed = label?.trim();
  if (trimmed) return trimmed;
  return CLINICAL_FLAG_LABELS[flagKey as HubClinicalFlagKey] ?? flagKey;
}

export function behaviorTagDisplayLabel(tag: string): string {
  return BEHAVIOR_TAG_LABELS[tag] ?? tag;
}

function uniqTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

export function mergeBehaviorTags(
  current: string[] | null | undefined,
  incoming: string[] | null | undefined,
  mode: 'replace' | 'union',
): string[] {
  const cur = uniqTags(Array.isArray(current) ? current : []);
  const inc = uniqTags(Array.isArray(incoming) ? incoming : []);
  if (mode === 'union') {
    if (inc.length === 0) return cur;
    return uniqTags([...cur, ...inc]);
  }
  return inc;
}

export function resolveNeutered(
  current: boolean | null | undefined,
  incoming: boolean | null | undefined,
  source: HubPetProfileSource,
): { next: boolean | null; applied: boolean; conflict: boolean } {
  if (incoming === undefined) {
    return { next: current === true || current === false ? current : null, applied: false, conflict: false };
  }
  const cur = current === true || current === false ? current : null;

  if (isFichaSource(source)) {
    if (cur === incoming) return { next: cur, applied: false, conflict: false };
    return { next: incoming, applied: true, conflict: false };
  }

  if (cur === null) {
    if (incoming === null) return { next: null, applied: false, conflict: false };
    return { next: incoming, applied: true, conflict: false };
  }
  if (incoming === null || incoming === cur) {
    return { next: cur, applied: false, conflict: false };
  }
  return { next: cur, applied: false, conflict: true };
}

export async function insertProfileChange(row: {
  clinicId: string;
  petId: string;
  field: 'neutered' | 'behavior_tags' | 'clinical_flag';
  oldValue: unknown;
  newValue: unknown;
  source: HubPetProfileSource;
  actorUserId: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('hub_pet_profile_changes').insert({
    clinic_id: row.clinicId,
    pet_id: row.petId,
    field: row.field,
    old_value: row.oldValue,
    new_value: row.newValue,
    source: row.source,
    actor_user_id: row.actorUserId,
  });
  if (error) {
    console.error('[hub_pet_profile_changes] insert', error);
  }
}

type FlagRow = {
  id: string;
  flag_key: string;
  label: string;
  notes: string | null;
  active: boolean;
};

export async function applyClinicalFlagUpsert(opts: {
  clinicId: string;
  petId: string;
  flagKey: string;
  label: string;
  notes?: string | null;
  active?: boolean;
  source: HubPetProfileSource;
  actorUserId: string | null;
}): Promise<{ flag: Record<string, unknown>; created: boolean; noop: boolean }> {
  const label = defaultFlagLabel(opts.flagKey, opts.label);
  const notes = opts.notes ?? null;
  const wantActive = opts.active ?? true;
  const ficha = isFichaSource(opts.source);

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('hub_pet_clinical_flags')
    .select('id, flag_key, label, notes, active')
    .eq('pet_id', opts.petId)
    .eq('flag_key', opts.flagKey)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchErr) {
    throw new Error(fetchErr.message);
  }

  const current = existing as FlagRow | null;

  if (!current) {
    if (!wantActive) {
      return { flag: { flag_key: opts.flagKey, label, notes, active: false }, created: false, noop: true };
    }
    const { data, error } = await supabaseAdmin
      .from('hub_pet_clinical_flags')
      .insert({
        clinic_id: opts.clinicId,
        pet_id: opts.petId,
        flag_key: opts.flagKey,
        label,
        notes,
        active: true,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Erro ao criar alerta clínico');
    await insertProfileChange({
      clinicId: opts.clinicId,
      petId: opts.petId,
      field: 'clinical_flag',
      oldValue: null,
      newValue: { flag_key: opts.flagKey, label, notes, active: true },
      source: opts.source,
      actorUserId: opts.actorUserId,
    });
    return { flag: data as Record<string, unknown>, created: true, noop: false };
  }

  if (!ficha) {
    if (current.active) {
      return { flag: current as unknown as Record<string, unknown>, created: false, noop: true };
    }
    if (!wantActive) {
      return { flag: current as unknown as Record<string, unknown>, created: false, noop: true };
    }
    const { data, error } = await supabaseAdmin
      .from('hub_pet_clinical_flags')
      .update({ active: true, label, notes })
      .eq('id', current.id)
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Erro ao reativar alerta clínico');
    await insertProfileChange({
      clinicId: opts.clinicId,
      petId: opts.petId,
      field: 'clinical_flag',
      oldValue: { flag_key: current.flag_key, label: current.label, notes: current.notes, active: current.active },
      newValue: { flag_key: opts.flagKey, label, notes, active: true },
      source: opts.source,
      actorUserId: opts.actorUserId,
    });
    return { flag: data as Record<string, unknown>, created: false, noop: false };
  }

  const nextActive = wantActive;
  const nextLabel = label;
  const nextNotes = notes;
  const unchanged =
    current.active === nextActive && current.label === nextLabel && (current.notes ?? null) === nextNotes;
  if (unchanged) {
    return { flag: current as unknown as Record<string, unknown>, created: false, noop: true };
  }

  const { data, error } = await supabaseAdmin
    .from('hub_pet_clinical_flags')
    .update({ label: nextLabel, notes: nextNotes, active: nextActive })
    .eq('id', current.id)
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Erro ao atualizar alerta clínico');
  await insertProfileChange({
    clinicId: opts.clinicId,
    petId: opts.petId,
    field: 'clinical_flag',
    oldValue: { flag_key: current.flag_key, label: current.label, notes: current.notes, active: current.active },
    newValue: { flag_key: opts.flagKey, label: nextLabel, notes: nextNotes, active: nextActive },
    source: opts.source,
    actorUserId: opts.actorUserId,
  });
  return { flag: data as Record<string, unknown>, created: false, noop: false };
}

export async function syncClinicalFlags(opts: {
  clinicId: string;
  petId: string;
  incoming: Array<{ flag_key: string; label?: string; notes?: string | null }>;
  mode: 'replace' | 'union';
  source: HubPetProfileSource;
  actorUserId: string | null;
}): Promise<void> {
  const incomingKeys = new Set(opts.incoming.map((f) => f.flag_key));
  for (const item of opts.incoming) {
    await applyClinicalFlagUpsert({
      clinicId: opts.clinicId,
      petId: opts.petId,
      flagKey: item.flag_key,
      label: defaultFlagLabel(item.flag_key, item.label),
      notes: item.notes ?? null,
      active: true,
      source: opts.source,
      actorUserId: opts.actorUserId,
    });
  }

  if (opts.mode !== 'replace' || !isFichaSource(opts.source)) return;

  const { data: existing, error } = await supabaseAdmin
    .from('hub_pet_clinical_flags')
    .select('id, flag_key, label, notes, active')
    .eq('pet_id', opts.petId)
    .eq('clinic_id', opts.clinicId)
    .eq('active', true)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  for (const row of (existing ?? []) as FlagRow[]) {
    if (incomingKeys.has(row.flag_key)) continue;
    await applyClinicalFlagUpsert({
      clinicId: opts.clinicId,
      petId: opts.petId,
      flagKey: row.flag_key,
      label: row.label,
      notes: row.notes,
      active: false,
      source: opts.source,
      actorUserId: opts.actorUserId,
    });
  }
}
