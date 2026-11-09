import { apiRequest } from '@petimi/web-core';
import type { BoardingMode, BoardingStage } from '../pages/boarding/boardingStages';
import { hubComandaApi } from './hubComandaApi';

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
  unit_id?: string | null;
  hub_service_type_id?: string | null;
  daycare_period?: BoardingDaycarePeriod | null;
  daycare_shift_key?: string | null;
  rate_source?: 'appointment' | 'service_type' | 'manual' | null;
  space_id?: string | null;
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
  care_profile?: BoardingCareProfile | null;
  care_plan?: BoardingCarePlan | null;
  plan_pendencies?: BoardingPlanPendency[];
  attention?: BoardingAttentionReason[];
  tasks?: BoardingTask[];
  incidents?: BoardingIncident[];
  belongings?: BoardingBelonging[];
  extras?: BoardingExtra[];
  media?: BoardingMedia[];
  tutor_reports?: BoardingTutorReport[];
  space?: { id: string; name: string; kind?: string; mode?: string; capacity?: number } | null;
  service_type?: { id: string; name: string } | null;
  unit_settings?: BoardingUnitSettings;
  pricing?: BoardingPricing;
  migrations_ready?: boolean;
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

  openFromAppointment(clinicId: string, hubAppointmentId: string, opts?: { forceCapacity?: boolean }) {
    return apiRequest(`${boardingBase}/reservations/open-from-appointment`, {
      method: 'POST',
      body: JSON.stringify({
        clinic_id: clinicId,
        hub_appointment_id: hubAppointmentId,
        ...(opts?.forceCapacity ? { force_capacity: true } : {}),
      }),
    }) as Promise<{ reservation: BoardingReservation; created: boolean }>;
  },

  createReservation(payload: {
    clinic_id: string;
    pet_id: string;
    guardian_id?: string | null;
    unit_id?: string | null;
    mode: BoardingMode;
    status?: 'reserved' | 'checked_in';
    expected_check_in?: string | null;
    expected_check_out?: string | null;
    daily_rate_cents?: number | null;
    notes?: string | null;
    hub_service_type_id?: string | null;
    daycare_period?: BoardingDaycarePeriod | null;
    daycare_shift_key?: string | null;
    space_id?: string | null;
    force_capacity?: boolean;
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
      daily_rate_cents?: number | null;
      hub_service_type_id?: string | null;
      daycare_period?: BoardingDaycarePeriod | null;
      daycare_shift_key?: string | null;
      space_id?: string | null;
      reprice?: boolean;
      force_capacity?: boolean;
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

  /**
   * Abre/obtém a comanda da reserva e aplica (ou remove) saldo de pacote na linha de hospedagem.
   * Reutiliza o fluxo do Caixa (`comandas/apply-package`).
   */
  async applyPackageOnStay(
    reservationId: string,
    payload: { clinic_id: string; package_balance_id: string | null },
  ): Promise<{ comanda_id: string; item_id: string; line_total: number }> {
    const detail = await hubComandaApi.openComanda({
      clinic_id: payload.clinic_id,
      origin_type: 'boarding_reservation',
      origin_id: reservationId,
    });
    const comandaId = String((detail.comanda as { id?: string })?.id ?? '');
    const item = (detail.items ?? []).find((it) => it.origin_type === 'boarding_reservation' && it.origin_id === reservationId);
    if (!comandaId || !item?.id) {
      throw new Error('Não foi possível localizar a linha de hospedagem na comanda.');
    }
    const updated = await hubComandaApi.applyPackage(comandaId, {
      clinic_id: payload.clinic_id,
      item_id: item.id,
      package_balance_id: payload.package_balance_id,
      edit_context: 'caixa',
    });
    const line = (updated.items ?? []).find((it) => it.id === item.id);
    return {
      comanda_id: comandaId,
      item_id: item.id,
      line_total: Number(line?.line_total ?? 0),
    };
  },

  /**
   * @deprecated Escrita descontinuada (API retorna 410). Use `executeTask` / rotina operacional.
   * Mantido só para clientes antigos descobrirem o erro.
   */
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
    daycare_shifts?: BoardingDaycareShift[];
    recreation_windows?: BoardingRecreationWindow[];
    recreation_capacity?: number | null;
    overbooking_policy?: BoardingOverbookingPolicy;
    meal_slot_times?: BoardingMealSlotTimes;
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

  // ─── Painel operacional ────────────────────────────────────────────────

  opsBoard(clinicId: string, opts?: { unitId?: string; dateYmd?: string }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.unitId) q.set('unit_id', opts.unitId);
    if (opts?.dateYmd) q.set('date', opts.dateYmd);
    return apiRequest(`${boardingBase}/ops-board?${q}`) as Promise<BoardingOpsBoardResponse>;
  },

  timeline(reservationId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${rsvPath(reservationId)}/timeline?${q}`) as Promise<{ timeline: BoardingTimelineEntry[] }>;
  },

  // ─── Ficha e plano de cuidados ─────────────────────────────────────────

  getCareProfile(petId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${boardingBase}/pets/${encodeURIComponent(petId)}/care-profile?${q}`) as Promise<{
      profile: BoardingCareProfile | null;
      recent_stays: Array<{ id: string; mode: string; status: string; checked_in_at?: string | null; checked_out_at?: string | null; expected_check_in?: string | null }>;
    }>;
  },

  putCareProfile(
    petId: string,
    payload: { clinic_id: string } & Partial<BoardingCareProfileBlocks> & { notes?: string | null },
  ) {
    return apiRequest(`${boardingBase}/pets/${encodeURIComponent(petId)}/care-profile`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }) as Promise<{ profile: BoardingCareProfile; plans_updated: number }>;
  },

  getCarePlan(reservationId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${rsvPath(reservationId)}/care-plan?${q}`) as Promise<BoardingCarePlanResponse>;
  },

  putCarePlan(
    reservationId: string,
    payload: { clinic_id: string } & Partial<BoardingCarePlanBlocks> & {
      instructions?: string | null;
      confirm_blocks?: BoardingCareBlockKey[];
      save_to_profile?: Exclude<BoardingCareBlockKey, 'recreation'>[];
      tutor_submission_reviewed?: boolean;
    },
  ) {
    return apiRequest(`${rsvPath(reservationId)}/care-plan`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }) as Promise<BoardingCarePlanResponse & { tasks_sync?: unknown }>;
  },

  tutorLink(reservationId: string, clinicId: string, opts?: { regenerate?: boolean }) {
    return apiRequest(`${rsvPath(reservationId)}/care-plan/tutor-link`, {
      method: 'POST',
      body: JSON.stringify({ clinic_id: clinicId, ...(opts?.regenerate ? { regenerate: true } : {}) }),
    }) as Promise<{ care_plan: BoardingCarePlan }>;
  },

  // ─── Tarefas ───────────────────────────────────────────────────────────

  tasks(clinicId: string, opts: { dateYmd?: string; unitId?: string; reservationId?: string }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts.dateYmd) q.set('date', opts.dateYmd);
    if (opts.unitId) q.set('unit_id', opts.unitId);
    if (opts.reservationId) q.set('reservation_id', opts.reservationId);
    return apiRequest(`${boardingBase}/tasks?${q}`) as Promise<{ tasks: BoardingTask[]; migrations_ready?: boolean }>;
  },

  createTask(
    reservationId: string,
    payload: { clinic_id: string; kind: BoardingTaskKind; title: string; scheduled_for?: string | null; notes?: string | null },
  ) {
    return apiRequest(`${rsvPath(reservationId)}/tasks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ task: BoardingTask }>;
  },

  executeTask(
    taskId: string,
    payload: { clinic_id: string; outcome?: BoardingTaskOutcome; skip?: boolean; undo?: boolean; notes?: string | null },
  ) {
    return apiRequest(`${boardingBase}/tasks/${encodeURIComponent(taskId)}/execute`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ task: BoardingTask }>;
  },

  batchActivity(payload: {
    clinic_id: string;
    reservation_ids: string[];
    kind: 'recreation' | 'walk' | 'custom';
    title?: string | null;
    outcome?: 'done' | 'not_done';
    notes?: string | null;
  }) {
    return apiRequest(`${boardingBase}/tasks/batch-activity`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{
      done: Array<{ reservation_id: string; task_id: string }>;
      skipped: Array<{ reservation_id: string; pet_name?: string | null; reason: string }>;
      batch_id: string;
    }>;
  },

  // ─── Intercorrências ───────────────────────────────────────────────────

  listIncidents(reservationId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${rsvPath(reservationId)}/incidents?${q}`) as Promise<{
      incidents: BoardingIncident[];
      migrations_ready?: boolean;
    }>;
  },

  createIncident(
    reservationId: string,
    payload: {
      clinic_id: string;
      kind: BoardingIncidentKind;
      severity: BoardingSeverity;
      description: string;
      action_taken?: string | null;
      tutor_notified?: boolean;
    },
  ) {
    return apiRequest(`${rsvPath(reservationId)}/incidents`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ incident: BoardingIncident }>;
  },

  patchIncident(
    incidentId: string,
    payload: {
      clinic_id: string;
      status?: 'open' | 'resolved';
      resolution_notes?: string | null;
      tutor_notified?: boolean;
      severity?: BoardingSeverity;
    },
  ) {
    return apiRequest(`${boardingBase}/incidents/${encodeURIComponent(incidentId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ incident: BoardingIncident }>;
  },

  // ─── Pertences ─────────────────────────────────────────────────────────

  listBelongings(reservationId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${rsvPath(reservationId)}/belongings?${q}`) as Promise<{
      belongings: BoardingBelonging[];
      migrations_ready?: boolean;
    }>;
  },

  createBelonging(
    reservationId: string,
    payload: { clinic_id: string; category: BoardingBelongingCategory; description: string; quantity?: number; notes?: string | null },
  ) {
    return apiRequest(`${rsvPath(reservationId)}/belongings`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ belonging: BoardingBelonging }>;
  },

  patchBelonging(
    belongingId: string,
    payload: { clinic_id: string; checkout_status?: BoardingBelongingCheckout; quantity?: number; notes?: string | null },
  ) {
    return apiRequest(`${boardingBase}/belongings/${encodeURIComponent(belongingId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ belonging: BoardingBelonging }>;
  },

  deleteBelonging(belongingId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${boardingBase}/belongings/${encodeURIComponent(belongingId)}?${q}`, {
      method: 'DELETE',
    }) as Promise<{ ok: boolean }>;
  },

  // ─── Adicionais ────────────────────────────────────────────────────────

  listExtras(reservationId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${rsvPath(reservationId)}/extras?${q}`) as Promise<{
      extras: BoardingExtra[];
      migrations_ready?: boolean;
    }>;
  },

  createExtra(
    reservationId: string,
    payload: {
      clinic_id: string;
      hub_service_type_id?: string | null;
      description?: string;
      quantity?: number;
      unit_amount_cents?: number;
      service_date?: string | null;
    },
  ) {
    return apiRequest(`${rsvPath(reservationId)}/extras`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ extra: BoardingExtra }>;
  },

  deleteExtra(extraId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${boardingBase}/extras/${encodeURIComponent(extraId)}?${q}`, {
      method: 'DELETE',
    }) as Promise<{ ok: boolean }>;
  },

  // ─── Fotos ─────────────────────────────────────────────────────────────

  listMedia(reservationId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${rsvPath(reservationId)}/media?${q}`) as Promise<{
      media: BoardingMedia[];
      migrations_ready?: boolean;
    }>;
  },

  uploadMedia(params: {
    clinicId: string;
    reservationId: string;
    file: File;
    caption?: string;
    taskId?: string | null;
    incidentId?: string | null;
  }) {
    const fd = new FormData();
    fd.append('file', params.file);
    fd.append('clinic_id', params.clinicId);
    if (params.caption) fd.append('caption', params.caption);
    if (params.taskId) fd.append('task_id', params.taskId);
    if (params.incidentId) fd.append('incident_id', params.incidentId);
    // multipart ainda não foi parseado no requirePermission — clinic_id precisa ir na query.
    const q = new URLSearchParams({ clinic_id: params.clinicId });
    return apiRequest(`${rsvPath(params.reservationId)}/media?${q}`, { method: 'POST', body: fd }) as Promise<{
      media: BoardingMedia;
    }>;
  },

  deleteMedia(mediaId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${boardingBase}/media/${encodeURIComponent(mediaId)}?${q}`, {
      method: 'DELETE',
    }) as Promise<{ ok: boolean }>;
  },

  // ─── Acomodações ───────────────────────────────────────────────────────

  spaces(clinicId: string, opts?: { unitId?: string; includeInactive?: boolean }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.unitId) q.set('unit_id', opts.unitId);
    if (opts?.includeInactive) q.set('include_inactive', 'true');
    return apiRequest(`${boardingBase}/spaces?${q}`) as Promise<{ spaces: BoardingSpace[]; migrations_ready?: boolean }>;
  },

  createSpace(payload: {
    clinic_id: string;
    unit_id?: string | null;
    name: string;
    kind: BoardingSpaceKind;
    mode: BoardingSpaceMode;
    capacity: number;
    notes?: string | null;
  }) {
    return apiRequest(`${boardingBase}/spaces`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ space: BoardingSpace }>;
  },

  patchSpace(
    spaceId: string,
    payload: {
      clinic_id: string;
      name?: string;
      kind?: BoardingSpaceKind;
      mode?: BoardingSpaceMode;
      capacity?: number;
      notes?: string | null;
      active?: boolean;
    },
  ) {
    return apiRequest(`${boardingBase}/spaces/${encodeURIComponent(spaceId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ space: BoardingSpace }>;
  },

  deleteSpace(spaceId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${boardingBase}/spaces/${encodeURIComponent(spaceId)}?${q}`, {
      method: 'DELETE',
    }) as Promise<{ ok: boolean }>;
  },

  // ─── Passagem de turno ─────────────────────────────────────────────────

  handoffs(clinicId: string, opts?: { unitId?: string; limit?: number }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.unitId) q.set('unit_id', opts.unitId);
    if (opts?.limit) q.set('limit', String(opts.limit));
    return apiRequest(`${boardingBase}/handoffs?${q}`) as Promise<{ handoffs: BoardingHandoff[]; migrations_ready?: boolean }>;
  },

  createHandoff(payload: { clinic_id: string; unit_id?: string | null; shift_label?: string | null; notes?: string | null }) {
    return apiRequest(`${boardingBase}/handoffs`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ handoff: BoardingHandoff }>;
  },

  acknowledgeHandoff(handoffId: string, clinicId: string) {
    return apiRequest(`${boardingBase}/handoffs/${encodeURIComponent(handoffId)}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ clinic_id: clinicId }),
    }) as Promise<{ handoff: BoardingHandoff }>;
  },

  // ─── Relatório ao tutor ────────────────────────────────────────────────

  tutorReportPreview(reservationId: string, clinicId: string, opts: { kind: BoardingTutorReportKind; dateYmd?: string }) {
    const q = new URLSearchParams({ clinic_id: clinicId, kind: opts.kind });
    if (opts.dateYmd) q.set('date', opts.dateYmd);
    return apiRequest(`${rsvPath(reservationId)}/tutor-report?${q}`) as Promise<{
      body: string;
      kind: BoardingTutorReportKind;
      report_date: string;
      guardian_phone: string | null;
      photos_count: number;
    }>;
  },

  recordTutorReport(
    reservationId: string,
    payload: {
      clinic_id: string;
      kind: BoardingTutorReportKind;
      report_date?: string | null;
      body: string;
      channel: 'whatsapp' | 'copy';
    },
  ) {
    return apiRequest(`${rsvPath(reservationId)}/tutor-reports`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ report: BoardingTutorReport }>;
  },
};

