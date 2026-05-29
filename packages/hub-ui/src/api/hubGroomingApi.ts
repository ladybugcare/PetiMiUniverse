import { apiRequest } from '@petimi/web-core';
import type { GroomingStage } from '../pages/grooming/groomingStages';

const groomingBase = '/api/hub/grooming';

export type GroomingClinicalTag = { key: string; label: string };

export type GroomingDayBoardPet = {
  id: string;
  name: string;
  species?: string;
  breed?: string | null;
  size_tier?: string;
  birth_date?: string | null;
  coat_type?: string | null;
  notes?: string | null;
  /** URL pública (migration `alter_hub_pets_avatar_url.sql`). */
  avatar_url?: string | null;
  /** `true` se o pet nunca teve sessão de B&T encerrada nesta clínica. */
  is_first_grooming_visit?: boolean;
};

export type GroomingServiceMix = 'banho_only' | 'with_tosa' | 'unknown';

export type GroomingDayBoardItem = {
  kind: 'session' | 'appointment_slot';
  session_id?: string | null;
  appointment_id?: string | null;
  grooming_stage: GroomingStage | string;
  priority?: number;
  is_walk_in?: boolean;
  starts_at: string;
  ends_at: string;
  appointment_status?: string | null;
  appointment_kind?: string;
  title?: string | null;
  notes?: string | null;
  description?: string | null;
  operational_notes?: string | null;
  service_type?: { id: string; name: string; service_group?: string } | null;
  services?: Array<{
    id?: string;
    hub_service_type_id: string;
    name: string;
    duration_minutes: number | null;
    executed_at?: string | null;
  }>;
  estimated_duration_minutes?: number | null;
  /** Classificação heurística para filtros (ex.: «só banho»). */
  grooming_service_mix?: GroomingServiceMix;
  /** Pausa operacional (`alter_hub_grooming_sessions_paused_at.sql`); não altera `grooming_stage`. */
  paused_at?: string | null;
  is_late?: boolean;
  pet?: GroomingDayBoardPet | null;
  guardian?: { id: string; full_name: string; phone?: string | null } | null;
  staff_member?: { id: string; full_name: string } | null;
  pet_id?: string | null;
  guardian_id?: string | null;
  hub_staff_member_id?: string | null;
  clinical_tags?: GroomingClinicalTag[];
};

export type GroomingDayBoardResponse = {
  items: GroomingDayBoardItem[];
  date: string;
  grooming_types_configured?: boolean;
};

export type GroomingSession = {
  id: string;
  clinic_id: string;
  grooming_stage: GroomingStage;
  hub_appointment_id?: string | null;
  pet_id: string;
  priority?: number;
  operational_notes?: string | null;
  checklist?: Record<string, { done: boolean }>;
  paused_at?: string | null;
};

export type GroomingSessionEvent = {
  id: string;
  event_type: string;
  title: string;
  body?: string | null;
  created_at: string;
};

export type GroomingDrawerChecklistRow = { key: string; label: string; done: boolean };

export type GroomingDrawerAppointmentLine = {
  id: string;
  hub_service_type_id: string;
  name: string;
  duration_minutes: number | null;
  executed_at: string | null;
  sale_amount_applied: number | null;
};

export type GroomingDrawerExtra = {
  id: string;
  hub_service_type_id: string;
  name_snapshot: string;
  sale_amount_snapshot: number | null;
  created_at: string;
};

export type GroomingDrawerAddonOption = {
  id: string;
  name: string;
  sale_amount: number | null;
};

export type GroomingSessionDrawerResponse = {
  session: GroomingSession & Record<string, unknown>;
  pet: GroomingDayBoardPet | null;
  checklist_template: Array<{ key: string; label: string; default_checked?: boolean }>;
  checklist: GroomingDrawerChecklistRow[];
  clinical_tags: GroomingClinicalTag[];
  last_grooming_closed_at: string | null;
  appointment_lines: GroomingDrawerAppointmentLine[];
  extras: GroomingDrawerExtra[];
  available_addons: GroomingDrawerAddonOption[];
};

