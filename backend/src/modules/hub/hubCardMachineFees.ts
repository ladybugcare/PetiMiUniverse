import { z } from 'zod';

export const CARD_MACHINE_FEE_METHODS = ['credit_card', 'debit_card'] as const;
export type CardMachineFeeMethod = (typeof CARD_MACHINE_FEE_METHODS)[number];

export type CardMachineFeeTier = {
  min_installments: number;
  max_installments: number;
  rate_percent: number;
};

export type CardMachineFees = {
  debit_card: CardMachineFeeTier[];
  credit_card: CardMachineFeeTier[];
};

export type CardFeeSnapshot = {
  card_fee_rate_percent: number;
  card_fee_amount: number;
  net_amount: number;
};

const tierSchema = z
  .object({
    min_installments: z.number().int().min(1).max(99),
    max_installments: z.number().int().min(1).max(99),
    rate_percent: z.number().min(0).max(100),
  })
  .strict()
  .refine((t) => t.max_installments >= t.min_installments, {
    message: 'max_installments deve ser >= min_installments',
  });

const feesSchema = z
  .object({
    debit_card: z.array(tierSchema).max(24).default([]),
    credit_card: z.array(tierSchema).max(24).default([]),
  })
  .strict();

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function sortTiers(tiers: CardMachineFeeTier[]): CardMachineFeeTier[] {
  return [...tiers].sort((a, b) => {
    if (a.min_installments !== b.min_installments) return a.min_installments - b.min_installments;
    return a.max_installments - b.max_installments;
  });
}

function assertNoOverlap(method: CardMachineFeeMethod, tiers: CardMachineFeeTier[]): void {
  const sorted = sortTiers(tiers);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.min_installments <= prev.max_installments) {
      throw new Error(
        `Faixas de parcela sobrepostas em ${method === 'credit_card' ? 'crédito' : 'débito'} ` +
          `(${prev.min_installments}–${prev.max_installments}x e ${cur.min_installments}–${cur.max_installments}x).`,
      );
    }
  }
}

/** Normaliza JSONB bruto; inválido → faixas vazias. */
export function normalizeCardMachineFees(raw: unknown): CardMachineFees {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { debit_card: [], credit_card: [] };
  }
  const parsed = feesSchema.safeParse(raw);
  if (!parsed.success) {
    return { debit_card: [], credit_card: [] };
  }
  return {
    debit_card: sortTiers(parsed.data.debit_card),
    credit_card: sortTiers(parsed.data.credit_card),
  };
}

/** Valida e normaliza payload de PATCH (lança Error com mensagem amigável). */
export function parseCardMachineFeesInput(raw: unknown): CardMachineFees {
  const parsed = feesSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new Error('Taxas da maquininha inválidas.');
  }
  const fees: CardMachineFees = {
    debit_card: sortTiers(parsed.data.debit_card),
    credit_card: sortTiers(parsed.data.credit_card),
  };
  assertNoOverlap('debit_card', fees.debit_card);
  assertNoOverlap('credit_card', fees.credit_card);
  return fees;
}

export function lookupCardFeeRatePercent(
  fees: CardMachineFees,
  method: string,
  installments: number,
): number | null {
  if (method !== 'credit_card' && method !== 'debit_card') return null;
  const n = Math.max(1, Math.min(99, Math.floor(Number(installments) || 1)));
  const tiers = fees[method as CardMachineFeeMethod] ?? [];
  const hit = tiers.find((t) => n >= t.min_installments && n <= t.max_installments);
  return hit ? Number(hit.rate_percent) : null;
}

export function computeCardFeeSnapshot(opts: {
  fees: CardMachineFees;
  paymentMethod: string;
  amount: number;
  installments?: number | null;
}): CardFeeSnapshot | null {
  const rate = lookupCardFeeRatePercent(opts.fees, opts.paymentMethod, opts.installments ?? 1);
  if (rate == null) return null;
  const amount = round2(opts.amount);
  const card_fee_amount = round2(amount * (rate / 100));
  return {
    card_fee_rate_percent: rate,
    card_fee_amount,
    net_amount: round2(Math.max(0, amount - card_fee_amount)),
  };
}

export const cardMachineFeesPatchSchema = z
  .object({
    debit_card: z.array(tierSchema).max(24).optional(),
    credit_card: z.array(tierSchema).max(24).optional(),
  })
  .strict();

export type CardFeePaymentRow = {
  payment_method: string;
  amount: number;
  card_fee_amount: number | null;
  net_amount?: number | null;
};

export type CardFeeTotals = {
  card_gross_total: number;
  card_fee_total: number;
  card_net_total: number;
  /** Soma de cartões posted sem snapshot (legado / sem faixa no momento). */
  card_without_fee_gross_total: number;
};

function isCardMethod(method: string): method is CardMachineFeeMethod {
  return method === 'credit_card' || method === 'debit_card';
}

/**
 * Agrega totais de taxa da maquininha.
 * Pré-condição: o chamador já filtrou `status = posted`.
 * Aceita cartões com e sem snapshot; classifica internamente.
 */
export function aggregateCardFeeTotals(rows: CardFeePaymentRow[]): CardFeeTotals {
  let card_gross_total = 0;
  let card_fee_total = 0;
  let card_net_total = 0;
  let card_without_fee_gross_total = 0;

  for (const row of rows) {
    if (!isCardMethod(String(row.payment_method ?? ''))) continue;
    const amount = round2(Number(row.amount ?? 0));
    if (!(amount > 0)) continue;

    const feeRaw = row.card_fee_amount;
    if (feeRaw == null || !Number.isFinite(Number(feeRaw))) {
      card_without_fee_gross_total = round2(card_without_fee_gross_total + amount);
      continue;
    }

    const fee = round2(Number(feeRaw));
    const net =
      row.net_amount != null && Number.isFinite(Number(row.net_amount))
        ? round2(Number(row.net_amount))
        : round2(Math.max(0, amount - fee));

    card_gross_total = round2(card_gross_total + amount);
    card_fee_total = round2(card_fee_total + fee);
    card_net_total = round2(card_net_total + net);
  }

  return {
    card_gross_total,
    card_fee_total,
    card_net_total,
    card_without_fee_gross_total,
  };
}

/** Critério de UI: bloco visível só com taxa positiva em centavos. */
export function cardFeeTotalCentsPositive(cardFeeTotal: number): boolean {
  return Math.round(Number(cardFeeTotal || 0) * 100) > 0;
}
