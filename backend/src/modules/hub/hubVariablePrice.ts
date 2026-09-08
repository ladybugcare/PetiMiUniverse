import { checkPermission } from '../../middleware/authMiddleware';

export type ServicePriceModeRow = {
  id: string;
  name: string;
  sale_amount?: number | null;
  price_mode?: string | null;
  price_min?: number | null;
  price_max?: number | null;
};

export type ResolvedPriceStatus = 'confirmed' | 'pending_approval';

export function roundMoney2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Decide se o valor informado na hora fica confirmado ou pendente de aprovação financeira.
 * - Quem tem hub.financial.write confirma sempre.
 * - price_mode = fixed: usa catálogo (não deveria chegar override fora).
 * - price_mode = variable: dentro da faixa → confirmed; fora da faixa ou sem faixa → pending_approval.
 */
export function resolvePriceStatus(opts: {
  unitAmount: number;
  service: ServicePriceModeRow;
  canAutoApprove: boolean;
}): ResolvedPriceStatus {
  if (opts.canAutoApprove) return 'confirmed';

  const mode = String(opts.service.price_mode ?? 'fixed');
  if (mode !== 'variable') {
    // Fixed: override manual fora do catálogo exige aprovação.
    const catalog = roundMoney2(Number(opts.service.sale_amount ?? 0));
    return roundMoney2(opts.unitAmount) === catalog ? 'confirmed' : 'pending_approval';
  }

  const min = opts.service.price_min == null ? null : roundMoney2(Number(opts.service.price_min));
  const max = opts.service.price_max == null ? null : roundMoney2(Number(opts.service.price_max));
  const amount = roundMoney2(opts.unitAmount);

  if (min == null && max == null) return 'pending_approval';
  if (min != null && amount < min) return 'pending_approval';
  if (max != null && amount > max) return 'pending_approval';
  return 'confirmed';
}

export async function canAutoApproveFinancial(
  userId: string | null | undefined,
  clinicId: string,
): Promise<boolean> {
  if (!userId) return false;
  return checkPermission(userId, clinicId, 'hub.financial.write');
}
