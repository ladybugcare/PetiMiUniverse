import { apiRequest } from './api';
import { Unit, CreateUnitData, UpdateUnitData } from '../types/units';

export const unitsApi = {
  // Create new unit
  create: async (data: CreateUnitData): Promise<{ unit: Unit }> => {
    return apiRequest('/units/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get units by clinic ID (todas as unidades por defeito; use activeOnly para só active/approved)
  getByClinic: async (
    clinicId: string,
    options?: { activeOnly?: boolean }
  ): Promise<{ units: Unit[] }> => {
    const qs = options?.activeOnly ? '?activeOnly=true' : '';
    return apiRequest(`/units/clinic/${clinicId}${qs}`);
  },

  // Get unit by ID
  getById: async (unitId: string): Promise<{ unit: Unit }> => {
    return apiRequest(`/units/${unitId}`);
  },

  // Update unit
  update: async (unitId: string, data: UpdateUnitData): Promise<{ unit: Unit }> => {
    return apiRequest(`/units/${unitId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Delete unit (soft delete)
  delete: async (unitId: string): Promise<{ message: string; unit: Unit }> => {
    return apiRequest(`/units/${unitId}`, {
      method: 'DELETE',
    });
  },

  // Get unit statistics
  getUnitStats: async (unitId: string): Promise<{ stats: {
    totalDemands: number;
    openDemands: number;
    totalApplications: number;
    pendingApplications: number;
  } }> => {
    return apiRequest(`/units/${unitId}/stats`);
  },
};

