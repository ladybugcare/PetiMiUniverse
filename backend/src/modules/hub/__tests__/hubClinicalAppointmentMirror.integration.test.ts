jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import {
  configureSupabaseMock,
  getMockSupabaseClient,
} from '../../../__tests__/helpers/supabaseTestDouble';
import {
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/mockAuth';

const SURGERY_SERVICE_TYPE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const INTERNACAO_SERVICE_TYPE_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
const CLINIC_SERVICE_TYPE_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

function serviceType(id: string, group: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    clinic_id: TEST_CLINIC_ID,
    service_group: group,
    name,
    active: true,
    price_mode: 'fixed',
    sale_amount: 450,
    cost_amount: 200,
    pricing_matrix: null,
    default_duration_minutes: 60,
    deleted_at: null,
    ...extra,
  };
}

function baseTables(opts?: { withSurgeryService?: boolean; withInternacaoService?: boolean }) {
  const withSurgeryService = opts?.withSurgeryService !== false;
  const withInternacaoService = opts?.withInternacaoService !== false;
  const hub_service_types = [
    ...(withSurgeryService ? [serviceType(SURGERY_SERVICE_TYPE_ID, 'cirurgia', 'Castração')] : []),
    ...(withInternacaoService
      ? [serviceType(INTERNACAO_SERVICE_TYPE_ID, 'internacao', 'Diária internação')]
      : []),
    serviceType(CLINIC_SERVICE_TYPE_ID, 'clinica', 'Consulta'),
  ];
  return {
    hub_service_types,
    units: [{ id: TEST_UNIT_ID, clinic_id: TEST_CLINIC_ID, name: 'Matriz', is_main: true }],
    hub_pets: [
      {
        id: TEST_PET_ID,
        clinic_id: TEST_CLINIC_ID,
        size_tier: 'medio',
        birth_date: null,
        coat_type: null,
        deleted_at: null,
      },
    ],
    hub_guardians: [{ id: TEST_GUARDIAN_ID, clinic_id: TEST_CLINIC_ID, deleted_at: null }],
    hub_pet_guardians: [{ id: 'link-1', pet_id: TEST_PET_ID, guardian_id: TEST_GUARDIAN_ID }],
    hub_appointments: [],
    hub_appointment_services: [],
    hub_surgeries: [],
    hub_surgery_services: [],
    hub_hospitalizations: [],
    hub_hospital_beds: [],
    hub_clinical_cases: [],
    hub_encounters: [],
    hub_clinical_timeline_events: [],
    hub_comandas: [],
    hub_comanda_items: [],
  };
}

function appointmentsTable() {
  return (getMockSupabaseClient()._state.tables.hub_appointments ?? []) as Array<Record<string, unknown>>;
}

function surgeriesTable() {
  return (getMockSupabaseClient()._state.tables.hub_surgeries ?? []) as Array<Record<string, unknown>>;
}

function hospitalizationsTable() {
  return (getMockSupabaseClient()._state.tables.hub_hospitalizations ?? []) as Array<
    Record<string, unknown>
  >;
}

