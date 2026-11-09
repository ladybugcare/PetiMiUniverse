"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mercadoPagoAccessToken = mercadoPagoAccessToken;
exports.mercadoPagoConfigured = mercadoPagoConfigured;
exports.isValidMercadoPagoSignature = isValidMercadoPagoSignature;
exports.createMercadoPagoPreapproval = createMercadoPagoPreapproval;
exports.preapprovalCheckoutUrl = preapprovalCheckoutUrl;
exports.fetchMercadoPagoPreapproval = fetchMercadoPagoPreapproval;
const crypto_1 = __importDefault(require("crypto"));
const MP_API = 'https://api.mercadopago.com';
function mercadoPagoAccessToken() {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
    return token || null;
}
function mercadoPagoConfigured() {
    return Boolean(mercadoPagoAccessToken());
}
/** Manifest do Mercado Pago: id, request-id e ts, HMAC-SHA256 em hex. */
function isValidMercadoPagoSignature(input) {
    const header = input.signatureHeader?.trim();
    const dataId = input.dataId?.trim();
    if (!header || !dataId || !input.secret)
        return false;
    const parts = new Map();
    for (const chunk of header.split(',')) {
        const eq = chunk.indexOf('=');
        if (eq <= 0)
            continue;
        parts.set(chunk.slice(0, eq).trim(), chunk.slice(eq + 1).trim());
    }
    const ts = parts.get('ts');
    const v1 = parts.get('v1');
    if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1))
        return false;
    const id = /^[a-zA-Z0-9]+$/.test(dataId) ? dataId.toLowerCase() : dataId;
    const requestId = input.requestId?.trim() || '';
    const manifest = `id:${id};request-id:${requestId};ts:${ts};`;
    const expected = crypto_1.default.createHmac('sha256', input.secret).update(manifest).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(v1.toLowerCase(), 'utf8');
    if (a.length !== b.length)
        return false;
    return crypto_1.default.timingSafeEqual(a, b);
}
function webhookUrl() {
    const base = process.env.BACKEND_PUBLIC_URL?.trim().replace(/\/$/, '');
    if (!base)
        return undefined;
    return `${base}/api/public/mercadopago/webhook`;
}
async function createMercadoPagoPreapproval(input) {
    const token = mercadoPagoAccessToken();
    if (!token) {
        throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');
    }
    const start = new Date(Date.now() + 60_000).toISOString();
    const body = {
        reason: input.reason.slice(0, 256),
        external_reference: input.clinicId,
        payer_email: input.payerEmail,
        back_url: input.backUrl,
        status: 'pending',
        auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            start_date: start,
            transaction_amount: Number(input.amountReais.toFixed(2)),
            currency_id: 'BRL',
        },
    };
    const notification = webhookUrl();
    if (notification)
        body.notification_url = notification;
    const res = await fetch(`${MP_API}/preapproval`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({})));
    if (!res.ok || !data.id) {
        const detail = data.cause?.map((c) => c.description).filter(Boolean).join('; ') ||
            data.message ||
            `Mercado Pago respondeu ${res.status}`;
        throw new Error(detail);
    }
    return data;
}
function preapprovalCheckoutUrl(preapproval) {
    const token = mercadoPagoAccessToken() || '';
    if (token.startsWith('TEST-')) {
        return preapproval.sandbox_init_point || preapproval.init_point || null;
    }
    return preapproval.init_point || preapproval.sandbox_init_point || null;
}
async function fetchMercadoPagoPreapproval(id) {
    const token = mercadoPagoAccessToken();
    if (!token)
        throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');
    const res = await fetch(`${MP_API}/preapproval/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({})));
    if (!res.ok || !data.id) {
        throw new Error(data.message || `Mercado Pago respondeu ${res.status}`);
    }
    return data;
}
