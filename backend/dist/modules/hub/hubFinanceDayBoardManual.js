"use strict";
/** Montagem de linhas do day board a partir de comandas manuais (venda rápida). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildManualDayBoardServices = buildManualDayBoardServices;
exports.buildManualDayBoardItem = buildManualDayBoardItem;
exports.buildManualServicesFromReceivableLines = buildManualServicesFromReceivableLines;
function round2(n) {
    return Math.round(n * 100) / 100;
}
function lineLabel(line) {
    const raw = String(line.description ?? '').trim() || 'Item';
    const qty = Number(line.quantity ?? 1);
    const kind = String(line.item_kind ?? '');
    const prefix = kind === 'product' ? '' : '';
    if (qty > 1.009)
        return `${prefix}${raw} ×${qty}`;
    return `${prefix}${raw}`;
}
function normalizeLineKind(raw) {
    const k = String(raw ?? '').trim();
    if (k === 'product')
        return 'product';
    if (k === 'fee')
        return 'fee';
    if (k === 'service')
        return 'service';
    if (k === 'manual')
        return 'service';
    return null;
}
/** Agrupa linhas de comanda (serviços + produtos) para a coluna de serviços do day board. */
function buildManualDayBoardServices(lines) {
    const open = lines.filter((l) => String(l.status ?? 'open') !== 'cancelled');
    return open.map((l) => ({
        name: lineLabel(l),
        amount: round2(Number(l.line_total ?? 0)),
        kind: normalizeLineKind(l.item_kind),
    }));
}
function buildManualDayBoardItem(comanda, lines) {
    const services = buildManualDayBoardServices(lines);
    const fromLines = round2(services.reduce((s, sv) => s + sv.amount, 0));
    const estimated = fromLines > 0.009 ? fromLines : round2(Number(comanda.total_amount ?? 0));
    let petId = comanda.pet_id;
    let pet = comanda.pet;
    if (!petId) {
        const withPet = lines.find((l) => l.pet_id);
        if (withPet?.pet_id)
            petId = withPet.pet_id;
    }
    return {
        origin_type: 'manual',
        origin_id: comanda.origin_id,
        origin_label: 'Venda rápida',
        service_group: null,
        starts_at: comanda.opened_at,
        guardian_id: comanda.guardian_id,
        guardian: comanda.guardian,
        pet_id: petId,
        pet,
        operational_status: String(comanda.status || 'open'),
        estimated_amount: estimated,
        services,
    };
}
/** Enriquecimento de stub manual a partir de linhas de recebível (sem comanda). */
function buildManualServicesFromReceivableLines(lines) {
    return lines.map((l) => {
        const raw = String(l.description ?? '').trim() || 'Item';
        const qty = Number(l.quantity ?? 1);
        const name = qty > 1.009 ? `${raw} ×${qty}` : raw;
        return {
            name,
            amount: round2(Number(l.line_total ?? 0)),
            kind: normalizeLineKind(l.line_kind),
        };
    });
}
