/**
 * Isolamento multi-tenant — creates clínicos rejeitam FK de outra clínica.
 */
jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule(),
);
jest.mock('../hubSubscriptionService', () => {
  const actual = jest.requireActual('../hubSubscriptionService');
  return {
    ...actual,
    getClinicEntitlementSnapshot: jest.fn().mockResolvedValue({
      status: 'active',
      is_beta: true,
      base_plan_slug: 'beta',
      enabled_modules: ['hub_core', 'clinic', 'grooming', 'boarding'],
      disabled_operational_areas: [],
      max_units: null,
      max_users: null,
      access_mode: 'full',
    }),
  };
});

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';

const CLINIC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLINIC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PET_A = '11111111-1111-4111-8111-111111111111';
const PET_B = '22222222-2222-4222-8222-222222222222';
const GUARDIAN_A = '33333333-3333-4333-8333-333333333333';
const BED_A = '44444444-4444-4444-8444-444444444444';
const BED_B = '55555555-5555-4555-8555-555555555555';
const HOSP_A = '66666666-6666-4666-8666-666666666666';
const UNIT_A = '77777777-7777-4777-8777-777777777777';

function baseTables(extra: Record<string, unknown[]> = {}) {
  return {
    hub_pets: [
      { id: PET_A, clinic_id: CLINIC_A, name: 'Rex', deleted_at: null },
      { id: PET_B, clinic_id: CLINIC_B, name: 'Outro', deleted_at: null },
    ],
    hub_guardians: [
      { id: GUARDIAN_A, clinic_id: CLINIC_A, full_name: 'Tutor A', deleted_at: null },
    ],
    hub_pet_guardians: [{ id: 'pg-1', pet_id: PET_A, guardian_id: GUARDIAN_A, role: 'primary' }],
    hub_encounters: [] as Record<string, unknown>[],
    hub_clinical_cases: [] as Record<string, unknown>[],
    hub_prescriptions: [] as Record<string, unknown>[],
    hub_prescription_items: [] as Record<string, unknown>[],
    hub_clinical_timeline_events: [] as Record<string, unknown>[],
    hub_clinical_exams: [] as Record<string, unknown>[],
    hub_vaccinations: [] as Record<string, unknown>[],
    hub_hospital_beds: [
      { id: BED_A, clinic_id: CLINIC_A, code: 'A1', status: 'available', deleted_at: null },
      { id: BED_B, clinic_id: CLINIC_B, code: 'B1', status: 'available', deleted_at: null },
    ],
    hub_hospitalizations: [] as Record<string, unknown>[],
    hub_appointments: [] as Record<string, unknown>[],
    hub_service_types: [] as Record<string, unknown>[],
    units: [{ id: UNIT_A, clinic_id: CLINIC_A, name: 'Matriz' }],
    ...extra,
  };
}

describe('Tenant isolation — clínicos', () => {
  beforeEach(() => {
    configureSupabaseMock({ tables: baseTables() });
  });

  it('POST prescription com pet de outra clínica → 400', async () => {
    const res = await request(app).post('/api/hub/clinical/prescriptions').send({
      clinic_id: CLINIC_A,
      pet_id: PET_B,
      items: [{ medication_name: 'Amox' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pet inválido/i);
  });

  it('POST prescription válida → 201', async () => {
    const res = await request(app).post('/api/hub/clinical/prescriptions').send({
      clinic_id: CLINIC_A,
      pet_id: PET_A,
      items: [{ medication_name: 'Amox' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.prescription?.pet_id).toBe(PET_A);
  });

  it('POST timeline note com pet de outra clínica → 400', async () => {
    const res = await request(app).post('/api/hub/clinical/timeline/notes').send({
      clinic_id: CLINIC_A,
      pet_id: PET_B,
      title: 'Nota cruzada',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pet inválido/i);
  });

  it('POST exam com pet de outra clínica → 400', async () => {
    const res = await request(app).post('/api/hub/clinical/exams').send({
      clinic_id: CLINIC_A,
      pet_id: PET_B,
      exam_type: 'Hemograma',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pet inválido/i);
  });

  it('POST hospitalization com pet de outra clínica → 400', async () => {
    const res = await request(app).post('/api/hub/clinical/hospitalizations').send({
      clinic_id: CLINIC_A,
      pet_id: PET_B,
      create_new_case: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pet inválido/i);
  });

  it('POST hospitalization com leito de outra clínica → 400', async () => {
    const res = await request(app).post('/api/hub/clinical/hospitalizations').send({
      clinic_id: CLINIC_A,
      pet_id: PET_A,
      hub_hospital_bed_id: BED_B,
      create_new_case: true,
    });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/inválid/i);
  });

  it('PATCH hospitalization não altera status de leito de outra clínica', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_hospitalizations: [
          {
            id: HOSP_A,
            clinic_id: CLINIC_A,
            pet_id: PET_A,
            guardian_id: GUARDIAN_A,
            hub_hospital_bed_id: BED_A,
            status: 'active',
            hub_encounter_id: null,
            unit_id: UNIT_A,
            admission_notes: null,
            reason: null,
            hub_appointment_id: null,
            discharged_at: null,
            deleted_at: null,
          },
        ],
      }),
    });

    const res = await request(app)
      .patch(`/api/hub/clinical/hospitalizations/${HOSP_A}`)
      .send({ clinic_id: CLINIC_A, hub_hospital_bed_id: BED_B });

    expect(res.status).toBe(400);

    const bedB = getMockSupabaseClient()._state.tables.hub_hospital_beds?.find(
      (r) => String((r as { id?: string }).id) === BED_B,
    ) as { status?: string } | undefined;
    expect(bedB?.status).toBe('available');
  });
});
