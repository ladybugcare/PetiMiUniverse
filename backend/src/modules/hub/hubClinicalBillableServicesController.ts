import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { syncOpenComandasAfterEncounterChargeableChange } from './hubComandasController';
import {
  canAutoApproveFinancial,
  resolvePriceStatus,
  roundMoney2,
  type ServicePriceModeRow,
} from './hubVariablePrice';
import { isHospitalizationClosed } from './hubHospitalizationBilling';

const HOSPITALIZATION_CHARGE_BLOCKED_STATUSES = new Set([
  'discharged',
  'death',
  'transferred',
  'cancelled',
]);

function hospitalizationChargeBlockedMessage(status: string): string {
  if (status === 'cancelled') {
    return 'Não é possível lançar itens em internação cancelada.';
  }
  return 'Internação encerrada: não é possível lançar novos itens clínicos. Use o fluxo financeiro de ajuste, se necessário.';
}

const uuidStr = z.string().uuid();

const billingModeSchema = z.enum(['charge', 'included']);
const chargeKindSchema = z.enum(['daily', 'medication', 'procedure', 'material', 'other']);
const pricingSourceSchema = z.enum([
  'catalog',
  'manual',
  'special_pet',
  'special_guardian',
  'special_family',
]);

async function loadServiceType(
  clinicId: string,
  serviceTypeId: string,
  expectedGroup?: 'cirurgia' | 'internacao' | 'clinica',
): Promise<
  ServicePriceModeRow & { service_group: string; is_encounter_application?: boolean | null }
> {
  const { data, error } = await supabaseAdmin
    .from('hub_service_types')
    .select(
      'id, name, sale_amount, price_mode, price_min, price_max, service_group, active, deleted_at, is_encounter_application',
    )
    .eq('id', serviceTypeId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.deleted_at) throw new Error('Serviço não encontrado');
  if (data.active === false) throw new Error('Serviço inativo');
  const group = String(data.service_group ?? '');
  if (expectedGroup && group !== expectedGroup) {
    throw new Error(`Serviço deve pertencer ao grupo ${expectedGroup}`);
  }
  return data as ServicePriceModeRow & {
    service_group: string;
    is_encounter_application?: boolean | null;
  };
}

async function resolveUnitAndStatus(opts: {
  clinicId: string;
  userId: string | null | undefined;
  service: ServicePriceModeRow;
  unitAmountOverride?: number | null;
}): Promise<{ unit_amount: number; pricing_source: string; price_status: 'confirmed' | 'pending_approval' }> {
  const catalog = roundMoney2(Number(opts.service.sale_amount ?? 0));
  const hasOverride = opts.unitAmountOverride != null && Number.isFinite(Number(opts.unitAmountOverride));
  const unit_amount = hasOverride ? roundMoney2(Number(opts.unitAmountOverride)) : catalog;
  const pricing_source =
    hasOverride && unit_amount !== catalog ? 'manual' : 'catalog';
  const canApprove = await canAutoApproveFinancial(opts.userId, opts.clinicId);
  const price_status = resolvePriceStatus({
    unitAmount: unit_amount,
    service: opts.service,
    canAutoApprove: canApprove,
  });
  return { unit_amount, pricing_source, price_status };
}

