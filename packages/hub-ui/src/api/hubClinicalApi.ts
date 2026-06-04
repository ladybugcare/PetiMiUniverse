import { apiRequest } from '@petimi/web-core';

const encBase = '/api/hub/encounters';
const clinicalBase = '/api/hub/clinical';

export type HubClinicalCaseStatus = 'active' | 'monitoring' | 'resolved' | 'cancelled';

export type HubClinicalCase = {
  id: string;
  clinic_id: string;
  unit_id: string | null;
  pet_id: string;
  guardian_id_snapshot: string | null;
  primary_veterinarian_id: string | null;
  title: string;
  summary: string | null;
  status: HubClinicalCaseStatus;
  tags: string[];
  metadata: Record<string, unknown>;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  pet?: { id: string; name: string; species?: string; breed?: string | null; birth_date?: string | null } | null;
  primary_veterinarian?: { id: string; full_name: string } | null;
  guardian_snapshot?: { id: string; full_name: string } | null;
};

export type HubEncounterStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled';
export type HubEncounterType = 'consultation' | 'return' | 'emergency' | 'procedure';

export type HubEncounterPet = {
  id: string;
  name: string;
  species?: string;
  breed?: string | null;
  size_tier?: string;
  birth_date?: string | null;
  coat_type?: string | null;
};

export type HubEncounter = {
  id: string;
  clinic_id: string;
  unit_id: string | null;
  pet_id: string;
  guardian_id: string | null;
  hub_appointment_id: string | null;
  hub_staff_member_id: string | null;
  hub_case_id: string | null;
  encounter_type: HubEncounterType;
  status: HubEncounterStatus;
  chief_complaint: string | null;
  summary_notes: string | null;
  anamnesis: Record<string, unknown>;
  physical_exam: Record<string, unknown>;
  diagnosis: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  pet?: HubEncounterPet | null;
  guardian?: { id: string; full_name: string } | null;
  staff_member?: { id: string; full_name: string } | null;
  appointment?: Record<string, unknown> | null;
  service_type?: { id: string; name: string; service_group?: string } | null;
  case?: { id: string; title: string; status: HubClinicalCaseStatus; opened_at: string; closed_at: string | null } | null;
};

export type DayBoardItem = {
  kind: 'encounter' | 'appointment_slot';
  encounter_id?: string;
  appointment_id?: string;
  starts_at?: string;
  ends_at?: string;
  appointment_status?: string;
  title?: string | null;
  status?: HubEncounterStatus;
  pet?: HubEncounterPet | null;
  guardian?: { id: string; full_name: string } | null;
  staff_member?: { id: string; full_name: string } | null;
  service_type?: { id: string; name: string } | null;
  pet_id?: string | null;
  guardian_id?: string | null;
  hub_staff_member_id?: string | null;
} & Partial<HubEncounter>;

export type HubPetClinicalFlag = {
  id: string;
  flag_key: string;
  label: string;
  notes?: string | null;
};

export type HubEncounterEvent = {
  id: string;
  clinic_id: string;
  pet_id: string;
  hub_encounter_id?: string | null;
  event_type: string;
  title: string;
  body?: string | null;
  event_at: string;
  created_at?: string;
};

export type HubPrescriptionItem = {
  id?: string;
  medication_name: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  hub_inventory_item_id?: string | null;
};

export type HubPrescription = {
  id: string;
  clinic_id: string;
  pet_id: string;
  hub_encounter_id?: string | null;
  notes?: string | null;
  status?: string;
  prescribed_at?: string;
  items: HubPrescriptionItem[];
};

export type HubVaccination = {
  id: string;
  vaccine_name: string;
  batch_number?: string | null;
  administered_at: string;
  next_dose_at?: string | null;
  hub_encounter_id?: string | null;
};

export type HubClinicalAttachment = {
  id: string;
  file_name: string;
  storage_path: string;
  title?: string | null;
  mime_type?: string | null;
  uploaded_at?: string;
};

export type HubClinicalAlert = {
  type: string;
  message: string;
  pet_id: string;
  pet?: { name?: string } | null;
};

export type HubHospitalBed = {
  id: string;
  code: string;
  label?: string | null;
  status?: string;
};

export type HubHospitalization = {
  id: string;
  pet_id: string;
  status: string;
  admitted_at?: string;
  discharged_at?: string | null;
  hub_hospital_bed_id?: string | null;
  hub_pets?: { name: string } | null;
  hub_hospital_beds?: { code: string; label?: string | null } | null;
};

export type HubSurgeryStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type HubAnestheticRisk = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'E';

