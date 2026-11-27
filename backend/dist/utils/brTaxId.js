"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeBrTaxId = normalizeBrTaxId;
exports.isValidCpf = isValidCpf;
exports.isValidCnpj = isValidCnpj;
exports.isValidBrTaxId = isValidBrTaxId;
exports.isValidBrPhone = isValidBrPhone;
exports.firstZodFieldMessage = firstZodFieldMessage;
/** Normaliza CPF/CNPJ para só dígitos. */
function normalizeBrTaxId(raw) {
    if (!raw)
        return '';
    return String(raw).replace(/\D/g, '');
}
function allSameDigit(digits) {
    return /^(\d)\1+$/.test(digits);
}
/** Valida CPF (11 dígitos + dígitos verificadores). */
function isValidCpf(raw) {
    const cpf = normalizeBrTaxId(raw);
    if (cpf.length !== 11)
        return false;
    if (allSameDigit(cpf))
        return false;
    let sum = 0;
    for (let i = 1; i <= 9; i++) {
        sum += parseInt(cpf.substring(i - 1, i), 10) * (11 - i);
    }
    let remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11)
        remainder = 0;
    if (remainder !== parseInt(cpf.substring(9, 10), 10))
        return false;
    sum = 0;
    for (let i = 1; i <= 10; i++) {
        sum += parseInt(cpf.substring(i - 1, i), 10) * (12 - i);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11)
        remainder = 0;
    return remainder === parseInt(cpf.substring(10, 11), 10);
}
/** Valida CNPJ (14 dígitos + dígitos verificadores). */
function isValidCnpj(raw) {
    const cnpj = normalizeBrTaxId(raw);
    if (cnpj.length !== 14)
        return false;
    if (allSameDigit(cnpj))
        return false;
    let length = cnpj.length - 2;
    let numbers = cnpj.substring(0, length);
    const digits = cnpj.substring(length);
    let sum = 0;
    let pos = length - 7;
    for (let i = length; i >= 1; i--) {
        sum += parseInt(numbers.charAt(length - i), 10) * pos--;
        if (pos < 2)
            pos = 9;
    }
    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0), 10))
        return false;
    length += 1;
    numbers = cnpj.substring(0, length);
    sum = 0;
    pos = length - 7;
    for (let i = length; i >= 1; i--) {
        sum += parseInt(numbers.charAt(length - i), 10) * pos--;
        if (pos < 2)
            pos = 9;
    }
    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return result === parseInt(digits.charAt(1), 10);
}
/** CPF (11) ou CNPJ (14) com dígitos verificadores válidos. */
function isValidBrTaxId(raw) {
    const d = normalizeBrTaxId(raw);
    if (d.length === 11)
        return isValidCpf(d);
    if (d.length === 14)
        return isValidCnpj(d);
    return false;
}
/** Telefone BR: 10 (fixixo) ou 11 (celular) dígitos. */
function isValidBrPhone(raw) {
    if (!raw)
        return false;
    const d = String(raw).replace(/\D/g, '');
    return d.length === 10 || d.length === 11;
}
/** Primeira mensagem legível de um flatten do Zod. */
function firstZodFieldMessage(flatten, fallback = 'Dados inválidos') {
    for (const msgs of Object.values(flatten.fieldErrors)) {
        if (msgs?.[0])
            return msgs[0];
    }
    if (flatten.formErrors[0])
        return flatten.formErrors[0];
    return fallback;
}
