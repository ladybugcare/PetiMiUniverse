import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import {
  normalizeCardMachineFees,
  type CardMachineFees,
} from './hubCardMachineFees';
import { HUB_PAYMENT_METHODS, normalizeAcceptedPaymentMethods, type HubPaymentMethod } from './hubPaymentMethods';

const uuidStr = z.string().uuid();

const messageTemplatesSchema = z
  .record(z.string(), z.string().max(500))
  .optional();

const cupomWidthMmSchema = z.union([z.literal(58), z.literal(80)]);

const multipetPickupBillingSchema = z.enum(['per_visit', 'per_pet']);

const patchSchema = z
  .object({
    clinic_id: uuidStr,
    pet_puppy_max_months: z.number().int().min(1).max(24).optional(),
    message_templates: messageTemplatesSchema,
    cupom_width_mm: cupomWidthMmSchema.optional(),
    multipet_pickup_billing: multipetPickupBillingSchema.optional(),
  })
  .strict();

export type HubCupomWidthMm = 58 | 80;

export type HubMultipetPickupBilling = 'per_visit' | 'per_pet';

export type HubClinicSettingsRow = {
  pet_puppy_max_months: number;
  message_templates: Record<string, string>;
  accepted_payment_methods: HubPaymentMethod[];
  cupom_width_mm: HubCupomWidthMm;
  card_machine_fees: CardMachineFees;
  multipet_pickup_billing: HubMultipetPickupBilling;
};

function normalizeMultipetPickupBilling(raw: unknown): HubMultipetPickupBilling {
  return raw === 'per_pet' ? 'per_pet' : 'per_visit';
}

function normalizeCupomWidthMm(raw: unknown): HubCupomWidthMm {
  const n = Number(raw);
  return n === 58 ? 58 : 80;
}

function mapClinicSettingsRow(raw: {
  pet_puppy_max_months: number;
  message_templates: Record<string, string> | null;
  accepted_payment_methods: string[] | null;
  cupom_width_mm?: number | null;
  card_machine_fees?: unknown;
  multipet_pickup_billing?: string | null;
}): HubClinicSettingsRow {
  return {
    pet_puppy_max_months: Number(raw.pet_puppy_max_months) || 8,
    message_templates: raw.message_templates ?? {},
    accepted_payment_methods: normalizeAcceptedPaymentMethods(raw.accepted_payment_methods),
    cupom_width_mm: normalizeCupomWidthMm(raw.cupom_width_mm),
    card_machine_fees: normalizeCardMachineFees(raw.card_machine_fees),
    multipet_pickup_billing: normalizeMultipetPickupBilling(raw.multipet_pickup_billing),
  };
}

function isMissingMultipetPickupBillingColumn(error: { message?: string; code?: string } | null): boolean {
  const msg = String(error?.message ?? '');
  return msg.includes('multipet_pickup_billing') && (msg.includes('does not exist') || error?.code === '42703');
}

/** Garante linha de settings por clínica (defaults: 8 meses, templates vazios, todos os métodos). */
export async function getOrCreateHubClinicSettings(clinicId: string): Promise<HubClinicSettingsRow> {
  const selectCols =
    'pet_puppy_max_months, message_templates, accepted_payment_methods, cupom_width_mm, card_machine_fees, multipet_pickup_billing';
  const selectColsLegacy =
    'pet_puppy_max_months, message_templates, accepted_payment_methods, cupom_width_mm, card_machine_fees';

  let row: Record<string, unknown> | null = null;
  {
    const first = await supabaseAdmin
      .from('hub_clinic_settings')
      .select(selectCols)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (!first.error && first.data) {
      row = first.data as Record<string, unknown>;
    } else if (isMissingMultipetPickupBillingColumn(first.error)) {
      const legacy = await supabaseAdmin
        .from('hub_clinic_settings')
        .select(selectColsLegacy)
        .eq('clinic_id', clinicId)
        .maybeSingle();
      if (!legacy.error && legacy.data) {
        row = legacy.data as Record<string, unknown>;
      }
    }
  }

  if (row) {
    return mapClinicSettingsRow(row as Parameters<typeof mapClinicSettingsRow>[0]);
  }

  const { data: ins, error: insErr } = await supabaseAdmin
    .from('hub_clinic_settings')
    .insert({ clinic_id: clinicId, accepted_payment_methods: [...HUB_PAYMENT_METHODS] })
    .select(selectCols)
    .single();
  if (insErr || !ins) {
    if (isMissingMultipetPickupBillingColumn(insErr)) {
      const legacyIns = await supabaseAdmin
        .from('hub_clinic_settings')
        .insert({ clinic_id: clinicId, accepted_payment_methods: [...HUB_PAYMENT_METHODS] })
        .select(selectColsLegacy)
        .single();
      if (!legacyIns.error && legacyIns.data) {
        return mapClinicSettingsRow(legacyIns.data as Parameters<typeof mapClinicSettingsRow>[0]);
      }
    }
    return {
      pet_puppy_max_months: 8,
      message_templates: {},
      accepted_payment_methods: [...HUB_PAYMENT_METHODS],
      cupom_width_mm: 80,
      card_machine_fees: { debit_card: [], credit_card: [] },
      multipet_pickup_billing: 'per_visit',
    };
  }
  return mapClinicSettingsRow(ins as Parameters<typeof mapClinicSettingsRow>[0]);
}

export const getHubClinicSettings = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
    }
    const settings = await getOrCreateHubClinicSettings(parsed.data);
    return res.json({ settings });
  } catch (e) {
    console.error('[hub_clinic_settings] get', e);
    return res.status(500).json({ error: 'Erro ao carregar configurações' });
  }
};

export const patchHubClinicSettings = async (req: Request, res: Response) => {
  try {
    const body = patchSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    }
    const {
      clinic_id,
      pet_puppy_max_months,
      message_templates,
      cupom_width_mm,
      multipet_pickup_billing,
    } = body.data;

    if (
      pet_puppy_max_months === undefined &&
      message_templates === undefined &&
      cupom_width_mm === undefined &&
      multipet_pickup_billing === undefined
    ) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    await getOrCreateHubClinicSettings(clinic_id);

    const patch: Record<string, unknown> = {};
    if (pet_puppy_max_months !== undefined) patch.pet_puppy_max_months = pet_puppy_max_months;
    if (message_templates !== undefined) patch.message_templates = message_templates;
    if (cupom_width_mm !== undefined) patch.cupom_width_mm = cupom_width_mm;
    if (multipet_pickup_billing !== undefined) patch.multipet_pickup_billing = multipet_pickup_billing;

    const { error } = await supabaseAdmin
      .from('hub_clinic_settings')
      .update(patch)
      .eq('clinic_id', clinic_id);
    if (error) {
      console.error('[hub_clinic_settings] patch', error);
      return res.status(500).json({ error: error.message });
    }
    const settings = await getOrCreateHubClinicSettings(clinic_id);
    return res.json({ settings });
  } catch (e) {
    console.error('[hub_clinic_settings] patch', e);
    return res.status(500).json({ error: 'Erro ao gravar configurações' });
  }
};
