"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyHubPetReady = notifyHubPetReady;
exports.notifyHubGroomingExtraRequest = notifyHubGroomingExtraRequest;
exports.notifyHubPetOnTheWay = notifyHubPetOnTheWay;
exports.notifyHubPetArrived = notifyHubPetArrived;
exports.notifyHubCancellationPending = notifyHubCancellationPending;
exports.notifyHubPaymentDue = notifyHubPaymentDue;
exports.notifyHubStockAlert = notifyHubStockAlert;
exports.notifyHubNearlyEmptyLot = notifyHubNearlyEmptyLot;
exports.notifyHubStockExpiryAlert = notifyHubStockExpiryAlert;
exports.notifyHubBoardingCheckin = notifyHubBoardingCheckin;
exports.notifyHubBoardingCheckout = notifyHubBoardingCheckout;
/**
 * Emissores de notificação por evento operacional do Hub.
 *
 * Cada função sabe **quem** deve saber do evento (áreas operacionais) e monta o
 * texto/link; os controllers só disparam. Nenhuma delas lança: notificação nunca
 * pode quebrar o fluxo de negócio.
 */
const supabase_1 = require("../../config/supabase");
const hubNotifyStaff_1 = require("./hubNotifyStaff");
function brl(amount) {
    return Number(amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatDueDate(iso) {
    if (!iso)
        return null;
    const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime()))
        return null;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
async function resolvePetName(petId) {
    if (!petId)
        return 'Pet';
    try {
        const { data } = await supabase_1.supabaseAdmin
            .from('hub_pets')
            .select('name')
            .eq('id', petId)
            .maybeSingle();
        return String(data?.name ?? '').trim() || 'Pet';
    }
    catch {
        return 'Pet';
    }
}
async function resolveGuardianName(guardianId) {
    if (!guardianId)
        return null;
    try {
        const { data } = await supabase_1.supabaseAdmin
            .from('hub_guardians')
            .select('full_name')
            .eq('id', guardianId)
            .maybeSingle();
        return String(data?.full_name ?? '').trim() || null;
    }
    catch {
        return null;
    }
}
/** Pet pronto para retirada — quem atende o tutor no balcão e no caixa. */
async function notifyHubPetReady(opts) {
    const pet = await resolvePetName(opts.petId);
    await (0, hubNotifyStaff_1.hubNotifyStaff)({
        clinicId: opts.clinicId,
        unitId: opts.unitId,
        areas: ['recepcao', 'caixa'],
        excludeUserIds: opts.excludeUserIds,
        type: 'hub_pet_ready',
        title: 'Pet pronto para retirada',
        message: `${pet} já está pronto(a) para retirada.`,
        link: '/hub/recepcao',
        entityType: 'grooming_session',
        entityId: opts.sessionId,
    });
}
/** Salão pediu outro serviço (ex.: desembolo) — recepção pede autorização ao tutor. */
async function notifyHubGroomingExtraRequest(opts) {
    const pet = await resolvePetName(opts.petId);
    const service = opts.extraName.trim() || 'outro serviço';
    await (0, hubNotifyStaff_1.hubNotifyStaff)({
        clinicId: opts.clinicId,
        unitId: opts.unitId,
        areas: ['recepcao'],
        excludeUserIds: opts.excludeUserIds,
        type: 'hub_grooming_extra_request',
        title: 'Serviço precisa de autorização',
        message: `${pet}: a equipe pediu ${service}. Peça autorização ao tutor e inclua o serviço.`,
        link: '/hub/recepcao',
        entityType: 'grooming_session',
        entityId: opts.sessionId,
    });
}
/** Pet embarcado no leva e traz, a caminho da clínica — recepção se prepara. */
async function notifyHubPetOnTheWay(opts) {
    const pet = await resolvePetName(opts.petId);
    await (0, hubNotifyStaff_1.hubNotifyStaff)({
        clinicId: opts.clinicId,
        unitId: opts.unitId,
        areas: ['recepcao'],
        excludeUserIds: opts.excludeUserIds,
        type: 'hub_pet_on_the_way',
        title: 'Pet a caminho da clínica',
        message: `${pet} embarcou no leva e traz e está a caminho.`,
        link: '/hub/leva-e-traz',
        entityType: 'pickup_stop',
        entityId: opts.stopId,
    });
}
/** Pet desembarcou do leva e traz na unidade — recepção + módulo operacional. */
async function notifyHubPetArrived(opts) {
    const pet = await resolvePetName(opts.petId);
    const areas = opts.module === 'grooming'
        ? ['recepcao', 'banho_tosa']
        : opts.module === 'clinical'
            ? ['recepcao', 'clinica']
            : opts.module === 'boarding'
                ? ['recepcao', 'hotel_creche']
                : ['recepcao'];
    const link = opts.module === 'grooming'
        ? '/hub/banho-tosa'
        : opts.module === 'clinical'
            ? '/hub/clinica/atendimentos'
            : opts.module === 'boarding'
                ? '/hub/hotel-creche'
                : '/hub/leva-e-traz';
    const where = opts.module === 'grooming'
        ? 'e entrou na fila de banho e tosa'
        : opts.module === 'clinical'
            ? 'e aguarda no consultório'
            : opts.module === 'boarding'
                ? 'e deu entrada no hotel/creche'
                : 'via leva e traz';
    await (0, hubNotifyStaff_1.hubNotifyStaff)({
        clinicId: opts.clinicId,
        unitId: opts.unitId,
        areas: [...areas],
        excludeUserIds: opts.excludeUserIds,
        type: 'hub_pet_arrived',
        title: 'Pet chegou na clínica',
        message: `${pet} chegou ${where}.`,
        link,
        entityType: 'appointment',
        entityId: opts.appointmentId,
    });
}
/** Cancelamento operacional com valor já pago — caixa e financeiro resolvem. */
async function notifyHubCancellationPending(opts) {
    const guardian = await resolveGuardianName(opts.guardianId);
    const valor = opts.paidAmount && opts.paidAmount > 0 ? ` (${brl(opts.paidAmount)} já pago)` : '';
    await (0, hubNotifyStaff_1.hubNotifyStaff)({
        clinicId: opts.clinicId,
        unitId: opts.unitId,
        areas: ['caixa', 'financeiro'],
        type: 'hub_cancellation_pending',
        title: 'Cancelamento com pendência financeira',
        message: guardian
            ? `Atendimento de ${guardian} foi cancelado${valor}. Defina estorno, crédito ou cobrança.`
            : `Um atendimento foi cancelado${valor}. Defina estorno, crédito ou cobrança.`,
        link: '/hub/financeiro?tab=adjustments',
        entityType: 'comanda',
        entityId: opts.comandaId,
    });
}
/** Cobrança vencida ou saldo remanescente — caixa e financeiro acompanham. */
async function notifyHubPaymentDue(opts) {
    const guardian = await resolveGuardianName(opts.guardianId);
    const quem = guardian ? `${guardian}: ` : '';
    const venc = formatDueDate(opts.dueDate);
    const message = opts.reason === 'overdue'
        ? `${quem}cobrança de ${brl(opts.amount)} criada já vencida${venc ? ` em ${venc}` : ''}.`
        : `${quem}pagamento parcial recebido, restam ${brl(opts.amount)} em aberto.`;
    await (0, hubNotifyStaff_1.hubNotifyStaff)({
        clinicId: opts.clinicId,
        unitId: opts.unitId,
        areas: ['caixa', 'financeiro'],
        type: 'hub_payment_due',
        title: opts.reason === 'overdue' ? 'Cobrança vencida' : 'Saldo em aberto após pagamento',
        message,
        link: '/hub/financeiro',
        entityType: 'receivable',
        entityId: opts.receivableId,
    });
}
/** Item abaixo do estoque mínimo — só quem cuida de estoque (e gestores). */
async function notifyHubStockAlert(opts) {
    await (0, hubNotifyStaff_1.hubNotifyStaff)({
        clinicId: opts.clinicId,
        areas: ['estoque'],
        type: 'hub_stock_alert',
        title: 'Estoque abaixo do mínimo',
        message: `${opts.itemName}: ${opts.qtyOnHand} em estoque (mínimo ${opts.minQty}).`,
        link: '/hub/estoque/alertas',
        entityType: 'inventory_item',
        entityId: opts.itemId,
    });
}
/** Embalagem quase vazia após uso fracionado — quem pode zerar o resto. */
async function notifyHubNearlyEmptyLot(opts) {
    const lotLabel = opts.lotCode?.trim() ? `lote ${opts.lotCode}` : 'lote sem código';
    const stockPart = `${opts.remainingStock} ${opts.unitLabel}`;
    const contentPart = opts.remainingContent != null && opts.contentUnit
        ? ` (${opts.remainingContent} ${opts.contentUnit})`
        : '';
    await (0, hubNotifyStaff_1.hubNotifyStaff)({
        clinicId: opts.clinicId,
        areas: ['estoque'],
        type: 'hub_stock_alert',
        title: 'Embalagem quase vazia',
        message: `${opts.itemName} (${lotLabel}): restam ${stockPart}${contentPart}. Quem tem estoque pode dar a baixa completa do resto.`,
        link: '/hub/estoque/alertas',
        entityType: 'inventory_lot',
        entityId: opts.lotId,
    });
}
/** Lote dentro da janela de alerta de validade do item. */
async function notifyHubStockExpiryAlert(opts) {
    const lotLabel = opts.lotCode?.trim() ? `lote ${opts.lotCode}` : 'lote sem código';
    await (0, hubNotifyStaff_1.hubNotifyStaff)({
        clinicId: opts.clinicId,
        areas: ['estoque'],
        type: 'hub_stock_alert',
        title: 'Validade próxima',
        message: `${opts.itemName} (${lotLabel}): vence em ${opts.daysUntil} dia(s) (${opts.expiryDate}).`,
        link: '/hub/estoque/alertas',
        entityType: 'inventory_lot',
        entityId: opts.lotId,
    });
}
/** Check-in de hotel/creche — hotel e recepção. */
async function notifyHubBoardingCheckin(opts) {
    const pet = await resolvePetName(opts.petId);
    await (0, hubNotifyStaff_1.hubNotifyStaff)({
        clinicId: opts.clinicId,
        unitId: opts.unitId,
        areas: ['hotel_creche', 'recepcao'],
        excludeUserIds: opts.excludeUserIds,
        type: 'hub_boarding_checkin',
        title: 'Check-in realizado',
        message: `${pet} deu entrada no hotel/creche.`,
        link: '/hub/hotel-creche',
        entityType: 'boarding_reservation',
        entityId: opts.reservationId,
    });
}
/** Check-out de hotel/creche — hotel e caixa (fechar a cobrança). */
async function notifyHubBoardingCheckout(opts) {
    const pet = await resolvePetName(opts.petId);
    await (0, hubNotifyStaff_1.hubNotifyStaff)({
        clinicId: opts.clinicId,
        unitId: opts.unitId,
        areas: ['hotel_creche', 'caixa'],
        excludeUserIds: opts.excludeUserIds,
        type: 'hub_boarding_checkout',
        title: 'Check-out realizado',
        message: `${pet} saiu do hotel/creche — confira a cobrança.`,
        link: '/hub/hotel-creche',
        entityType: 'boarding_reservation',
        entityId: opts.reservationId,
    });
}
