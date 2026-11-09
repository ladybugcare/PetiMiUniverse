"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.comandaProductOriginAlreadyStockedOut = comandaProductOriginAlreadyStockedOut;
/** Origens de linha de produto cujo estoque já saiu via encounter_out (não repetir sale_out no checkout). */
function comandaProductOriginAlreadyStockedOut(originType) {
    const t = String(originType ?? '');
    return t === 'vaccination' || t === 'medication_product';
}