function rsvPath(reservationId: string): string {
  return `${boardingBase}/reservations/${encodeURIComponent(reservationId)}`;
}

// ─── Tipos adicionais ────────────────────────────────────────────────────────

export type BoardingDaycarePeriod = 'full_day' | 'half_day';
export type BoardingOverbookingPolicy = 'warn' | 'block';
export type BoardingDaycareShift = { key: string; label: string; start: string; end: string };
export type BoardingRecreationWindow = { start: string; end?: string | null; label?: string | null };
export type BoardingMealSlotTimes = Partial<Record<BoardingCareMealSlot, string>>;

export type BoardingUnitSettings = {
  unit_id: string | null;
  clinic_id?: string;
  hotel_slots: number | null;
  daycare_slots_per_shift: number | null;
  checkout_cutoff_time: string | null;
  daycare_shifts?: BoardingDaycareShift[] | null;
  recreation_windows?: BoardingRecreationWindow[] | null;
  recreation_capacity?: number | null;
  overbooking_policy?: BoardingOverbookingPolicy | null;
  meal_slot_times?: BoardingMealSlotTimes | null;
  updated_at?: string;
};

// ─── Cuidados ────────────────────────────────────────────────────────────────

export type BoardingCareMealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export type BoardingCareMeal = {
  slot: BoardingCareMealSlot;
  amount?: string | null;
  notes?: string | null;
  /** @deprecated legado HH:mm — normalizado no backend para `slot`. */
  time?: string;
};
export type BoardingCareFeeding = {
  food_source?: 'own' | 'house' | null;
  food_name?: string | null;
  meals?: BoardingCareMeal[];
  restrictions?: string | null;
  /** false = não come no estabelecimento (já vem alimentado). */
  feeds_on_site?: boolean | null;
};
export type BoardingCareMedication = {
  name: string;
  dose?: string | null;
  times?: string[];
  instructions?: string | null;
};
export type BoardingCareWalks = { times?: string[]; notes?: string | null };
export type BoardingSociability = 'sociable' | 'selective' | 'isolated';
export type BoardingCareHandling = {
  sociability?: BoardingSociability | null;
  group_play_allowed?: boolean | null;
  contact_restrictions?: string | null;
  special_care?: string | null;
};
export type BoardingCareRecreation = { allowed?: boolean | null; times?: string[] };

