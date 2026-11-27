"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHubCustomerCreditBalance = exports.postHubCustomerCreditMovement = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubCustomerCredit_1 = require("./hubCustomerCredit");
const hubTenantAsserts_1 = require("./hubTenantAsserts");
const uuidStr = zod_1.z.string().uuid();
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
const creditMovementBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    guardian_id: uuidStr,
    direction: zod_1.z.enum(['in', 'out']),
    amount: zod_1.z.number().positive(),
    reason: zod_1.z.string().trim().min(3).max(500),
    comanda_id: uuidStr.optional().nullable(),
    receivable_id: uuidStr.optional().nullable(),
    payment_method: zod_1.z.enum(['pix', 'cash', 'credit_card', 'debit_card', 'transfer', 'payment_link', 'other']).optional(),
    cash_session_id: uuidStr.optional().nullable(),
    notes: zod_1.z.string().trim().max(2000).optional().nullable(),
})
    .strict();
const postHubCustomerCreditMovement = async (req, res) => {
    try {
        const parsed = creditMovementBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const body = parsed.data;
        const userId = req.user?.id ?? null;
        if (!(await (0, hubTenantAsserts_1.assertGuardianInClinic)(body.clinic_id, body.guardian_id))) {
            return res.status(400).json({ error: 'Tutor inválido' });
        }
        if (!(await (0, hubTenantAsserts_1.assertComandaInClinic)(body.clinic_id, body.comanda_id))) {
            return res.status(400).json({ error: 'Referência inválida' });
        }
        if (!(await (0, hubTenantAsserts_1.assertReceivableInClinic)(body.clinic_id, body.receivable_id))) {
            return res.status(400).json({ error: 'Referência inválida' });
        }
        if (body.direction === 'in' && body.payment_method === 'cash' && !body.cash_session_id) {
            return res.status(409).json({ error: 'Informe a sessão de caixa para entrada em dinheiro.' });
        }
        if (body.cash_session_id) {
            const { data: sess } = await supabase_1.supabaseAdmin
                .from('hub_cash_sessions')
                .select('id, clinic_id, status')
                .eq('id', body.cash_session_id)
                .maybeSingle();
            if (!sess || sess.clinic_id !== body.clinic_id || sess.status !== 'open') {
                return res.status(409).json({ error: 'Sessão de caixa inválida' });
            }
        }
        const { data: row, error } = await supabase_1.supabaseAdmin
            .from('hub_customer_credit_movements')
            .insert({
            clinic_id: body.clinic_id,
            guardian_id: body.guardian_id,
            direction: body.direction,
            amount: round2(body.amount),
            reason: body.reason,
            comanda_id: body.comanda_id ?? null,
            receivable_id: body.receivable_id ?? null,
            payment_method: body.payment_method ?? null,
            cash_session_id: body.cash_session_id ?? null,
            notes: body.notes ?? null,
            created_by_user_id: userId,
        })
            .select('*')
            .single();
        if (error) {
            if (String(error.message || '').includes('hub_customer_credit')) {
                return res.status(503).json({ error: 'Tabela de crédito do tutor não encontrada. Aplique 044_create_hub_customer_credit_movements.sql.' });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.status(201).json({ movement: row });
    }
    catch (e) {
        console.error('postHubCustomerCreditMovement', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubCustomerCreditMovement = postHubCustomerCreditMovement;
const getHubCustomerCreditBalance = async (req, res) => {
    try {
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        const guardianParsed = uuidStr.safeParse(req.query.guardian_id);
        if (!clinicParsed.success || !guardianParsed.success) {
            return res.status(400).json({ error: 'clinic_id e guardian_id obrigatórios' });
        }
        if (!(await (0, hubTenantAsserts_1.assertGuardianInClinic)(clinicParsed.data, guardianParsed.data))) {
            return res.status(400).json({ error: 'Tutor inválido' });
        }
        try {
            const balance = await (0, hubCustomerCredit_1.getHubCustomerCreditBalance)(clinicParsed.data, guardianParsed.data);
            const { data, error } = await supabase_1.supabaseAdmin
                .from('hub_customer_credit_movements')
                .select('id')
                .eq('clinic_id', clinicParsed.data)
                .eq('guardian_id', guardianParsed.data);
            if (error && !String(error.message || '').includes('hub_customer_credit')) {
                return res.status(500).json({ error: error.message });
            }
            return res.json({ balance, movements_count: (data ?? []).length });
        }
        catch (e) {
            if (e instanceof hubCustomerCredit_1.CustomerCreditError && e.status === 503) {
                return res.json({ balance: 0, movements_count: 0 });
            }
            throw e;
        }
    }
    catch (e) {
        console.error('getHubCustomerCreditBalance', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubCustomerCreditBalance = getHubCustomerCreditBalance;
