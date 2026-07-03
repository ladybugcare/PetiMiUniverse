import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../../config/supabase';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type ClinicalDocumentStatus = 'valid' | 'revoked' | 'expired';
export type ClinicalDocumentScope = 'single' | 'encounter_bundle';

export type ClinicalPartySnapshot = {
  clinic: { id: string; name: string };
  pet: { id: string; name: string; species: string | null; breed: string | null };
  guardian: { id: string | null; full_name: string };
  veterinarian: {
    id: string | null;
    full_name: string;
    crmv: string | null;
    crmv_uf: string | null;
  };
};

export function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export function generatePublicToken(): string {
  return randomBytes(24).toString('base64url');
}

export function generatePrefixedValidationCode(prefix: string): string {
  const part = () =>
    Array.from({ length: 4 }, () => CROCKFORD[randomBytes(1)[0]! % CROCKFORD.length]).join('');
  return `${prefix}-${part()}-${part()}`;
}

function sortObjectKeys(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  return sorted;
}

export function canonicalizeSnapshot(snapshot: unknown): string {
  return JSON.stringify(sortObjectKeys(snapshot));
}

export function computeSnapshotHash(snapshot: unknown): string {
  return createHash('sha256').update(canonicalizeSnapshot(snapshot)).digest('hex');
}

export function truncateContentHash(hash: string, edge = 8): string {
  if (hash.length <= edge * 2 + 1) return hash;
  return `${hash.slice(0, edge)}…${hash.slice(-edge)}`;
}