export type BoardingCareProfileBlocks = {
  feeding: BoardingCareFeeding | null;
  medications: BoardingCareMedication[] | null;
  walks: BoardingCareWalks | null;
  handling: BoardingCareHandling | null;
};
export type BoardingCarePlanBlocks = BoardingCareProfileBlocks & { recreation: BoardingCareRecreation | null };

export type BoardingCareBlockKey = 'feeding' | 'medications' | 'walks' | 'handling' | 'recreation';
export type BoardingBlockStatus = 'inherited' | 'confirmed' | 'overridden' | 'pending';

export type BoardingCareProfile = BoardingCareProfileBlocks & {
  notes?: string | null;
  updated_at?: string | null;
};

export type BoardingCarePlan = BoardingCarePlanBlocks & {
  id: string;
  instructions?: string | null;
  block_status: Partial<Record<BoardingCareBlockKey, BoardingBlockStatus>>;
  confirmed_at?: string | null;
  tasks_generated_at?: string | null;
  tutor_link?: { token: string; expires_at: string | null; path: string } | null;
  tutor_submission?: (Partial<BoardingCareProfileBlocks> & { notes?: string | null; contact_name?: string | null }) | null;
  tutor_submitted_at?: string | null;
  tutor_submission_reviewed_at?: string | null;
  updated_at?: string | null;
};