export type HubSurgery = {
  id: string;
  clinic_id: string;
  title: string;
  status: HubSurgeryStatus;
  scheduled_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  discharge_at?: string | null;
  pet_id: string;
  guardian_id?: string | null;
  hub_encounter_id?: string | null;
  hub_case_id?: string | null;
  hub_staff_member_id?: string | null;
  anesthetic_risk?: HubAnestheticRisk | null;
  pre_op?: Record<string, unknown>;
  procedure?: Record<string, unknown>;
  team?: Record<string, unknown>[];
  materials?: Record<string, unknown>[];
  post_op?: Record<string, unknown>;
  // Legacy text fields (backward compat)
  anesthesia_notes?: string | null;
  team_notes?: string | null;
  materials_notes?: string | null;
  post_op_notes?: string | null;
  hub_pets?: { name: string } | null;
  hub_guardians?: { full_name: string } | null;
};

export type HubHospitalizationEventKind = 'vital' | 'medication' | 'feeding' | 'fluid' | 'nursing' | 'note';

export type HubHospitalizationEvent = {
  id: string;
  hospitalization_id: string;
  kind: HubHospitalizationEventKind;
  recorded_at: string;
  payload: Record<string, unknown>;
  hub_staff_member_id?: string | null;
  created_at: string;
};

function getSelectedUnitId(): string | undefined {
  try {
    const id = localStorage.getItem('selected_unit_id');
    return id && id.trim() ? id : undefined;
  } catch {
    return undefined;
  }
}

export type DayBoardResponse = {
  items: DayBoardItem[];
  date: string;
  clinical_types_configured?: boolean;
};

export const hubEncountersApi = {
  dayBoard(
    clinicId: string,
    range: { dateYmd: string; from: string; to: string },
    opts?: { status?: string; staffId?: string; unitId?: string },
  ) {
    const q = new URLSearchParams({
      clinic_id: clinicId,
      date: range.dateYmd,
      from: range.from,
      to: range.to,
    });
    if (opts?.unitId) q.set('unit_id', opts.unitId);
    if (opts?.status) q.set('status', opts.status);
    if (opts?.staffId) q.set('hub_staff_member_id', opts.staffId);
    return apiRequest(`${encBase}/day-board?${q}`) as Promise<DayBoardResponse>;
  },
  get(id: string, clinicId: string) {
    return apiRequest(`${encBase}/${id}?clinic_id=${encodeURIComponent(clinicId)}`) as Promise<{
      encounter: HubEncounter;
    }>;
  },
  create(payload: Record<string, unknown>) {
    return apiRequest(encBase, { method: 'POST', body: JSON.stringify(payload) }) as Promise<{
      encounter: HubEncounter;
    }>;
  },
  openFromAppointment(clinicId: string, hubAppointmentId: string) {
    return apiRequest(`${encBase}/open-from-appointment`, {
      method: 'POST',
      body: JSON.stringify({ clinic_id: clinicId, hub_appointment_id: hubAppointmentId }),
    }) as Promise<{ encounter: HubEncounter; created: boolean }>;
  },
  patch(id: string, payload: Record<string, unknown>) {
    return apiRequest(`${encBase}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }) as Promise<{
      encounter: HubEncounter;
    }>;
  },
  complete(id: string, clinicId: string, changedBy?: string | null) {
    return apiRequest(`${encBase}/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ clinic_id: clinicId, changed_by: changedBy ?? undefined }),
    }) as Promise<{ encounter: HubEncounter }>;
  },
  amend(
    id: string,
    payload: {
      clinic_id: string;
      change_reason: string;
      changed_by?: string | null;
      chief_complaint?: string | null;
      summary_notes?: string | null;
      anamnesis?: Record<string, unknown>;
      physical_exam?: Record<string, unknown>;
      diagnosis?: Record<string, unknown>;
      hub_staff_member_id?: string | null;
    },
  ) {
    return apiRequest(`${encBase}/${id}/amend`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ encounter: HubEncounter }>;
  },
  getVersions(id: string, clinicId: string) {
    return apiRequest(
      `${encBase}/${id}/versions?clinic_id=${encodeURIComponent(clinicId)}`,
    ) as Promise<{
      versions: Array<{
        id: string;
        version_no: number;
        changed_by: string | null;
        change_reason: string | null;
        created_at: string;
        changed_by_member: { id: string; full_name: string } | null;
      }>;
    }>;
  },
  listByPet(clinicId: string, petId: string) {
    return apiRequest(
      `${encBase}?clinic_id=${encodeURIComponent(clinicId)}&pet_id=${encodeURIComponent(petId)}`,
    ) as Promise<{ encounters: HubEncounter[] }>;
  },
};

