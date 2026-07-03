import { z } from 'zod';
import { BOARDING_MODES, BOARDING_STATUSES } from './boardingOperational';

export const uuidStr = z.string().uuid();

export const dayBoardQuerySchema = z
  .object({
    clinic_id: uuidStr,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    unit_id: uuidStr.optional(),
    mode: z.enum(BOARDING_MODES).optional(),
  })
  .refine((d) => (d.from && d.to) || d.date, { message: 'Informe date ou from e to' });

export const openFromApptSchema = z
  .object({
    clinic_id: uuidStr,
    hub_appointment_id: uuidStr,
  })
  .strict();

export const createReservationSchema = z
  .object({
    clinic_id: uuidStr,
    pet_id: uuidStr,
    guardian_id: uuidStr.optional().nullable(),
    unit_id: uuidStr.optional().nullable(),
    mode: z.enum(['hotel', 'daycare']),
    expected_check_in: z.string().datetime({ offset: true }).optional().nullable(),
    expected_check_out: z.string().datetime({ offset: true }).optional().nullable(),
    daily_rate_cents: z.number().int().min(0).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .strict();

export const patchReservationSchema = z
  .object({
    clinic_id: uuidStr,
    status: z.enum(BOARDING_STATUSES).optional(),
    expected_check_in: z.string().datetime({ offset: true }).optional().nullable(),
    expected_check_out: z.string().datetime({ offset: true }).optional().nullable(),
    checked_in_at: z.string().datetime({ offset: true }).optional().nullable(),
    checked_out_at: z.string().datetime({ offset: true }).optional().nullable(),
    daily_rate_cents: z.number().int().min(0).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .strict();

export const unitSettingsQuerySchema = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr.optional(),
});

export const unitSettingsPatchSchema = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr,
  hotel_slots: z.number().int().positive().nullable().optional(),
  daycare_slots_per_shift: z.number().int().positive().nullable().optional(),
  checkout_cutoff_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .nullable()
    .optional(),
});

export const occupancyQuerySchema = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  mode: z.enum(BOARDING_MODES).optional(),
});

export const calendarQuerySchema = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(BOARDING_MODES).optional(),
});

export const dailyLogSchema = z
  .object({
    clinic_id: uuidStr,
    log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'log_date deve ser YYYY-MM-DD'),
    fed: z.unknown().optional(),
    medication: z.unknown().optional(),
    walks: z.unknown().optional(),
    mood: z.string().max(100).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    created_by_staff_id: uuidStr.optional().nullable(),
  })
  .strict();