export type BoardingPlanPendency = { block: BoardingCareBlockKey; kind: 'missing' | 'unconfirmed'; label: string };

export type BoardingCarePlanResponse = {
  care_plan: BoardingCarePlan | null;
  care_profile: BoardingCareProfile | null;
  plan_pendencies: BoardingPlanPendency[];
};

export type BoardingAttentionReason = { key: string; label: string; severity: BoardingSeverity };

// ─── Tarefas ─────────────────────────────────────────────────────────────────

export type BoardingTaskKind = 'feeding' | 'medication' | 'walk' | 'recreation' | 'custom';
export type BoardingTaskOutcome = 'ate_all' | 'ate_partial' | 'refused' | 'given' | 'not_given' | 'done' | 'not_done';

export type BoardingTask = {
  id: string;
  hub_boarding_reservation_id: string;
  kind: BoardingTaskKind;
  source?: 'plan' | 'manual' | 'batch';
  title: string;
  details?: string | null;
  scheduled_for: string | null;
  task_date: string;
  plan_key?: string | null;
  status: 'pending' | 'done' | 'skipped';
  outcome?: BoardingTaskOutcome | null;
  last_notes?: string | null;
  executed_at?: string | null;
  executed_by_user_id?: string | null;
  overdue?: boolean;
  /** Presentes no painel do dia. */
  pet_name?: string;
  mode?: string | null;
  can_group_play?: boolean;
  space_name?: string | null;
};