describe('Consultório → Agenda (espelho clínico)', () => {
  describe('cirurgia', () => {
    beforeEach(() => {
      configureSupabaseMock({ tables: baseTables() });
    });

    it('cria o slot na agenda ao agendar cirurgia no Consultório', async () => {
      const res = await request(app)
        .post('/api/hub/clinical/surgeries')
        .send({
          clinic_id: TEST_CLINIC_ID,
          unit_id: TEST_UNIT_ID,
          pet_id: TEST_PET_ID,
          guardian_id: TEST_GUARDIAN_ID,
          title: 'Ovariohisterectomia',
          scheduled_at: '2026-09-20T14:00:00.000Z',
          create_new_case: true,
          services: [{ hub_service_type_id: SURGERY_SERVICE_TYPE_ID }],
        });

      expect(res.status).toBe(201);
      expect(surgeriesTable()).toHaveLength(1);
      expect(appointmentsTable()).toHaveLength(1);

      const surgery = surgeriesTable()[0]!;
      const appt = appointmentsTable()[0]!;
      expect(surgery.hub_appointment_id).toBe(appt.id);
      expect(surgery.hub_encounter_id).toBeTruthy();
      expect(surgery.hub_case_id).toBeTruthy();
      expect(appt).toMatchObject({
        status: 'confirmed',
        appointment_kind: 'standard',
        starts_at: '2026-09-20T14:00:00.000Z',
        ends_at: '2026-09-20T15:00:00.000Z',
        pet_id: TEST_PET_ID,
        hub_service_type_id: SURGERY_SERVICE_TYPE_ID,
      });
      expect(surgeriesTable()).toHaveLength(1);
    });

    it('ainda cria a ficha quando não há tipo cirurgia no catálogo (sem slot)', async () => {
      configureSupabaseMock({ tables: baseTables({ withSurgeryService: false }) });

      const res = await request(app)
        .post('/api/hub/clinical/surgeries')
        .send({
          clinic_id: TEST_CLINIC_ID,
          unit_id: TEST_UNIT_ID,
          pet_id: TEST_PET_ID,
          guardian_id: TEST_GUARDIAN_ID,
          title: 'Cirurgia sem serviço',
          scheduled_at: '2026-09-20T14:00:00.000Z',
          create_new_case: true,
          services: [],
        });

      expect(res.status).toBe(201);
      expect(surgeriesTable()).toHaveLength(1);
      expect(appointmentsTable()).toHaveLength(0);
      expect(surgeriesTable()[0]!.hub_appointment_id ?? null).toBeNull();
    });

    it('cancela o slot ao cancelar a cirurgia', async () => {
      const created = await request(app)
        .post('/api/hub/clinical/surgeries')
        .send({
          clinic_id: TEST_CLINIC_ID,
          unit_id: TEST_UNIT_ID,
          pet_id: TEST_PET_ID,
          guardian_id: TEST_GUARDIAN_ID,
          title: 'Castração',
          scheduled_at: '2026-09-21T10:00:00.000Z',
          create_new_case: true,
          services: [{ hub_service_type_id: SURGERY_SERVICE_TYPE_ID }],
        });
      expect(created.status).toBe(201);
      const surgeryId = created.body.surgery.id as string;

      const res = await request(app)
        .patch(`/api/hub/clinical/surgeries/${surgeryId}`)
        .send({ clinic_id: TEST_CLINIC_ID, status: 'cancelled' });

      expect(res.status).toBe(200);
      expect(appointmentsTable()[0]?.status).toBe('cancelled');
    });
  });

  describe('internação', () => {
    beforeEach(() => {
      configureSupabaseMock({ tables: baseTables() });
    });

    it('cria slot in_progress ao admitir no Consultório', async () => {
      const before = Date.now();
      const res = await request(app)
        .post('/api/hub/clinical/hospitalizations')
        .send({
          clinic_id: TEST_CLINIC_ID,
          unit_id: TEST_UNIT_ID,
          pet_id: TEST_PET_ID,
          guardian_id: TEST_GUARDIAN_ID,
          reason: 'Gastroenterite',
          create_new_case: true,
          daily_hub_service_type_id: INTERNACAO_SERVICE_TYPE_ID,
        });

      expect(res.status).toBe(201);
      expect(hospitalizationsTable()).toHaveLength(1);
      expect(appointmentsTable()).toHaveLength(1);

      const hosp = hospitalizationsTable()[0]!;
      const appt = appointmentsTable()[0]!;
      expect(hosp.hub_appointment_id).toBe(appt.id);
      expect(appt).toMatchObject({
        status: 'in_progress',
        appointment_kind: 'clinical_walk_in',
        hub_service_type_id: INTERNACAO_SERVICE_TYPE_ID,
        pet_id: TEST_PET_ID,
      });
      const startMs = new Date(String(appt.starts_at)).getTime();
      expect(startMs).toBeGreaterThanOrEqual(before - 1000);
      expect(startMs).toBeLessThan(before + 15_000);
    });

    it('marca o slot como done na alta', async () => {
      const created = await request(app)
        .post('/api/hub/clinical/hospitalizations')
        .send({
          clinic_id: TEST_CLINIC_ID,
          unit_id: TEST_UNIT_ID,
          pet_id: TEST_PET_ID,
          guardian_id: TEST_GUARDIAN_ID,
          reason: 'Observação',
          create_new_case: true,
          daily_hub_service_type_id: INTERNACAO_SERVICE_TYPE_ID,
        });
      expect(created.status).toBe(201);
      const hospId = created.body.hospitalization.id as string;

      const res = await request(app)
        .patch(`/api/hub/clinical/hospitalizations/${hospId}`)
        .send({ clinic_id: TEST_CLINIC_ID, status: 'discharged' });

      expect(res.status).toBe(200);
      expect(appointmentsTable()[0]?.status).toBe('done');
    });
  });

  describe('regressão Fluxo E (Agenda → cirurgia)', () => {
    beforeEach(() => {
      configureSupabaseMock({ tables: baseTables() });
    });

    it('continua criando exatamente uma ficha ao agendar pela recepção', async () => {
      const res = await request(app)
        .post('/api/hub/appointments')
        .send({
          clinic_id: TEST_CLINIC_ID,
          unit_id: TEST_UNIT_ID,
          hub_service_type_id: SURGERY_SERVICE_TYPE_ID,
          pet_id: TEST_PET_ID,
          guardian_id: TEST_GUARDIAN_ID,
          starts_at: '2026-09-18T19:00:00.000Z',
          ends_at: '2026-09-18T20:00:00.000Z',
          title: 'Piômetra',
          services: [{ hub_service_type_id: SURGERY_SERVICE_TYPE_ID, duration_minutes: 60 }],
        });

      expect(res.status).toBe(201);
      expect(surgeriesTable()).toHaveLength(1);
      expect(surgeriesTable()[0]).toMatchObject({
        hub_appointment_id: res.body.appointment.id,
        status: 'scheduled',
      });
      expect(surgeriesTable()[0].hub_encounter_id ?? null).toBeNull();
    });
  });
});
