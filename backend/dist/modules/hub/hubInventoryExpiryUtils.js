"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOT_EXPIRED_SALE_MSG = exports.LOT_EXPIRED_CREATE_MSG = void 0;
exports.inventoryTodayYmd = inventoryTodayYmd;
exports.isLotExpired = isLotExpired;
/** Data local YYYY-MM-DD (mesmo critério operacional do estoque). */
function inventoryTodayYmd(now = new Date()) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
/** Lote vencido quando tem validade e ela é estritamente anterior a hoje. */
function isLotExpired(expiryDate, todayYmd = inventoryTodayYmd()) {
    if (expiryDate == null || expiryDate === '')
        return false;
    return expiryDate < todayYmd;
}
exports.LOT_EXPIRED_CREATE_MSG = 'Não é permitido cadastrar lote com validade vencida.';
exports.LOT_EXPIRED_SALE_MSG = 'Não é permitido vender produto com lote vencido.';