// ─── Registros ───────────────────────────────────────────────────────────────

export type BoardingSeverity = 'low' | 'medium' | 'high';
export type BoardingIncidentKind =
  | 'health'
  | 'injury'
  | 'behavior'
  | 'feeding'
  | 'elimination'
  | 'escape'
  | 'property'
  | 'other';

export type BoardingIncident = {
  id: string;
  hub_boarding_reservation_id: string;
  kind: BoardingIncidentKind;
  severity: BoardingSeverity;
  status: 'open' | 'resolved';
  description: string;
  action_taken?: string | null;
  occurred_at: string;
  tutor_notified_at?: string | null;
  resolution_notes?: string | null;
  resolved_at?: string | null;
};

export type BoardingBelongingCategory = 'food' | 'medication' | 'bed' | 'toy' | 'leash_collar' | 'clothing' | 'bowl' | 'other';
export type BoardingBelongingCheckout = 'pending' | 'returned' | 'missing' | 'consumed';

export type BoardingBelonging = {
  id: string;
  category: BoardingBelongingCategory;
  description: string;
  quantity: number;
  notes?: string | null;
  checkout_status: BoardingBelongingCheckout;
};

export type BoardingExtra = {
  id: string;
  hub_service_type_id?: string | null;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  service_date?: string | null;
  created_at?: string;
};

