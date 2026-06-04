"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVICE_GROUP_VALUES = void 0;
exports.isValidServiceGroup = isValidServiceGroup;
exports.slugifyServiceNameToCode = slugifyServiceNameToCode;
exports.slugifyServiceGroupLabel = slugifyServiceGroupLabel;
exports.isValidServiceGroupSlug = isValidServiceGroupSlug;
exports.ensureUniqueHubServiceTypeCode = ensureUniqueHubServiceTypeCode;
exports.ensureUniqueHubServiceTypeCodeLiteral = ensureUniqueHubServiceTypeCodeLiteral;
/** Valores canônicos de `service_group` (alinhados à migration e à UI). */
exports.SERVICE_GROUP_VALUES = [
    'banho_tosa',
    'hotel',
    'creche',
    'clinica',
    'cirurgia',
    'leva_traz',
    'outros',
];
function isValidServiceGroup(g) {
    return exports.SERVICE_GROUP_VALUES.includes(g);
}
/**
 * Gera slug de código a partir do nome: sem acentos, minúsculas, [a-z0-9_].
 */
function slugifyServiceNameToCode(name) {
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
/** Slug canônico para `service_group` (pré-definidos ou personalizados). */
function slugifyServiceGroupLabel(raw) {
    return slugifyServiceNameToCode(raw);
}
/** Aceita slugs `a-z`, `0-9` e `_` (1–64), após normalização a partir do texto livre. */
function isValidServiceGroupSlug(g) {
    if (!g || g.length > 64)
        return false;
    return /^[a-z0-9_]+$/.test(g);
}
/**
 * Código único por clínica entre linhas não arquivadas (`deleted_at IS NULL`).
 */
async function ensureUniqueHubServiceTypeCode(supabase, clinicId, nameOrBase, excludeId) {
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
async function ensureUniqueHubServiceTypeCodeLiteral(supabase, clinicId, exactCode, excludeId) {
    const base = exactCode
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
