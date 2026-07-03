"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyLogSchema = exports.calendarQuerySchema = exports.occupancyQuerySchema = exports.unitSettingsPatchSchema = exports.unitSettingsQuerySchema = exports.patchReservationSchema = exports.createReservationSchema = exports.openFromApptSchema = exports.dayBoardQuerySchema = exports.uuidStr = void 0;
const zod_1 = require("zod");
const boardingOperational_1 = require("./boardingOperational");
exports.uuidStr = zod_1.z.string().uuid();
exports.dayBoardQuerySchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    from: zod_1.z.string().datetime({ offset: true }).optional(),
    to: zod_1.z.string().datetime({ offset: true }).optional(),
    unit_id: exports.uuidStr.optional(),
    mode: zod_1.z.enum(boardingOperational_1.BOARDING_MODES).optional(),
})
    .refine((d) => (d.from && d.to) || d.date, { message: 'Informe date ou from e to' });
exports.openFromApptSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    hub_appointment_id: exports.uuidStr,
})
    .strict();
exports.createReservationSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    pet_id: exports.uuidStr,
    guardian_id: exports.uuidStr.optional().nullable(),
    unit_id: exports.uuidStr.optional().nullable(),
    mode: zod_1.z.enum(['hotel', 'daycare']),
    expected_check_in: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    expected_check_out: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    daily_rate_cents: zod_1.z.number().int().min(0).optional().nullable(),
    notes: zod_1.z.string().max(2000).optional().nullable(),
})
    .strict();
exports.patchReservationSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    status: zod_1.z.enum(boardingOperational_1.BOARDING_STATUSES).optional(),
    expected_check_in: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    expected_check_out: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    checked_in_at: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    checked_out_at: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    daily_rate_cents: zod_1.z.number().int().min(0).optional().nullable(),
    notes: zod_1.z.string().max(2000).optional().nullable(),
})
    .strict();
exports.unitSettingsQuerySchema = zod_1.z.object({
    clinic_id: exports.uuidStr,
    unit_id: exports.uuidStr.optional(),
});
exports.unitSettingsPatchSchema = zod_1.z.object({
    clinic_id: exports.uuidStr,
    unit_id: exports.uuidStr,
    hotel_slots: zod_1.z.number().int().positive().nullable().optional(),
    daycare_slots_per_shift: zod_1.z.number().int().positive().nullable().optional(),
    checkout_cutoff_time: zod_1.z
        .string()
        .regex(/^\d{2}:\d{2}(:\d{2})?$/)
        .nullable()
        .optional(),
});
exports.occupancyQuerySchema = zod_1.z.object({
    clinic_id: exports.uuidStr,
    unit_id: exports.uuidStr.optional(),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    from: zod_1.z.string().datetime({ offset: true }).optional(),
    to: zod_1.z.string().datetime({ offset: true }).optional(),
    mode: zod_1.z.enum(boardingOperational_1.BOARDING_MODES).optional(),
});
exports.calendarQuerySchema = zod_1.z.object({
    clinic_id: exports.uuidStr,
    unit_id: exports.uuidStr.optional(),
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mode: zod_1.z.enum(boardingOperational_1.BOARDING_MODES).optional(),
});
exports.dailyLogSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    log_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'log_date deve ser YYYY-MM-DD'),
    fed: zod_1.z.unknown().optional(),
    medication: zod_1.z.unknown().optional(),
    walks: zod_1.z.unknown().optional(),
    mood: zod_1.z.string().max(100).optional().nullable(),
    notes: zod_1.z.string().max(2000).optional().nullable(),
    created_by_staff_id: exports.uuidStr.optional().nullable(),
})
    .strict();
