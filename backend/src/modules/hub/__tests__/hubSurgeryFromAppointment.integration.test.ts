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
const CLINIC_SERVICE_TYPE_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

function serviceType(id: string, group: string, name: string) {
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
    deleted_at: null,
  };
}

function baseTables() {
  return {
    hub_service_types: [
      serviceType(SURGERY_SERVICE_TYPE_ID, 'cirurgia', 'Castração'),
      serviceType(CLINIC_SERVICE_TYPE_ID, 'clinica', 'Consulta'),
    ],
    units: [{ id: TEST_UNIT_ID, clinic_id: TEST_CLINIC_ID, name: 'Matriz', is_main: true }],
    hub_pets: [{ id: TEST_PET_ID, clinic_id: TEST_CLINIC_ID, size_tier: 'medio', deleted_at: null }],
    hub_guardians: [{ id: TEST_GUARDIAN_ID, clinic_id: TEST_CLINIC_ID, deleted_at: null }],
    hub_pet_guardians: [{ id: 'link-1', pet_id: TEST_PET_ID, guardian_id: TEST_GUARDIAN_ID }],
    hub_appointments: [],
    hub_appointment_services: [],
    hub_surgeries: [],
    hub_surgery_services: [],
  };
}

function appointmentPayload(serviceTypeId: string) {
  return {
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    hub_service_type_id: serviceTypeId,
    pet_id: TEST_PET_ID,
    guardian_id: TEST_GUARDIAN_ID,
    starts_at: '2026-09-18T19:00:00.000Z',
    ends_at: '2026-09-18T20:00:00.000Z',
    title: 'Piômetra',
    services: [{ hub_service_type_id: serviceTypeId, duration_minutes: 60 }],
  };
}

function surgeriesTable() {
  return (getMockSupabaseClient()._state.tables.hub_surgeries ?? []) as Array<Record<string, unknown>>;
}

