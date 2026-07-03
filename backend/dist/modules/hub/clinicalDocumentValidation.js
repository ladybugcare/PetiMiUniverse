"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedOne = embedOne;
exports.generatePublicToken = generatePublicToken;
exports.generatePrefixedValidationCode = generatePrefixedValidationCode;
exports.canonicalizeSnapshot = canonicalizeSnapshot;
exports.computeSnapshotHash = computeSnapshotHash;
exports.truncateContentHash = truncateContentHash;
exports.maskPublicToken = maskPublicToken;
exports.computeDocumentStatus = computeDocumentStatus;
exports.addDaysIso = addDaysIso;
exports.resolveHubWebBaseUrl = resolveHubWebBaseUrl;
exports.resolveClinicalPublicUrl = resolveClinicalPublicUrl;
exports.resolveValidityDays = resolveValidityDays;
exports.generateUniqueCode = generateUniqueCode;
exports.generateUniquePublicToken = generateUniquePublicToken;
exports.recordClinicalDocumentEvent = recordClinicalDocumentEvent;
exports.resolveEncounterGuardianId = resolveEncounterGuardianId;
exports.loadEncounterIssueParties = loadEncounterIssueParties;
exports.fetchClinicJsonDefaults = fetchClinicJsonDefaults;
const node_crypto_1 = require("node:crypto");
const supabase_1 = require("../../config/supabase");
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function embedOne(x) {
    if (x == null)
        return null;
    return Array.isArray(x) ? (x[0] ?? null) : x;
}
function generatePublicToken() {
    return (0, node_crypto_1.randomBytes)(24).toString('base64url');
}
function generatePrefixedValidationCode(prefix) {
    const part = () => Array.from({ length: 4 }, () => CROCKFORD[(0, node_crypto_1.randomBytes)(1)[0] % CROCKFORD.length]).join('');
    return `${prefix}-${part()}-${part()}`;
}
function sortObjectKeys(value) {
    if (value == null || typeof value !== 'object')
        return value;
    if (Array.isArray(value))
        return value.map(sortObjectKeys);
    const obj = value;
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortObjectKeys(obj[key]);
    }
    return sorted;
}
function canonicalizeSnapshot(snapshot) {
    return JSON.stringify(sortObjectKeys(snapshot));
}
function computeSnapshotHash(snapshot) {
    return (0, node_crypto_1.createHash)('sha256').update(canonicalizeSnapshot(snapshot)).digest('hex');
}
function truncateContentHash(hash, edge = 8) {
    if (hash.length <= edge * 2 + 1)
        return hash;
    return `${hash.slice(0, edge)}…${hash.slice(-edge)}`;
}
function maskPublicToken(token) {
    if (token.length <= 10)
        return '***';
    return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
function computeDocumentStatus(doc) {
    if (doc.revoked_at)
        return 'revoked';
    if (doc.expires_at && new Date(doc.expires_at).getTime() < Date.now())
        return 'expired';
    return 'valid';
}
function addDaysIso(iso, days) {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString();
}
function resolveHubWebBaseUrl() {
    return (process.env.HUB_WEB_URL?.trim() ||
        process.env.VITE_HUB_WEB_URL?.trim() ||
        process.env.FRONTEND_URL?.trim() ||
        'http://localhost:3002').replace(/\/$/, '');
}
function resolveClinicalPublicUrl(pathSegment, publicToken) {
    return `${resolveHubWebBaseUrl()}${pathSegment}${publicToken}`;
}
function resolveValidityDays(defaults, fallback = 30) {
    const raw = defaults?.validity_days;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 365)
        return Math.floor(n);
    return fallback;
}
const CODE_RETRY_MAX = 8;
async function generateUniqueCode(prefix, table, column = 'validation_code') {
    for (let i = 0; i < CODE_RETRY_MAX; i++) {
        const code = generatePrefixedValidationCode(prefix);
        const { data } = await supabase_1.supabaseAdmin.from(table).select('id').eq(column, code).maybeSingle();
        if (!data)
            return code;
    }
    throw new Error('Não foi possível gerar código de validação único');
}
async function generateUniquePublicToken(table, column = 'public_token') {
    for (let i = 0; i < CODE_RETRY_MAX; i++) {
        const token = generatePublicToken();
        const { data } = await supabase_1.supabaseAdmin.from(table).select('id').eq(column, token).maybeSingle();
        if (!data)
            return token;
    }
    throw new Error('Não foi possível gerar token público único');
}
async function recordClinicalDocumentEvent(opts) {
    try {
        await supabase_1.supabaseAdmin.from(opts.table).insert({
            clinic_id: opts.clinic_id,
            document_id: opts.document_id,
            event_type: opts.event_type,
            actor_user_id: opts.actor_user_id ?? null,
            actor_ip: opts.actor_ip ?? null,
            actor_user_agent: opts.actor_user_agent ?? null,
            metadata: opts.metadata ?? {},
        });
    }
    catch (e) {
        console.error(`[${opts.table}]`, e);
    }
}
async function resolveEncounterGuardianId(encounterId, petId) {
    if (encounterId) {
        const { data: enc } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select('guardian_id')
            .eq('id', encounterId)
            .maybeSingle();
        if (enc?.guardian_id)
            return enc.guardian_id;
    }
    const { data: pgRow } = await supabase_1.supabaseAdmin
        .from('hub_pet_guardians')
        .select('guardian_id')
        .eq('pet_id', petId)
        .order('role', { ascending: true })
        .limit(1)
        .maybeSingle();
    return pgRow?.guardian_id ?? null;
}
async function loadEncounterIssueParties(clinicId, encounterId) {
    const { data: enc, error } = await supabase_1.supabaseAdmin
        .from('hub_encounters')
        .select(`
      id, clinic_id, pet_id, hub_case_id, guardian_id, hub_staff_member_id,
      clinic:clinics(id, name),
      pet:hub_pets(id, name, species, breed),
      guardian:hub_guardians(id, full_name),
      staff:hub_staff_members(id, full_name, crmv, crmv_uf)
    `)
        .eq('id', encounterId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error)
        return { ok: false, status: 500, error: error.message };
    if (!enc)
        return { ok: false, status: 404, error: 'Atendimento não encontrado' };
    const row = enc;
    if (!row.pet_id)
        return { ok: false, status: 409, error: 'Atendimento sem pet vinculado' };
    if (!row.hub_staff_member_id) {
        return { ok: false, status: 409, error: 'Atendimento sem veterinário responsável' };
    }
    let guardianEmbed = row.guardian;
    if (!guardianEmbed && row.guardian_id) {
        const { data: gRow } = await supabase_1.supabaseAdmin
            .from('hub_guardians')
            .select('id, full_name')
            .eq('id', row.guardian_id)
            .maybeSingle();
        guardianEmbed = gRow;
    }
    if (!guardianEmbed && row.pet_id) {
        const gid = await resolveEncounterGuardianId(encounterId, String(row.pet_id));
        if (gid) {
            const { data: gRow } = await supabase_1.supabaseAdmin
                .from('hub_guardians')
                .select('id, full_name')
                .eq('id', gid)
                .maybeSingle();
            guardianEmbed = gRow;
        }
    }
    const clinic = embedOne(row.clinic) ?? {
        id: clinicId,
        name: 'Clínica veterinária',
    };
    const petRow = embedOne(row.pet);
    const guardianRow = embedOne(guardianEmbed);
    const staffRow = embedOne(row.staff);
    return {
        ok: true,
        parties: {
            encounter_id: String(row.id),
            pet_id: String(row.pet_id),
            hub_case_id: row.hub_case_id ?? null,
            clinic: { id: clinic.id, name: clinic.name },
            pet: {
                id: petRow?.id ?? String(row.pet_id),
                name: petRow?.name ?? '—',
                species: petRow?.species ?? null,
                breed: petRow?.breed ?? null,
            },
            guardian: {
                id: (guardianRow?.id ?? row.guardian_id ?? null),
                full_name: guardianRow?.full_name ?? 'Tutor não informado',
            },
            veterinarian: {
                id: (staffRow?.id ?? row.hub_staff_member_id ?? null),
                full_name: staffRow?.full_name ?? 'Veterinário responsável',
                crmv: staffRow?.crmv ?? null,
                crmv_uf: staffRow?.crmv_uf ?? null,
            },
        },
    };
}
async function fetchClinicJsonDefaults(clinicId, column) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_clinic_settings')
        .select(column)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    const row = data;
    return (row?.[column] ?? {});
}
