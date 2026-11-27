"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardMachineFeesPatchSchema = exports.CARD_MACHINE_FEE_METHODS = void 0;
exports.normalizeCardMachineFees = normalizeCardMachineFees;
exports.parseCardMachineFeesInput = parseCardMachineFeesInput;
exports.lookupCardFeeRatePercent = lookupCardFeeRatePercent;
exports.computeCardFeeSnapshot = computeCardFeeSnapshot;
exports.aggregateCardFeeTotals = aggregateCardFeeTotals;
exports.cardFeeTotalCentsPositive = cardFeeTotalCentsPositive;
const zod_1 = require("zod");
exports.CARD_MACHINE_FEE_METHODS = ['credit_card', 'debit_card'];
const tierSchema = zod_1.z
    .object({
    min_installments: zod_1.z.number().int().min(1).max(99),
    max_installments: zod_1.z.number().int().min(1).max(99),
    rate_percent: zod_1.z.number().min(0).max(100),
})
    .strict()
    .refine((t) => t.max_installments >= t.min_installments, {
    message: 'max_installments deve ser >= min_installments',
});
const feesSchema = zod_1.z
    .object({
    debit_card: zod_1.z.array(tierSchema).max(24).default([]),
    credit_card: zod_1.z.array(tierSchema).max(24).default([]),
})
    .strict();
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function sortTiers(tiers) {
    return [...tiers].sort((a, b) => {
        if (a.min_installments !== b.min_installments)
            return a.min_installments - b.min_installments;
        return a.max_installments - b.max_installments;
    });
}
function assertNoOverlap(method, tiers) {
    const sorted = sortTiers(tiers);
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        if (cur.min_installments <= prev.max_installments) {
            throw new Error(`Faixas de parcela sobrepostas em ${method === 'credit_card' ? 'crédito' : 'débito'} ` +
                `(${prev.min_installments}–${prev.max_installments}x e ${cur.min_installments}–${cur.max_installments}x).`);
        }
    }
}
/** Normaliza JSONB bruto; inválido → faixas vazias. */
function normalizeCardMachineFees(raw) {
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
function parseCardMachineFeesInput(raw) {
    const parsed = feesSchema.safeParse(raw ?? {});
    if (!parsed.success) {
        throw new Error('Taxas da maquininha inválidas.');
    }
    const fees = {
        debit_card: sortTiers(parsed.data.debit_card),
        credit_card: sortTiers(parsed.data.credit_card),
    };
    assertNoOverlap('debit_card', fees.debit_card);
    assertNoOverlap('credit_card', fees.credit_card);
    return fees;
}
function lookupCardFeeRatePercent(fees, method, installments) {
    if (method !== 'credit_card' && method !== 'debit_card')
        return null;
    const n = Math.max(1, Math.min(99, Math.floor(Number(installments) || 1)));
    const tiers = fees[method] ?? [];
    const hit = tiers.find((t) => n >= t.min_installments && n <= t.max_installments);
    return hit ? Number(hit.rate_percent) : null;
}
function computeCardFeeSnapshot(opts) {
    const rate = lookupCardFeeRatePercent(opts.fees, opts.paymentMethod, opts.installments ?? 1);
    if (rate == null)
        return null;
    const amount = round2(opts.amount);
    const card_fee_amount = round2(amount * (rate / 100));
    return {
        card_fee_rate_percent: rate,
        card_fee_amount,
        net_amount: round2(Math.max(0, amount - card_fee_amount)),
    };
}
exports.cardMachineFeesPatchSchema = zod_1.z
    .object({
    debit_card: zod_1.z.array(tierSchema).max(24).optional(),
    credit_card: zod_1.z.array(tierSchema).max(24).optional(),
})
    .strict();
function isCardMethod(method) {
    return method === 'credit_card' || method === 'debit_card';
}
/**
 * Agrega totais de taxa da maquininha.
 * Pré-condição: o chamador já filtrou `status = posted`.
 * Aceita cartões com e sem snapshot; classifica internamente.
 */
function aggregateCardFeeTotals(rows) {
    let card_gross_total = 0;
    let card_fee_total = 0;
    let card_net_total = 0;
    let card_without_fee_gross_total = 0;
    for (const row of rows) {
        if (!isCardMethod(String(row.payment_method ?? '')))
            continue;
        const amount = round2(Number(row.amount ?? 0));
        if (!(amount > 0))
            continue;
        const feeRaw = row.card_fee_amount;
        if (feeRaw == null || !Number.isFinite(Number(feeRaw))) {
            card_without_fee_gross_total = round2(card_without_fee_gross_total + amount);
            continue;
        }
        const fee = round2(Number(feeRaw));
        const net = row.net_amount != null && Number.isFinite(Number(row.net_amount))
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
function cardFeeTotalCentsPositive(cardFeeTotal) {
    return Math.round(Number(cardFeeTotal || 0) * 100) > 0;
}