describe('Agendamento de cirurgia pela agenda', () => {
  beforeEach(() => {
    configureSupabaseMock({ tables: baseTables() });
  });

  it('cria a ficha cirúrgica vinculada ao slot quando o serviço é do grupo cirurgia', async () => {
    const res = await request(app)
      .post('/api/hub/appointments')
      .send(appointmentPayload(SURGERY_SERVICE_TYPE_ID));

    expect(res.status).toBe(201);
    const surgeries = surgeriesTable();
    expect(surgeries).toHaveLength(1);
    expect(surgeries[0]).toMatchObject({
      clinic_id: TEST_CLINIC_ID,
      pet_id: TEST_PET_ID,
      guardian_id: TEST_GUARDIAN_ID,
      hub_appointment_id: res.body.appointment.id,
      status: 'scheduled',
      scheduled_at: '2026-09-18T19:00:00.000Z',
      title: 'Piômetra',
    });
    expect(surgeries[0].hub_encounter_id ?? null).toBeNull();
    expect(surgeries[0].hub_case_id ?? null).toBeNull();
  });

  it('adota a linha de serviço do slot na ficha (sem cobrança em dobro)', async () => {
    await request(app).post('/api/hub/appointments').send(appointmentPayload(SURGERY_SERVICE_TYPE_ID));

    const tables = getMockSupabaseClient()._state.tables;
    const apptLine = (tables.hub_appointment_services ?? [])[0] as Record<string, unknown>;
    const surgeryServices = (tables.hub_surgery_services ?? []) as Array<Record<string, unknown>>;

    expect(surgeryServices).toHaveLength(1);
    expect(surgeryServices[0]).toMatchObject({
      hub_service_type_id: SURGERY_SERVICE_TYPE_ID,
      hub_appointment_service_id: apptLine.id,
      service_name: 'Castração',
      price_status: 'confirmed',
    });
  });

  it('não cria ficha para agendamento de outro grupo de serviço', async () => {
    const res = await request(app)
      .post('/api/hub/appointments')
      .send(appointmentPayload(CLINIC_SERVICE_TYPE_ID));

    expect(res.status).toBe(201);
    expect(surgeriesTable()).toHaveLength(0);
  });

  it('cancela a ficha quando o agendamento é cancelado', async () => {
    const created = await request(app)
      .post('/api/hub/appointments')
      .send(appointmentPayload(SURGERY_SERVICE_TYPE_ID));
    const apptId = created.body.appointment.id as string;

    const res = await request(app)
      .patch(`/api/hub/appointments/${apptId}`)
      .send({ clinic_id: TEST_CLINIC_ID, status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(surgeriesTable()[0]).toMatchObject({ status: 'cancelled' });
  });

  it('reagenda a ficha quando o horário do slot muda', async () => {
    const created = await request(app)
      .post('/api/hub/appointments')
      .send(appointmentPayload(SURGERY_SERVICE_TYPE_ID));
    const apptId = created.body.appointment.id as string;

    const res = await request(app)
      .patch(`/api/hub/appointments/${apptId}`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        starts_at: '2026-09-19T13:00:00.000Z',
        ends_at: '2026-09-19T14:00:00.000Z',
      });

    expect(res.status).toBe(200);
    expect(surgeriesTable()).toHaveLength(1);
    expect(surgeriesTable()[0]).toMatchObject({ scheduled_at: '2026-09-19T13:00:00.000Z' });
  });

  it('herda atendimento e caso ao abrir o atendimento pelo slot', async () => {
    const created = await request(app)
      .post('/api/hub/appointments')
      .send(appointmentPayload(SURGERY_SERVICE_TYPE_ID));
    const apptId = created.body.appointment.id as string;

    const res = await request(app)
      .post('/api/hub/encounters/open-from-appointment')
      .send({ clinic_id: TEST_CLINIC_ID, hub_appointment_id: apptId, create_new_case: true });

    expect(res.status).toBe(201);
    const surgery = surgeriesTable()[0]!;
    expect(surgery.hub_encounter_id).toBe(res.body.encounter.id);
    expect(surgery.hub_case_id).toBeTruthy();
  });

  it('não reagenda a ficha depois do atendimento aberto', async () => {
    const created = await request(app)
      .post('/api/hub/appointments')
      .send(appointmentPayload(SURGERY_SERVICE_TYPE_ID));
    const apptId = created.body.appointment.id as string;
    await request(app)
      .post('/api/hub/encounters/open-from-appointment')
      .send({ clinic_id: TEST_CLINIC_ID, hub_appointment_id: apptId, create_new_case: true });

    await request(app)
      .patch(`/api/hub/appointments/${apptId}`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        starts_at: '2026-09-19T13:00:00.000Z',
        ends_at: '2026-09-19T14:00:00.000Z',
      });

    expect(surgeriesTable()[0]).toMatchObject({ scheduled_at: '2026-09-18T19:00:00.000Z' });
  });

  it('ao concluir a cirurgia, encerra o slot da agenda', async () => {
    const created = await request(app)
      .post('/api/hub/appointments')
      .send(appointmentPayload(SURGERY_SERVICE_TYPE_ID));
    const apptId = created.body.appointment.id as string;
    const surgery = surgeriesTable()[0]!;
    surgery.hub_case_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    const res = await request(app)
      .patch(`/api/hub/clinical/surgeries/${surgery.id}`)
      .send({ clinic_id: TEST_CLINIC_ID, status: 'completed', completed_at: new Date().toISOString() });

    expect(res.status).toBe(200);
    expect(surgeriesTable()[0]).toMatchObject({ status: 'completed' });
    const appt = (getMockSupabaseClient()._state.tables.hub_appointments ?? []).find(
      (a: Record<string, unknown>) => a.id === apptId,
    ) as Record<string, unknown> | undefined;
    expect(appt?.status).toBe('done');
  });

  it('ao iniciar uma cirurgia futura, antecipa o slot da agenda para agora', async () => {
    const created = await request(app)
      .post('/api/hub/appointments')
      .send(appointmentPayload(SURGERY_SERVICE_TYPE_ID));
    const apptId = created.body.appointment.id as string;
    const surgeryId = surgeriesTable()[0]!.id as string;

    const before = Date.now();
    const res = await request(app)
      .patch(`/api/hub/clinical/surgeries/${surgeryId}`)
      .send({ clinic_id: TEST_CLINIC_ID, status: 'in_progress', started_at: new Date().toISOString() });

    expect(res.status).toBe(200);
    expect(surgeriesTable()[0]).toMatchObject({ status: 'in_progress' });
    const appt = (getMockSupabaseClient()._state.tables.hub_appointments ?? []).find(
      (a: Record<string, unknown>) => a.id === apptId,
    ) as Record<string, unknown> | undefined;
    expect(appt?.status).toBe('in_progress');
    const newStart = new Date(String(appt?.starts_at)).getTime();
    expect(newStart).toBeGreaterThanOrEqual(before - 1000);
    expect(newStart).toBeLessThan(before + 15_000);
    expect(surgeriesTable()[0]!.scheduled_at).toBe(appt?.starts_at);
  });

  it('remove a ficha quando o agendamento é excluído', async () => {
    const created = await request(app)
      .post('/api/hub/appointments')
      .send(appointmentPayload(SURGERY_SERVICE_TYPE_ID));
    const apptId = created.body.appointment.id as string;

    const res = await request(app)
      .patch(`/api/hub/appointments/${apptId}`)
      .send({ clinic_id: TEST_CLINIC_ID, deleted: true });

    expect(res.status).toBe(204);
    const surgery = surgeriesTable()[0]!;
    expect(surgery.status).toBe('cancelled');
    expect(surgery.deleted_at).toBeTruthy();
  });
});