export type BoardingMedia = {
  id: string;
  url: string;
  mime_type?: string | null;
  caption?: string | null;
  task_id?: string | null;
  incident_id?: string | null;
  created_at: string;
};

export type BoardingTutorReportKind = 'daily' | 'stay_summary' | 'pickup';

export type BoardingTutorReport = {
  id: string;
  kind: BoardingTutorReportKind;
  report_date?: string | null;
  body: string;
  channel: 'whatsapp' | 'copy';
  sent_at: string;
};

export type BoardingPricing = {
  daily_rate_cents: number | null;
  rate_source: string | null;
  cutoff_time: string | null;
  quantity: number;
  /** Valores em reais. */
  base: number;
  extras: number;
  total: number;
};

export type BoardingTimelineEntry = {
  id: string;
  at: string;
  type: 'reservation' | 'task' | 'incident' | 'incident_resolved' | 'photo' | 'tutor_report' | 'belonging' | 'legacy_log';
  title: string;
  detail?: string | null;
  severity?: string | null;
  photo_url?: string | null;
  actor_name?: string | null;
};

// ─── Acomodações ─────────────────────────────────────────────────────────────

export type BoardingSpaceKind = 'kennel' | 'suite' | 'room' | 'yard' | 'other';
export type BoardingSpaceMode = 'hotel' | 'daycare' | 'shared';

