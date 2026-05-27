import { apiRequest } from '@petimi/web-core';

const basePath = '/api/hub/appointments';

export type HubAppointmentStatus =
  | 'pending_confirm'
  | 'confirmed'
  | 'in_progress'
  | 'done'
  | 'cancelled'
  | 'paid';

export type HubAppointmentKind = 'standard' | 'hotel_stay' | 'daycare_block' | 'pickup_route';

export type HubAppointmentServiceTypeRef = {
  name: string;
  code: string;
  service_group: string;
  agenda_color: string | null;
  group_color?: string | null;
  default_duration_minutes: number | null;
};

export type HubAppointmentStaffRef = {
  full_name: string;
  agenda_color: string | null;
};

export type HubAppointmentPetRef = {
  name: string;
  size_tier?: string;
  coat_type?: string | null;
  birth_date?: string | null;
};
export type HubAppointmentGuardianRef = { full_name: string };
export type HubAppointmentUnitRef = { name: string };

export type HubAppointmentServiceLine = {
  id: string;
  hub_service_type_id: string;
  duration_minutes: number;
  order_index: number;
  pricing_porte_tier_applied?: string | null;
  pricing_coat_type_applied?: string | null;
  cost_amount_applied?: number | null;
  sale_amount_applied?: number | null;
  pricing_variant?: HubAppointmentPricingVariant | null;
  service_type: HubAppointmentServiceTypeRef | null;
};

export type HubAppointment = {
  id: string;
  clinic_id: string;
  unit_id: string | null;
  hub_service_type_id: string;
  hub_staff_member_id: string | null;
  pet_id: string | null;
  guardian_id: string | null;
  starts_at: string;
  ends_at: string;
  status: HubAppointmentStatus;
  resource_label: string | null;
  notes: string | null;
  appointment_kind: HubAppointmentKind;
  title: string | null;
  description: string | null;
  financial_notes?: string | null;
  series_id: string | null;
  series_occurrence_date: string | null;
  created_at: string;
  updated_at: string;
  pricing_porte_tier?: string | null;
  pricing_coat_type?: string | null;
  service_type: HubAppointmentServiceTypeRef | null;
  staff_member: HubAppointmentStaffRef | null;
  pet: HubAppointmentPetRef | null;
  guardian: HubAppointmentGuardianRef | null;
  unit: HubAppointmentUnitRef | null;
  services: HubAppointmentServiceLine[];
};

export type HubAgendaCalendarBlock = {
  id: string;
  clinic_id: string;
  block_date: string;
  label: string;
  kind: 'holiday' | 'closure' | 'reduced_staff' | 'other';
  created_at?: string;
  updated_at?: string;
};

export type ListHubAppointmentsParams = {
  clinic_id: string;
  from: string;
  to: string;
  unit_id?: string;
  hub_staff_member_id?: string;
  hub_service_type_id?: string;
  service_group?: string;
  status?: HubAppointmentStatus;
  resource_label?: string;
};

export type HubAppointmentRecurrenceRule = {
  kind: 'daily' | 'weekly' | 'monthly';
  interval_value?: number;
  days_of_week?: number[] | null;
  day_of_month?: number | null;
  until_date?: string | null;
  occurrences?: number | null;
};

export type HubAppointmentPricingVariant = {
  km_tier_index?: number;
  period?: 'full_day' | 'half_day';
  consult_type?: 'padrao' | 'retorno';
};

export type HubAppointmentPickupRoutePricing = {
  hub_service_type_id: string;
  pricing_variant: { km_tier_index: number };
};

export type CreatePickupRouteBlock = {
  starts_at: string;
  ends_at: string;
  resource_label?: string | null;
  hub_staff_member_id?: string | null;
};

export type CreateExtraBlock = {
  starts_at: string;
  ends_at: string;
  services: Array<{
    hub_service_type_id: string;
    duration_minutes: number;
    pricing_porte_tier?: string | null;
    pricing_coat_type?: string | null;
    pricing_variant?: HubAppointmentPricingVariant | null;
  }>;
  hub_staff_member_id?: string | null;
  resource_label?: string | null;
  status?: HubAppointmentStatus;
  notes?: string | null;
  title?: string | null;
};

