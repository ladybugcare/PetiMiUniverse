"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pricingVariantsEqual = pricingVariantsEqual;
exports.catalogReferenceSaleForPackageItem = catalogReferenceSaleForPackageItem;
exports.referenceSaleAmountForServiceType = referenceSaleAmountForServiceType;
exports.computePackagePriceFromCatalog = computePackagePriceFromCatalog;
exports.computePackageCatalogSubtotal = computePackageCatalogSubtotal;
exports.loadPackageWithItems = loadPackageWithItems;
exports.resolvePackagePurchasePetIds = resolvePackagePurchasePetIds;
exports.resolvePackagePurchaseLines = resolvePackagePurchaseLines;
exports.buildComandaItemsFromPackagePurchases = buildComandaItemsFromPackagePurchases;
exports.buildComandaItemsFromPackagePurchase = buildComandaItemsFromPackagePurchase;
exports.createPackageBalancesOnCheckout = createPackageBalancesOnCheckout;
exports.listActivePackageBalances = listActivePackageBalances;
exports.findEligiblePackageBalance = findEligiblePackageBalance;
exports.redeemPackageBalancesOnCheckout = redeemPackageBalancesOnCheckout;
exports.reversePackageRedemptionsForComanda = reversePackageRedemptionsForComanda;
exports.fulfillPackagePurchasesOnComandaCheckout = fulfillPackagePurchasesOnComandaCheckout;
exports.newPurchaseGroupId = newPurchaseGroupId;
exports.hasPackageBalanceForServices = hasPackageBalanceForServices;
exports.eligibleBalancesForComandaItem = eligibleBalancesForComandaItem;
const node_crypto_1 = require("node:crypto");
const supabase_1 = require("../../config/supabase");
const hubServiceTypesPricingMatrix_1 = require("./hubServiceTypesPricingMatrix");
const hubPricingResolve_1 = require("./hubPricingResolve");
function matrixNeedsExplicitVariant(matrix) {
    if (!matrix)
        return false;
    return (matrix.kind === 'periodo' ||
        matrix.kind === 'consulta' ||
        matrix.kind === 'km_banda' ||
        matrix.kind === 'personalizado');
}
function pricingVariantsEqual(a, b) {
    const norm = (v) => {
        if (!v)
            return null;
        const out = {};
        if (v.period)
            out.period = v.period;
        if (v.consult_type)
            out.consult_type = v.consult_type;
        if (typeof v.km_tier_index === 'number')
            out.km_tier_index = v.km_tier_index;
        if (typeof v.custom_tier_index === 'number')
            out.custom_tier_index = v.custom_tier_index;
        return Object.keys(out).length ? out : null;
    };
    return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
/** Preço de referência do catálogo para composição do pacote. */
function catalogReferenceSaleForPackageItem(st, pricingVariant) {
    const matrix = parseMatrix(st.pricing_matrix);
    if (matrixNeedsExplicitVariant(matrix)) {
        const resolved = (0, hubPricingResolve_1.resolveServiceLinePricing)({
            serviceType: st,
            pet: { size_tier: 'medio', birth_date: null, coat_type: null },
            appointmentDateYmd: new Date().toISOString().slice(0, 10),
            puppyMaxMonths: 12,
            overrideTier: null,
            overrideCoatType: null,
            pricing_variant: pricingVariant,
        });
        return resolved.sale;
    }
    return referenceSaleAmountForServiceType(st);
}
function parseMatrix(raw) {
    const p = (0, hubServiceTypesPricingMatrix_1.parsePricingMatrixJson)(raw);
    if (!p || typeof p !== 'object' || 'error' in p)
        return null;
    return p;
}
/** Menor preço de venda na matriz (tier de referência para catálogo de pacotes). */
function referenceSaleAmountForServiceType(st) {
    const matrix = parseMatrix(st.pricing_matrix);
    const refSale = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(Number(st.sale_amount) || 0);
    if (!matrix || !matrix.tiers?.length)
        return refSale;
    let min = Infinity;
    for (const tier of matrix.tiers) {
        const sale = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(Number(tier.sale_amount) || 0);
        if (sale < min)
            min = sale;
    }
    return min === Infinity ? refSale : min;
}
function computePackagePriceFromCatalog(catalogSubtotal, discountAmount, discountPercent) {
    let price = catalogSubtotal;
    if (discountPercent != null && discountPercent > 0) {
        price = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(price * (1 - discountPercent / 100));
    }
    price = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(Math.max(0, price - discountAmount));
    return price;
}
async function computePackageCatalogSubtotal(clinicId, items) {
    if (!items.length)
        return { catalog_subtotal: 0, lines: [] };
    const ids = [...new Set(items.map((i) => i.hub_service_type_id))];
    const { data: types, error } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, name, sale_amount, cost_amount, pricing_matrix, is_addon, active, deleted_at, service_group')
        .eq('clinic_id', clinicId)
        .in('id', ids);
    if (error)
        throw new Error(error.message);
    const byId = new Map((types ?? []).map((t) => [t.id, t]));
    const lines = [];
    let catalogSubtotal = 0;
    for (const item of items) {
        const st = byId.get(item.hub_service_type_id);
        if (!st || st.deleted_at || !st.active) {
            throw new Error(`Serviço inválido ou inativo: ${item.hub_service_type_id}`);
        }
        const matrix = parseMatrix(st.pricing_matrix);
        const variant = item.pricing_variant ?? null;
        if (matrixNeedsExplicitVariant(matrix) && !variant) {
            throw new Error(`Selecione a opção de preço para «${String(st.name ?? 'serviço')}»`);
        }
        const unitRef = catalogReferenceSaleForPackageItem(st, variant);
        const lineTotal = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(unitRef * item.quantity);
        catalogSubtotal += lineTotal;
        lines.push({
            hub_service_type_id: item.hub_service_type_id,
            quantity: item.quantity,
            unit_reference_sale: unitRef,
            line_total: lineTotal,
            service_name: String(st.name ?? 'Serviço'),
            is_addon: Boolean(st.is_addon),
            pricing_variant: variant,
        });
    }
    return { catalog_subtotal: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(catalogSubtotal), lines };
}
async function loadPackageWithItems(clinicId, packageId) {
    const { data: pkg, error } = await supabase_1.supabaseAdmin
        .from('hub_packages')
        .select('*')
        .eq('id', packageId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!pkg)
        return null;
    const { data: items, error: iErr } = await supabase_1.supabaseAdmin
        .from('hub_package_items')
        .select('id, package_id, hub_service_type_id, quantity, sort_order, pricing_variant, hub_service_types(id, name, sale_amount, is_addon)')
        .eq('package_id', packageId)
        .eq('clinic_id', clinicId)
        .order('sort_order', { ascending: true });
    if (iErr)
        throw new Error(iErr.message);
    let resolvedItems = (items ?? []);
    if (resolvedItems.length === 0 && pkg.hub_service_type_id) {
        resolvedItems = [
            {
                id: 'legacy',
                package_id: packageId,
                hub_service_type_id: pkg.hub_service_type_id,
                quantity: Number(pkg.sessions_total ?? 1),
                sort_order: 0,
                hub_service_types: null,
            },
        ];
    }
    return { package: pkg, items: resolvedItems };
}
function resolvePackagePurchasePetIds(input) {
    const deduped = input.pet_ids?.length
        ? [...new Set(input.pet_ids.filter((id) => typeof id === 'string' && id.length > 0))]
        : [];
    if (deduped.length)
        return deduped;
    if (input.pet_id)
        return [input.pet_id];
    return [null];
}
function resolvePackagePurchaseLines(input) {
    if (input.package_lines?.length) {
        const seen = new Set();
        const lines = [];
        for (const ln of input.package_lines) {
            const key = `${ln.packageId}:${ln.petId}`;
            if (seen.has(key))
                throw new Error('DUPLICATE_PACKAGE_PET_LINE');
            seen.add(key);
            lines.push({ packageId: ln.packageId, petId: ln.petId });
        }
        return lines;
    }
    if (!input.package_id)
        throw new Error('PACKAGE_ID_REQUIRED');
    const petIds = resolvePackagePurchasePetIds({ pet_id: input.pet_id, pet_ids: input.pet_ids });
    return petIds.map((petId) => ({ packageId: input.package_id, petId }));
}
async function resolveDefaultUnitId(clinicId, unitId) {
    if (unitId)
        return unitId;
    const { data: main } = await supabase_1.supabaseAdmin
        .from('units')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('is_main', true)
        .limit(1)
        .maybeSingle();
    return main?.id ?? null;
}
async function buildComandaItemsFromPackagePurchases(input) {
    if (!input.lines.length)
        throw new Error('PACKAGE_LINES_REQUIRED');
    const unitId = await resolveDefaultUnitId(input.clinicId, input.unitId);
    const uniquePackageIds = [...new Set(input.lines.map((ln) => ln.packageId))];
    const packageCache = new Map();
    for (const packageId of uniquePackageIds) {
        const loaded = await loadPackageWithItems(input.clinicId, packageId);
        if (!loaded)
            throw new Error('NOT_FOUND');
        if (!loaded.package.active)
            throw new Error('PACKAGE_INACTIVE');
        packageCache.set(packageId, loaded);
    }
    const petIdsToFetch = [...new Set(input.lines.map((ln) => ln.petId).filter((id) => Boolean(id)))];
    const petNames = new Map();
    if (petIdsToFetch.length) {
        const { data: pets, error: petsErr } = await supabase_1.supabaseAdmin
            .from('hub_pets')
            .select('id, name')
            .eq('clinic_id', input.clinicId)
            .in('id', petIdsToFetch);
        if (petsErr)
            throw new Error(petsErr.message);
        for (const pet of pets ?? []) {
            petNames.set(pet.id, String(pet.name ?? 'Pet'));
        }
        for (const petId of petIdsToFetch) {
            if (!petNames.has(petId))
                throw new Error('PET_NOT_FOUND');
        }
    }
    const items = [];
    let subtotal = 0;
    input.lines.forEach((ln, index) => {
        const loaded = packageCache.get(ln.packageId);
        const pkg = loaded.package;
        const price = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(Number(pkg.price) || 0);
        const petLabel = ln.petId ? petNames.get(ln.petId) : null;
        const description = petLabel ? `Pacote — ${pkg.name} (${petLabel})` : `Pacote — ${pkg.name}`;
        items.push({
            pet_id: ln.petId,
            item_kind: 'fee',
            hub_service_type_id: null,
            hub_inventory_item_id: null,
            hub_inventory_lot_id: null,
            description,
            quantity: 1,
            unit_amount: price,
            discount_amount: 0,
            line_total: price,
            service_date: null,
            origin_type: 'package_purchase',
            origin_id: ln.packageId,
            sort_order: index,
            package_balance_id: null,
        });
        subtotal = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(subtotal + price);
    });
    const uniquePetIds = [...new Set(input.lines.map((ln) => ln.petId).filter((id) => Boolean(id)))];
    const headerPetId = uniquePetIds.length === 1 ? uniquePetIds[0] : null;
    const firstPackageId = input.lines[0].packageId;
    const firstLoaded = packageCache.get(firstPackageId);
    return {
        items,
        subtotal,
        unit_id: unitId,
        guardian_id: input.guardianId,
        pet_id: headerPetId,
        package_id: firstPackageId,
        purchase_group_id: input.purchaseGroupId,
        package_row: firstLoaded.package,
        package_items: firstLoaded.items,
    };
}
async function buildComandaItemsFromPackagePurchase(input) {
    const lines = resolvePackagePurchaseLines({
        package_lines: input.packageLines,
        package_id: input.packageId,
        pet_id: input.petId,
        pet_ids: input.petIds,
    });
    return buildComandaItemsFromPackagePurchases({
        clinicId: input.clinicId,
        purchaseGroupId: input.purchaseGroupId,
        guardianId: input.guardianId,
        unitId: input.unitId,
        lines,
    });
}
async function createPackageBalancesOnCheckout(input) {
    const loaded = await loadPackageWithItems(input.clinicId, input.packageId);
    if (!loaded)
        throw new Error('NOT_FOUND');
    const { package: pkg, items } = loaded;
    const now = new Date();
    let expiresAt = null;
    if (pkg.validity_days != null && pkg.validity_days > 0) {
        const d = new Date(now);
        d.setDate(d.getDate() + pkg.validity_days);
        expiresAt = d.toISOString().slice(0, 10);
    }
    const rows = items.map((it) => ({
        clinic_id: input.clinicId,
        guardian_id: input.guardianId,
        pet_id: input.petId,
        package_id: input.packageId,
        purchase_group_id: input.purchaseGroupId,
        hub_service_type_id: it.hub_service_type_id,
        package_item_id: it.id === 'legacy' ? null : it.id,
        pricing_variant: it.pricing_variant ?? null,
        sessions_total: it.quantity,
        sessions_remaining: it.quantity,
        purchased_receivable_id: input.purchasedReceivableId,
        comanda_id: input.comandaId,
        purchased_at: now.toISOString(),
        expires_at: expiresAt,
    }));
    const { data, error } = await supabase_1.supabaseAdmin.from('hub_customer_package_balances').insert(rows).select('id');
    if (error)
        throw new Error(error.message);
    return data ?? [];
}
async function listActivePackageBalances(input) {
    let q = supabase_1.supabaseAdmin
        .from('hub_customer_package_balances')
        .select('id, clinic_id, guardian_id, pet_id, package_id, hub_service_type_id, sessions_remaining, sessions_total, expires_at, purchased_at, purchase_group_id, pricing_variant, hub_packages(id, name), hub_service_types(id, name)')
        .eq('clinic_id', input.clinicId)
        .gt('sessions_remaining', 0);
    if (input.guardianId)
        q = q.eq('guardian_id', input.guardianId);
    if (input.petId)
        q = q.or(`pet_id.eq.${input.petId},pet_id.is.null`);
    if (input.hubServiceTypeId)
        q = q.eq('hub_service_type_id', input.hubServiceTypeId);
    const { data, error } = await q.order('expires_at', { ascending: true, nullsFirst: false }).order('purchased_at', { ascending: true });
    if (error)
        throw new Error(error.message);
    const today = new Date().toISOString().slice(0, 10);
    return (data ?? []).filter((row) => {
        const exp = row.expires_at;
        return !exp || exp >= today;
    });
}
/** FIFO: saldo mais antigo com validade mais próxima. */
async function findEligiblePackageBalance(input) {
    const balances = await listActivePackageBalances({
        clinicId: input.clinicId,
        guardianId: input.guardianId,
        hubServiceTypeId: input.hubServiceTypeId,
    });
    const exclude = new Set(input.excludeBalanceIds ?? []);
    for (const b of balances) {
        if (exclude.has(b.id))
            continue;
        const balPet = b.pet_id;
        if (balPet && input.petId && balPet !== input.petId)
            continue;
        if (balPet && !input.petId)
            continue;
        const balVariant = b.pricing_variant ?? null;
        if (balVariant && !pricingVariantsEqual(balVariant, input.pricingVariant))
            continue;
        return b;
    }
    return null;
}
async function redeemPackageBalancesOnCheckout(input) {
    const { data: items, error } = await supabase_1.supabaseAdmin
        .from('hub_comanda_items')
        .select('id, package_balance_id, origin_type, origin_id, hub_service_type_id')
        .eq('comanda_id', input.comandaId)
        .not('package_balance_id', 'is', null);
    if (error)
        throw new Error(error.message);
    const redeemed = [];
    for (const it of items ?? []) {
        const balanceId = it.package_balance_id;
        const { data: bal, error: bErr } = await supabase_1.supabaseAdmin
            .from('hub_customer_package_balances')
            .select('id, sessions_remaining, clinic_id')
            .eq('id', balanceId)
            .eq('clinic_id', input.clinicId)
            .maybeSingle();
        if (bErr || !bal)
            throw new Error('PACKAGE_BALANCE_NOT_FOUND');
        if (Number(bal.sessions_remaining) <= 0)
            throw new Error('PACKAGE_BALANCE_EMPTY');
        const appointmentServiceId = String(it.origin_type) === 'appointment_service' ? it.origin_id : null;
        const { error: rErr } = await supabase_1.supabaseAdmin.from('hub_package_redemptions').insert({
            clinic_id: input.clinicId,
            balance_id: balanceId,
            comanda_item_id: it.id,
            appointment_service_id: appointmentServiceId,
            redeemed_by_staff_id: null,
        });
        if (rErr)
            throw new Error(rErr.message);
        const { error: uErr } = await supabase_1.supabaseAdmin
            .from('hub_customer_package_balances')
            .update({ sessions_remaining: Number(bal.sessions_remaining) - 1 })
            .eq('id', balanceId)
            .eq('clinic_id', input.clinicId);
        if (uErr)
            throw new Error(uErr.message);
        redeemed.push(balanceId);
    }
    return redeemed;
}
async function reversePackageRedemptionsForComanda(clinicId, comandaId) {
    const { data: items } = await supabase_1.supabaseAdmin.from('hub_comanda_items').select('id').eq('comanda_id', comandaId);
    const itemIds = (items ?? []).map((i) => i.id);
    if (!itemIds.length)
        return;
    const { data: redemptions } = await supabase_1.supabaseAdmin
        .from('hub_package_redemptions')
        .select('id, balance_id')
        .in('comanda_item_id', itemIds)
        .is('reversed_at', null);
    const now = new Date().toISOString();
    for (const r of redemptions ?? []) {
        await supabase_1.supabaseAdmin
            .from('hub_package_redemptions')
            .update({ reversed_at: now })
            .eq('id', r.id);
        const { data: bal } = await supabase_1.supabaseAdmin
            .from('hub_customer_package_balances')
            .select('sessions_remaining')
            .eq('id', r.balance_id)
            .maybeSingle();
        if (bal) {
            await supabase_1.supabaseAdmin
                .from('hub_customer_package_balances')
                .update({ sessions_remaining: Number(bal.sessions_remaining) + 1 })
                .eq('id', r.balance_id);
        }
    }
}
/** Cria saldos de pacote para cada linha `package_purchase` da comanda (idempotente por comanda + pacote + pet). */
async function fulfillPackagePurchasesOnComandaCheckout(input) {
    const seen = new Set();
    for (const line of input.packagePurchaseLines) {
        const key = `${line.packageId}:${line.petId ?? 'null'}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        let existingQ = supabase_1.supabaseAdmin
            .from('hub_customer_package_balances')
            .select('id')
            .eq('clinic_id', input.clinicId)
            .eq('comanda_id', input.comandaId)
            .eq('package_id', line.packageId)
            .limit(1);
        existingQ = line.petId ? existingQ.eq('pet_id', line.petId) : existingQ.is('pet_id', null);
        const { data: existingBalances, error: existingErr } = await existingQ;
        if (existingErr)
            throw new Error(existingErr.message);
        if (existingBalances?.length)
            continue;
        await createPackageBalancesOnCheckout({
            clinicId: input.clinicId,
            comandaId: input.comandaId,
            purchaseGroupId: input.purchaseGroupId,
            packageId: line.packageId,
            guardianId: input.guardianId,
            petId: line.petId,
            purchasedReceivableId: input.purchasedReceivableId,
        });
    }
}
function newPurchaseGroupId() {
    return (0, node_crypto_1.randomUUID)();
}
function hasPackageBalanceForServices(balances, guardianId, petId, serviceTypeIds) {
    if (!guardianId || !serviceTypeIds.length)
        return false;
    for (const stId of serviceTypeIds) {
        for (const b of balances) {
            if (String(b.guardian_id) !== guardianId)
                continue;
            if (String(b.hub_service_type_id) !== stId)
                continue;
            const balPet = b.pet_id;
            if (balPet && petId && balPet !== petId)
                continue;
            if (balPet && !petId)
                continue;
            return true;
        }
    }
    return false;
}
async function eligibleBalancesForComandaItem(input) {
    const balances = await listActivePackageBalances({
        clinicId: input.clinicId,
        guardianId: input.guardianId,
        hubServiceTypeId: input.hubServiceTypeId,
    });
    return balances.filter((b) => {
        const balPet = b.pet_id;
        if (balPet && input.petId && balPet !== input.petId)
            return false;
        if (balPet && !input.petId)
            return false;
        const balVariant = b.pricing_variant ?? null;
        if (balVariant && !pricingVariantsEqual(balVariant, input.pricingVariant))
            return false;
        return true;
    });
}
