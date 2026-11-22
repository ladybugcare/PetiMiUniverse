/**
 * Política de preço na landing pública — Resolução CFMV nº 1.649/2025 art. 6º, V.
 * Só serviços padronizados podem expor valor; clínicos ficam sob avaliação.
 */

export const PUBLIC_PRICE_ALLOWED_SERVICE_GROUPS = [
  'banho_tosa',
  'hotel',
  'creche',
  'leva_traz',
] as const;

export const PUBLIC_PRICE_EVALUATION_NOTE = 'Valor sob avaliação veterinária.';

export function normalizeServiceGroupSlug(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  return s || 'outros';
}

export function allowsPublicServicePrice(group: string | null | undefined): boolean {
  const g = normalizeServiceGroupSlug(group);
  return (PUBLIC_PRICE_ALLOWED_SERVICE_GROUPS as readonly string[]).includes(g);
}
