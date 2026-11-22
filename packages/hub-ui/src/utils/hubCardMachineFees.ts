export type CardMachineFeeTier = {
  min_installments: number;
  max_installments: number;
  rate_percent: number;
};

export type CardMachineFees = {
  debit_card: CardMachineFeeTier[];
  credit_card: CardMachineFeeTier[];
};

export type CardFeePreview = {
  rate_percent: number;
  fee_amount: number;
  net_amount: number;
};

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function emptyCardMachineFees(): CardMachineFees {
  return { debit_card: [], credit_card: [] };
}

export function normalizeCardMachineFees(raw: unknown): CardMachineFees {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return emptyCardMachineFees();
  const obj = raw as Record<string, unknown>;
  const parseTiers = (v: unknown): CardMachineFeeTier[] => {
    if (!Array.isArray(v)) return [];
    return v
      .map((t) => {
        if (!t || typeof t !== 'object') return null;
        const row = t as Record<string, unknown>;
        const min = Math.floor(Number(row.min_installments));
        const max = Math.floor(Number(row.max_installments));
        const rate = Number(row.rate_percent);
        if (!(min >= 1 && max >= min && max <= 99 && rate >= 0 && rate <= 100)) return null;
        return { min_installments: min, max_installments: max, rate_percent: rate };
      })
      .filter((t): t is CardMachineFeeTier => t != null)
      .sort((a, b) => a.min_installments - b.min_installments || a.max_installments - b.max_installments);
  };
  return {
    debit_card: parseTiers(obj.debit_card),
    credit_card: parseTiers(obj.credit_card),
  };
}

export function lookupCardFeeRatePercent(
  fees: CardMachineFees,
  method: string,
  installments: number,
): number | null {
  if (method !== 'credit_card' && method !== 'debit_card') return null;
  const n = Math.max(1, Math.min(99, Math.floor(Number(installments) || 1)));
  const tiers = fees[method as 'credit_card' | 'debit_card'] ?? [];
  const hit = tiers.find((t) => n >= t.min_installments && n <= t.max_installments);
  return hit ? Number(hit.rate_percent) : null;
}

export function previewCardFee(
  fees: CardMachineFees,
  method: string,
  amount: number,
  installments: number,
): CardFeePreview | null {
  const rate = lookupCardFeeRatePercent(fees, method, installments);
  if (rate == null || !(amount > 0)) return null;
  const fee_amount = round2(amount * (rate / 100));
  return {
    rate_percent: rate,
    fee_amount,
    net_amount: round2(Math.max(0, amount - fee_amount)),
  };
}

export function formatInstallmentRange(tier: CardMachineFeeTier): string {
  if (tier.min_installments === tier.max_installments) return `${tier.min_installments}x`;
  return `${tier.min_installments}x–${tier.max_installments}x`;
}

/** Bloco de taxa/líquido visível só com taxa positiva em centavos. */
export function cardFeeTotalCentsPositive(cardFeeTotal: number): boolean {
  return Math.round(Number(cardFeeTotal || 0) * 100) > 0;
}

export const CARD_FEE_PARTIAL_COVERAGE_HINT =
  'Valores calculados apenas para cartões com taxa registrada.';
