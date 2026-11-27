"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchHubClinicSettings = exports.getHubClinicSettings = void 0;
exports.getOrCreateHubClinicSettings = getOrCreateHubClinicSettings;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubCardMachineFees_1 = require("./hubCardMachineFees");
const hubPaymentMethods_1 = require("./hubPaymentMethods");
const uuidStr = zod_1.z.string().uuid();
const messageTemplatesSchema = zod_1.z
    .record(zod_1.z.string(), zod_1.z.string().max(500))
    .optional();
const cupomWidthMmSchema = zod_1.z.union([zod_1.z.literal(58), zod_1.z.literal(80)]);
const multipetPickupBillingSchema = zod_1.z.enum(['per_visit', 'per_pet']);
const patchSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    pet_puppy_max_months: zod_1.z.number().int().min(1).max(24).optional(),
    message_templates: messageTemplatesSchema,
    cupom_width_mm: cupomWidthMmSchema.optional(),
    multipet_pickup_billing: multipetPickupBillingSchema.optional(),
})
    .strict();
function normalizeMultipetPickupBilling(raw) {
    return raw === 'per_pet' ? 'per_pet' : 'per_visit';
}
function normalizeCupomWidthMm(raw) {
    const n = Number(raw);
    return n === 58 ? 58 : 80;
}
function mapClinicSettingsRow(raw) {
    return {
        pet_puppy_max_months: Number(raw.pet_puppy_max_months) || 8,
        message_templates: raw.message_templates ?? {},
        accepted_payment_methods: (0, hubPaymentMethods_1.normalizeAcceptedPaymentMethods)(raw.accepted_payment_methods),
        cupom_width_mm: normalizeCupomWidthMm(raw.cupom_width_mm),
        card_machine_fees: (0, hubCardMachineFees_1.normalizeCardMachineFees)(raw.card_machine_fees),
        multipet_pickup_billing: normalizeMultipetPickupBilling(raw.multipet_pickup_billing),
    };
}
function isMissingMultipetPickupBillingColumn(error) {
    const msg = String(error?.message ?? '');
    return msg.includes('multipet_pickup_billing') && (msg.includes('does not exist') || error?.code === '42703');
}
/** Garante linha de settings por clínica (defaults: 8 meses, templates vazios, todos os métodos). */
async function getOrCreateHubClinicSettings(clinicId) {
    const selectCols = 'pet_puppy_max_months, message_templates, accepted_payment_methods, cupom_width_mm, card_machine_fees, multipet_pickup_billing';
    const selectColsLegacy = 'pet_puppy_max_months, message_templates, accepted_payment_methods, cupom_width_mm, card_machine_fees';
    let row = null;
    {
        const first = await supabase_1.supabaseAdmin
            .from('hub_clinic_settings')
            .select(selectCols)
            .eq('clinic_id', clinicId)
            .maybeSingle();
        if (!first.error && first.data) {
            row = first.data;
        }
        else if (isMissingMultipetPickupBillingColumn(first.error)) {
            const legacy = await supabase_1.supabaseAdmin
                .from('hub_clinic_settings')
                .select(selectColsLegacy)
                .eq('clinic_id', clinicId)
                .maybeSingle();
            if (!legacy.error && legacy.data) {
                row = legacy.data;
            }
        }
    }
    if (row) {
        return mapClinicSettingsRow(row);
    }
    const { data: ins, error: insErr } = await supabase_1.supabaseAdmin
        .from('hub_clinic_settings')
        .insert({ clinic_id: clinicId, accepted_payment_methods: [...hubPaymentMethods_1.HUB_PAYMENT_METHODS] })
        .select(selectCols)
        .single();
    if (insErr || !ins) {
        if (isMissingMultipetPickupBillingColumn(insErr)) {
            const legacyIns = await supabase_1.supabaseAdmin
                .from('hub_clinic_settings')
                .insert({ clinic_id: clinicId, accepted_payment_methods: [...hubPaymentMethods_1.HUB_PAYMENT_METHODS] })
                .select(selectColsLegacy)
                .single();
            if (!legacyIns.error && legacyIns.data) {
                return mapClinicSettingsRow(legacyIns.data);
            }
        }
        return {
            pet_puppy_max_months: 8,
            message_templates: {},
            accepted_payment_methods: [...hubPaymentMethods_1.HUB_PAYMENT_METHODS],
            cupom_width_mm: 80,
            card_machine_fees: { debit_card: [], credit_card: [] },
            multipet_pickup_billing: 'per_visit',
        };
    }
    return mapClinicSettingsRow(ins);
}
const getHubClinicSettings = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const settings = await getOrCreateHubClinicSettings(parsed.data);
        return res.json({ settings });
    }
    catch (e) {
        console.error('[hub_clinic_settings] get', e);
        return res.status(500).json({ error: 'Erro ao carregar configurações' });
    }
};
exports.getHubClinicSettings = getHubClinicSettings;
const patchHubClinicSettings = async (req, res) => {
    try {
        const body = patchSchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, pet_puppy_max_months, message_templates, cupom_width_mm, multipet_pickup_billing, } = body.data;
        if (pet_puppy_max_months === undefined &&
            message_templates === undefined &&
            cupom_width_mm === undefined &&
            multipet_pickup_billing === undefined) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        }
        await getOrCreateHubClinicSettings(clinic_id);
        const patch = {};
        if (pet_puppy_max_months !== undefined)
            patch.pet_puppy_max_months = pet_puppy_max_months;
        if (message_templates !== undefined)
            patch.message_templates = message_templates;
        if (cupom_width_mm !== undefined)
            patch.cupom_width_mm = cupom_width_mm;
        if (multipet_pickup_billing !== undefined)
            patch.multipet_pickup_billing = multipet_pickup_billing;
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_clinic_settings')
            .update(patch)
            .eq('clinic_id', clinic_id);
        if (error) {
            console.error('[hub_clinic_settings] patch', error);
            return res.status(500).json({ error: error.message });
        }
        const settings = await getOrCreateHubClinicSettings(clinic_id);
        return res.json({ settings });
    }
    catch (e) {
        console.error('[hub_clinic_settings] patch', e);
        return res.status(500).json({ error: 'Erro ao gravar configurações' });
    }
};
exports.patchHubClinicSettings = patchHubClinicSettings;
