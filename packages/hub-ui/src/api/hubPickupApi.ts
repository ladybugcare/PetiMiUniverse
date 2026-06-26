import { apiRequest } from '@petimi/web-core';

const pickupBase = '/api/hub/pickup';

export type PickupDirection = 'pickup' | 'delivery' | 'unknown';

export type PickupDayBoardPet = {
  id: string;
  name: string;
  species?: string | null;
  breed?: string | null;
  size_tier?: string | null;
  birth_date?: string | null;
  avatar_url?: string | null;
};

export type PickupDayBoardItem = {
  appointment_id: string;
  appointment_kind: 'pickup_route';
  direction: PickupDirection;
  starts_at: string;
  ends_at: string;
  status: string;
  notes?: string | null;
  resource_label?: string | null;
  service_type?: { id: string; name: string; service_group: string } | null;
  pet?: PickupDayBoardPet | null;
  guardian?: { id: string; full_name: string; phone?: string | null } | null;
  /** Endereço formatado do tutor (rua, bairro, cidade, estado). */
  address?: string | null;
  unit_id?: string | null;
  hub_staff_member_id?: string | null;
};

export type PickupDayBoardResponse = {
  items: PickupDayBoardItem[];
  date: string;
  clinic_id: string;
};

export const hubPickupApi = {
  dayBoard(
    clinicId: string,
    range: { dateYmd: string; from: string; to: string },
    opts?: { unitId?: string; direction?: 'pickup' | 'delivery' | 'all' },
  ) {
    const q = new URLSearchParams({
      clinic_id: clinicId,
      date: range.dateYmd,
      from: range.from,
      to: range.to,
    });
    if (opts?.unitId) q.set('unit_id', opts.unitId);
    if (opts?.direction && opts.direction !== 'all') q.set('direction', opts.direction);
    return apiRequest(`${pickupBase}/day-board?${q}`) as Promise<PickupDayBoardResponse>;
  },
};