export const hubGroomingApi = {
  dayBoard(
    clinicId: string,
    range: { dateYmd: string; from: string; to: string },
    opts?: { staffId?: string; unitId?: string },
  ) {
    const q = new URLSearchParams({
      clinic_id: clinicId,
      date: range.dateYmd,
      from: range.from,
      to: range.to,
    });
    if (opts?.unitId) q.set('unit_id', opts.unitId);
    if (opts?.staffId) q.set('hub_staff_member_id', opts.staffId);
    return apiRequest(`${groomingBase}/day-board?${q}`) as Promise<GroomingDayBoardResponse>;
  },

  sessionDrawer(sessionId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(
      `${groomingBase}/sessions/${encodeURIComponent(sessionId)}/drawer?${q}`,
    ) as Promise<GroomingSessionDrawerResponse>;
  },

  openFromAppointment(clinicId: string, hubAppointmentId: string, groomingStage?: GroomingStage) {
    return apiRequest(`${groomingBase}/sessions/open-from-appointment`, {
      method: 'POST',
      body: JSON.stringify({
        clinic_id: clinicId,
        hub_appointment_id: hubAppointmentId,
        ...(groomingStage ? { grooming_stage: groomingStage } : {}),
      }),
    }) as Promise<{ session: GroomingSession; created: boolean }>;
  },

  createSession(payload: {
    clinic_id: string;
    pet_id: string;
    hub_staff_member_id: string;
    guardian_id?: string | null;
    unit_id?: string | null;
    operational_notes?: string | null;
  }) {
    return apiRequest(`${groomingBase}/sessions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ session: GroomingSession }>;
  },

  patchSession(
    id: string,
    payload: {
      clinic_id: string;
      grooming_stage?: GroomingStage;
      /** Pausa (`true`) ou retoma (`false`); só em `in_service` / `finishing`. Não combinar com `grooming_stage` no mesmo pedido. */
      paused?: boolean;
      hub_staff_member_id?: string | null;
      priority?: number;
      operational_notes?: string | null;
      checklist?: Record<string, { done: boolean }>;
    },
  ) {
    return apiRequest(`${groomingBase}/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ session: GroomingSession }>;
  },

  advanceSession(id: string, clinicId: string) {
    return apiRequest(`${groomingBase}/sessions/${encodeURIComponent(id)}/advance`, {
      method: 'POST',
      body: JSON.stringify({ clinic_id: clinicId }),
    }) as Promise<{ session: GroomingSession }>;
  },

  patchAppointmentServiceLine(
    lineId: string,
    payload: { clinic_id: string; executed: boolean; executed_by_staff_id?: string | null },
  ) {
    return apiRequest(`${groomingBase}/appointment-service-lines/${encodeURIComponent(lineId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ line: { id: string; executed_at: string | null } }>;
  },

  /** Produto: «Adicionais». Rota mantém `/extras` por compatibilidade. */
  postSessionExtra(
    sessionId: string,
    payload: { clinic_id: string; hub_service_type_id: string; created_by_staff_id?: string | null },
  ) {
    return apiRequest(`${groomingBase}/sessions/${encodeURIComponent(sessionId)}/extras`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ extra: GroomingDrawerExtra }>;
  },

  listEvents(sessionId: string, clinicId: string) {
    return apiRequest(
      `${groomingBase}/sessions/${encodeURIComponent(sessionId)}/events?clinic_id=${encodeURIComponent(clinicId)}`,
    ) as Promise<{ events: GroomingSessionEvent[] }>;
  },

  addNote(sessionId: string, clinicId: string, body: string) {
    return apiRequest(`${groomingBase}/sessions/${encodeURIComponent(sessionId)}/events`, {
      method: 'POST',
      body: JSON.stringify({
        clinic_id: clinicId,
        event_type: 'note',
        body,
      }),
    }) as Promise<{ event: GroomingSessionEvent }>;
  },
};
