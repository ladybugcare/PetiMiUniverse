jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  boardingAppointment,
  emptyBoardingTables,
  hotelReservationCheckedOut,
  hotelServiceType,
  TEST_APPOINTMENT_ID,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_HOTEL_SERVICE_TYPE_ID,
  TEST_PET_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';

describe('POST /api/hub/comandas/open (appointment + boarding checked_out)', () => {
  it('abre comanda appointment com itens de estadia quando boarding está checked_out', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_service_types: [hotelServiceType()],
        hub_appointments: [
          boardingAppointment({
            status: 'done',
          }),
        ],
        hub_appointment_services: [
          {
            id: 'svc-hotel-1',
            appointment_id: TEST_APPOINTMENT_ID,
            hub_service_type_id: TEST_HOTEL_SERVICE_TYPE_ID,
            sale_amount_applied: 150,
            order_index: 0,
          },
        ],
        hub_boarding_reservations: [
          hotelReservationCheckedOut({
            hub_appointment_id: TEST_APPOINTMENT_ID,
          }),
        ],
      },
    });

    const openRes = await request(app)
      .post('/api/hub/comandas/open')
      .send({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'appointment',
        origin_id: TEST_APPOINTMENT_ID,
      });

    expect(openRes.status).toBe(201);
    const descriptions = (openRes.body.items as Array<{ description?: string }>).map((it) => it.description ?? '');
    expect(descriptions.some((d) => /hotel|diária/i.test(d))).toBe(true);
  });

  it('reusa comanda de encounter ao abrir pelo agendamento da consulta', async () => {
    const encounterId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
    const existingComandaId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001';
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_appointments: [boardingAppointment({ status: 'done', title: 'Consulta Luke' })],
        hub_appointment_services: [
          {
            id: 'svc-clinic-1',
            appointment_id: TEST_APPOINTMENT_ID,
            hub_service_type_id: TEST_HOTEL_SERVICE_TYPE_ID,
            sale_amount_applied: 190,
            order_index: 0,
          },
        ],
        hub_encounters: [
          {
            id: encounterId,
            clinic_id: TEST_CLINIC_ID,
            hub_appointment_id: TEST_APPOINTMENT_ID,
            status: 'completed',
            deleted_at: null,
            created_at: '2026-06-01T15:00:00.000Z',
          },
        ],
        hub_comandas: [
          {
            id: existingComandaId,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            guardian_id: TEST_GUARDIAN_ID,
            pet_id: TEST_PET_ID,
            origin_type: 'encounter',
            origin_id: encounterId,
            hub_encounter_id: encounterId,
            status: 'aberta',
            financial_status: 'open',
            subtotal_amount: 190,
            discount_amount: 0,
            total_amount: 190,
            deleted_at: null,
          },
        ],
        hub_comanda_items: [
          {
            id: 'item-enc-1',
            clinic_id: TEST_CLINIC_ID,
            comanda_id: existingComandaId,
            pet_id: TEST_PET_ID,
            item_kind: 'service',
            description: 'Consulta veterinária',
            quantity: 1,
            unit_amount: 190,
            discount_amount: 0,
            line_total: 190,
            origin_type: 'appointment_service',
            sort_order: 0,
          },
        ],
      },
    });

    const openRes = await request(app)
      .post('/api/hub/comandas/open')
      .send({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'appointment',
        origin_id: TEST_APPOINTMENT_ID,
      });

    expect(openRes.status).toBe(200);
    expect(openRes.body.comanda?.id).toBe(existingComandaId);
  });
});
