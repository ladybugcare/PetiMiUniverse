import { z } from 'zod';
import { BOARDING_MODES, BOARDING_STATUSES } from './boardingOperational';

export const uuidStr = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser YYYY-MM-DD');
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário deve ser HH:MM');
const isoTs = z.string().datetime({ offset: true });
export const daycarePeriodSchema = z.enum(['full_day', 'half_day']);

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
    status: z.enum(['reserved', 'checked_in']).optional(),
    hub_service_type_id: uuidStr.optional().nullable(),
    daycare_period: daycarePeriodSchema.optional().nullable(),
    daycare_shift_key: z.string().max(40).optional().nullable(),
    space_id: uuidStr.optional().nullable(),
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
    hub_service_type_id: uuidStr.optional().nullable(),
    daycare_period: daycarePeriodSchema.optional().nullable(),
    daycare_shift_key: z.string().max(40).optional().nullable(),
    space_id: uuidStr.optional().nullable(),
    /** Recalcula daily_rate_cents a partir do serviço/período (ignora valor manual). */
    reprice: z.boolean().optional(),
    /** Fazer check-in mesmo acima da capacidade (política "alertar"). */
    force_capacity: z.boolean().optional(),
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
  daycare_shifts: z
    .array(
      z.object({
        key: z.string().min(1).max(40),
        label: z.string().min(1).max(60),
        start: hm,
        end: hm,
      }),
    )
    .max(8)
    .optional(),
  recreation_windows: z
    .array(z.object({ start: hm, end: hm.optional().nullable(), label: z.string().max(60).optional().nullable() }))
    .max(12)
    .optional(),
  recreation_capacity: z.number().int().positive().nullable().optional(),
  overbooking_policy: z.enum(['warn', 'block']).optional(),
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

// ─── Fichas e plano de cuidados ────────────────────────────────────────────

const looseBlock = z.unknown().optional();

export const careProfilePutSchema = z
  .object({
    clinic_id: uuidStr,
    feeding: looseBlock,
    medications: looseBlock,
    walks: looseBlock,
    handling: looseBlock,
    notes: z.string().max(4000).optional().nullable(),
  })
  .strict();

const careBlockKey = z.enum(['feeding', 'medications', 'walks', 'handling', 'recreation']);

export const carePlanPutSchema = z
  .object({
    clinic_id: uuidStr,
    feeding: looseBlock,
    medications: looseBlock,
    walks: looseBlock,
    handling: looseBlock,
    recreation: looseBlock,
    instructions: z.string().max(4000).optional().nullable(),
    confirm_blocks: z.array(careBlockKey).optional(),
    /** Grava os blocos informados também na ficha permanente do pet. */
    save_to_profile: z.array(careBlockKey.exclude(['recreation'])).optional(),
    /** Marca a resposta do tutor como revisada. */
    tutor_submission_reviewed: z.boolean().optional(),
  })
  .strict();

export const publicCareSubmitSchema = z
  .object({
    feeding: looseBlock,
    medications: looseBlock,
    walks: looseBlock,
    handling: looseBlock,
    notes: z.string().max(2000).optional().nullable(),
    contact_name: z.string().max(120).optional().nullable(),
  })
  .strict();

// ─── Tarefas ──────────────────────────────────────────────────────────────

export const tasksQuerySchema = z.object({
  clinic_id: uuidStr,
  date: ymd.optional(),
  unit_id: uuidStr.optional(),
  reservation_id: uuidStr.optional(),
});

export const createTaskSchema = z
  .object({
    clinic_id: uuidStr,
    kind: z.enum(['feeding', 'medication', 'walk', 'recreation', 'custom']).default('custom'),
    title: z.string().min(1).max(160),
    scheduled_for: isoTs.optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
  })
  .strict();

export const executeTaskSchema = z
  .object({
    clinic_id: uuidStr,
    outcome: z.enum(['ate_all', 'ate_partial', 'refused', 'given', 'not_given', 'done', 'not_done']).optional(),
    skip: z.boolean().optional(),
    undo: z.boolean().optional(),
    notes: z.string().max(1000).optional().nullable(),
    executed_at: isoTs.optional(),
  })
  .strict()
  .refine((d) => d.outcome || d.skip || d.undo, { message: 'Informe o resultado' });

export const batchActivitySchema = z
  .object({
    clinic_id: uuidStr,
    reservation_ids: z.array(uuidStr).min(1).max(80),
    kind: z.enum(['recreation', 'walk', 'custom']),
    title: z.string().max(160).optional().nullable(),
    outcome: z.enum(['done', 'not_done']).default('done'),
    notes: z.string().max(1000).optional().nullable(),
    executed_at: isoTs.optional(),
  })
  .strict();