export const hubClinicalApi = {
  listPetFlags(clinicId: string, petId: string) {
    return apiRequest(
      `${clinicalBase}/pet-flags?clinic_id=${encodeURIComponent(clinicId)}&pet_id=${encodeURIComponent(petId)}`,
    ) as Promise<{ flags: HubPetClinicalFlag[] }>;
  },
  upsertPetFlag(payload: {
    clinic_id: string;
    pet_id: string;
    flag_key: string;
    label: string;
    notes?: string | null;
    active?: boolean;
  }) {
    return apiRequest(`${clinicalBase}/pet-flags`, { method: 'POST', body: JSON.stringify(payload) }) as Promise<{
      flag: HubPetClinicalFlag;
    }>;
  },
  listEvents(clinicId: string, petId: string) {
    return apiRequest(
      `${clinicalBase}/encounter-events?clinic_id=${encodeURIComponent(clinicId)}&pet_id=${encodeURIComponent(petId)}`,
    ) as Promise<{ events: HubEncounterEvent[] }>;
  },
  createEvent(payload: {
    clinic_id: string;
    pet_id: string;
    hub_encounter_id?: string | null;
    event_type?: string;
    title: string;
    body?: string | null;
    event_at?: string;
  }) {
    return apiRequest(`${clinicalBase}/encounter-events`, { method: 'POST', body: JSON.stringify(payload) }) as Promise<{
      event: HubEncounterEvent;
    }>;
  },
  alerts(clinicId: string) {
    return apiRequest(`${clinicalBase}/alerts?clinic_id=${encodeURIComponent(clinicId)}`) as Promise<{
      alerts: HubClinicalAlert[];
    }>;
  },
  listPrescriptions(clinicId: string, petId?: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (petId) q.set('pet_id', petId);
    return apiRequest(`${clinicalBase}/prescriptions?${q}`) as Promise<{ prescriptions: HubPrescription[] }>;
  },
  createPrescription(payload: {
    clinic_id: string;
    pet_id: string;
    hub_encounter_id?: string | null;
    hub_staff_member_id?: string | null;
    notes?: string | null;
    items: Array<{
      medication_name: string;
      dosage?: string | null;
      frequency?: string | null;
      duration?: string | null;
      instructions?: string | null;
      hub_inventory_item_id?: string | null;
    }>;
  }) {
    return apiRequest(`${clinicalBase}/prescriptions`, { method: 'POST', body: JSON.stringify(payload) });
  },
  openPrescriptionPdf(prescriptionId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    window.open(`${clinicalBase}/prescriptions/${encodeURIComponent(prescriptionId)}/pdf?${q}`, '_blank', 'noopener,noreferrer');
  },
  listVaccinations(clinicId: string, petId?: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (petId) q.set('pet_id', petId);
    return apiRequest(`${clinicalBase}/vaccinations?${q}`) as Promise<{ vaccinations: HubVaccination[] }>;
  },
  createVaccination(payload: {
    clinic_id: string;
    pet_id: string;
    hub_encounter_id?: string | null;
    vaccine_name: string;
    batch_number?: string | null;
    administered_at: string;
    next_dose_at?: string | null;
    hub_staff_member_id?: string | null;
    notes?: string | null;
  }) {
    return apiRequest(`${clinicalBase}/vaccinations`, { method: 'POST', body: JSON.stringify(payload) });
  },
  listAttachments(clinicId: string, opts?: { petId?: string; encounterId?: string }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.petId) q.set('pet_id', opts.petId);
    if (opts?.encounterId) q.set('hub_encounter_id', opts.encounterId);
    return apiRequest(`${clinicalBase}/attachments?${q}`) as Promise<{ attachments: HubClinicalAttachment[] }>;
  },
  createAttachment(payload: {
    clinic_id: string;
    pet_id: string;
    hub_encounter_id?: string | null;
    file_name: string;
    storage_path: string;
    mime_type?: string | null;
    title?: string | null;
    notes?: string | null;
  }) {
    return apiRequest(`${clinicalBase}/attachments`, { method: 'POST', body: JSON.stringify(payload) });
  },
  uploadAttachmentFile(params: {
    clinicId: string;
    petId: string;
    encounterId?: string | null;
    file: File;
    title?: string;
  }) {
    const fd = new FormData();
    fd.append('file', params.file);
    fd.append('clinic_id', params.clinicId);
    fd.append('pet_id', params.petId);
    if (params.encounterId) fd.append('hub_encounter_id', params.encounterId);
    if (params.title) fd.append('title', params.title);
    return apiRequest(`${clinicalBase}/attachments/upload`, { method: 'POST', body: fd }) as Promise<{
      attachment: HubClinicalAttachment;
    }>;
  },
  listBeds(clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    const unitId = getSelectedUnitId();
    if (unitId) q.set('unit_id', unitId);
    return apiRequest(`${clinicalBase}/hospital-beds?${q}`) as Promise<{ beds: HubHospitalBed[] }>;
  },
  createBed(payload: { clinic_id: string; code: string; label?: string | null; unit_id?: string | null }) {
    return apiRequest(`${clinicalBase}/hospital-beds`, { method: 'POST', body: JSON.stringify(payload) });
  },
  listHospitalizations(clinicId: string, status?: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (status) q.set('status', status);
    return apiRequest(`${clinicalBase}/hospitalizations?${q}`) as Promise<{
      hospitalizations: HubHospitalization[];
    }>;
  },
  createHospitalization(payload: Record<string, unknown>) {
    return apiRequest(`${clinicalBase}/hospitalizations`, { method: 'POST', body: JSON.stringify(payload) });
  },
  patchHospitalization(id: string, payload: { clinic_id: string; status?: string; discharge_notes?: string | null }) {
    return apiRequest(`${clinicalBase}/hospitalizations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ hospitalization: HubHospitalization }>;
  },
  addDailyNote(hospitalizationId: string, payload: Record<string, unknown>) {
    return apiRequest(`${clinicalBase}/hospitalizations/${hospitalizationId}/daily-notes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  listHospEvents(hospitalizationId: string, kind?: HubHospitalizationEventKind) {
    const q = new URLSearchParams({ hospitalization_id: hospitalizationId });
    if (kind) q.set('kind', kind);
    return apiRequest(`${clinicalBase}/hospitalizations/${hospitalizationId}/events?${q}`) as Promise<{
      events: HubHospitalizationEvent[];
    }>;
  },
  createHospEvent(hospitalizationId: string, payload: Record<string, unknown>) {
    return apiRequest(`${clinicalBase}/hospitalizations/${hospitalizationId}/events`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ event: HubHospitalizationEvent }>;
  },
  listSurgeries(clinicId: string, status?: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (status) q.set('status', status);
    return apiRequest(`${clinicalBase}/surgeries?${q}`) as Promise<{ surgeries: HubSurgery[] }>;
  },
  createSurgery(payload: Record<string, unknown>) {
    return apiRequest(`${clinicalBase}/surgeries`, { method: 'POST', body: JSON.stringify(payload) });
  },
  patchSurgery(id: string, payload: Record<string, unknown>) {
    return apiRequest(`${clinicalBase}/surgeries/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },
  listTemplates(clinicId: string) {
    return apiRequest(`${clinicalBase}/templates?clinic_id=${encodeURIComponent(clinicId)}`) as Promise<{
      templates: Array<{ id: string; name: string }>;
    }>;
  },
  createTemplate(payload: Record<string, unknown>) {
    return apiRequest(`${clinicalBase}/templates`, { method: 'POST', body: JSON.stringify(payload) });
  },
  applyTemplate(encounterId: string, clinicId: string, templateId: string) {
    return apiRequest(`${clinicalBase}/templates/${encounterId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ clinic_id: clinicId, template_id: templateId }),
    });
  },
};

