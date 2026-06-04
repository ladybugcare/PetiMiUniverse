"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHubCustomerCreditBalance = exports.postHubCustomerCreditMovement = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
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
                return res.status(503).json({ error: 'Tabela de crédito do tutor não encontrada. Aplique create_hub_customer_credit_movements.sql.' });
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
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_customer_credit_movements')
            .select('direction, amount')
            .eq('clinic_id', clinicParsed.data)
            .eq('guardian_id', guardianParsed.data);
        if (error) {
            if (String(error.message || '').includes('hub_customer_credit')) {
                return res.json({ balance: 0, movements_count: 0 });
            }
            return res.status(500).json({ error: error.message });
        }
        let balance = 0;
        for (const row of data ?? []) {
            const a = Number(row.amount ?? 0);
            if (row.direction === 'in')
                balance += a;
            else
                balance -= a;
        }
        return res.json({ balance: round2(balance), movements_count: (data ?? []).length });
    }
    catch (e) {
        console.error('getHubCustomerCreditBalance', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubCustomerCreditBalance = getHubCustomerCreditBalance;