export type BoardingSpace = {
  id: string;
  unit_id?: string | null;
  name: string;
  kind: BoardingSpaceKind;
  mode: BoardingSpaceMode;
  capacity: number;
  notes?: string | null;
  active: boolean;
  sort_order?: number | null;
  current?: number;
};

// ─── Passagem de turno ───────────────────────────────────────────────────────

export type BoardingHandoffSnapshot = {
  generated_at: string;
  present_count: number;
  attention: Array<{ pet_name: string; reasons: string[] }>;
  pending_tasks: Array<{ pet_name: string; title: string; scheduled_for: string | null; overdue: boolean }>;
  open_incidents: Array<{ pet_name: string; description: string; severity: string }>;
};

export type BoardingHandoff = {
  id: string;
  unit_id?: string | null;
  shift_label?: string | null;
  snapshot: BoardingHandoffSnapshot | null;
  notes?: string | null;
  created_at: string;
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  acknowledged_at?: string | null;
  acknowledged_by_name?: string | null;
};

// ─── Painel do dia ───────────────────────────────────────────────────────────

export type BoardingOpsStay = {
  key: string;
  reservation_id: string | null;
  appointment_id?: string | null;
  kind: 'reservation' | 'appointment_slot';
  stage: BoardingStage | string;
  mode: 'hotel' | 'daycare' | string;
  is_walk_in: boolean;
  pet_id?: string | null;
  guardian_id?: string | null;
  pet: BoardingDayBoardPet | null;
  guardian: { id: string; full_name: string; phone?: string | null } | null;
  clinical_tags: BoardingClinicalTag[];
  starts_at: string;
  ends_at: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  nights_count: number;
  is_late: boolean;
  is_arrival: boolean;
  is_departure: boolean;
  handling: BoardingCareHandling | null;
  can_group_play: boolean;
  plan_pendencies: BoardingPlanPendency[];
  attention: BoardingAttentionReason[];
  tasks_summary: { total: number; done: number; pending: number; overdue: number };
  next_task: { id: string; title: string; kind: BoardingTaskKind; scheduled_for: string | null } | null;
  open_incidents: Array<{ id: string; kind: BoardingIncidentKind; severity: BoardingSeverity; description: string; occurred_at: string }>;
  belongings_count: number;
  space: { id: string; name: string } | null;
  daycare_shift: { key: string; label: string } | null;
  daycare_period: BoardingDaycarePeriod | null;
  daily_rate_cents: number | null;
  notes: string | null;
};

export type BoardingOpsBoardResponse = {
  date: string;
  generated_at: string;
  boarding_types_configured: boolean;
  reservations_table_exists: boolean;
  migrations_ready: boolean;
  stays: BoardingOpsStay[];
  tasks: BoardingTask[];
  counts: {
    present: number;
    arrivals: number;
    departures: number;
    departed: number;
    attention: number;
    hotel: number;
    daycare: number;
    tasks_pending: number;
    tasks_overdue: number;
  };
  occupancy: {
    hotel: { current: number; max: number | null };
    daycare: { current: number; max: number | null };
    spaces: Array<{ id: string; name: string; kind: BoardingSpaceKind; mode: BoardingSpaceMode; capacity: number; current: number; pets: string[] }>;
  };
  settings: BoardingUnitSettings;
  last_handoff: BoardingHandoff | null;
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