export function maskPublicToken(token: string): string {
  if (token.length <= 10) return '***';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export function computeDocumentStatus(doc: {
  revoked_at?: string | null;
  expires_at?: string | null;
}): ClinicalDocumentStatus {
  if (doc.revoked_at) return 'revoked';
  if (doc.expires_at && new Date(doc.expires_at).getTime() < Date.now()) return 'expired';
  return 'valid';
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function resolveHubWebBaseUrl(): string {
  return (
    process.env.HUB_WEB_URL?.trim() ||
    process.env.VITE_HUB_WEB_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    'http://localhost:3002'
  ).replace(/\/$/, '');
}

export function resolveClinicalPublicUrl(pathSegment: string, publicToken: string): string {
  return `${resolveHubWebBaseUrl()}${pathSegment}${publicToken}`;
}

export function resolveValidityDays(
  defaults: Record<string, unknown> | null | undefined,
  fallback = 30,
): number {
  const raw = defaults?.validity_days;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 365) return Math.floor(n);
  return fallback;
}

const CODE_RETRY_MAX = 8;

export async function generateUniqueCode(
  prefix: string,
  table: string,
  column = 'validation_code',
): Promise<string> {
  for (let i = 0; i < CODE_RETRY_MAX; i++) {
    const code = generatePrefixedValidationCode(prefix);
    const { data } = await supabaseAdmin.from(table).select('id').eq(column, code).maybeSingle();
    if (!data) return code;
  }
  throw new Error('Não foi possível gerar código de validação único');
}

export async function generateUniquePublicToken(table: string, column = 'public_token'): Promise<string> {
  for (let i = 0; i < CODE_RETRY_MAX; i++) {
    const token = generatePublicToken();
    const { data } = await supabaseAdmin.from(table).select('id').eq(column, token).maybeSingle();
    if (!data) return token;
  }
  throw new Error('Não foi possível gerar token público único');
}

export async function recordClinicalDocumentEvent(opts: {
  table: string;
  clinic_id: string;
  document_id: string;
  event_type: 'created' | 'viewed' | 'pdf_downloaded' | 'revoked' | 'whatsapp_opened';
  actor_user_id?: string | null;
  actor_ip?: string | null;
  actor_user_agent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from(opts.table).insert({
      clinic_id: opts.clinic_id,
      document_id: opts.document_id,
      event_type: opts.event_type,
      actor_user_id: opts.actor_user_id ?? null,
      actor_ip: opts.actor_ip ?? null,
      actor_user_agent: opts.actor_user_agent ?? null,
      metadata: opts.metadata ?? {},
    });
  } catch (e) {
    console.error(`[${opts.table}]`, e);
  }
}

export async function resolveEncounterGuardianId(
  encounterId: string | null | undefined,
  petId: string,
): Promise<string | null> {
  if (encounterId) {
    const { data: enc } = await supabaseAdmin
      .from('hub_encounters')
      .select('guardian_id')
      .eq('id', encounterId)
      .maybeSingle();
    if (enc?.guardian_id) return enc.guardian_id as string;
  }
  const { data: pgRow } = await supabaseAdmin
    .from('hub_pet_guardians')
    .select('guardian_id')
    .eq('pet_id', petId)
    .order('role', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (pgRow?.guardian_id as string | null | undefined) ?? null;
}

export async function loadEncounterIssueParties(
  clinicId: string,
  encounterId: string,
): Promise<
  | { ok: true; parties: ClinicalPartySnapshot & { encounter_id: string; pet_id: string; hub_case_id: string | null } }
  | { ok: false; status: number; error: string }
> {
  const { data: enc, error } = await supabaseAdmin
    .from('hub_encounters')
    .select(
      `
      id, clinic_id, pet_id, hub_case_id, guardian_id, hub_staff_member_id,
      clinic:clinics(id, name),
      pet:hub_pets(id, name, species, breed),
      guardian:hub_guardians(id, full_name),
      staff:hub_staff_members(id, full_name, crmv, crmv_uf)
    `,
    )
    .eq('id', encounterId)
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!enc) return { ok: false, status: 404, error: 'Atendimento não encontrado' };

  const row = enc as Record<string, unknown>;
  if (!row.pet_id) return { ok: false, status: 409, error: 'Atendimento sem pet vinculado' };
  if (!row.hub_staff_member_id) {
    return { ok: false, status: 409, error: 'Atendimento sem veterinário responsável' };
  }

  let guardianEmbed = row.guardian;
  if (!guardianEmbed && row.guardian_id) {
    const { data: gRow } = await supabaseAdmin
      .from('hub_guardians')
      .select('id, full_name')
      .eq('id', row.guardian_id as string)
      .maybeSingle();
    guardianEmbed = gRow;
  }
  if (!guardianEmbed && row.pet_id) {
    const gid = await resolveEncounterGuardianId(encounterId, String(row.pet_id));
    if (gid) {
      const { data: gRow } = await supabaseAdmin
        .from('hub_guardians')
        .select('id, full_name')
        .eq('id', gid)
        .maybeSingle();
      guardianEmbed = gRow;
    }
  }

  const clinic = embedOne(row.clinic as { id: string; name: string } | null) ?? {
    id: clinicId,
    name: 'Clínica veterinária',
  };
  const petRow = embedOne(
    row.pet as { id: string; name: string; species?: string | null; breed?: string | null } | null,
  );
  const guardianRow = embedOne(guardianEmbed as { id: string; full_name: string } | null);
  const staffRow = embedOne(
    row.staff as { id: string; full_name: string; crmv?: string | null; crmv_uf?: string | null } | null,
  );

  return {
    ok: true,
    parties: {
      encounter_id: String(row.id),
      pet_id: String(row.pet_id),
      hub_case_id: (row.hub_case_id as string | null) ?? null,
      clinic: { id: clinic.id, name: clinic.name },
      pet: {
        id: petRow?.id ?? String(row.pet_id),
        name: petRow?.name ?? '—',
        species: petRow?.species ?? null,
        breed: petRow?.breed ?? null,
      },
      guardian: {
        id: (guardianRow?.id ?? (row.guardian_id as string | null) ?? null) as string | null,
        full_name: guardianRow?.full_name ?? 'Tutor não informado',
      },
      veterinarian: {
        id: (staffRow?.id ?? (row.hub_staff_member_id as string | null) ?? null) as string | null,
        full_name: staffRow?.full_name ?? 'Veterinário responsável',
        crmv: staffRow?.crmv ?? null,
        crmv_uf: staffRow?.crmv_uf ?? null,
      },
    },
  };
}

export async function fetchClinicJsonDefaults(
  clinicId: string,
  column: string,
): Promise<Record<string, unknown>> {
  const { data } = await supabaseAdmin
    .from('hub_clinic_settings')
    .select(column)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  return ((row?.[column] as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
}