export type HubClinicalExamStatus = 'requested' | 'collected' | 'sent' | 'result_received' | 'completed' | 'cancelled';
export type HubClinicalExamLabKind = 'internal' | 'external';

export type HubClinicalExam = {
  id: string;
  clinic_id: string;
  pet_id: string;
  hub_case_id: string | null;
  hub_encounter_id: string | null;
  exam_type: string;
  lab_kind: HubClinicalExamLabKind;
  lab_name: string | null;
  external_lab_name: string | null;
  external_order_code: string | null;
  external_result_url: string | null;
  status: HubClinicalExamStatus;
  requested_at: string;
  collected_at: string | null;
  result_at: string | null;
  result_text: string | null;
  requested_by: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  requested_by_member?: { id: string; full_name: string } | null;
};

export const hubClinicalExamsApi = {
  list(clinicId: string, opts?: { petId?: string; caseId?: string; encounterId?: string; status?: HubClinicalExamStatus }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.petId) q.set('pet_id', opts.petId);
    if (opts?.caseId) q.set('hub_case_id', opts.caseId);
    if (opts?.encounterId) q.set('hub_encounter_id', opts.encounterId);
    if (opts?.status) q.set('status', opts.status);
    return apiRequest(`${clinicalBase}/exams?${q}`) as Promise<{ exams: HubClinicalExam[] }>;
  },
  get(id: string, clinicId: string) {
    return apiRequest(`${clinicalBase}/exams/${id}?clinic_id=${encodeURIComponent(clinicId)}`) as Promise<{
      exam: HubClinicalExam;
    }>;
  },
  create(payload: {
    clinic_id: string;
    pet_id: string;
    exam_type: string;
    hub_case_id?: string | null;
    hub_encounter_id?: string | null;
    lab_kind?: HubClinicalExamLabKind;
    lab_name?: string | null;
    external_lab_name?: string | null;
    external_order_code?: string | null;
    external_result_url?: string | null;
    requested_by?: string | null;
    notes?: string | null;
  }) {
    return apiRequest(`${clinicalBase}/exams`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ exam: HubClinicalExam }>;
  },
  patch(
    id: string,
    payload: {
      clinic_id: string;
      status?: HubClinicalExamStatus;
      result_text?: string | null;
      result_at?: string | null;
      collected_at?: string | null;
      external_result_url?: string | null;
      notes?: string | null;
      exam_type?: string;
    },
  ) {
    return apiRequest(`${clinicalBase}/exams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ exam: HubClinicalExam }>;
  },
  remove(id: string, clinicId: string) {
    return apiRequest(`${clinicalBase}/exams/${id}?clinic_id=${encodeURIComponent(clinicId)}`, {
      method: 'DELETE',
    }) as Promise<void>;
  },
};

export type HubClinicalTimelineEventType =
  | 'encounter_created'
  | 'encounter_completed'
  | 'encounter_amended'
  | 'exam_requested'
  | 'exam_result_received'
  | 'prescription_issued'
  | 'vaccination_applied'
  | 'hospitalization_started'
  | 'hospitalization_discharged'
  | 'surgery_performed'
  | 'return_scheduled'
  | 'note';

export type HubClinicalTimelineEvent = {
  id: string;
  clinic_id: string;
  pet_id: string;
  hub_case_id: string | null;
  hub_encounter_id: string | null;
  event_type: HubClinicalTimelineEventType;
  ref_type: string | null;
  ref_id: string | null;
  title: string;
  body: string | null;
  event_at: string;
  created_by: string | null;
  created_at: string;
  created_by_member?: { id: string; full_name: string } | null;
};

export const hubClinicalTimelineApi = {
  list(clinicId: string, opts: { petId?: string; caseId?: string }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts.petId) q.set('pet_id', opts.petId);
    if (opts.caseId) q.set('hub_case_id', opts.caseId);
    return apiRequest(`${clinicalBase}/timeline?${q}`) as Promise<{
      events: HubClinicalTimelineEvent[];
    }>;
  },
  createNote(payload: {
    clinic_id: string;
    pet_id: string;
    hub_case_id?: string | null;
    hub_encounter_id?: string | null;
    title: string;
    body?: string | null;
    event_at?: string;
    created_by?: string | null;
  }) {
    return apiRequest(`${clinicalBase}/timeline/notes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ event: HubClinicalTimelineEvent }>;
  },
};