async function syncEncounterComandaFromSurgery(surgeryId: string, clinicId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('hub_surgeries')
    .select('hub_encounter_id')
    .eq('id', surgeryId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  const encId = (data as { hub_encounter_id?: string | null } | null)?.hub_encounter_id;
  if (encId) await syncOpenComandasAfterEncounterChargeableChange(clinicId, encId);
}

async function syncEncounterComandaFromHospitalization(
  hospitalizationId: string,
  clinicId: string,
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('hub_hospitalizations')
    .select('hub_encounter_id')
    .eq('id', hospitalizationId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  const encId = (data as { hub_encounter_id?: string | null } | null)?.hub_encounter_id;
  if (encId) await syncOpenComandasAfterEncounterChargeableChange(clinicId, encId);
}

async function findAppointmentServiceDedupe(
  appointmentId: string,
  serviceTypeId: string,
): Promise<{ id: string; sale_amount_applied: number | null } | null> {
  const { data } = await supabaseAdmin
    .from('hub_appointment_services')
    .select('id, sale_amount_applied, hub_service_type_id')
    .eq('appointment_id', appointmentId)
    .eq('hub_service_type_id', serviceTypeId)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    sale_amount_applied: data.sale_amount_applied == null ? null : Number(data.sale_amount_applied),
  };
}

// ── Surgery services ─────────────────────────────────────────────────────────

export const listHubSurgeryServices = async (req: Request, res: Response) => {
  const surgeryId = uuidStr.safeParse(req.params.id);
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!surgeryId.success || !clinic_id.success) {
    return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
  }
  const { data, error } = await supabaseAdmin
    .from('hub_surgery_services')
    .select('*')
    .eq('surgery_id', surgeryId.data)
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (error) {
    if (String(error.message).includes('hub_surgery_services') || error.code === '42P01') {
      return res.json({ services: [] });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.json({ services: data ?? [] });
};

const surgeryServiceBodySchema = z.object({
  clinic_id: uuidStr,
  hub_service_type_id: uuidStr,
  unit_amount: z.number().min(0).optional().nullable(),
  quantity: z.number().positive().optional().default(1),
  billing_mode: billingModeSchema.optional().default('charge'),
  notes: z.string().trim().max(2000).optional().nullable(),
  sort_order: z.number().int().optional(),
});

export const createHubSurgeryService = async (req: Request, res: Response) => {
  const surgeryId = uuidStr.safeParse(req.params.id);
  const parsed = surgeryServiceBodySchema.safeParse(req.body);
  if (!surgeryId.success || !parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
  }
  const b = parsed.data;

  const { data: surgery, error: surgErr } = await supabaseAdmin
    .from('hub_surgeries')
    .select('id, clinic_id, hub_appointment_id, hub_encounter_id')
    .eq('id', surgeryId.data)
    .eq('clinic_id', b.clinic_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (surgErr) return res.status(500).json({ error: surgErr.message });
  if (!surgery) return res.status(404).json({ error: 'Cirurgia não encontrada' });

  let service: ServicePriceModeRow & { service_group: string };
  try {
    service = await loadServiceType(b.clinic_id, b.hub_service_type_id, 'cirurgia');
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  let hub_appointment_service_id: string | null = null;
  let unitOverride = b.unit_amount;
  const apptId = (surgery as { hub_appointment_id?: string | null }).hub_appointment_id ?? null;
  if (apptId) {
    const dedupe = await findAppointmentServiceDedupe(apptId, b.hub_service_type_id);
    if (dedupe) {
      hub_appointment_service_id = dedupe.id;
      if (unitOverride == null && dedupe.sale_amount_applied != null) {
        unitOverride = dedupe.sale_amount_applied;
      }
    }
  }

  const resolved = await resolveUnitAndStatus({
    clinicId: b.clinic_id,
    userId: req.user?.id,
    service,
    unitAmountOverride: unitOverride,
  });

  const { data, error } = await supabaseAdmin
    .from('hub_surgery_services')
    .insert({
      clinic_id: b.clinic_id,
      surgery_id: surgeryId.data,
      hub_service_type_id: b.hub_service_type_id,
      hub_appointment_service_id,
      service_name: service.name,
      quantity: b.quantity,
      unit_amount: resolved.unit_amount,
      pricing_source: resolved.pricing_source,
      price_status: hub_appointment_service_id ? 'confirmed' : resolved.price_status,
      proposed_by_user_id: req.user?.id ?? null,
      approved_by_user_id:
        (hub_appointment_service_id || resolved.price_status === 'confirmed') && req.user?.id
          ? req.user.id
          : null,
      approved_at:
        hub_appointment_service_id || resolved.price_status === 'confirmed'
          ? new Date().toISOString()
          : null,
      billing_mode: b.billing_mode,
      notes: b.notes ?? null,
      sort_order: b.sort_order ?? 0,
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await syncEncounterComandaFromSurgery(surgeryId.data, b.clinic_id);
  return res.status(201).json({ service: data });
};

export const patchHubSurgeryService = async (req: Request, res: Response) => {
  const surgeryId = uuidStr.safeParse(req.params.id);
  const serviceId = uuidStr.safeParse(req.params.serviceId);
  const parsed = z
    .object({
      clinic_id: uuidStr,
      unit_amount: z.number().min(0).optional(),
      quantity: z.number().positive().optional(),
      billing_mode: billingModeSchema.optional(),
      notes: z.string().trim().max(2000).optional().nullable(),
      sort_order: z.number().int().optional(),
    })
    .safeParse(req.body);
  if (!surgeryId.success || !serviceId.success || !parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }
  const b = parsed.data;

  const { data: existing, error: getErr } = await supabaseAdmin
    .from('hub_surgery_services')
    .select('*')
    .eq('id', serviceId.data)
    .eq('surgery_id', surgeryId.data)
    .eq('clinic_id', b.clinic_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (getErr) return res.status(500).json({ error: getErr.message });
  if (!existing) return res.status(404).json({ error: 'Serviço da cirurgia não encontrado' });

  const update: Record<string, unknown> = {};
  if (b.quantity !== undefined) update.quantity = b.quantity;
  if (b.billing_mode !== undefined) update.billing_mode = b.billing_mode;
  if (b.notes !== undefined) update.notes = b.notes;
  if (b.sort_order !== undefined) update.sort_order = b.sort_order;

  if (b.unit_amount !== undefined) {
    let service: ServicePriceModeRow;
    try {
      service = await loadServiceType(b.clinic_id, existing.hub_service_type_id as string);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
    const resolved = await resolveUnitAndStatus({
      clinicId: b.clinic_id,
      userId: req.user?.id,
      service,
      unitAmountOverride: b.unit_amount,
    });
    update.unit_amount = resolved.unit_amount;
    update.pricing_source = resolved.pricing_source;
    update.price_status = resolved.price_status;
    update.proposed_by_user_id = req.user?.id ?? null;
    if (resolved.price_status === 'confirmed') {
      update.approved_by_user_id = req.user?.id ?? null;
      update.approved_at = new Date().toISOString();
    } else {
      update.approved_by_user_id = null;
      update.approved_at = null;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('hub_surgery_services')
    .update(update)
    .eq('id', serviceId.data)
    .eq('clinic_id', b.clinic_id)
    .select('*')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });

  await syncEncounterComandaFromSurgery(surgeryId.data, b.clinic_id);
  return res.json({ service: data });
};

export const deleteHubSurgeryService = async (req: Request, res: Response) => {
  const surgeryId = uuidStr.safeParse(req.params.id);
  const serviceId = uuidStr.safeParse(req.params.serviceId);
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!surgeryId.success || !serviceId.success || !clinic_id.success) {
    return res.status(400).json({ error: 'id, serviceId e clinic_id obrigatórios' });
  }
  const { error } = await supabaseAdmin
    .from('hub_surgery_services')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', serviceId.data)
    .eq('surgery_id', surgeryId.data)
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null);
  if (error) return res.status(500).json({ error: error.message });
  await syncEncounterComandaFromSurgery(surgeryId.data, clinic_id.data);
  return res.status(204).send();
};

export const approveHubSurgeryServicePrice = async (req: Request, res: Response) => {
  const surgeryId = uuidStr.safeParse(req.params.id);
  const serviceId = uuidStr.safeParse(req.params.serviceId);
  const parsed = z.object({ clinic_id: uuidStr }).safeParse(req.body);
  if (!surgeryId.success || !serviceId.success || !parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }
  const { clinic_id } = parsed.data;
  const { data, error } = await supabaseAdmin
    .from('hub_surgery_services')
    .update({
      price_status: 'confirmed',
      approved_by_user_id: req.user?.id ?? null,
      approved_at: new Date().toISOString(),
    })
    .eq('id', serviceId.data)
    .eq('surgery_id', surgeryId.data)
    .eq('clinic_id', clinic_id)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Serviço da cirurgia não encontrado' });
  await syncEncounterComandaFromSurgery(surgeryId.data, clinic_id);
  return res.json({ service: data });
};

// ── Hospitalization charges ──────────────────────────────────────────────────

export const listHubHospitalizationCharges = async (req: Request, res: Response) => {
  const hospId = uuidStr.safeParse(req.params.id);
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!hospId.success || !clinic_id.success) {
    return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
  }
  const { data, error } = await supabaseAdmin
    .from('hub_hospitalization_charges')
    .select('*')
    .eq('hospitalization_id', hospId.data)
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    if (String(error.message).includes('hub_hospitalization_charges') || error.code === '42P01') {
      return res.json({ charges: [] });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.json({ charges: data ?? [] });
};

const hospChargeBodySchema = z.object({
  clinic_id: uuidStr,
  charge_kind: chargeKindSchema.optional().default('other'),
  hub_service_type_id: uuidStr.optional().nullable(),
  hub_inventory_item_id: uuidStr.optional().nullable(),
  hub_inventory_lot_id: uuidStr.optional().nullable(),
  service_name: z.string().trim().min(1).max(300).optional(),
  unit_amount: z.number().min(0).optional().nullable(),
  quantity: z.number().positive().optional().default(1),
  billing_mode: billingModeSchema.optional(),
  service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  sort_order: z.number().int().optional(),
});

export const createHubHospitalizationCharge = async (req: Request, res: Response) => {
  const hospId = uuidStr.safeParse(req.params.id);
  const parsed = hospChargeBodySchema.safeParse(req.body);
  if (!hospId.success || !parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
  }
  const b = parsed.data;

  const { data: hosp, error: hospErr } = await supabaseAdmin
    .from('hub_hospitalizations')
    .select('id, clinic_id, status, daily_includes_medication, hub_encounter_id')
    .eq('id', hospId.data)
    .eq('clinic_id', b.clinic_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (hospErr) return res.status(500).json({ error: hospErr.message });
  if (!hosp) return res.status(404).json({ error: 'Internação não encontrada' });

  const hospStatus = String((hosp as { status?: string }).status ?? '');
  if (HOSPITALIZATION_CHARGE_BLOCKED_STATUSES.has(hospStatus) || isHospitalizationClosed(hospStatus)) {
    return res.status(409).json({
      error: hospitalizationChargeBlockedMessage(hospStatus),
      code: 'HOSPITALIZATION_CLOSED',
      status: hospStatus,
    });
  }

  let service: (ServicePriceModeRow & { service_group: string }) | null = null;
  if (b.hub_service_type_id) {
    try {
      service = await loadServiceType(b.clinic_id, b.hub_service_type_id, 'internacao');
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
  }

  let inventoryName: string | null = null;
  let inventorySale: number | null = null;
  if (b.hub_inventory_item_id) {
    const { data: inv, error: invErr } = await supabaseAdmin
      .from('hub_inventory_items')
      .select('id, name, sale_amount, active, deleted_at')
      .eq('id', b.hub_inventory_item_id)
      .eq('clinic_id', b.clinic_id)
      .maybeSingle();
    if (invErr) return res.status(500).json({ error: invErr.message });
    if (!inv || inv.deleted_at || inv.active === false) {
      return res.status(400).json({ error: 'Item de estoque não encontrado' });
    }
    inventoryName = String(inv.name ?? '') || null;
    inventorySale = inv.sale_amount == null ? null : roundMoney2(Number(inv.sale_amount));
  }

  const serviceName =
    b.service_name?.trim() ||
    service?.name ||
    inventoryName ||
    (b.charge_kind === 'medication'
      ? 'Medicação'
      : b.charge_kind === 'material'
        ? 'Material'
        : 'Item de internação');

  const defaultBilling: 'charge' | 'included' =
    b.billing_mode ??
    (b.charge_kind === 'medication' && (hosp as { daily_includes_medication?: boolean }).daily_includes_medication
      ? 'included'
      : 'charge');

  let unit_amount = roundMoney2(
    Number(b.unit_amount ?? service?.sale_amount ?? inventorySale ?? 0),
  );
  let pricing_source: z.infer<typeof pricingSourceSchema> = 'catalog';
  let price_status: 'confirmed' | 'pending_approval' = 'confirmed';

  if (service) {
    const resolved = await resolveUnitAndStatus({
      clinicId: b.clinic_id,
      userId: req.user?.id,
      service,
      unitAmountOverride: b.unit_amount,
    });
    unit_amount = resolved.unit_amount;
    pricing_source = resolved.pricing_source as z.infer<typeof pricingSourceSchema>;
    price_status = resolved.price_status;
  } else if (b.hub_inventory_item_id && inventorySale != null && b.unit_amount == null) {
    // Material/medicamento do estoque ao preço de catálogo — cobrável sem aprovação extra.
    unit_amount = inventorySale;
    pricing_source = 'catalog';
    price_status = 'confirmed';
  } else if (b.unit_amount != null) {
    const canApprove = await canAutoApproveFinancial(req.user?.id, b.clinic_id);
    const catalog = inventorySale;
    pricing_source =
      catalog != null && roundMoney2(b.unit_amount) === catalog ? 'catalog' : 'manual';
    // Preço manual explícito exige hub.financial.write; preço de catálogo confirma.
    price_status =
      pricing_source === 'catalog' || canApprove ? 'confirmed' : 'pending_approval';
  }

  // Itens inclusos não precisam de aprovação financeira
  if (defaultBilling === 'included') price_status = 'confirmed';

  const { data, error } = await supabaseAdmin
    .from('hub_hospitalization_charges')
    .insert({
      clinic_id: b.clinic_id,
      hospitalization_id: hospId.data,
      charge_kind: b.charge_kind,
      hub_service_type_id: b.hub_service_type_id ?? null,
      hub_inventory_item_id: b.hub_inventory_item_id ?? null,
      hub_inventory_lot_id: b.hub_inventory_lot_id ?? null,
      service_name: serviceName,
      quantity: b.quantity,
      unit_amount,
      pricing_source,
      price_status,
      proposed_by_user_id: req.user?.id ?? null,
      approved_by_user_id: price_status === 'confirmed' ? req.user?.id ?? null : null,
      approved_at: price_status === 'confirmed' ? new Date().toISOString() : null,
      billing_mode: defaultBilling,
      service_date: b.service_date ?? new Date().toISOString().slice(0, 10),
      notes: b.notes ?? null,
      sort_order: b.sort_order ?? 0,
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await syncEncounterComandaFromHospitalization(hospId.data, b.clinic_id);
  return res.status(201).json({ charge: data });
};

export const patchHubHospitalizationCharge = async (req: Request, res: Response) => {
  const hospId = uuidStr.safeParse(req.params.id);
  const chargeId = uuidStr.safeParse(req.params.chargeId);
  const parsed = z
    .object({
      clinic_id: uuidStr,
      unit_amount: z.number().min(0).optional(),
      quantity: z.number().positive().optional(),
      billing_mode: billingModeSchema.optional(),
      notes: z.string().trim().max(2000).optional().nullable(),
      service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      sort_order: z.number().int().optional(),
    })
    .safeParse(req.body);
  if (!hospId.success || !chargeId.success || !parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }
  const b = parsed.data;

  const { data: hospRow, error: hospStatusErr } = await supabaseAdmin
    .from('hub_hospitalizations')
    .select('id, status')
    .eq('id', hospId.data)
    .eq('clinic_id', b.clinic_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (hospStatusErr) return res.status(500).json({ error: hospStatusErr.message });
  if (!hospRow) return res.status(404).json({ error: 'Internação não encontrada' });
  const patchHospStatus = String((hospRow as { status?: string }).status ?? '');
  if (HOSPITALIZATION_CHARGE_BLOCKED_STATUSES.has(patchHospStatus) || isHospitalizationClosed(patchHospStatus)) {
    return res.status(409).json({
      error: hospitalizationChargeBlockedMessage(patchHospStatus),
      code: 'HOSPITALIZATION_CLOSED',
      status: patchHospStatus,
    });
  }

  const { data: existing, error: getErr } = await supabaseAdmin
    .from('hub_hospitalization_charges')
    .select('*')
    .eq('id', chargeId.data)
    .eq('hospitalization_id', hospId.data)
    .eq('clinic_id', b.clinic_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (getErr) return res.status(500).json({ error: getErr.message });
  if (!existing) return res.status(404).json({ error: 'Lançamento não encontrado' });

  const update: Record<string, unknown> = {};
  if (b.quantity !== undefined) update.quantity = b.quantity;
  if (b.billing_mode !== undefined) update.billing_mode = b.billing_mode;
  if (b.notes !== undefined) update.notes = b.notes;
  if (b.service_date !== undefined) update.service_date = b.service_date;
  if (b.sort_order !== undefined) update.sort_order = b.sort_order;

  if (b.unit_amount !== undefined) {
    if (existing.hub_service_type_id) {
      let service: ServicePriceModeRow;
      try {
        service = await loadServiceType(b.clinic_id, existing.hub_service_type_id as string);
      } catch (e) {
        return res.status(400).json({ error: (e as Error).message });
      }
      const resolved = await resolveUnitAndStatus({
        clinicId: b.clinic_id,
        userId: req.user?.id,
        service,
        unitAmountOverride: b.unit_amount,
      });
      update.unit_amount = resolved.unit_amount;
      update.pricing_source = resolved.pricing_source;
      update.price_status = resolved.price_status;
    } else {
      const canApprove = await canAutoApproveFinancial(req.user?.id, b.clinic_id);
      update.unit_amount = roundMoney2(b.unit_amount);
      update.pricing_source = 'manual';
      update.price_status = canApprove ? 'confirmed' : 'pending_approval';
    }
    update.proposed_by_user_id = req.user?.id ?? null;
    if (update.price_status === 'confirmed') {
      update.approved_by_user_id = req.user?.id ?? null;
      update.approved_at = new Date().toISOString();
    } else {
      update.approved_by_user_id = null;
      update.approved_at = null;
    }
  }

  if (update.billing_mode === 'included') {
    update.price_status = 'confirmed';
  }

  const { data, error } = await supabaseAdmin
    .from('hub_hospitalization_charges')
    .update(update)
    .eq('id', chargeId.data)
    .eq('clinic_id', b.clinic_id)
    .select('*')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });

  await syncEncounterComandaFromHospitalization(hospId.data, b.clinic_id);
  return res.json({ charge: data });
};

export const deleteHubHospitalizationCharge = async (req: Request, res: Response) => {
  const hospId = uuidStr.safeParse(req.params.id);
  const chargeId = uuidStr.safeParse(req.params.chargeId);
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!hospId.success || !chargeId.success || !clinic_id.success) {
    return res.status(400).json({ error: 'id, chargeId e clinic_id obrigatórios' });
  }
  const { error } = await supabaseAdmin
    .from('hub_hospitalization_charges')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', chargeId.data)
    .eq('hospitalization_id', hospId.data)
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null);
  if (error) return res.status(500).json({ error: error.message });
  await syncEncounterComandaFromHospitalization(hospId.data, clinic_id.data);
  return res.status(204).send();
};

export const approveHubHospitalizationChargePrice = async (req: Request, res: Response) => {
  const hospId = uuidStr.safeParse(req.params.id);
  const chargeId = uuidStr.safeParse(req.params.chargeId);
  const parsed = z.object({ clinic_id: uuidStr }).safeParse(req.body);
  if (!hospId.success || !chargeId.success || !parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }
  const { clinic_id } = parsed.data;
  const { data, error } = await supabaseAdmin
    .from('hub_hospitalization_charges')
    .update({
      price_status: 'confirmed',
      approved_by_user_id: req.user?.id ?? null,
      approved_at: new Date().toISOString(),
    })
    .eq('id', chargeId.data)
    .eq('hospitalization_id', hospId.data)
    .eq('clinic_id', clinic_id)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Lançamento não encontrado' });
  await syncEncounterComandaFromHospitalization(hospId.data, clinic_id);
  return res.json({ charge: data });
};

/** Helper usado pelo create de cirurgia para inserir várias linhas de uma vez. */
export async function insertSurgeryServicesBatch(opts: {
  clinicId: string;
  surgeryId: string;
  appointmentId: string | null;
  userId: string | null | undefined;
  services: Array<{
    hub_service_type_id: string;
    unit_amount?: number | null;
    quantity?: number;
    billing_mode?: 'charge' | 'included';
    notes?: string | null;
  }>;
}): Promise<void> {
  let sort = 0;
  for (const svc of opts.services) {
    const service = await loadServiceType(opts.clinicId, svc.hub_service_type_id, 'cirurgia');
    let hub_appointment_service_id: string | null = null;
    let unitOverride = svc.unit_amount;
    if (opts.appointmentId) {
      const dedupe = await findAppointmentServiceDedupe(opts.appointmentId, svc.hub_service_type_id);
      if (dedupe) {
        hub_appointment_service_id = dedupe.id;
        if (unitOverride == null && dedupe.sale_amount_applied != null) {
          unitOverride = dedupe.sale_amount_applied;
        }
      }
    }
    const resolved = await resolveUnitAndStatus({
      clinicId: opts.clinicId,
      userId: opts.userId,
      service,
      unitAmountOverride: unitOverride,
    });
    const price_status = hub_appointment_service_id ? 'confirmed' : resolved.price_status;
    await supabaseAdmin.from('hub_surgery_services').insert({
      clinic_id: opts.clinicId,
      surgery_id: opts.surgeryId,
      hub_service_type_id: svc.hub_service_type_id,
      hub_appointment_service_id,
      service_name: service.name,
      quantity: svc.quantity ?? 1,
      unit_amount: resolved.unit_amount,
      pricing_source: resolved.pricing_source,
      price_status,
      proposed_by_user_id: opts.userId ?? null,
      approved_by_user_id: price_status === 'confirmed' ? opts.userId ?? null : null,
      approved_at: price_status === 'confirmed' ? new Date().toISOString() : null,
      billing_mode: svc.billing_mode ?? 'charge',
      notes: svc.notes ?? null,
      sort_order: sort++,
    });
  }
}

// ── Encounter services (consulta / grupo clinica) ─────────────────────────────

const encounterServiceBodySchema = z.object({
  clinic_id: uuidStr,
  hub_service_type_id: uuidStr,
  unit_amount: z.number().min(0).optional().nullable(),
  quantity: z.number().positive().optional().default(1),
  billing_mode: billingModeSchema.optional().default('charge'),
  notes: z.string().trim().max(2000).optional().nullable(),
  sort_order: z.number().int().optional(),
});

export const listHubEncounterServices = async (req: Request, res: Response) => {
  const encounterId = uuidStr.safeParse(req.params.id);
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!encounterId.success || !clinic_id.success) {
    return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
  }
  const { data, error } = await supabaseAdmin
    .from('hub_encounter_services')
    .select('*')
    .eq('hub_encounter_id', encounterId.data)
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (error) {
    if (String(error.message).includes('hub_encounter_services') || error.code === '42P01') {
      return res.json({ services: [] });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.json({ services: data ?? [] });
};

export const createHubEncounterService = async (req: Request, res: Response) => {
  const encounterId = uuidStr.safeParse(req.params.id);
  const parsed = encounterServiceBodySchema.safeParse(req.body);
  if (!encounterId.success || !parsed.success) {
    return res.status(400).json({
      error: 'Dados inválidos',
      details: parsed.success ? undefined : parsed.error.flatten(),
    });
  }
  const b = parsed.data;

  const { data: enc, error: encErr } = await supabaseAdmin
    .from('hub_encounters')
    .select('id, clinic_id, hub_appointment_id, status, deleted_at')
    .eq('id', encounterId.data)
    .eq('clinic_id', b.clinic_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (encErr) return res.status(500).json({ error: encErr.message });
  if (!enc) return res.status(404).json({ error: 'Atendimento não encontrado' });
  if (String(enc.status) === 'cancelled') {
    return res.status(400).json({ error: 'Não é possível lançar serviços em atendimento cancelado' });
  }

  let service: ServicePriceModeRow & {
    service_group: string;
    is_encounter_application?: boolean | null;
  };
  try {
    service = await loadServiceType(b.clinic_id, b.hub_service_type_id, 'clinica');
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
  if (service.is_encounter_application) {
    return res.status(400).json({
      error: 'Serviço de aplicação na consulta: use o fluxo Medicação (Aplicado agora).',
    });
  }

  let hub_appointment_service_id: string | null = null;
  let unitOverride = b.unit_amount;
  const apptId = (enc as { hub_appointment_id?: string | null }).hub_appointment_id ?? null;
  if (apptId) {
    const dedupe = await findAppointmentServiceDedupe(apptId, b.hub_service_type_id);
    if (dedupe) {
      hub_appointment_service_id = dedupe.id;
      if (unitOverride == null && dedupe.sale_amount_applied != null) {
        unitOverride = dedupe.sale_amount_applied;
      }
    }
  }

  const resolved = await resolveUnitAndStatus({
    clinicId: b.clinic_id,
    userId: req.user?.id,
    service,
    unitAmountOverride: unitOverride,
  });

  const { data, error } = await supabaseAdmin
    .from('hub_encounter_services')
    .insert({
      clinic_id: b.clinic_id,
      hub_encounter_id: encounterId.data,
      hub_service_type_id: b.hub_service_type_id,
      hub_appointment_service_id,
      service_name: service.name,
      quantity: b.quantity,
      unit_amount: resolved.unit_amount,
      pricing_source: resolved.pricing_source,
      price_status: hub_appointment_service_id ? 'confirmed' : resolved.price_status,
      proposed_by_user_id: req.user?.id ?? null,
      approved_by_user_id:
        (hub_appointment_service_id || resolved.price_status === 'confirmed') && req.user?.id
          ? req.user.id
          : null,
      approved_at:
        hub_appointment_service_id || resolved.price_status === 'confirmed'
          ? new Date().toISOString()
          : null,
      billing_mode: b.billing_mode,
      notes: b.notes ?? null,
      sort_order: b.sort_order ?? 0,
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await syncOpenComandasAfterEncounterChargeableChange(b.clinic_id, encounterId.data);
  return res.status(201).json({ service: data });
};

export const patchHubEncounterService = async (req: Request, res: Response) => {
  const encounterId = uuidStr.safeParse(req.params.id);
  const serviceId = uuidStr.safeParse(req.params.serviceId);
  const parsed = z
    .object({
      clinic_id: uuidStr,
      unit_amount: z.number().min(0).optional(),
      quantity: z.number().positive().optional(),
      billing_mode: billingModeSchema.optional(),
      notes: z.string().trim().max(2000).optional().nullable(),
      sort_order: z.number().int().optional(),
    })
    .safeParse(req.body);
  if (!encounterId.success || !serviceId.success || !parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }
  const b = parsed.data;

  const { data: existing, error: getErr } = await supabaseAdmin
    .from('hub_encounter_services')
    .select('*')
    .eq('id', serviceId.data)
    .eq('hub_encounter_id', encounterId.data)
    .eq('clinic_id', b.clinic_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (getErr) return res.status(500).json({ error: getErr.message });
  if (!existing) return res.status(404).json({ error: 'Serviço do atendimento não encontrado' });

  const update: Record<string, unknown> = {};
  if (b.quantity !== undefined) update.quantity = b.quantity;
  if (b.billing_mode !== undefined) update.billing_mode = b.billing_mode;
  if (b.notes !== undefined) update.notes = b.notes;
  if (b.sort_order !== undefined) update.sort_order = b.sort_order;

  if (b.unit_amount !== undefined) {
    let service: ServicePriceModeRow;
    try {
      service = await loadServiceType(b.clinic_id, existing.hub_service_type_id as string);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
    const resolved = await resolveUnitAndStatus({
      clinicId: b.clinic_id,
      userId: req.user?.id,
      service,
      unitAmountOverride: b.unit_amount,
    });
    update.unit_amount = resolved.unit_amount;
    update.pricing_source = resolved.pricing_source;
    update.price_status = resolved.price_status;
    update.proposed_by_user_id = req.user?.id ?? null;
    if (resolved.price_status === 'confirmed') {
      update.approved_by_user_id = req.user?.id ?? null;
      update.approved_at = new Date().toISOString();
    } else {
      update.approved_by_user_id = null;
      update.approved_at = null;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('hub_encounter_services')
    .update(update)
    .eq('id', serviceId.data)
    .eq('clinic_id', b.clinic_id)
    .select('*')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });

  await syncOpenComandasAfterEncounterChargeableChange(b.clinic_id, encounterId.data);
  return res.json({ service: data });
};

export const deleteHubEncounterService = async (req: Request, res: Response) => {
  const encounterId = uuidStr.safeParse(req.params.id);
  const serviceId = uuidStr.safeParse(req.params.serviceId);
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!encounterId.success || !serviceId.success || !clinic_id.success) {
    return res.status(400).json({ error: 'id, serviceId e clinic_id obrigatórios' });
  }
  const { error } = await supabaseAdmin
    .from('hub_encounter_services')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', serviceId.data)
    .eq('hub_encounter_id', encounterId.data)
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null);
  if (error) return res.status(500).json({ error: error.message });
  await syncOpenComandasAfterEncounterChargeableChange(clinic_id.data, encounterId.data);
  return res.status(204).send();
};

export const approveHubEncounterServicePrice = async (req: Request, res: Response) => {
  const encounterId = uuidStr.safeParse(req.params.id);
  const serviceId = uuidStr.safeParse(req.params.serviceId);
  const parsed = z.object({ clinic_id: uuidStr }).safeParse(req.body);
  if (!encounterId.success || !serviceId.success || !parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }
  const { clinic_id } = parsed.data;
  const { data, error } = await supabaseAdmin
    .from('hub_encounter_services')
    .update({
      price_status: 'confirmed',
      approved_by_user_id: req.user?.id ?? null,
      approved_at: new Date().toISOString(),
    })
    .eq('id', serviceId.data)
    .eq('hub_encounter_id', encounterId.data)
    .eq('clinic_id', clinic_id)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Serviço do atendimento não encontrado' });
  await syncOpenComandasAfterEncounterChargeableChange(clinic_id, encounterId.data);
  return res.json({ service: data });
};
