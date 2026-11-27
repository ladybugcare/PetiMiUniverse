"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postHubMessageLog = postHubMessageLog;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const createMessageLogSchema = zod_1.z.object({
    clinic_id: zod_1.z.string().uuid(),
    unit_id: zod_1.z.string().uuid().optional().nullable(),
    guardian_id: zod_1.z.string().uuid().optional().nullable(),
    pet_id: zod_1.z.string().uuid().optional().nullable(),
    channel: zod_1.z.enum(['whatsapp_link', 'in_app']),
    template_key: zod_1.z.string().max(64).optional().nullable(),
    triggered_by_staff_id: zod_1.z.string().uuid().optional().nullable(),
});
/**
 * Telemetria de tentativa de comunicação (WhatsApp / in-app).
 * Schema restrito — não aceita payload arbitrário.
 * Isolamento: membro da clínica (MW + assert no controller).
 */
async function postHubMessageLog(req, res) {
    const parsed = createMessageLogSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        return;
    }
    const data = parsed.data;
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
    }
    const hasAccess = await (0, authMiddleware_1.checkClinicAccess)(userId, data.clinic_id);
    if (!hasAccess) {
        res.status(403).json({ error: 'Acesso negado' });
        return;
    }
    if (data.unit_id) {
        const { data: unit } = await supabase_1.supabaseAdmin
            .from('units')
            .select('id')
            .eq('id', data.unit_id)
            .eq('clinic_id', data.clinic_id)
            .maybeSingle();
        if (!unit) {
            res.status(400).json({ error: 'Unidade inválida para esta clínica' });
            return;
        }
    }
    if (data.guardian_id) {
        const { data: guardian } = await supabase_1.supabaseAdmin
            .from('hub_guardians')
            .select('id')
            .eq('id', data.guardian_id)
            .eq('clinic_id', data.clinic_id)
            .maybeSingle();
        if (!guardian) {
            res.status(400).json({ error: 'Tutor inválido para esta clínica' });
            return;
        }
    }
    if (data.pet_id) {
        const { data: pet } = await supabase_1.supabaseAdmin
            .from('hub_pets')
            .select('id')
            .eq('id', data.pet_id)
            .eq('clinic_id', data.clinic_id)
            .maybeSingle();
        if (!pet) {
            res.status(400).json({ error: 'Pet inválido para esta clínica' });
            return;
        }
    }
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
