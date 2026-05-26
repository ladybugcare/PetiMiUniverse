import type { SupabaseClient } from '@supabase/supabase-js';

/** Valores canónicos de `service_group` (alinhados à migration e à UI). */
export const SERVICE_GROUP_VALUES = [
  'banho_tosa',
  'hotel',
  'creche',
  'clinica',
  'cirurgia',
  'leva_traz',
  'outros',
] as const;

export type HubServiceGroup = (typeof SERVICE_GROUP_VALUES)[number];

export function isValidServiceGroup(g: string): g is HubServiceGroup {
  return (SERVICE_GROUP_VALUES as readonly string[]).includes(g);
}

/**
 * Gera slug de código a partir do nome: sem acentos, minúsculas, [a-z0-9_].
 */
export function slugifyServiceNameToCode(name: string): string {
  const raw = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, '_e_')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const trimmed = raw.slice(0, 55);
  return trimmed || 'servico';
}

/** Slug canónico para `service_group` (pré-definidos ou personalizados). */
export function slugifyServiceGroupLabel(raw: string): string {
  return slugifyServiceNameToCode(raw);
}

/** Aceita slugs `a-z`, `0-9` e `_` (1–64), após normalização a partir do texto livre. */
export function isValidServiceGroupSlug(g: string): boolean {
  if (!g || g.length > 64) return false;
  return /^[a-z0-9_]+$/.test(g);
}

/**
 * Código único por clínica entre linhas não arquivadas (`deleted_at IS NULL`).
 */
export async function ensureUniqueHubServiceTypeCode(
  supabase: SupabaseClient,
  clinicId: string,
  nameOrBase: string,
  excludeId?: string
): Promise<string> {
  const baseClean = slugifyServiceNameToCode(nameOrBase);
  let candidate = baseClean;
  let suffix = 2;
  for (;;) {
    let q = supabase
      .from('hub_service_types')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('code', candidate)
      .is('deleted_at', null)
      .limit(1);
    if (excludeId) {
      q = q.neq('id', excludeId);
    }
    const { data, error } = await q;
    if (error) {
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      return candidate;
    }
    const next = `${baseClean}_${suffix}`;
    candidate = next.slice(0, 64);
    suffix += 1;
    if (suffix > 1000) {
      throw new Error('Não foi possível gerar código único');
    }
  }
}

/**
 * Verifica unicidade de um código já no formato [a-z0-9_] (ex.: override no POST).
 */
export async function ensureUniqueHubServiceTypeCodeLiteral(
  supabase: SupabaseClient,
  clinicId: string,
  exactCode: string,
  excludeId?: string
): Promise<string> {
  const base =
    exactCode
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 55) || 'servico';
  let candidate = base;
  let suffix = 2;
  for (;;) {
    let q = supabase
      .from('hub_service_types')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('code', candidate)
      .is('deleted_at', null)
      .limit(1);
    if (excludeId) {
      q = q.neq('id', excludeId);
    }
    const { data, error } = await q;
    if (error) {
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      return candidate;
    }
    candidate = `${base}_${suffix}`.slice(0, 64);
    suffix += 1;
    if (suffix > 1000) {
      throw new Error('Não foi possível gerar código único');
    }
  }
}
