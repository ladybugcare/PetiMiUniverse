"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTransportCage = exports.patchTransportCage = exports.createTransportCage = exports.patchPickupVehicle = exports.createPickupVehicle = exports.listPickupVehicles = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const uuidStr = zod_1.z.string().uuid();
// ─── Schemas ──────────────────────────────────────────────────────────────────
const createVehicleSchema = zod_1.z.object({
    clinic_id: uuidStr,
    name: zod_1.z.string().min(1).max(120),
    license_plate: zod_1.z.string().max(20).optional().nullable(),
    color: zod_1.z.string().max(50).optional().nullable(),
    capacity_animals: zod_1.z.number().int().min(1).default(1),
    has_cages: zod_1.z.boolean().default(false),
    notes: zod_1.z.string().max(500).optional().nullable(),
});
const patchVehicleSchema = zod_1.z.object({
    clinic_id: uuidStr,
    name: zod_1.z.string().min(1).max(120).optional(),
    license_plate: zod_1.z.string().max(20).optional().nullable(),
    color: zod_1.z.string().max(50).optional().nullable(),
    capacity_animals: zod_1.z.number().int().min(1).optional(),
    has_cages: zod_1.z.boolean().optional(),
    active: zod_1.z.boolean().optional(),
    notes: zod_1.z.string().max(500).optional().nullable(),
});
const createCageSchema = zod_1.z.object({
    clinic_id: uuidStr,
    name: zod_1.z.string().min(1).max(80),
    color: zod_1.z.string().max(50).optional().nullable(),
    capacity: zod_1.z.number().int().min(1).default(1),
    sort_order: zod_1.z.number().int().min(0).default(0),
});
const patchCageSchema = zod_1.z.object({
    clinic_id: uuidStr,
    name: zod_1.z.string().min(1).max(80).optional(),
    color: zod_1.z.string().max(50).optional().nullable(),
    capacity: zod_1.z.number().int().min(1).optional(),
    sort_order: zod_1.z.number().int().min(0).optional(),
    active: zod_1.z.boolean().optional(),
});
const VEHICLE_SELECT = 'id, clinic_id, name, license_plate, color, capacity_animals, has_cages, active, notes, created_at, updated_at';
const CAGE_SELECT = 'id, clinic_id, vehicle_id, name, color, capacity, sort_order, active, created_at, updated_at';
// ─── Helpers ──────────────────────────────────────────────────────────────────
async function assertVehicleInClinic(clinicId, vehicleId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_pickup_vehicles')
        .select('id, clinic_id, name')
        .eq('id', vehicleId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    return data;
}
async function assertCageInClinic(clinicId, cageId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_transport_cages')
        .select('id, clinic_id, vehicle_id')
        .eq('id', cageId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    return data;
}
async function loadCagesForVehicle(vehicleId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_transport_cages')
        .select(CAGE_SELECT)
        .eq('vehicle_id', vehicleId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
    return data ?? [];
}
// ─── Veículos ─────────────────────────────────────────────────────────────────
const listPickupVehicles = async (req, res) => {
    try {
        const clinicId = req.query.clinic_id;
        if (!uuidStr.safeParse(clinicId).success) {
            return res.status(400).json({ error: 'clinic_id inválido' });
        }
        const includeInactive = req.query.include_inactive === 'true';
        let q = supabase_1.supabaseAdmin
            .from('hub_pickup_vehicles')
            .select(VEHICLE_SELECT)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .order('name', { ascending: true });
        if (!includeInactive)
            q = q.eq('active', true);
        const { data: vehicles, error } = await q;
        if (error)
            return res.status(500).json({ error: error.message });
        // Carregar caixas de todos os veículos em uma única query
        const vehicleIds = (vehicles ?? []).map((v) => v.id);
        let cagesByVehicle = {};
        if (vehicleIds.length > 0) {
            const { data: allCages } = await supabase_1.supabaseAdmin
                .from('hub_transport_cages')
                .select(CAGE_SELECT)
                .in('vehicle_id', vehicleIds)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true });
            for (const cage of allCages ?? []) {
                const vid = cage.vehicle_id;
                if (!cagesByVehicle[vid])
                    cagesByVehicle[vid] = [];
                cagesByVehicle[vid].push(cage);
            }
        }
        const result = (vehicles ?? []).map((v) => ({
            ...v,
            cages: cagesByVehicle[v.id] ?? [],
        }));
        return res.json({ vehicles: result });
    }
    catch (e) {
        console.error('[pickup_vehicles] list', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listPickupVehicles = listPickupVehicles;
const createPickupVehicle = async (req, res) => {
    try {
        const parsed = createVehicleSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, ...fields } = parsed.data;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_pickup_vehicles')
            .insert({ clinic_id, ...fields })
            .select(VEHICLE_SELECT)
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        return res.status(201).json({ vehicle: { ...data, cages: [] } });
    }
    catch (e) {
        console.error('[pickup_vehicles] create', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.createPickupVehicle = createPickupVehicle;
const patchPickupVehicle = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const body = patchVehicleSchema.safeParse(req.body);
        if (!idParsed.success || !body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error?.flatten() });
        }
        const { clinic_id, ...fields } = body.data;
        const existing = await assertVehicleInClinic(clinic_id, idParsed.data);
        if (!existing)
            return res.status(404).json({ error: 'Veículo não encontrado' });
        // Soft-delete via active=false ou deleted_at quando active explicitamente false
        const patch = { ...fields, updated_at: new Date().toISOString() };
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_pickup_vehicles')
            .update(patch)
            .eq('id', idParsed.data)
            .eq('clinic_id', clinic_id)
            .select(VEHICLE_SELECT)
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        const cages = await loadCagesForVehicle(idParsed.data);
        return res.json({ vehicle: { ...data, cages } });
    }
    catch (e) {
        console.error('[pickup_vehicles] patch', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.patchPickupVehicle = patchPickupVehicle;
// ─── Caixas ───────────────────────────────────────────────────────────────────
const createTransportCage = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.vehicleId);
        const body = createCageSchema.safeParse(req.body);
        if (!idParsed.success || !body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error?.flatten() });
        }
        const { clinic_id, ...fields } = body.data;
        const vehicle = await assertVehicleInClinic(clinic_id, idParsed.data);
        if (!vehicle)
            return res.status(404).json({ error: 'Veículo não encontrado' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_transport_cages')
            .insert({ clinic_id, vehicle_id: idParsed.data, ...fields })
            .select(CAGE_SELECT)
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        return res.status(201).json({ cage: data });
    }
    catch (e) {
        console.error('[pickup_vehicles] create_cage', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.createTransportCage = createTransportCage;
const patchTransportCage = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const body = patchCageSchema.safeParse(req.body);
        if (!idParsed.success || !body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error?.flatten() });
        }
        const { clinic_id, ...fields } = body.data;
        const existing = await assertCageInClinic(clinic_id, idParsed.data);
        if (!existing)
            return res.status(404).json({ error: 'Caixa não encontrada' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_transport_cages')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', idParsed.data)
            .eq('clinic_id', clinic_id)
            .select(CAGE_SELECT)
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ cage: data });
    }
    catch (e) {
        console.error('[pickup_vehicles] patch_cage', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.patchTransportCage = patchTransportCage;
const deleteTransportCage = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const clinicId = req.query.clinic_id;
        if (!idParsed.success || !uuidStr.safeParse(clinicId).success) {
            return res.status(400).json({ error: 'Parâmetros inválidos' });
        }
        const existing = await assertCageInClinic(clinicId, idParsed.data);
        if (!existing)
            return res.status(404).json({ error: 'Caixa não encontrada' });
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_transport_cages')
            .delete()
            .eq('id', idParsed.data)
            .eq('clinic_id', clinicId);
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ deleted: true });
    }
    catch (e) {
        console.error('[pickup_vehicles] delete_cage', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.deleteTransportCage = deleteTransportCage;
