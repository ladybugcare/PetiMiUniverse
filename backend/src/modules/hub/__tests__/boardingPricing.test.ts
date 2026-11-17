jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule()
);

import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  TEST_APPOINTMENT_ID,
  TEST_CLINIC_ID,
  TEST_HOTEL_SERVICE_TYPE_ID,
  hotelServiceType,
} from '../../../__tests__/helpers/fixtures/boarding';
import { resolveBoardingRateFromAppointment } from '../boardingPricing';

describe('resolveBoardingRateFromAppointment', () => {
  it('usa o snapshot da Agenda (sale_amount_applied) em centavos', async () => {
    configureSupabaseMock({
      tables: {
        hub_appointment_services: [
          {
            appointment_id: TEST_APPOINTMENT_ID,
            hub_service_type_id: TEST_HOTEL_SERVICE_TYPE_ID,
            sale_amount_applied: 150,
          },
        ],
        hub_service_types: [{ ...hotelServiceType(), sale_amount: 150 }],
      },
    });

    const rate = await resolveBoardingRateFromAppointment({
      clinicId: TEST_CLINIC_ID,
      appointmentId: TEST_APPOINTMENT_ID,
      primaryServiceTypeId: TEST_HOTEL_SERVICE_TYPE_ID,
    });

    expect(rate).toEqual({
      daily_rate_cents: 15000,
      hub_service_type_id: TEST_HOTEL_SERVICE_TYPE_ID,
      rate_source: 'appointment',
    });
  });

  it('preserva diária gratuita intencional (sale_amount_applied = 0)', async () => {
    configureSupabaseMock({
      tables: {
        hub_appointment_services: [
          {
            appointment_id: TEST_APPOINTMENT_ID,
            hub_service_type_id: TEST_HOTEL_SERVICE_TYPE_ID,
            sale_amount_applied: 0,
          },
        ],
        hub_service_types: [{ ...hotelServiceType(), sale_amount: 150 }],
      },
    });

    const rate = await resolveBoardingRateFromAppointment({
      clinicId: TEST_CLINIC_ID,
      appointmentId: TEST_APPOINTMENT_ID,
      primaryServiceTypeId: TEST_HOTEL_SERVICE_TYPE_ID,
    });

    expect(rate).toEqual({
      daily_rate_cents: 0,
      hub_service_type_id: TEST_HOTEL_SERVICE_TYPE_ID,
      rate_source: 'appointment',
    });
  });
});
