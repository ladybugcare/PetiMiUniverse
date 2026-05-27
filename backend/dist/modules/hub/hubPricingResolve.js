"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PET_BODY_SIZE_TIERS = void 0;
exports.ageInWholeMonths = ageInWholeMonths;
exports.resolvePorteLinePricing = resolvePorteLinePricing;
exports.resolveServiceLinePricing = resolveServiceLinePricing;
exports.validatePorteOverrideForServiceTypes = validatePorteOverrideForServiceTypes;
exports.validateCoatOverrideForServiceTypes = validateCoatOverrideForServiceTypes;
exports.requiresCoatPricing = requiresCoatPricing;
const hubServiceTypesPricingMatrix_1 = require("./hubServiceTypesPricingMatrix");
function parseMatrix(raw) {
    const p = (0, hubServiceTypesPricingMatrix_1.parsePricingMatrixJson)(raw);
    if (!p || typeof p !== 'object' || 'error' in p)
        return null;
    return p;
}
exports.PET_BODY_SIZE_TIERS = ['mini', 'pequeno', 'medio', 'grande', 'gigante'];
/** Idade em meses completos entre birthYmd e refYmd (ref >= birth). */
function ageInWholeMonths(birthYmd, refYmd) {
    if (!birthYmd || !/^\d{4}-\d{2}-\d{2}$/.test(birthYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(refYmd))
        return null;
    const [by, bm, bd] = birthYmd.split('-').map(Number);
    const [ry, rm, rd] = refYmd.split('-').map(Number);
    if (!by || !bm || !bd || !ry || !rm || !rd)
        return null;
    let months = (ry - by) * 12 + (rm - bm);
    if (rd < bd)
        months -= 1;
    return Math.max(0, months);
}
function matrixPorteTierSet(matrix) {
    if (!matrix || (matrix.kind !== 'porte' && matrix.kind !== 'porte_pelagem'))
        return null;
    return new Set(matrix.tiers.map((t) => t.porte));
}
function matrixCoatTypeSet(matrix) {
    if (!matrix || (matrix.kind !== 'pelagem' && matrix.kind !== 'porte_pelagem'))
        return null;
    return new Set(matrix.tiers.map((t) => t.coat_type));
}
function pickAmountsForPorteTier(matrix, tier) {
    if (matrix.kind !== 'porte')
        return null;
    const row = matrix.tiers.find((t) => t.porte === tier);
    if (!row)
        return null;
    return { cost: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.cost_amount), sale: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.sale_amount) };
}
function pickAmountsForCoatType(matrix, coatType) {
    if (matrix.kind !== 'pelagem')
        return null;
    const row = matrix.tiers.find((t) => t.coat_type === coatType);
    if (!row)
        return null;
    return { cost: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.cost_amount), sale: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.sale_amount) };
}
function pickAmountsForPorteCoat(matrix, tier, coatType) {
    if (matrix.kind !== 'porte_pelagem')
        return null;
    const row = matrix.tiers.find((t) => t.porte === tier && t.coat_type === coatType);
    if (!row)
        return null;
    return { cost: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.cost_amount), sale: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.sale_amount) };
}
function pickPeriodoTier(matrix, pricingVariant) {
    const tiers = matrix.tiers;
    if (tiers.length === 0) {
        return { variant: {}, cost: 0, sale: 0 };
    }
    const want = pricingVariant?.period;
    if (want && tiers.some((t) => t.period === want)) {
        const row = tiers.find((t) => t.period === want);
        return {
            variant: { period: row.period },
            cost: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.cost_amount),
            sale: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.sale_amount),
        };
    }
    const row = tiers[0];
    return {
        variant: { period: row.period },
        cost: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.cost_amount),
        sale: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.sale_amount),
    };
}
function pickConsultaTier(matrix, pricingVariant) {
    const tiers = matrix.tiers;
    if (tiers.length === 0) {
        return { variant: {}, cost: 0, sale: 0 };
    }
    const want = pricingVariant?.consult_type;
    if (want && tiers.some((t) => t.consult_type === want)) {
        const row = tiers.find((t) => t.consult_type === want);
        return {
            variant: { consult_type: row.consult_type },
            cost: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.cost_amount),
            sale: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.sale_amount),
        };
    }
    const padrao = tiers.find((t) => t.consult_type === 'padrao');
    const row = padrao ?? tiers[0];
    return {
        variant: { consult_type: row.consult_type },
        cost: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.cost_amount),
        sale: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.sale_amount),
    };
}
function pickKmBandaTier(matrix, pricingVariant) {
    const tiers = matrix.tiers;
    if (tiers.length === 0) {
        return { variant: {}, cost: 0, sale: 0 };
    }
    const idx = pricingVariant?.km_tier_index;
    if (typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < tiers.length) {
        const row = tiers[idx];
        return {
            variant: { km_tier_index: idx },
            cost: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.cost_amount),
            sale: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.sale_amount),
        };
    }
    const row = tiers[0];
    return {
        variant: { km_tier_index: 0 },
        cost: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.cost_amount),
        sale: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(row.sale_amount),
    };
}
function resolveAutoPorte(input) {
    const { matrix, pet, appointmentDateYmd, puppyMaxMonths, overrideTier } = input;
    const tierSet = matrixPorteTierSet(matrix);
    if (!tierSet)
        return null;
    const normalizeOverride = overrideTier?.trim() || null;
    if (normalizeOverride && tierSet.has(normalizeOverride))
        return normalizeOverride;
    const ageM = ageInWholeMonths(pet.birth_date, appointmentDateYmd);
    if (ageM != null && ageM < puppyMaxMonths && tierSet.has('filhote'))
        return 'filhote';
    const bodyTier = exports.PET_BODY_SIZE_TIERS.includes(pet.size_tier) ? pet.size_tier : 'medio';
    if (tierSet.has(bodyTier))
        return bodyTier;
    return [...tierSet][0] ?? null;
}
function resolveAutoCoatType(input) {
    const { matrix, pet, overrideCoatType } = input;
    const coatSet = matrixCoatTypeSet(matrix);
    if (!coatSet)
        return null;
    const normalizeOverride = overrideCoatType?.trim() || null;
    if (normalizeOverride && coatSet.has(normalizeOverride))
        return normalizeOverride;
    if (pet.coat_type && hubServiceTypesPricingMatrix_1.COAT_TYPE_VALUES.includes(pet.coat_type) && coatSet.has(pet.coat_type)) {
        return pet.coat_type;
    }
    return null;
}
/**
 * Resolve tier + valores para um tipo de serviço (grupo banho_tosa/hotel com matriz porte).
 * `overrideTier`: tier explícito do pedido (linha ou agendamento); null = automático.
 */
