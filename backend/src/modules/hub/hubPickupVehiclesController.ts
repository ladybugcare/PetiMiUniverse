import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

const uuidStr = z.string().uuid();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createVehicleSchema = z.object({
  clinic_id: uuidStr,
  name: z.string().min(1).max(120),
  license_plate: z.string().max(20).optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  capacity_animals: z.number().int().min(1).default(1),
  has_cages: z.boolean().default(false),
  notes: z.string().max(500).optional().nullable(),
});

const patchVehicleSchema = z.object({
  clinic_id: uuidStr,
  name: z.string().min(1).max(120).optional(),
  license_plate: z.string().max(20).optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  capacity_animals: z.number().int().min(1).optional(),
  has_cages: z.boolean().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
});

const createCageSchema = z.object({
  clinic_id: uuidStr,
  name: z.string().min(1).max(80),
  color: z.string().max(50).optional().nullable(),
  capacity: z.number().int().min(1).default(1),
  sort_order: z.number().int().min(0).default(0),
});

const patchCageSchema = z.object({
  clinic_id: uuidStr,
  name: z.string().min(1).max(80).optional(),
  color: z.string().max(50).optional().nullable(),
  capacity: z.number().int().min(1).optional(),
  sort_order: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

const VEHICLE_SELECT =
  'id, clinic_id, name, license_plate, color, capacity_animals, has_cages, active, notes, created_at, updated_at';
const CAGE_SELECT =
  'id, clinic_id, vehicle_id, name, color, capacity, sort_order, active, created_at, updated_at';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertVehicleInClinic(clinicId: string, vehicleId: string) {
  const { data } = await supabaseAdmin
    .from('hub_pickup_vehicles')
    .select('id, clinic_id, name')
    .eq('id', vehicleId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  return data;
}

async function assertCageInClinic(clinicId: string, cageId: string) {
  const { data } = await supabaseAdmin
    .from('hub_transport_cages')
    .select('id, clinic_id, vehicle_id')
    .eq('id', cageId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  return data;
}

async function loadCagesForVehicle(vehicleId: string) {
  const { data } = await supabaseAdmin
    .from('hub_transport_cages')
    .select(CAGE_SELECT)
    .eq('vehicle_id', vehicleId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  return data ?? [];
}

// ─── Veículos ─────────────────────────────────────────────────────────────────

export const listPickupVehicles = async (req: Request, res: Response) => {
  try {
    const clinicId = req.query.clinic_id as string;
    if (!uuidStr.safeParse(clinicId).success) {
      return res.status(400).json({ error: 'clinic_id inválido' });
    }
    const includeInactive = req.query.include_inactive === 'true';

    let q = supabaseAdmin
      .from('hub_pickup_vehicles')
      .select(VEHICLE_SELECT)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (!includeInactive) q = q.eq('active', true);

    const { data: vehicles, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    // Carregar caixas de todos os veículos em uma única query
    const vehicleIds = (vehicles ?? []).map((v: { id: string }) => v.id);
    let cagesByVehicle: Record<string, unknown[]> = {};
    if (vehicleIds.length > 0) {
      const { data: allCages } = await supabaseAdmin
        .from('hub_transport_cages')
        .select(CAGE_SELECT)
        .in('vehicle_id', vehicleIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      for (const cage of allCages ?? []) {
        const vid = (cage as { vehicle_id: string }).vehicle_id;
        if (!cagesByVehicle[vid]) cagesByVehicle[vid] = [];
        cagesByVehicle[vid].push(cage);
      }
    }

    const result = (vehicles ?? []).map((v: { id: string }) => ({
      ...v,
      cages: cagesByVehicle[v.id] ?? [],
    }));

    return res.json({ vehicles: result });
  } catch (e) {
    console.error('[pickup_vehicles] list', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const createPickupVehicle = async (req: Request, res: Response) => {
  try {
    const parsed = createVehicleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const { clinic_id, ...fields } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from('hub_pickup_vehicles')
      .insert({ clinic_id, ...fields })
      .select(VEHICLE_SELECT)
      .single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({ vehicle: { ...data, cages: [] } });
  } catch (e) {
    console.error('[pickup_vehicles] create', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const patchPickupVehicle = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const body = patchVehicleSchema.safeParse(req.body);
    if (!idParsed.success || !body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error?.flatten() });
    }
    const { clinic_id, ...fields } = body.data;

    const existing = await assertVehicleInClinic(clinic_id, idParsed.data);
    if (!existing) return res.status(404).json({ error: 'Veículo não encontrado' });

    // Soft-delete via active=false ou deleted_at quando active explicitamente false
    const patch: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() };

    const { data, error } = await supabaseAdmin
      .from('hub_pickup_vehicles')
      .update(patch)
      .eq('id', idParsed.data)
      .eq('clinic_id', clinic_id)
      .select(VEHICLE_SELECT)
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const cages = await loadCagesForVehicle(idParsed.data);
    return res.json({ vehicle: { ...data, cages } });
  } catch (e) {
    console.error('[pickup_vehicles] patch', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

// ─── Caixas ───────────────────────────────────────────────────────────────────

export const createTransportCage = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.vehicleId);
    const body = createCageSchema.safeParse(req.body);
    if (!idParsed.success || !body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error?.flatten() });
    }
    const { clinic_id, ...fields } = body.data;

    const vehicle = await assertVehicleInClinic(clinic_id, idParsed.data);
    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado' });

    const { data, error } = await supabaseAdmin
      .from('hub_transport_cages')
      .insert({ clinic_id, vehicle_id: idParsed.data, ...fields })
      .select(CAGE_SELECT)
      .single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({ cage: data });
  } catch (e) {
    console.error('[pickup_vehicles] create_cage', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const patchTransportCage = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const body = patchCageSchema.safeParse(req.body);
    if (!idParsed.success || !body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error?.flatten() });
    }
    const { clinic_id, ...fields } = body.data;

    const existing = await assertCageInClinic(clinic_id, idParsed.data);
    if (!existing) return res.status(404).json({ error: 'Caixa não encontrada' });

    const { data, error } = await supabaseAdmin
      .from('hub_transport_cages')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', idParsed.data)
      .eq('clinic_id', clinic_id)
      .select(CAGE_SELECT)
      .single();
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ cage: data });
  } catch (e) {
    console.error('[pickup_vehicles] patch_cage', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};

export const deleteTransportCage = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    const clinicId = req.query.clinic_id as string;
    if (!idParsed.success || !uuidStr.safeParse(clinicId).success) {
      return res.status(400).json({ error: 'Parâmetros inválidos' });
    }

    const existing = await assertCageInClinic(clinicId, idParsed.data);
    if (!existing) return res.status(404).json({ error: 'Caixa não encontrada' });

    const { error } = await supabaseAdmin
      .from('hub_transport_cages')
      .delete()
      .eq('id', idParsed.data)
      .eq('clinic_id', clinicId);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ deleted: true });
  } catch (e) {
    console.error('[pickup_vehicles] delete_cage', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro interno' });
  }
};
