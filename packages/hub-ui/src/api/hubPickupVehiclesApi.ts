import { apiRequest } from '@petimi/web-core';

const base = '/api/hub/pickup';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TransportCage = {
  id: string;
  clinic_id: string;
  vehicle_id: string;
  name: string;
  color?: string | null;
  capacity: number;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type PickupVehicle = {
  id: string;
  clinic_id: string;
  name: string;
  license_plate?: string | null;
  color?: string | null;
  capacity_animals: number;
  has_cages: boolean;
  active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  cages: TransportCage[];
};

export type CreateVehiclePayload = {
  clinic_id: string;
  name: string;
  license_plate?: string | null;
  color?: string | null;
  capacity_animals?: number;
  has_cages?: boolean;
  notes?: string | null;
};

export type PatchVehiclePayload = Partial<Omit<CreateVehiclePayload, 'clinic_id'>> & {
  clinic_id: string;
  active?: boolean;
};

export type CreateCagePayload = {
  clinic_id: string;
  name: string;
  color?: string | null;
  capacity?: number;
  sort_order?: number;
};

export type PatchCagePayload = Partial<Omit<CreateCagePayload, 'clinic_id'>> & {
  clinic_id: string;
  active?: boolean;
};

// ─── Cliente de API ───────────────────────────────────────────────────────────

export const hubPickupVehiclesApi = {
  listVehicles(clinicId: string, opts?: { includeInactive?: boolean }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.includeInactive) q.set('include_inactive', 'true');
    return apiRequest(`${base}/vehicles?${q}`) as Promise<{ vehicles: PickupVehicle[] }>;
  },

  createVehicle(payload: CreateVehiclePayload) {
    return apiRequest(`${base}/vehicles`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ vehicle: PickupVehicle }>;
  },

  patchVehicle(vehicleId: string, payload: PatchVehiclePayload) {
    return apiRequest(`${base}/vehicles/${encodeURIComponent(vehicleId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ vehicle: PickupVehicle }>;
  },

  createCage(vehicleId: string, payload: CreateCagePayload) {
    return apiRequest(`${base}/vehicles/${encodeURIComponent(vehicleId)}/cages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ cage: TransportCage }>;
  },

  patchCage(cageId: string, payload: PatchCagePayload) {
    return apiRequest(`${base}/cages/${encodeURIComponent(cageId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ cage: TransportCage }>;
  },

  deleteCage(cageId: string, clinicId: string) {
    return apiRequest(
      `${base}/cages/${encodeURIComponent(cageId)}?clinic_id=${encodeURIComponent(clinicId)}`,
      { method: 'DELETE' },
    ) as Promise<{ deleted: boolean }>;
  },
};
