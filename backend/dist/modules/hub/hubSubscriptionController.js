"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postMercadoPagoWebhook = exports.postHubSubscriptionSync = exports.postHubSubscriptionCheckout = exports.getHubSubscriptionMe = exports.getHubSubscriptionPlans = void 0;
const zod_1 = require("zod");
const supabase_js_1 = require("../../config/supabase.js");
const errorHandler_js_1 = require("../../middleware/errorHandler.js");
const errors_js_1 = require("../../utils/errors.js");
const hubSubscriptionService_js_1 = require("./hubSubscriptionService.js");
const hubMercadoPago_js_1 = require("./hubMercadoPago.js");
function hubWebBase() {
    const raw = process.env.HUB_WEB_URL?.trim() || process.env.FRONTEND_URL?.trim();
    if (!raw)
        throw new errors_js_1.ValidationError('HUB_WEB_URL não configurada no servidor');
    return raw.replace(/\/$/, '');
}
async function clinicForUser(userId) {
    const { data, error } = await supabase_js_1.supabaseAdmin
        .from('clinic_users')
        .select('clinic_id, role, status, created_at')
        .eq('user_id', userId)
        .not('clinic_id', 'is', null)
        .order('created_at', { ascending: true });
    if (error)
        throw error;
    const rows = (data || []);
    const row = rows.find((r) => r.status === 'active') || rows[0];
    if (!row?.clinic_id)
        return null;
    return { clinicId: row.clinic_id, role: String(row.role || '').toUpperCase() };
}
/** GET /api/hub/subscription/plans — catálogo (beta e/ou planos pagos do lançamento). */
exports.getHubSubscriptionPlans = (0, errorHandler_js_1.asyncHandler)(async (_req, res) => {
    const catalog = await (0, hubSubscriptionService_js_1.listPublicPlansAndModules)();
    res.json({ ...catalog, mercado_pago_configured: (0, hubMercadoPago_js_1.mercadoPagoConfigured)() });
});
/** GET /api/hub/subscription — assinatura da clínica logada. */
exports.getHubSubscriptionMe = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const clinic = await clinicForUser(req.user.id);
    if (!clinic)
        throw new errors_js_1.ValidationError('Nenhuma clínica vinculada a esta conta.');
    const sub = await (0, hubSubscriptionService_js_1.getClinicSubscription)(clinic.clinicId);
    const catalog = await (0, hubSubscriptionService_js_1.listPublicPlansAndModules)();
    res.json({
        mercado_pago_configured: (0, hubMercadoPago_js_1.mercadoPagoConfigured)(),
        can_checkout: clinic.role === 'CADMIN',
        mode: catalog.mode,
        paid_plans: catalog.paid_plans,
        subscription: sub
            ? {
                ...(0, hubSubscriptionService_js_1.toSessionSubscriptionPayload)(sub),
                plan_name: sub.hub_platform_plans?.name ?? null,
                monthly_price_cents: sub.hub_platform_plans?.monthly_price_cents ?? null,
                max_units: sub.hub_platform_plans?.max_units ?? null,
                max_users: sub.hub_platform_plans?.max_users ?? null,
                current_period_end: sub.current_period_end ?? null,
                mp_preapproval_id: sub.mp_preapproval_id ?? null,
            }
            : null,
    });
});
const checkoutBody = zod_1.z.object({
    plan_slug: zod_1.z.string().trim().min(2).max(50),
});
/** POST /api/hub/subscription/checkout — cria a assinatura no Mercado Pago e devolve o link. */
exports.postHubSubscriptionCheckout = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const parsed = checkoutBody.safeParse(req.body);
    if (!parsed.success)
        throw new errors_js_1.ValidationError('Informe o plano.');
    const clinic = await clinicForUser(req.user.id);
    if (!clinic)
        throw new errors_js_1.ValidationError('Nenhuma clínica vinculada a esta conta.');
    if (clinic.role !== 'CADMIN') {
        throw new errors_js_1.ForbiddenError('Só o administrador da clínica pode assinar o plano.');
    }
    const email = req.user.email?.trim();
    if (!email)
        throw new errors_js_1.ValidationError('A conta precisa de um e-mail para o Mercado Pago.');
    if (!(0, hubMercadoPago_js_1.mercadoPagoConfigured)()) {
        throw new errors_js_1.ValidationError('Mercado Pago ainda não está configurado neste ambiente. Defina MERCADOPAGO_ACCESS_TOKEN no servidor.');
    }
    let staged;
    try {
        staged = await (0, hubSubscriptionService_js_1.stagePlanCheckout)(clinic.clinicId, parsed.data.plan_slug);
    }
    catch (e) {
        if (e instanceof hubSubscriptionService_js_1.HubPlanError)
            throw new errors_js_1.ValidationError(e.message);
        throw e;
    }
    const backUrl = `${hubWebBase()}/hub/assinatura?retorno=1`;
    let preapproval;
    try {
        preapproval = await (0, hubMercadoPago_js_1.createMercadoPagoPreapproval)({
            reason: `PetMi Hub — ${staged.planName}`,
            clinicId: clinic.clinicId,
            payerEmail: email,
            amountReais: staged.amountCents / 100,
            backUrl,
        });
    }
    catch (e) {
        throw new errors_js_1.ExternalServiceError(e.message || 'Falha ao abrir o Mercado Pago', 'mercadopago');
    }
    await (0, hubSubscriptionService_js_1.savePreapprovalId)(clinic.clinicId, preapproval.id);
    const initPoint = (0, hubMercadoPago_js_1.preapprovalCheckoutUrl)(preapproval);
    if (!initPoint) {
        throw new errors_js_1.ExternalServiceError('Mercado Pago não devolveu o link de pagamento.', 'mercadopago');
    }
    res.json({ init_point: initPoint, preapproval_id: preapproval.id });
});
/** POST /api/hub/subscription/sync — consulta o Mercado Pago depois que o cliente volta do checkout. */
exports.postHubSubscriptionSync = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const clinic = await clinicForUser(req.user.id);
    if (!clinic)
        throw new errors_js_1.ValidationError('Nenhuma clínica vinculada a esta conta.');
    const sub = await (0, hubSubscriptionService_js_1.getClinicSubscription)(clinic.clinicId);
    if (!sub?.mp_preapproval_id) {
        res.json({
            subscription: sub ? (0, hubSubscriptionService_js_1.toSessionSubscriptionPayload)(sub) : null,
            synced: false,
        });
        return;
    }
    if (!(0, hubMercadoPago_js_1.mercadoPagoConfigured)()) {
        res.json({ subscription: (0, hubSubscriptionService_js_1.toSessionSubscriptionPayload)(sub), synced: false });
        return;
    }
    try {
        const remote = await (0, hubMercadoPago_js_1.fetchMercadoPagoPreapproval)(sub.mp_preapproval_id);
        await (0, hubSubscriptionService_js_1.applyMercadoPagoPreapproval)({
            preapprovalId: remote.id,
            status: remote.status,
            externalReference: remote.external_reference ?? clinic.clinicId,
            nextPaymentDate: remote.next_payment_date ?? null,
        });
    }
    catch (e) {
        console.warn('[hubSubscription] sync', e.message);
    }
    const fresh = await (0, hubSubscriptionService_js_1.getClinicSubscription)(clinic.clinicId);
    res.json({
        subscription: fresh ? (0, hubSubscriptionService_js_1.toSessionSubscriptionPayload)(fresh) : null,
        synced: true,
    });
});
function webhookDataId(req) {
    const query = req.query;
    const fromQuery = query['data.id'] ?? query.id;
    if (typeof fromQuery === 'string' && fromQuery.trim())
        return fromQuery.trim();
    const body = req.body;
    const fromBody = body?.data?.id || body?.id;
    return fromBody ? String(fromBody) : null;
}
function webhookTopic(req) {
    const query = req.query;
    const topic = query.topic ?? query.type;
    const body = req.body;
    return String(topic || body?.type || body?.topic || '').toLowerCase();
}
/** POST /api/public/mercadopago/webhook — aviso de assinatura autorizada, pausada ou cancelada. */
exports.postMercadoPagoWebhook = (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const dataId = webhookDataId(req);
    const topic = webhookTopic(req);
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
    if (secret) {
        const ok = (0, hubMercadoPago_js_1.isValidMercadoPagoSignature)({
            signatureHeader: req.header('x-signature') || undefined,
            requestId: req.header('x-request-id') || undefined,
            dataId: dataId || undefined,
            secret,
        });
        if (!ok) {
            res.status(401).json({ error: 'Assinatura do webhook inválida' });
            return;
        }
    }
    const isPreapproval = !topic || topic.includes('preapproval');
    if (!dataId || !isPreapproval || !(0, hubMercadoPago_js_1.mercadoPagoConfigured)()) {
        res.status(200).json({ ok: true, ignored: true });
        return;
    }
    try {
        const remote = await (0, hubMercadoPago_js_1.fetchMercadoPagoPreapproval)(dataId);
        await (0, hubSubscriptionService_js_1.applyMercadoPagoPreapproval)({
            preapprovalId: remote.id,
            status: remote.status,
            externalReference: remote.external_reference ?? null,
            nextPaymentDate: remote.next_payment_date ?? null,
        });
    }
    catch (e) {
        console.error('[mercadopago] webhook', e.message);
        res.status(500).json({ error: 'Falha ao processar aviso' });
        return;
    }
    res.status(200).json({ ok: true });
});