// ─── Intercorrências, pertences, adicionais ───────────────────────────────

export const INCIDENT_KINDS = ['health', 'injury', 'behavior', 'feeding', 'elimination', 'escape', 'property', 'other'] as const;

export const createIncidentSchema = z
  .object({
    clinic_id: uuidStr,
    kind: z.enum(INCIDENT_KINDS),
    severity: z.enum(['low', 'medium', 'high']).default('low'),
    description: z.string().min(1).max(2000),
    occurred_at: isoTs.optional(),
    action_taken: z.string().max(2000).optional().nullable(),
    tutor_notified: z.boolean().optional(),
  })
  .strict();

export const patchIncidentSchema = z
  .object({
    clinic_id: uuidStr,
    status: z.enum(['open', 'resolved']).optional(),
    resolution_notes: z.string().max(2000).optional().nullable(),
    action_taken: z.string().max(2000).optional().nullable(),
    tutor_notified: z.boolean().optional(),
    severity: z.enum(['low', 'medium', 'high']).optional(),
  })
  .strict();

export const BELONGING_CATEGORIES = ['food', 'medication', 'bed', 'toy', 'leash_collar', 'clothing', 'bowl', 'other'] as const;

export const createBelongingSchema = z
  .object({
    clinic_id: uuidStr,
    category: z.enum(BELONGING_CATEGORIES).default('other'),
    description: z.string().min(1).max(200),
    quantity: z.number().int().positive().max(999).default(1),
    notes: z.string().max(500).optional().nullable(),
  })
  .strict();

export const patchBelongingSchema = z
  .object({
    clinic_id: uuidStr,
    category: z.enum(BELONGING_CATEGORIES).optional(),
    description: z.string().min(1).max(200).optional(),
    quantity: z.number().int().positive().max(999).optional(),
    notes: z.string().max(500).optional().nullable(),
    checkout_status: z.enum(['pending', 'returned', 'missing', 'consumed']).optional(),
  })
  .strict();

export const createExtraSchema = z
  .object({
    clinic_id: uuidStr,
    hub_service_type_id: uuidStr.optional().nullable(),
    description: z.string().min(1).max(200).optional(),
    quantity: z.number().positive().max(999).default(1),
    unit_amount_cents: z.number().int().min(0).optional(),
    service_date: ymd.optional().nullable(),
  })
  .strict()
  .refine((d) => d.hub_service_type_id || (d.description && d.unit_amount_cents != null), {
    message: 'Informe um serviço ou descrição e valor',
  });

export const clinicBodySchema = z.object({ clinic_id: uuidStr }).passthrough();
export const clinicQuerySchema = z.object({ clinic_id: uuidStr }).passthrough();

// ─── Acomodações ──────────────────────────────────────────────────────────

export const spacesQuerySchema = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr.optional(),
  include_inactive: z.enum(['true', 'false']).optional(),
});

export const createSpaceSchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    name: z.string().min(1).max(80),
    kind: z.enum(['kennel', 'suite', 'room', 'yard', 'other']).default('kennel'),
    mode: z.enum(['hotel', 'daycare', 'shared']).default('hotel'),
    capacity: z.number().int().positive().max(200).default(1),
    notes: z.string().max(500).optional().nullable(),
    sort_order: z.number().int().optional(),
  })
  .strict();

export const patchSpaceSchema = z
  .object({
    clinic_id: uuidStr,
    name: z.string().min(1).max(80).optional(),
    kind: z.enum(['kennel', 'suite', 'room', 'yard', 'other']).optional(),
    mode: z.enum(['hotel', 'daycare', 'shared']).optional(),
    capacity: z.number().int().positive().max(200).optional(),
    notes: z.string().max(500).optional().nullable(),
    active: z.boolean().optional(),
    sort_order: z.number().int().optional(),
  })
  .strict();

// ─── Painel, passagem de turno, relatório ao tutor ────────────────────────

export const opsBoardQuerySchema = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr.optional(),
  date: ymd.optional(),
});

export const handoffsQuerySchema = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const createHandoffSchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    shift_label: z.string().max(60).optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
  })
  .strict();

export const tutorReportQuerySchema = z.object({
  clinic_id: uuidStr,
  kind: z.enum(['daily', 'stay_summary', 'pickup']).default('daily'),
  date: ymd.optional(),
});

export const createTutorReportSchema = z
  .object({
    clinic_id: uuidStr,
    kind: z.enum(['daily', 'stay_summary', 'pickup']),
    report_date: ymd.optional().nullable(),
    body: z.string().min(1).max(6000),
    channel: z.enum(['whatsapp', 'copy']).default('whatsapp'),
  })
  .strict();
