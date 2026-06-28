"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postHubMessageLog = postHubMessageLog;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const createMessageLogSchema = zod_1.z.object({
    clinic_id: zod_1.z.string().uuid(),
    unit_id: zod_1.z.string().uuid().optional().nullable(),
    guardian_id: zod_1.z.string().uuid().optional().nullable(),
    pet_id: zod_1.z.string().uuid().optional().nullable(),
    channel: zod_1.z.enum(['whatsapp_link', 'in_app']),
    template_key: zod_1.z.string().max(64).optional().nullable(),
    triggered_by_staff_id: zod_1.z.string().uuid().optional().nullable(),
});
async function postHubMessageLog(req, res) {
    const parsed = createMessageLogSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        return;
    }
    const data = parsed.data;
    const { error } = await supabase_1.supabaseAdmin.from('hub_message_logs').insert([
        {
            clinic_id: data.clinic_id,
            unit_id: data.unit_id ?? null,
            guardian_id: data.guardian_id ?? null,
            pet_id: data.pet_id ?? null,
            channel: data.channel,
            template_key: data.template_key ?? null,
            triggered_by_staff_id: data.triggered_by_staff_id ?? null,
        },
    ]);
    if (error) {
        res.status(500).json({ error: 'Erro ao registrar tentativa de comunicação' });
        return;
    }
    res.status(201).json({ ok: true });
}
