import { apiRequest } from '@petimi/web-core';
import type { BoardingMode, BoardingStage } from '../pages/boarding/boardingStages';

const boardingBase = '/api/hub/boarding';

export type BoardingClinicalTag = { key: string; label: string };

export type BoardingDayBoardPet = {
  id: string;
  name: string;
  species?: string;
  breed?: string | null;
  size_tier?: string;
  birth_date?: string | null;
  notes?: string | null;
  avatar_url?: string | null;
};

export type BoardingDayBoardItem = {
  kind: 'reservation' | 'appointment_slot';
  reservation_id?: string | null;
  appointment_id?: string | null;
  boarding_stage: BoardingStage | string;
  /** 'hotel' ou 'daycare' */
  mode: BoardingMode | string;
  is_walk_in?: boolean;
  is_late?: boolean;
  starts_at: string;
  ends_at: string;
  appointment_status?: string | null;
  appointment_kind?: string;
  title?: string | null;
  notes?: string | null;
  service_type?: { id: string; name: string; service_group?: string } | null;
  daily_rate_cents?: number | null;
  /** Diárias acumuladas (check-in até agora ou até check-out). */
  nights_count?: number | null;
  pet?: BoardingDayBoardPet | null;
  guardian?: { id: string; full_name: string; phone?: string | null } | null;
  pet_id?: string | null;
  guardian_id?: string | null;
  clinical_tags?: BoardingClinicalTag[];
};

export type BoardingDayBoardResponse = {
  items: BoardingDayBoardItem[];
  date: string;
  boarding_types_configured?: boolean;
};

export type BoardingReservation = {
  id: string;
  clinic_id: string;
  mode: BoardingMode;
  status: BoardingStage;
  pet_id: string;
  guardian_id?: string | null;
  hub_appointment_id?: string | null;
  expected_check_in?: string | null;
  expected_check_out?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  daily_rate_cents?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type BoardingDailyLog = {
  id: string;
  clinic_id: string;
  hub_boarding_reservation_id: string;
  log_date: string;
  fed?: unknown;
  medication?: unknown;
  walks?: unknown;
  mood?: string | null;
  notes?: string | null;
  created_at: string;
};

export type BoardingDrawerResponse = {
  reservation: BoardingReservation & Record<string, unknown>;
  pet: BoardingDayBoardPet | null;
  guardian: { id: string; full_name: string; phone?: string | null } | null;
  clinical_tags: BoardingClinicalTag[];
  nights_count: number;
  daily_logs: BoardingDailyLog[];
};

export const hubBoardingApi = {
  dayBoard(
    clinicId: string,
    range: { dateYmd: string; from: string; to: string },
    opts?: { unitId?: string; mode?: BoardingMode },
  ) {
    const q = new URLSearchParams({
      clinic_id: clinicId,
      date: range.dateYmd,
      from: range.from,
      to: range.to,
    });
    if (opts?.unitId) q.set('unit_id', opts.unitId);
    if (opts?.mode && opts.mode !== 'all') q.set('mode', opts.mode);
    return apiRequest(`${boardingBase}/day-board?${q}`) as Promise<BoardingDayBoardResponse>;
  },

  openFromAppointment(clinicId: string, hubAppointmentId: string) {
    return apiRequest(`${boardingBase}/reservations/open-from-appointment`, {
      method: 'POST',
      body: JSON.stringify({ clinic_id: clinicId, hub_appointment_id: hubAppointmentId }),
    }) as Promise<{ reservation: BoardingReservation; created: boolean }>;
  },

  createReservation(payload: {
    clinic_id: string;
    pet_id: string;
    guardian_id?: string | null;
    unit_id?: string | null;
    mode: BoardingMode;
    expected_check_in?: string | null;
    expected_check_out?: string | null;
    daily_rate_cents?: number | null;
    notes?: string | null;
  }) {
    return apiRequest(`${boardingBase}/reservations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ reservation: BoardingReservation }>;
  },

  patchReservation(
    id: string,
    payload: {
      clinic_id: string;
      status?: BoardingStage;
      expected_check_in?: string | null;
      expected_check_out?: string | null;
      checked_in_at?: string | null;
      checked_out_at?: string | null;
      notes?: string | null;
    },
  ) {
    return apiRequest(`${boardingBase}/reservations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ reservation: BoardingReservation }>;
  },

  reservationDrawer(reservationId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(
      `${boardingBase}/reservations/${encodeURIComponent(reservationId)}/drawer?${q}`,
    ) as Promise<BoardingDrawerResponse>;
  },

  postDailyLog(
    reservationId: string,
    payload: {
      clinic_id: string;
      log_date: string;
      fed?: unknown;
      medication?: unknown;
      walks?: unknown;
      mood?: string | null;
      notes?: string | null;
    },
  ) {
    return apiRequest(`${boardingBase}/reservations/${encodeURIComponent(reservationId)}/daily-logs`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ log: BoardingDailyLog }>;
  },

  getUnitSettings(clinicId: string, unitId?: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (unitId) q.set('unit_id', unitId);
    return apiRequest(`${boardingBase}/unit-settings?${q}`) as Promise<{
      settings: BoardingUnitSettings[];
    }>;
  },

  patchUnitSettings(payload: {
    clinic_id: string;
    unit_id: string;
    hotel_slots?: number | null;
    daycare_slots_per_shift?: number | null;
    checkout_cutoff_time?: string | null;
  }) {
    return apiRequest(`${boardingBase}/unit-settings`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ settings: BoardingUnitSettings }>;
  },

  getOccupancy(clinicId: string, opts?: { unitId?: string; dateYmd?: string; mode?: BoardingMode }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.unitId) q.set('unit_id', opts.unitId);
    if (opts?.dateYmd) q.set('date', opts.dateYmd);
    if (opts?.mode && opts.mode !== 'all') q.set('mode', opts.mode);
    return apiRequest(`${boardingBase}/occupancy?${q}`) as Promise<BoardingOccupancyResponse>;
  },

  getCalendar(clinicId: string, from: string, to: string, opts?: { unitId?: string; mode?: BoardingMode }) {
    const q = new URLSearchParams({ clinic_id: clinicId, from, to });
    if (opts?.unitId) q.set('unit_id', opts.unitId);
    if (opts?.mode && opts.mode !== 'all') q.set('mode', opts.mode);
    return apiRequest(`${boardingBase}/calendar?${q}`) as Promise<BoardingCalendarResponse>;
  },
};

// ─── Tipos adicionais ────────────────────────────────────────────────────────

export type BoardingUnitSettings = {
  unit_id: string;
  clinic_id: string;
  hotel_slots: number | null;
  daycare_slots_per_shift: number | null;
  checkout_cutoff_time: string | null;
  updated_at: string;
};

export type BoardingOccupancySlot = {
  current: number;
  max: number | null;
  over_capacity: boolean;
};

export type BoardingOccupancyResponse = {
  hotel: BoardingOccupancySlot;
  daycare: BoardingOccupancySlot;
};

export type BoardingCalendarEvent = {
  id: string;
  mode: BoardingMode | string;
  status: BoardingStage | string;
  expected_check_in: string;
  expected_check_out: string;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  pet?: { id: string; name: string; size_tier?: string | null } | null;
  guardian?: { id: string; full_name: string; phone?: string | null } | null;
};

export type BoardingCalendarResponse = {
  events: BoardingCalendarEvent[];
};