export const hubClinicalCasesApi = {
  list(clinicId: string, opts?: { petId?: string; status?: HubClinicalCaseStatus }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.petId) q.set('pet_id', opts.petId);
    if (opts?.status) q.set('status', opts.status);
    return apiRequest(`${clinicalBase}/cases?${q}`) as Promise<{ cases: HubClinicalCase[] }>;
  },
  get(id: string, clinicId: string) {
    return apiRequest(`${clinicalBase}/cases/${id}?clinic_id=${encodeURIComponent(clinicId)}`) as Promise<{
      case: HubClinicalCase;
    }>;
  },
  create(payload: {
    clinic_id: string;
    pet_id: string;
    title: string;
    unit_id?: string | null;
    guardian_id_snapshot?: string | null;
    primary_veterinarian_id?: string | null;
    summary?: string | null;
    status?: HubClinicalCaseStatus;
    tags?: string[];
    opened_at?: string;
  }) {
    return apiRequest(`${clinicalBase}/cases`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ case: HubClinicalCase }>;
  },
  patch(
    id: string,
    payload: {
      clinic_id: string;
      title?: string;
      summary?: string | null;
      status?: HubClinicalCaseStatus;
      tags?: string[];
      primary_veterinarian_id?: string | null;
    },
  ) {
    return apiRequest(`${clinicalBase}/cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ case: HubClinicalCase }>;
  },
  remove(id: string, clinicId: string) {
    return apiRequest(`${clinicalBase}/cases/${id}?clinic_id=${encodeURIComponent(clinicId)}`, {
      method: 'DELETE',
    }) as Promise<void>;
  },
};
