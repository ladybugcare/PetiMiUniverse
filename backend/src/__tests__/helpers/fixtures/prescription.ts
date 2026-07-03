export const RX_CLINIC_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const RX_PRESCRIPTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const RX_ENCOUNTER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const RX_PET_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
export const RX_STAFF_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
export const RX_GUARDIAN_ID = '11111111-1111-4111-8111-111111111111';
export const RX_DOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const RX_PUBLIC_TOKEN = 'abcdefghijklmnopqrstuvwx';
export const RX_VALIDATION_CODE = 'RX-AB12-CD34';

export function activePrescriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RX_PRESCRIPTION_ID,
    clinic_id: RX_CLINIC_ID,
    pet_id: RX_PET_ID,
    hub_encounter_id: RX_ENCOUNTER_ID,
    hub_staff_member_id: RX_STAFF_ID,
    guardian_id: RX_GUARDIAN_ID,
    hub_case_id: null,
    status: 'active',
    notes: 'Observação clínica',
    deleted_at: null,
    clinic: { id: RX_CLINIC_ID, name: 'Clínica Teste' },
    pet: { id: RX_PET_ID, name: 'Thor', species: 'Canino', breed: 'Labrador' },
    guardian: { id: RX_GUARDIAN_ID, full_name: 'João Souza' },
    staff: { id: RX_STAFF_ID, full_name: 'Dra. Ana', crmv: '99999', crmv_uf: 'RJ' },
    encounter: {
      guardian_id: RX_GUARDIAN_ID,
      pet_id: RX_PET_ID,
      hub_staff_member_id: RX_STAFF_ID,
    },
    ...overrides,
  };
}

export function prescriptionItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1111-1111-4111-8111-111111111111',
    prescription_id: RX_PRESCRIPTION_ID,
    medication_name: 'Amoxicilina',
    presentation: 'Comprimido',
    concentration: '250mg',
    quantity: '14',
    posology: '12/12h',
    duration: '7 dias',
    instructions: null,
    administration: 'home_use',
    order_index: 0,
    ...overrides,
  };
}

export function issuedDocumentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RX_DOC_ID,
    clinic_id: RX_CLINIC_ID,
    prescription_id: RX_PRESCRIPTION_ID,
    version_no: 1,
    validation_code: RX_VALIDATION_CODE,
    public_token: RX_PUBLIC_TOKEN,
    document_status: 'valid',
    content_hash: 'f'.repeat(64),
    snapshot: {
      version: 1,
      prescription_id: RX_PRESCRIPTION_ID,
      document_version: 1,
      clinic: { id: RX_CLINIC_ID, name: 'Clínica Teste' },
      pet: { id: RX_PET_ID, name: 'Thor', species: 'Canino', breed: 'Labrador' },
      guardian: { id: RX_GUARDIAN_ID, full_name: 'João Souza' },
      veterinarian: { id: RX_STAFF_ID, full_name: 'Dra. Ana', crmv: '99999', crmv_uf: 'RJ' },
      medications: [
        {
          medication_name: 'Amoxicilina',
          presentation: 'Comprimido',
          concentration: '250mg',
          quantity: '14',
          posology: '12/12h',
          duration: '7 dias',
          instructions: null,
          administration: 'home_use',
        },
      ],
      notes: 'Observação clínica',
      issued_at: '2026-07-01T10:00:00.000Z',
      disclaimers: ['Aviso legal PetMi Hub.'],
    },
    issued_at: '2026-07-01T10:00:00.000Z',
    expires_at: '2099-01-01T00:00:00.000Z',
    revoked_at: null,
    revoke_reason: null,
    validation_url: `http://localhost:3002/receita/${RX_PUBLIC_TOKEN}`,
    ...overrides,
  };
}

export function prescriptionIssueFixture(overrides: Partial<Record<string, unknown[]>> = {}) {
  return {
    tables: {
      hub_prescriptions: [activePrescriptionRow()],
      hub_prescription_items: [prescriptionItemRow()],
      hub_prescription_documents: [],
      hub_prescription_document_events: [],
      hub_clinical_timeline_events: [],
      hub_clinic_settings: [
        {
          clinic_id: RX_CLINIC_ID,
          prescription_defaults: { validity_days: 30 },
        },
      ],
      ...overrides,
    },
  };
}
