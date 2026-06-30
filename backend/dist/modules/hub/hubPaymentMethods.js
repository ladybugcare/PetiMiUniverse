"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentMethodNotAcceptedError = exports.patchPaymentMethodSettingsSchema = exports.HUB_PAYMENT_METHOD_LABELS = exports.hubPaymentMethodSchema = exports.HUB_PAYMENT_METHODS = void 0;
exports.normalizeAcceptedPaymentMethods = normalizeAcceptedPaymentMethods;
exports.getAcceptedPaymentMethods = getAcceptedPaymentMethods;
exports.assertPaymentMethodInList = assertPaymentMethodInList;
const zod_1 = require("zod");
exports.HUB_PAYMENT_METHODS = [
    'pix',
    'cash',
    'credit_card',
    'debit_card',
    'transfer',
    'payment_link',
    'customer_credit',
];
exports.hubPaymentMethodSchema = zod_1.z.enum(exports.HUB_PAYMENT_METHODS);
exports.HUB_PAYMENT_METHOD_LABELS = {
    pix: 'Pix',
    cash: 'Dinheiro',
    credit_card: 'Cartão de crédito',
    debit_card: 'Cartão de débito',
    transfer: 'Transferência',
    payment_link: 'Link de pagamento',
    customer_credit: 'Crédito do tutor',
};
const acceptedPaymentMethodsSchema = zod_1.z
    .array(exports.hubPaymentMethodSchema)
    .min(1, 'Selecione pelo menos uma forma de pagamento')
    .refine((arr) => new Set(arr).size === arr.length, 'Formas de pagamento duplicadas');
exports.patchPaymentMethodSettingsSchema = zod_1.z
    .object({
    clinic_id: zod_1.z.string().uuid(),
    accepted_payment_methods: acceptedPaymentMethodsSchema,
})
    .strict();
/** Fallback para lista completa se vazio ou inválido. */
function normalizeAcceptedPaymentMethods(raw) {
    if (!Array.isArray(raw) || raw.length === 0) {
        return [...exports.HUB_PAYMENT_METHODS];
    }
    const valid = new Set(exports.HUB_PAYMENT_METHODS);
    const filtered = raw.filter((m) => typeof m === 'string' && valid.has(m));
    return filtered.length > 0 ? filtered : [...exports.HUB_PAYMENT_METHODS];
}
class PaymentMethodNotAcceptedError extends Error {
    statusCode = 400;
    constructor(method) {
        const label = exports.HUB_PAYMENT_METHOD_LABELS[method] ?? method;
        super(`Forma de pagamento "${label}" não está habilitada para esta clínica.`);
        this.name = 'PaymentMethodNotAcceptedError';
    }
}
exports.PaymentMethodNotAcceptedError = PaymentMethodNotAcceptedError;
async function getAcceptedPaymentMethods(getSettings, clinicId) {
    const settings = await getSettings(clinicId);
    return normalizeAcceptedPaymentMethods(settings.accepted_payment_methods);
}
function assertPaymentMethodInList(method, accepted) {
    if (!accepted.includes(method)) {
        throw new PaymentMethodNotAcceptedError(method);
    }
}