function resolvePorteLinePricing(input) {
    const { serviceType, petSizeTier, petBirthDate, appointmentDateYmd, puppyMaxMonths, overrideTier } = input;
    const parsed = parseMatrix(serviceType.pricing_matrix);
    const matrix = parsed;
    const refCost = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(Number(serviceType.cost_amount) || 0);
    const refSale = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(Number(serviceType.sale_amount) || 0);
    if (!matrix || matrix.kind !== 'porte') {
        return { tierApplied: null, cost: refCost, sale: refSale };
    }
    const tierSet = matrixPorteTierSet(matrix);
    const normalizeOverride = overrideTier?.trim() || null;
    if (normalizeOverride && tierSet.has(normalizeOverride)) {
        const picked = pickAmountsForPorteTier(matrix, normalizeOverride);
        if (picked)
            return { tierApplied: normalizeOverride, ...picked };
    }
    // auto
    const ageM = ageInWholeMonths(petBirthDate, appointmentDateYmd);
    if (ageM != null && ageM < puppyMaxMonths && tierSet.has('filhote')) {
        const picked = pickAmountsForPorteTier(matrix, 'filhote');
        if (picked)
            return { tierApplied: 'filhote', ...picked };
    }
    const bodyTier = exports.PET_BODY_SIZE_TIERS.includes(petSizeTier) ? petSizeTier : 'medio';
    if (tierSet.has(bodyTier)) {
        const picked = pickAmountsForPorteTier(matrix, bodyTier);
        if (picked)
            return { tierApplied: bodyTier, ...picked };
    }
    // fallback: first tier in matrix
    const first = matrix.tiers[0];
    if (first) {
        return {
            tierApplied: first.porte,
            cost: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(first.cost_amount),
            sale: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(first.sale_amount),
        };
    }
    return { tierApplied: null, cost: refCost, sale: refSale };
}
function resolveServiceLinePricing(input) {
    const { serviceType, pet, appointmentDateYmd, puppyMaxMonths, overrideTier, overrideCoatType, pricing_variant } = input;
    const matrix = parseMatrix(serviceType.pricing_matrix);
    const refCost = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(Number(serviceType.cost_amount) || 0);
    const refSale = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(Number(serviceType.sale_amount) || 0);
    if (!matrix) {
        return { porteTierApplied: null, coatTypeApplied: null, cost: refCost, sale: refSale, pricing_variant: null };
    }
    if (matrix.kind === 'porte') {
        const tier = resolveAutoPorte({ matrix, pet, appointmentDateYmd, puppyMaxMonths, overrideTier });
        const picked = tier ? pickAmountsForPorteTier(matrix, tier) : null;
        return picked
            ? { porteTierApplied: tier, coatTypeApplied: null, ...picked, pricing_variant: null }
            : { porteTierApplied: null, coatTypeApplied: null, cost: refCost, sale: refSale, pricing_variant: null };
    }
    if (matrix.kind === 'pelagem') {
        let coatType = resolveAutoCoatType({ matrix, pet, overrideCoatType });
        if (!coatType && matrix.tiers.length > 0) {
            coatType = matrix.tiers[0].coat_type;
        }
        if (!coatType) {
            return { porteTierApplied: null, coatTypeApplied: null, cost: refCost, sale: refSale, pricing_variant: null };
        }
        const picked = pickAmountsForCoatType(matrix, coatType);
        if (picked) {
            return { porteTierApplied: null, coatTypeApplied: coatType, ...picked, pricing_variant: null };
        }
        const first = matrix.tiers[0];
        if (first) {
            return {
                porteTierApplied: null,
                coatTypeApplied: first.coat_type,
                cost: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(first.cost_amount),
                sale: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(first.sale_amount),
                pricing_variant: null,
            };
        }
        return { porteTierApplied: null, coatTypeApplied: null, cost: refCost, sale: refSale, pricing_variant: null };
    }
    if (matrix.kind === 'porte_pelagem') {
        let tier = resolveAutoPorte({ matrix, pet, appointmentDateYmd, puppyMaxMonths, overrideTier });
        let coatType = resolveAutoCoatType({ matrix, pet, overrideCoatType });
        if (!tier && matrix.tiers.length > 0) {
            tier = matrix.tiers[0].porte;
        }
        if (!coatType && matrix.tiers.length > 0) {
            const rowForCoat = tier ? matrix.tiers.find((t) => t.porte === tier) ?? matrix.tiers[0] : matrix.tiers[0];
            coatType = rowForCoat.coat_type;
        }
        if (!tier || !coatType) {
            return { porteTierApplied: null, coatTypeApplied: null, cost: refCost, sale: refSale, pricing_variant: null };
        }
        let picked = pickAmountsForPorteCoat(matrix, tier, coatType);
        if (picked) {
            return { porteTierApplied: tier, coatTypeApplied: coatType, ...picked, pricing_variant: null };
        }
        if (matrix.tiers.length > 0) {
            const row0 = matrix.tiers[0];
            const picked0 = pickAmountsForPorteCoat(matrix, row0.porte, row0.coat_type);
            if (picked0) {
                return {
                    porteTierApplied: row0.porte,
                    coatTypeApplied: row0.coat_type,
                    ...picked0,
                    pricing_variant: null,
                };
            }
        }
        return { porteTierApplied: null, coatTypeApplied: null, cost: refCost, sale: refSale, pricing_variant: null };
    }
    if (matrix.kind === 'periodo') {
        const p = pickPeriodoTier(matrix, pricing_variant);
        return {
            porteTierApplied: null,
            coatTypeApplied: null,
            cost: p.cost,
            sale: p.sale,
            pricing_variant: p.variant.period ? p.variant : null,
        };
    }
    if (matrix.kind === 'consulta') {
        const p = pickConsultaTier(matrix, pricing_variant);
        return {
            porteTierApplied: null,
            coatTypeApplied: null,
            cost: p.cost,
            sale: p.sale,
            pricing_variant: p.variant.consult_type ? p.variant : null,
        };
    }
    if (matrix.kind === 'km_banda') {
        const p = pickKmBandaTier(matrix, pricing_variant);
        return {
            porteTierApplied: null,
            coatTypeApplied: null,
            cost: p.cost,
            sale: p.sale,
            pricing_variant: typeof p.variant.km_tier_index === 'number' ? p.variant : null,
        };
    }
    return { porteTierApplied: null, coatTypeApplied: null, cost: refCost, sale: refSale, pricing_variant: null };
}
/** Valida que um override explícito existe em todas as matrizes `porte` dos serviços indicados. */
function validatePorteOverrideForServiceTypes(serviceTypes, overrideTier) {
    const t = overrideTier?.trim();
    if (!t)
        return true;
    const porteServices = serviceTypes.filter((st) => {
        const m = parseMatrix(st.pricing_matrix);
        return m?.kind === 'porte';
    });
    for (const st of porteServices) {
        const m = parseMatrix(st.pricing_matrix);
        const set = matrixPorteTierSet(m);
        if (set && !set.has(t)) {
            return {
                error: `O porte «${t}» não existe na matriz de preços do serviço selecionado (${st.id}). Ajuste a matriz ou escolha outro porte.`,
            };
        }
    }
    return true;
}
function validateCoatOverrideForServiceTypes(serviceTypes, overrideCoatType) {
    const t = overrideCoatType?.trim();
    if (!t)
        return true;
    if (!hubServiceTypesPricingMatrix_1.COAT_TYPE_VALUES.includes(t))
        return { error: `Pelagem inválida: ${t}` };
    const coatServices = serviceTypes.filter((st) => {
        const m = parseMatrix(st.pricing_matrix);
        return m?.kind === 'pelagem' || m?.kind === 'porte_pelagem';
    });
    for (const st of coatServices) {
        const m = parseMatrix(st.pricing_matrix);
        const set = matrixCoatTypeSet(m);
        if (set && !set.has(t)) {
            return {
                error: `A pelagem «${t}» não existe na matriz de preços do serviço selecionado (${st.id}). Ajuste a matriz ou escolha outra pelagem.`,
            };
        }
    }
    return true;
}
function requiresCoatPricing(serviceType) {
    const m = parseMatrix(serviceType.pricing_matrix);
    return m?.kind === 'pelagem' || m?.kind === 'porte_pelagem';
}
