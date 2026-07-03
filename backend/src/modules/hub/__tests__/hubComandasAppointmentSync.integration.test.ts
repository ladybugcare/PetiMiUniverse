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
  TEST_HOTEL_SERVICE_TYPE_ID,
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
});