export type CreateHubAppointmentPayload = {
  clinic_id: string;
  unit_id?: string | null;
  hub_service_type_id: string;
  hub_staff_member_id?: string | null;
  pet_id?: string | null;
  guardian_id?: string | null;
  starts_at: string;
  ends_at: string;
  status?: HubAppointmentStatus;
  resource_label?: string | null;
  notes?: string | null;
  appointment_kind?: HubAppointmentKind;
  title?: string | null;
  description?: string | null;
  financial_notes?: string | null;
  services?: Array<{
    hub_service_type_id: string;
    duration_minutes: number;
    pricing_porte_tier?: string | null;
    pricing_coat_type?: string | null;
    pricing_variant?: HubAppointmentPricingVariant | null;
  }>;
  pricing_porte_tier?: string | null;
  pricing_coat_type?: string | null;
  with_pickup_route_before?: CreatePickupRouteBlock | null;
  with_pickup_route_after?: CreatePickupRouteBlock | null;
  pickup_route_pricing?: HubAppointmentPickupRoutePricing | null;
  extra_blocks?: CreateExtraBlock[];
  recurrence?: HubAppointmentRecurrenceRule | null;
};

export type PatchHubAppointmentPayload = {
  clinic_id: string;
  unit_id?: string | null;
  hub_service_type_id?: string;
  hub_staff_member_id?: string | null;
  pet_id?: string | null;
  guardian_id?: string | null;
  starts_at?: string;
  ends_at?: string;
  status?: HubAppointmentStatus;
  resource_label?: string | null;
  notes?: string | null;
  appointment_kind?: HubAppointmentKind;
  deleted?: boolean;
  title?: string | null;
  description?: string | null;
  services?: Array<{
    hub_service_type_id: string;
    duration_minutes: number;
    pricing_porte_tier?: string | null;
    pricing_coat_type?: string | null;
    pricing_variant?: HubAppointmentPricingVariant | null;
  }>;
  pricing_porte_tier?: string | null;
  pricing_coat_type?: string | null;
};

function listAppointmentsUrl(p: ListHubAppointmentsParams): string {
  const q = new URLSearchParams({
    clinic_id: p.clinic_id,
    from: p.from,
    to: p.to,
  });
  if (p.unit_id) q.set('unit_id', p.unit_id);
  if (p.hub_staff_member_id) q.set('hub_staff_member_id', p.hub_staff_member_id);
  if (p.hub_service_type_id) q.set('hub_service_type_id', p.hub_service_type_id);
  if (p.service_group) q.set('service_group', p.service_group);
  if (p.status) q.set('status', p.status);
  if (p.resource_label) q.set('resource_label', p.resource_label);
  return `${basePath}?${q.toString()}`;
}

function calendarBlocksUrl(clinicId: string, from: string, to: string): string {
  const q = new URLSearchParams({ clinic_id: clinicId, from, to });
  return `${basePath}/calendar-blocks?${q.toString()}`;
}

export const hubAgendaApi = {
  async list(p: ListHubAppointmentsParams): Promise<{ appointments: HubAppointment[]; range: { from: string; to: string } }> {
    return apiRequest(listAppointmentsUrl(p)) as Promise<{
      appointments: HubAppointment[];
      range: { from: string; to: string };
    }>;
  },

  async listCalendarBlocks(
    clinicId: string,
    fromYmd: string,
    toYmd: string,
  ): Promise<{ blocks: HubAgendaCalendarBlock[] }> {
    return apiRequest(calendarBlocksUrl(clinicId, fromYmd, toYmd)) as Promise<{ blocks: HubAgendaCalendarBlock[] }>;
  },

  async create(payload: CreateHubAppointmentPayload): Promise<{
    appointment: HubAppointment;
    created_count: number;
    conflict_count: number;
    conflicts?: Array<{ date: string; reason: string; conflictingId?: string }>;
  }> {
    return apiRequest(basePath, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{
      appointment: HubAppointment;
      created_count: number;
      conflict_count: number;
      conflicts?: Array<{ date: string; reason: string; conflictingId?: string }>;
    }>;
  },

  async patch(
    id: string,
    payload: PatchHubAppointmentPayload,
    opts?: { scope?: 'this' | 'future' | 'all' },
  ): Promise<{ appointment: HubAppointment; updated_count: number }> {
    const scope = opts?.scope ?? 'this';
    return apiRequest(`${basePath}/${encodeURIComponent(id)}?scope=${scope}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ appointment: HubAppointment; updated_count: number }>;
  },

  async upsertCalendarBlock(payload: {
    clinic_id: string;
    block_date: string;
    label: string;
    kind?: 'holiday' | 'closure' | 'reduced_staff' | 'other';
  }): Promise<{ block: HubAgendaCalendarBlock }> {
    return apiRequest(`${basePath}/calendar-blocks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ block: HubAgendaCalendarBlock }>;
  },

  async deleteCalendarBlock(id: string, clinicId: string): Promise<void> {
    await apiRequest(`${basePath}/calendar-blocks/${encodeURIComponent(id)}?clinic_id=${encodeURIComponent(clinicId)}`, {
      method: 'DELETE',
    });
  },
};
