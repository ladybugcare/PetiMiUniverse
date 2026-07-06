import { supabaseAdmin } from '../../config/supabase';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const STAFF_SPECIALTIES_MAX_ITEMS = 32;
export const STAFF_SPECIALTY_MAX_LEN = 200;

export function isStaffSpecialtyUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Normaliza entrada da API: trim, dedupe, limite de tamanho. */
export function sanitizeStaffSpecialtiesInput(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const v = item.trim();
    if (!v || v.length > STAFF_SPECIALTY_MAX_LEN) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= STAFF_SPECIALTIES_MAX_ITEMS) break;
  }
  return out;
}

/**
 * Resolve nomes do catálogo para UUID quando existirem em `public.specialties`.
 * Mantém UUIDs e nomes livres sem correspondência.
 */
export async function normalizeStaffSpecialtiesForStorage(values: string[]): Promise<string[]> {
  const unique = sanitizeStaffSpecialtiesInput(values);
  if (unique.length === 0) return [];

  const namesToResolve = unique.filter((v) => !isStaffSpecialtyUuid(v));
  const nameToId = new Map<string, string>();

  if (namesToResolve.length > 0) {
    const { data, error } = await supabaseAdmin.from('specialties').select('id, name').in('name', namesToResolve);
    if (!error && data) {
      for (const row of data) {
        const name = String(row.name ?? '').trim();
        const id = String(row.id ?? '').trim();
        if (name && id) nameToId.set(name.toLowerCase(), id);
      }
    }
  }

  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const v of unique) {
    const mapped = isStaffSpecialtyUuid(v) ? v : nameToId.get(v.toLowerCase()) ?? v;
    const key = isStaffSpecialtyUuid(mapped) ? mapped.toLowerCase() : mapped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(mapped);
  }
  return resolved;
}
