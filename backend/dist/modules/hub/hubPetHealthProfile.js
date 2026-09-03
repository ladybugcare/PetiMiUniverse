"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BEHAVIOR_TAG_LABELS = exports.CLINICAL_FLAG_LABELS = exports.CLINICAL_FLAG_KEYS = exports.PROFILE_SOURCES = void 0;
exports.isFichaSource = isFichaSource;
exports.resolveProfileSource = resolveProfileSource;
exports.resolveTagsMode = resolveTagsMode;
exports.defaultFlagLabel = defaultFlagLabel;
exports.behaviorTagDisplayLabel = behaviorTagDisplayLabel;
exports.mergeBehaviorTags = mergeBehaviorTags;
exports.resolveNeutered = resolveNeutered;
exports.insertProfileChange = insertProfileChange;
exports.applyClinicalFlagUpsert = applyClinicalFlagUpsert;
exports.syncClinicalFlags = syncClinicalFlags;
const supabase_1 = require("../../config/supabase");
exports.PROFILE_SOURCES = ['wizard', 'clinic', 'grooming', 'boarding', 'pets_form'];
exports.CLINICAL_FLAG_KEYS = ['allergy', 'cardiac', 'aggressive', 'diabetic', 'epileptic', 'other'];
exports.CLINICAL_FLAG_LABELS = {
    allergy: 'Alergia',
    cardiac: 'Cardiopata',
    aggressive: 'Agressivo',
    diabetic: 'Diabético',
    epileptic: 'Epiléptico',
    other: 'Outro',
};
exports.BEHAVIOR_TAG_LABELS = {
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
const FICHA_SOURCES = new Set(['wizard', 'clinic', 'pets_form']);
function isFichaSource(source) {
    return FICHA_SOURCES.has(source);
}
function resolveProfileSource(raw) {
    if (raw && exports.PROFILE_SOURCES.includes(raw)) {
        return raw;
    }
    return 'pets_form';
}
function resolveTagsMode(source, requested) {
    if (!isFichaSource(source))
        return 'union';
    return requested ?? 'replace';
}
function defaultFlagLabel(flagKey, label) {
    const trimmed = label?.trim();
    if (trimmed)
        return trimmed;
    return exports.CLINICAL_FLAG_LABELS[flagKey] ?? flagKey;
}
function behaviorTagDisplayLabel(tag) {
    return exports.BEHAVIOR_TAG_LABELS[tag] ?? tag;
}
function uniqTags(tags) {
    const seen = new Set();
    const out = [];
    for (const raw of tags) {
        const t = raw.trim();
        if (!t || seen.has(t))
            continue;
        seen.add(t);
        out.push(t);
        if (out.length >= 20)
            break;
    }
    return out;
}
function mergeBehaviorTags(current, incoming, mode) {
    const cur = uniqTags(Array.isArray(current) ? current : []);
    const inc = uniqTags(Array.isArray(incoming) ? incoming : []);
    if (mode === 'union') {
        if (inc.length === 0)
            return cur;
        return uniqTags([...cur, ...inc]);
    }
    return inc;
}
function resolveNeutered(current, incoming, source) {
    if (incoming === undefined) {
        return { next: current === true || current === false ? current : null, applied: false, conflict: false };
    }
    const cur = current === true || current === false ? current : null;
    if (isFichaSource(source)) {
        if (cur === incoming)
            return { next: cur, applied: false, conflict: false };
        return { next: incoming, applied: true, conflict: false };
    }
    if (cur === null) {
        if (incoming === null)
            return { next: null, applied: false, conflict: false };
        return { next: incoming, applied: true, conflict: false };
    }
    if (incoming === null || incoming === cur) {
        return { next: cur, applied: false, conflict: false };
    }
    return { next: cur, applied: false, conflict: true };
}
async function insertProfileChange(row) {
    const { error } = await supabase_1.supabaseAdmin.from('hub_pet_profile_changes').insert({
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
async function applyClinicalFlagUpsert(opts) {
    const label = defaultFlagLabel(opts.flagKey, opts.label);
    const notes = opts.notes ?? null;
    const wantActive = opts.active ?? true;
    const ficha = isFichaSource(opts.source);
    const { data: existing, error: fetchErr } = await supabase_1.supabaseAdmin
        .from('hub_pet_clinical_flags')
        .select('id, flag_key, label, notes, active')
        .eq('pet_id', opts.petId)
        .eq('flag_key', opts.flagKey)
        .is('deleted_at', null)
        .maybeSingle();
    if (fetchErr) {
        throw new Error(fetchErr.message);
    }
    const current = existing;
    if (!current) {
        if (!wantActive) {
            return { flag: { flag_key: opts.flagKey, label, notes, active: false }, created: false, noop: true };
        }
        const { data, error } = await supabase_1.supabaseAdmin
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
        if (error || !data)
            throw new Error(error?.message || 'Erro ao criar alerta clínico');
        await insertProfileChange({
            clinicId: opts.clinicId,
            petId: opts.petId,
            field: 'clinical_flag',
            oldValue: null,
            newValue: { flag_key: opts.flagKey, label, notes, active: true },
            source: opts.source,
            actorUserId: opts.actorUserId,
        });
        return { flag: data, created: true, noop: false };
    }
    if (!ficha) {
        if (current.active) {
            return { flag: current, created: false, noop: true };
        }
        if (!wantActive) {
            return { flag: current, created: false, noop: true };
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_pet_clinical_flags')
            .update({ active: true, label, notes })
            .eq('id', current.id)
            .select('*')
            .single();
        if (error || !data)
            throw new Error(error?.message || 'Erro ao reativar alerta clínico');
        await insertProfileChange({
            clinicId: opts.clinicId,
            petId: opts.petId,
            field: 'clinical_flag',
            oldValue: { flag_key: current.flag_key, label: current.label, notes: current.notes, active: current.active },
            newValue: { flag_key: opts.flagKey, label, notes, active: true },
            source: opts.source,
            actorUserId: opts.actorUserId,
        });
        return { flag: data, created: false, noop: false };
    }
    const nextActive = wantActive;
    const nextLabel = label;
    const nextNotes = notes;
    const unchanged = current.active === nextActive && current.label === nextLabel && (current.notes ?? null) === nextNotes;
    if (unchanged) {
        return { flag: current, created: false, noop: true };
    }
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pet_clinical_flags')
        .update({ label: nextLabel, notes: nextNotes, active: nextActive })
        .eq('id', current.id)
        .select('*')
        .single();
    if (error || !data)
        throw new Error(error?.message || 'Erro ao atualizar alerta clínico');
    await insertProfileChange({
        clinicId: opts.clinicId,
        petId: opts.petId,
        field: 'clinical_flag',
        oldValue: { flag_key: current.flag_key, label: current.label, notes: current.notes, active: current.active },
        newValue: { flag_key: opts.flagKey, label: nextLabel, notes: nextNotes, active: nextActive },
        source: opts.source,
        actorUserId: opts.actorUserId,
    });
    return { flag: data, created: false, noop: false };
}
async function syncClinicalFlags(opts) {
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
    if (opts.mode !== 'replace' || !isFichaSource(opts.source))
        return;
    const { data: existing, error } = await supabase_1.supabaseAdmin
        .from('hub_pet_clinical_flags')
        .select('id, flag_key, label, notes, active')
        .eq('pet_id', opts.petId)
        .eq('clinic_id', opts.clinicId)
        .eq('active', true)
        .is('deleted_at', null);
    if (error)
        throw new Error(error.message);
    for (const row of (existing ?? [])) {
        if (incomingKeys.has(row.flag_key))
            continue;
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
