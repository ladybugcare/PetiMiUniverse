import { apiRequest } from '@petimi/web-core';

const base = '/api/hub/appointments';

export type HubAppointmentsServiceGroupStat = {
  service_group: string;
  label: string;
  count: number;
};

export const hubAppointmentsApi = {
  async getStatsByServiceGroup(params: {
    clinic_id: string;
    unit_id: string;
    from: string;
    to: string;
    hub_staff_member_id?: string | '__na__';
    hub_service_type_id?: string;
  }): Promise<{ period: { from: string; to: string }; items: HubAppointmentsServiceGroupStat[] }> {
    const q = new URLSearchParams({
      clinic_id: params.clinic_id,
      unit_id: params.unit_id,
      from: params.from,
      to: params.to,
    });
    if (params.hub_staff_member_id) q.set('hub_staff_member_id', params.hub_staff_member_id);
    if (params.hub_service_type_id) q.set('hub_service_type_id', params.hub_service_type_id);
    return apiRequest(`${base}/stats/by-service-group?${q}`) as Promise<{
      period: { from: string; to: string };
      items: HubAppointmentsServiceGroupStat[];
    }>;
  },
};
