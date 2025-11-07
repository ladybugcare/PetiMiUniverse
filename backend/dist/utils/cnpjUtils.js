"use strict";
/**
 * Utilitários para normalização e validação de CNPJ
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidCNPJFormat = exports.normalizeCNPJ = void 0;
/**
 * Remove formatação do CNPJ (pontos, barras e traços)
 * @param cnpj CNPJ formatado ou não
 * @returns CNPJ apenas com números
 */
const normalizeCNPJ = (cnpj) => {
    if (!cnpj)
        return '';
    return cnpj.replace(/\D/g, '');
};
exports.normalizeCNPJ = normalizeCNPJ;
/**
 * Valida se o CNPJ tem o formato correto (14 dígitos)
 * @param cnpj CNPJ normalizado (apenas números)
 * @returns true se tiver 14 dígitos
 */
const isValidCNPJFormat = (cnpj) => {
    const normalized = (0, exports.normalizeCNPJ)(cnpj);
    return normalized.length === 14;
};
exports.isValidCNPJFormat = isValidCNPJFormat;
