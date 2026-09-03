import { apiRequest, getApiBaseUrl, getSupabase } from '@petimi/web-core';

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

export type HubEncounterOperationalPhase = 'awaiting_exams' | 'exams_returned';

export type HubEncounter = {
  id: string;
  clinic_id: string;
  unit_id: string | null;
  care_location_kind?: 'own_unit' | 'partner_clinic';
  hub_partner_clinic_id?: string | null;
  partner_clinic?: { id: string; name: string } | null;
  /** Nullable para urgências abertas sem pet identificado. */
  pet_id: string | null;
  guardian_id: string | null;
  hub_appointment_id: string | null;
  hub_staff_member_id: string | null;
  hub_case_id: string | null;
  encounter_type: HubEncounterType;
  /** Walk-in: tipo de serviço principal (Clínica / Internação / Cirurgia). */
  hub_service_type_id?: string | null;
  status: HubEncounterStatus;
  operational_phase?: HubEncounterOperationalPhase | null;
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
  financial_adjustment_pending?: boolean;
  comanda_id?: string | null;
};

export type DayBoardItem = {
  kind: 'encounter' | 'appointment_slot';
  encounter_id?: string;
  appointment_id?: string;
  starts_at?: string;
  ends_at?: string;
  appointment_status?: string;
  appointment_kind?: string | null;
  title?: string | null;
  notes?: string | null;
  status?: HubEncounterStatus;
  care_location_kind?: 'own_unit' | 'partner_clinic' | string | null;
  hub_partner_clinic_id?: string | null;
  partner_clinic?: { id: string; name: string } | null;
  pet?: HubEncounterPet | null;
  guardian?: { id: string; full_name: string } | null;
  staff_member?: { id: string; full_name: string } | null;
  service_type?: { id: string; name: string } | null;
  pet_id?: string | null;
  guardian_id?: string | null;
  hub_staff_member_id?: string | null;
  operational_phase?: HubEncounterOperationalPhase | null;
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

export type HubPrescriptionAdministration = 'home_use' | 'administered_in_clinic';

export type HubPrescriptionItem = {
  id?: string;
  medication_name: string;
  presentation?: string | null;
  concentration?: string | null;
  quantity?: string | null;
  posology?: string | null;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  hub_inventory_item_id?: string | null;
  administration?: HubPrescriptionAdministration | string | null;
};

export type HubPrescriptionDocumentStatus = 'valid' | 'revoked' | 'expired';

export type HubPrescriptionDocumentRow = {
  id: string;
  prescription_id: string;
  version_no: number;
  pdf_path?: string | null;
  issued_by?: string | null;
  issued_at?: string | null;
  signature_status?: string | null;
  created_at?: string | null;
  issued_by_member?: { id: string; full_name: string } | null;
  validation_code?: string | null;
  public_token_masked?: string | null;
  document_status?: HubPrescriptionDocumentStatus;
  content_hash_short?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
  validation_url?: string | null;
  public_url?: string | null;
};

export type HubPrescriptionIssueResponse = {
  document: HubPrescriptionDocumentRow;
  snapshot?: Record<string, unknown>;
  public_url?: string;
  content_hash_short?: string;
};

export type HubPrescription = {
  id: string;
  clinic_id: string;
  pet_id: string;
  hub_encounter_id?: string | null;
  hub_case_id?: string | null;
  notes?: string | null;
  status?: string;
  prescribed_at?: string;
  items: HubPrescriptionItem[];
};

export type HubVaccinationSource = 'in_clinic' | 'external';

export type HubVaccination = {
  id: string;
  vaccine_name: string;
  batch_number?: string | null;
  administered_at: string;
  next_dose_at?: string | null;
  hub_encounter_id?: string | null;
  hub_case_id?: string | null;
  source?: HubVaccinationSource | null;
  hub_inventory_item_id?: string | null;
  hub_inventory_lot_id?: string | null;
  expiry_date?: string | null;
  price?: number | null;
  stock_movement_id?: string | null;
  notes?: string | null;
};

export type HubClinicalAttachment = {
  id: string;
  file_name: string;
  storage_path: string;
  title?: string | null;
  mime_type?: string | null;
  uploaded_at?: string;
  hub_encounter_id?: string | null;
  hub_exam_id?: string | null;
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
  hub_case_id?: string | null;
  hub_encounter_id?: string | null;
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
  openFromAppointment(
    clinicId: string,
    hubAppointmentId: string,
    opts?: {
      hub_case_id?: string | null;
      create_new_case?: boolean;
      new_case_title?: string | null;
    },
  ) {
    return apiRequest(`${encBase}/open-from-appointment`, {
      method: 'POST',
      body: JSON.stringify({ clinic_id: clinicId, hub_appointment_id: hubAppointmentId, ...opts }),
    }) as Promise<{ encounter: HubEncounter; created: boolean }>;
  },
  patch(
    id: string,
    payload: {
      clinic_id: string;
      status?: string;
      operational_phase?: HubEncounterOperationalPhase | null;
      chief_complaint?: string | null;
      summary_notes?: string | null;
      anamnesis?: Record<string, unknown>;
      physical_exam?: Record<string, unknown>;
      diagnosis?: Record<string, unknown>;
      hub_staff_member_id?: string | null;
      guardian_id?: string | null;
      /** Identificação posterior: pet do atendimento de urgência. */
      pet_id?: string | null;
      /** Identificação posterior: vincular caso clínico (copia pet/tutor quando ausentes). */
      hub_case_id?: string | null;
    },
  ) {
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

export type VetCockpitPatientContext = {
  pet: {
    id: string;
    name: string;
    species?: string;
    breed?: string | null;
    sex?: string | null;
    birth_date?: string | null;
    size_tier?: string;
  };
  guardian: { id: string; full_name: string; phone?: string | null } | null;
  chief_complaint: string | null;
  weight_kg: unknown;
  flags: HubPetClinicalFlag[];
  active_case: HubClinicalCase | null;
  cases: HubClinicalCase[];
  recent_encounters: Array<{
    id: string;
    chief_complaint: string | null;
    status: string;
    started_at: string | null;
    completed_at: string | null;
  }>;
  recent_exams: HubClinicalExam[];
  exams_grouped: {
    requested: HubClinicalExam[];
    awaiting: HubClinicalExam[];
    available: HubClinicalExam[];
  };
  active_prescriptions: HubPrescription[];
  draft_prescriptions_count: number;
  recent_vaccinations: HubVaccination[];
  active_hospitalization: HubHospitalization | null;
  encounter: {
    id: string;
    status: string;
    operational_phase: HubEncounterOperationalPhase | null;
    hub_case_id: string | null;
  } | null;
  appointment: {
    id: string;
    status: string;
    appointment_kind: string | null;
    starts_at: string;
  } | null;
};

export const hubVetCockpitApi = {
  patientContext(
    clinicId: string,
    opts: { petId?: string; encounterId?: string; appointmentId?: string },
  ) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts.petId) q.set('pet_id', opts.petId);
    if (opts.encounterId) q.set('encounter_id', opts.encounterId);
    if (opts.appointmentId) q.set('appointment_id', opts.appointmentId);
    return apiRequest(`${clinicalBase}/cockpit/patient-context?${q}`) as Promise<VetCockpitPatientContext>;
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
  listPrescriptions(clinicId: string, petId?: string, hubCaseId?: string, hubEncounterId?: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (petId) q.set('pet_id', petId);
    if (hubCaseId) q.set('hub_case_id', hubCaseId);
    if (hubEncounterId) q.set('hub_encounter_id', hubEncounterId);
    return apiRequest(`${clinicalBase}/prescriptions?${q}`) as Promise<{ prescriptions: HubPrescription[] }>;
  },
  createPrescription(payload: {
    clinic_id: string;
    pet_id: string;
    hub_encounter_id?: string | null;
    hub_case_id?: string | null;
    hub_staff_member_id?: string | null;
    notes?: string | null;
    items: Array<{
      medication_name: string;
      presentation?: string | null;
      concentration?: string | null;
      quantity?: string | null;
      posology?: string | null;
      dosage?: string | null;
      frequency?: string | null;
      duration?: string | null;
      instructions?: string | null;
      hub_inventory_item_id?: string | null;
      administration?: HubPrescriptionAdministration;
    }>;
  }) {
    return apiRequest(`${clinicalBase}/prescriptions`, { method: 'POST', body: JSON.stringify(payload) }) as Promise<{
      prescription: HubPrescription;
      merged_into_existing?: boolean;
    }>;
  },
  patchPrescription(
    prescriptionId: string,
    payload: {
      clinic_id: string;
      notes?: string | null;
      hub_staff_member_id?: string | null;
      items?: Array<{
        medication_name: string;
        presentation?: string | null;
        concentration?: string | null;
        quantity?: string | null;
        posology?: string | null;
        dosage?: string | null;
        frequency?: string | null;
        duration?: string | null;
        instructions?: string | null;
        hub_inventory_item_id?: string | null;
        administration?: HubPrescriptionAdministration;
      }>;
    },
  ) {
    return apiRequest(`${clinicalBase}/prescriptions/${encodeURIComponent(prescriptionId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ prescription: HubPrescription }>;
  },
  listPrescriptionDocuments(prescriptionId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(
      `${clinicalBase}/prescriptions/${encodeURIComponent(prescriptionId)}/documents?${q}`,
    ) as Promise<{ documents: HubPrescriptionDocumentRow[] }>;
  },
  issuePrescriptionDocument(
    prescriptionId: string,
    payload: { clinic_id: string; issued_by?: string | null },
  ) {
    return apiRequest(`${clinicalBase}/prescriptions/${encodeURIComponent(prescriptionId)}/documents`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<HubPrescriptionIssueResponse>;
  },
  revokePrescriptionDocument(
    prescriptionId: string,
    documentId: string,
    payload: { clinic_id: string; reason: string; revoked_by?: string | null },
  ) {
    return apiRequest(
      `${clinicalBase}/prescriptions/${encodeURIComponent(prescriptionId)}/documents/${encodeURIComponent(documentId)}/revoke`,
      { method: 'POST', body: JSON.stringify(payload) },
    ) as Promise<{ document: HubPrescriptionDocumentRow }>;
  },
  publicPrescriptionLink(tokenOrUrl: string): string {
    if (tokenOrUrl.startsWith('http://') || tokenOrUrl.startsWith('https://')) return tokenOrUrl;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/receita/${tokenOrUrl}`;
  },
  prescriptionPdfUrl(prescriptionId: string, clinicId: string, documentId?: string): string {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (documentId) q.set('document_id', documentId);
    return `${clinicalBase}/prescriptions/${encodeURIComponent(prescriptionId)}/pdf?${q}`;
  },
  /** @deprecated Use openHubPrescriptionPdf — window.open na API não envia Bearer. */
  openPrescriptionPdf(prescriptionId: string, clinicId: string, documentId?: string) {
    void openHubPrescriptionPdf(prescriptionId, clinicId, documentId);
  },
  listVaccinations(clinicId: string, petId?: string, hubCaseId?: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (petId) q.set('pet_id', petId);
    if (hubCaseId) q.set('hub_case_id', hubCaseId);
    return apiRequest(`${clinicalBase}/vaccinations?${q}`) as Promise<{ vaccinations: HubVaccination[] }>;
  },
  createVaccination(payload: {
    clinic_id: string;
    pet_id: string;
    hub_encounter_id?: string | null;
    hub_case_id?: string | null;
    vaccine_name: string;
    batch_number?: string | null;
    administered_at: string;
    next_dose_at?: string | null;
    hub_staff_member_id?: string | null;
    notes?: string | null;
    source?: HubVaccinationSource;
    hub_inventory_item_id?: string | null;
    hub_inventory_lot_id?: string | null;
    expiry_date?: string | null;
    manufacturer?: string | null;
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
    examId?: string | null;
    file: File;
    title?: string;
  }) {
    const fd = new FormData();
    fd.append('file', params.file);
    fd.append('clinic_id', params.clinicId);
    fd.append('pet_id', params.petId);
    if (params.encounterId) fd.append('hub_encounter_id', params.encounterId);
    if (params.title) fd.append('title', params.title);
    if (params.examId) fd.append('hub_exam_id', params.examId);
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
  listHospitalizations(clinicId: string, status?: string, hubCaseId?: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (status) q.set('status', status);
    if (hubCaseId) q.set('hub_case_id', hubCaseId);
    return apiRequest(`${clinicalBase}/hospitalizations?${q}`) as Promise<{
      hospitalizations: HubHospitalization[];
    }>;
  },
  createHospitalization(payload: {
    clinic_id: string;
    pet_id: string;
    hub_hospital_bed_id?: string | null;
    admission_notes?: string | null;
    reason?: string | null;
    hub_case_id?: string | null;
    hub_encounter_id?: string | null;
    create_new_case?: boolean;
    new_case_title?: string | null;
    hub_staff_member_id?: string | null;
    guardian_id?: string | null;
    unit_id?: string | null;
  }) {
    return apiRequest(`${clinicalBase}/hospitalizations`, { method: 'POST', body: JSON.stringify(payload) }) as Promise<{ hospitalization: HubHospitalization }>;
  },
  patchHospitalization(id: string, payload: {
    clinic_id: string;
    status?: string;
    discharge_notes?: string | null;
    hub_case_id?: string | null;
    create_new_case?: boolean;
    new_case_title?: string | null;
  }) {
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
  listSurgeries(clinicId: string, status?: string, hubCaseId?: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (status) q.set('status', status);
    if (hubCaseId) q.set('hub_case_id', hubCaseId);
    return apiRequest(`${clinicalBase}/surgeries?${q}`) as Promise<{ surgeries: HubSurgery[] }>;
  },
  createSurgery(payload: {
    clinic_id: string;
    pet_id: string;
    title: string;
    scheduled_at?: string | null;
    anesthetic_risk?: HubAnestheticRisk | null;
    pre_op?: Record<string, unknown>;
    hub_case_id?: string | null;
    hub_encounter_id?: string | null;
    create_new_case?: boolean;
    new_case_title?: string | null;
    hub_staff_member_id?: string | null;
    guardian_id?: string | null;
    unit_id?: string | null;
  }) {
    return apiRequest(`${clinicalBase}/surgeries`, { method: 'POST', body: JSON.stringify(payload) }) as Promise<{ surgery: HubSurgery }>;
  },
  patchSurgery(id: string, payload: Record<string, unknown>) {
    return apiRequest(`${clinicalBase}/surgeries/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },
};

export type HubClinicalExamStatus = 'requested' | 'collected' | 'sent' | 'result_received' | 'completed' | 'cancelled';
export type HubClinicalExamLabKind = 'internal' | 'external';

export type HubClinicalExamDocumentStatus = 'draft' | 'active' | 'issued' | 'cancelled';

export type HubClinicalExam = {
  id: string;
  clinic_id: string;
  pet_id: string;
  hub_case_id: string | null;
  hub_encounter_id: string | null;
  guardian_id?: string | null;
  exam_type: string;
  lab_kind: HubClinicalExamLabKind;
  lab_name: string | null;
  external_lab_name: string | null;
  external_order_code: string | null;
  external_result_url: string | null;
  urgency?: 'routine' | 'urgent' | null;
  clinical_indication?: string | null;
  fasting_required?: boolean;
  collection_instructions?: string | null;
  document_status?: HubClinicalExamDocumentStatus;
  status: HubClinicalExamStatus;
  requested_at: string;
  collected_at: string | null;
  result_at: string | null;
  result_text: string | null;
  requested_by: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  care_location_kind?: 'own_unit' | 'partner_clinic';
  hub_partner_clinic_id?: string | null;
  partner_clinic?: { id: string; name: string } | null;
  created_at: string;
  updated_at: string;
  requested_by_member?: { id: string; full_name: string } | null;
};

export type HubClinicalDocumentStatus = 'valid' | 'revoked' | 'expired';
export type HubClinicalDocumentScope = 'single' | 'encounter_bundle';

export type HubClinicalDocumentRow = {
  id: string;
  hub_encounter_id: string;
  scope?: HubClinicalDocumentScope;
  version_no: number;
  issued_by?: string | null;
  issued_at: string;
  validation_code?: string | null;
  public_token_masked?: string | null;
  document_status?: HubClinicalDocumentStatus;
  content_hash?: string | null;
  content_hash_short?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
  validation_url?: string | null;
  public_url?: string | null;
  issued_by_member?: { id: string; full_name: string } | null;
};

export type HubClinicalDocumentIssueResponse = {
  document: HubClinicalDocumentRow;
  public_url: string;
  content_hash_short: string;
};

export type HubSpecialistReferralStatus = 'draft' | 'active' | 'issued' | 'cancelled';

export type HubSpecialistReferral = {
  id: string;
  clinic_id: string;
  pet_id: string;
  hub_case_id: string | null;
  hub_encounter_id: string | null;
  guardian_id: string | null;
  specialty: string;
  specialist_name: string | null;
  specialist_contact: string | null;
  referral_reason: string;
  clinical_summary: string | null;
  priority: 'routine' | 'urgent';
  status: HubSpecialistReferralStatus;
  notes: string | null;
  metadata: Record<string, unknown>;
  requested_by: string | null;
  created_at: string;
  updated_at: string;
  requested_by_member?: { id: string; full_name: string } | null;
};

export const hubClinicalExamsApi = {
  list(
    clinicId: string,
    opts?: {
      petId?: string;
      caseId?: string;
      encounterId?: string;
      status?: HubClinicalExamStatus;
      careLocationKind?: 'own_unit' | 'partner_clinic';
      partnerClinicId?: string;
    },
  ) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.petId) q.set('pet_id', opts.petId);
    if (opts?.caseId) q.set('hub_case_id', opts.caseId);
    if (opts?.encounterId) q.set('hub_encounter_id', opts.encounterId);
    if (opts?.status) q.set('status', opts.status);
    if (opts?.careLocationKind) q.set('care_location_kind', opts.careLocationKind);
    if (opts?.partnerClinicId) q.set('hub_partner_clinic_id', opts.partnerClinicId);
    return apiRequest(`${clinicalBase}/exams?${q}`) as Promise<{ exams: HubClinicalExam[] }>;
  },
  exportCsvUrl(
    clinicId: string,
    opts?: {
      status?: HubClinicalExamStatus;
      careLocationKind?: 'own_unit' | 'partner_clinic';
      partnerClinicId?: string;
      from?: string;
      to?: string;
    },
  ) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.status) q.set('status', opts.status);
    if (opts?.careLocationKind) q.set('care_location_kind', opts.careLocationKind);
    if (opts?.partnerClinicId) q.set('hub_partner_clinic_id', opts.partnerClinicId);
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    return `${clinicalBase}/exams/export.csv?${q}`;
  },
  async downloadExportCsv(
    clinicId: string,
    opts?: {
      status?: HubClinicalExamStatus;
      careLocationKind?: 'own_unit' | 'partner_clinic';
      partnerClinicId?: string;
      from?: string;
      to?: string;
    },
  ) {
    const token = (await getSupabase().auth.getSession()).data.session?.access_token;
    if (!token) throw new Error('Sessão expirada. Faça login novamente.');
    const path = hubClinicalExamsApi.exportCsvUrl(clinicId, opts);
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string })?.error || 'Falha ao exportar exames');
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = 'exames.csv';
    a.click();
    URL.revokeObjectURL(objectUrl);
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
    guardian_id?: string | null;
    lab_kind?: HubClinicalExamLabKind;
    lab_name?: string | null;
    external_lab_name?: string | null;
    external_order_code?: string | null;
    external_result_url?: string | null;
    requested_by?: string | null;
    urgency?: 'routine' | 'urgent' | null;
    clinical_indication?: string | null;
    fasting_required?: boolean;
    collection_instructions?: string | null;
    notes?: string | null;
    care_location_kind?: 'own_unit' | 'partner_clinic';
    hub_partner_clinic_id?: string | null;
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
      urgency?: 'routine' | 'urgent' | null;
      clinical_indication?: string | null;
      fasting_required?: boolean;
      collection_instructions?: string | null;
      metadata?: Record<string, unknown>;
      care_location_kind?: 'own_unit' | 'partner_clinic';
      hub_partner_clinic_id?: string | null;
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
  issueOrderDocument(payload: {
    clinic_id: string;
    hub_encounter_id: string;
    scope?: HubClinicalDocumentScope;
    exam_id?: string | null;
    issued_by?: string | null;
  }) {
    return apiRequest(`${clinicalBase}/exams/orders/issue`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<HubClinicalDocumentIssueResponse>;
  },
  listOrderDocumentsByEncounter(encounterId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${clinicalBase}/exams/encounter/${encodeURIComponent(encounterId)}/order-documents?${q}`) as Promise<{
      documents: HubClinicalDocumentRow[];
    }>;
  },
  revokeOrderDocument(docId: string, payload: { clinic_id: string; reason: string; revoked_by?: string | null }) {
    return apiRequest(`${clinicalBase}/exams/order-documents/${encodeURIComponent(docId)}/revoke`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ ok: boolean }>;
  },
  examOrderPdfUrl(clinicId: string, documentId: string): string {
    const q = new URLSearchParams({ clinic_id: clinicId, document_id: documentId });
    return `${clinicalBase}/exams/pdf?${q}`;
  },
};

export const hubSpecialistReferralsApi = {
  list(clinicId: string, opts?: { petId?: string; caseId?: string; encounterId?: string }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.petId) q.set('pet_id', opts.petId);
    if (opts?.caseId) q.set('hub_case_id', opts.caseId);
    if (opts?.encounterId) q.set('hub_encounter_id', opts.encounterId);
    return apiRequest(`${clinicalBase}/specialist-referrals?${q}`) as Promise<{ referrals: HubSpecialistReferral[] }>;
  },
  create(payload: {
    clinic_id: string;
    pet_id: string;
    hub_encounter_id?: string | null;
    hub_case_id?: string | null;
    guardian_id?: string | null;
    requested_by?: string | null;
    specialty: string;
    specialist_name?: string | null;
    specialist_contact?: string | null;
    referral_reason: string;
    clinical_summary?: string | null;
    priority?: 'routine' | 'urgent';
    notes?: string | null;
  }) {
    return apiRequest(`${clinicalBase}/specialist-referrals`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ referral: HubSpecialistReferral }>;
  },
  patch(
    id: string,
    payload: {
      clinic_id: string;
      specialty?: string;
      specialist_name?: string | null;
      specialist_contact?: string | null;
      referral_reason?: string;
      clinical_summary?: string | null;
      priority?: 'routine' | 'urgent';
      status?: HubSpecialistReferralStatus;
      notes?: string | null;
      requested_by?: string | null;
    },
  ) {
    return apiRequest(`${clinicalBase}/specialist-referrals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ referral: HubSpecialistReferral }>;
  },
  remove(id: string, clinicId: string) {
    return apiRequest(`${clinicalBase}/specialist-referrals/${id}?clinic_id=${encodeURIComponent(clinicId)}`, {
      method: 'DELETE',
    }) as Promise<void>;
  },
  issueDocument(
    referralId: string,
    payload: {
      clinic_id: string;
      hub_encounter_id: string;
      scope?: HubClinicalDocumentScope;
      issued_by?: string | null;
    },
  ) {
    return apiRequest(`${clinicalBase}/specialist-referrals/${encodeURIComponent(referralId)}/documents`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<HubClinicalDocumentIssueResponse>;
  },
  issueBundle(payload: {
    clinic_id: string;
    hub_encounter_id: string;
    scope?: HubClinicalDocumentScope;
    issued_by?: string | null;
  }) {
    return apiRequest(`${clinicalBase}/specialist-referrals/orders/issue`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<HubClinicalDocumentIssueResponse>;
  },
  listDocumentsByEncounter(encounterId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(
      `${clinicalBase}/specialist-referrals/encounter/${encodeURIComponent(encounterId)}/documents?${q}`,
    ) as Promise<{ documents: HubClinicalDocumentRow[] }>;
  },
  revokeDocument(
    referralId: string,
    docId: string,
    payload: { clinic_id: string; reason: string; revoked_by?: string | null },
  ) {
    return apiRequest(
      `${clinicalBase}/specialist-referrals/${encodeURIComponent(referralId)}/documents/${encodeURIComponent(docId)}/revoke`,
      { method: 'POST', body: JSON.stringify(payload) },
    ) as Promise<{ ok: boolean }>;
  },
  referralPdfUrl(clinicId: string, documentId: string, referralId: string): string {
    const q = new URLSearchParams({ clinic_id: clinicId, document_id: documentId });
    return `${clinicalBase}/specialist-referrals/${encodeURIComponent(referralId)}/pdf?${q}`;
  },
};

export type HubClinicalTimelineEventType =
  | 'encounter_created'
  | 'encounter_completed'
  | 'encounter_amended'
  | 'exam_requested'
  | 'exam_result_received'
  | 'exam_order_issued'
  | 'exam_order_revoked'
  | 'specialist_referral_requested'
  | 'specialist_referral_issued'
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

async function fetchHubPrescriptionPdfBlob(
  prescriptionId: string,
  clinicId: string,
  documentId?: string,
): Promise<Blob> {
  const token = (await getSupabase().auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');
  const url = `${getApiBaseUrl()}${clinicalBase}/prescriptions/${encodeURIComponent(prescriptionId)}/pdf?${new URLSearchParams({
    clinic_id: clinicId,
    ...(documentId ? { document_id: documentId } : {}),
  })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string })?.error || 'Falha ao gerar PDF');
  }
  return res.blob();
}

/** Abre aba em branco no gesto do usuário (sem noopener — senão a referência é null). */
export function openBlankPdfPreviewTab(): Window | null {
  const w = window.open('about:blank', '_blank');
  if (w) {
    try {
      w.opener = null;
    } catch {
      /* ignore */
    }
  }
  return w;
}

export type PrescriptionPdfOpenResult = 'tab' | 'download';

export async function openHubPrescriptionPdf(
  prescriptionId: string,
  clinicId: string,
  documentId?: string,
  previewWindow?: Window | null,
): Promise<PrescriptionPdfOpenResult> {
  const blob = await fetchHubPrescriptionPdfBlob(prescriptionId, clinicId, documentId);
  const objectUrl = URL.createObjectURL(blob);
  const filename = documentId
    ? `receita-${(documentId || prescriptionId).slice(0, 8)}.pdf`
    : `receita-${prescriptionId.slice(0, 8)}.pdf`;

  const assignToPreview = (): boolean => {
    if (!previewWindow || previewWindow.closed) return false;
    try {
      previewWindow.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
      return true;
    } catch {
      try {
        previewWindow.close();
      } catch {
        /* ignore */
      }
      return false;
    }
  };

  if (assignToPreview()) return 'tab';

  const opened = window.open(objectUrl, '_blank');
  if (opened) {
    try {
      opened.opener = null;
    } catch {
      /* ignore */
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
    return 'tab';
  }

  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
  return 'download';
}

export async function downloadHubPrescriptionPdf(
  prescriptionId: string,
  clinicId: string,
  documentId?: string,
  filename?: string,
): Promise<void> {
  const blob = await fetchHubPrescriptionPdfBlob(prescriptionId, clinicId, documentId);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename ?? `receita-${prescriptionId.slice(0, 8)}.pdf`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
}

async function fetchHubClinicalDocumentPdfBlob(path: string): Promise<Blob> {
  const token = (await getSupabase().auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');
  const url = path.startsWith('http') ? path : `${getApiBaseUrl()}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string })?.error || 'Falha ao gerar PDF');
  }
  return res.blob();
}

export async function openHubClinicalDocumentPdf(
  path: string,
  filename: string,
  previewWindow?: Window | null,
): Promise<PrescriptionPdfOpenResult> {
  const blob = await fetchHubClinicalDocumentPdfBlob(path);
  const objectUrl = URL.createObjectURL(blob);

  const assignToPreview = (): boolean => {
    if (!previewWindow || previewWindow.closed) return false;
    try {
      previewWindow.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
      return true;
    } catch {
      try {
        previewWindow.close();
      } catch {
        /* ignore */
      }
      return false;
    }
  };

  if (assignToPreview()) return 'tab';

  const opened = window.open(objectUrl, '_blank');
  if (opened) {
    try {
      opened.opener = null;
    } catch {
      /* ignore */
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
    return 'tab';
  }

  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
  return 'download';
}
