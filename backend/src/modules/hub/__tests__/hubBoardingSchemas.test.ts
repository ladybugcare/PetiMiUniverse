import {
  calendarQuerySchema,
  createReservationSchema,
  dailyLogSchema,
  dayBoardQuerySchema,
  patchReservationSchema,
  unitSettingsPatchSchema,
} from '../hubBoardingSchemas';
import { TEST_CLINIC_ID, TEST_PET_ID, TEST_UNIT_ID } from '../../../__tests__/helpers/fixtures/boarding';

describe('hubBoardingSchemas', () => {
  describe('dayBoardQuerySchema', () => {
    it('aceita date', () => {
      const r = dayBoardQuerySchema.safeParse({ clinic_id: TEST_CLINIC_ID, date: '2026-06-01' });
      expect(r.success).toBe(true);
    });

    it('aceita from e to', () => {
      const r = dayBoardQuerySchema.safeParse({
        clinic_id: TEST_CLINIC_ID,
        from: '2026-06-01T00:00:00-03:00',
        to: '2026-06-01T23:59:59-03:00',
      });
      expect(r.success).toBe(true);
    });

    it('rejeita sem date nem from/to', () => {
      const r = dayBoardQuerySchema.safeParse({ clinic_id: TEST_CLINIC_ID });
      expect(r.success).toBe(false);
    });
  });

  describe('createReservationSchema', () => {
    it('aceita payload walk-in válido', () => {
      const r = createReservationSchema.safeParse({
        clinic_id: TEST_CLINIC_ID,
        pet_id: TEST_PET_ID,
        mode: 'hotel',
        daily_rate_cents: 15000,
      });
      expect(r.success).toBe(true);
    });

    it('rejeita mode inválido', () => {
      const r = createReservationSchema.safeParse({
        clinic_id: TEST_CLINIC_ID,
        pet_id: TEST_PET_ID,
        mode: 'spa',
      });
      expect(r.success).toBe(false);
    });

    it('rejeita daily_rate_cents negativo', () => {
      const r = createReservationSchema.safeParse({
        clinic_id: TEST_CLINIC_ID,
        pet_id: TEST_PET_ID,
        mode: 'hotel',
        daily_rate_cents: -1,
      });
      expect(r.success).toBe(false);
    });
  });

  describe('patchReservationSchema', () => {
    it('aceita status válido', () => {
      const r = patchReservationSchema.safeParse({
        clinic_id: TEST_CLINIC_ID,
        status: 'checked_in',
      });
      expect(r.success).toBe(true);
    });

    it('rejeita status inválido', () => {
      const r = patchReservationSchema.safeParse({
        clinic_id: TEST_CLINIC_ID,
        status: 'unknown',
      });
      expect(r.success).toBe(false);
    });
  });

  describe('unitSettingsPatchSchema', () => {
    it('aceita slots null (sem limite)', () => {
      const r = unitSettingsPatchSchema.safeParse({
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        hotel_slots: null,
        daycare_slots_per_shift: null,
      });
      expect(r.success).toBe(true);
    });

    it('aceita checkout_cutoff_time HH:MM', () => {
      const r = unitSettingsPatchSchema.safeParse({
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        checkout_cutoff_time: '12:30',
      });
      expect(r.success).toBe(true);
    });

    it('rejeita checkout_cutoff_time inválido', () => {
      const r = unitSettingsPatchSchema.safeParse({
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        checkout_cutoff_time: 'noon',
      });
      expect(r.success).toBe(false);
    });
  });

  describe('dailyLogSchema', () => {
    it('aceita log_date YYYY-MM-DD', () => {
      const r = dailyLogSchema.safeParse({
        clinic_id: TEST_CLINIC_ID,
        log_date: '2026-06-02',
      });
      expect(r.success).toBe(true);
    });

    it('rejeita log_date inválido', () => {
      const r = dailyLogSchema.safeParse({
        clinic_id: TEST_CLINIC_ID,
        log_date: '02/06/2026',
      });
      expect(r.success).toBe(false);
    });
  });

  describe('calendarQuerySchema', () => {
    it('exige from e to em YYYY-MM-DD', () => {
      const r = calendarQuerySchema.safeParse({
        clinic_id: TEST_CLINIC_ID,
        from: '2026-06-01',
        to: '2026-06-30',
      });
      expect(r.success).toBe(true);
    });
  });
});
