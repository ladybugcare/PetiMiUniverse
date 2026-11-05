import { apiRequest } from '@petimi/web-core';
import type { HubDayOpsSummary } from '../pages/dashboard/todayOpsTypes';

const base = '/api/hub';

export const hubOpsApi = {
  getDayOpsSummary(clinicId: string, unitId: string, dateYmd: string): Promise<HubDayOpsSummary> {
    const q = new URLSearchParams({
      clinic_id: clinicId,
      unit_id: unitId,
      date: dateYmd,
    });
    return apiRequest(`${base}/day-ops-summary?${q}`) as Promise<HubDayOpsSummary>;
  },
};
