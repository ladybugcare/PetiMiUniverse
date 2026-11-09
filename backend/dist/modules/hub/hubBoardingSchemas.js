"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTutorReportSchema = exports.tutorReportQuerySchema = exports.createHandoffSchema = exports.handoffsQuerySchema = exports.opsBoardQuerySchema = exports.patchSpaceSchema = exports.createSpaceSchema = exports.spacesQuerySchema = exports.clinicQuerySchema = exports.clinicBodySchema = exports.createExtraSchema = exports.patchBelongingSchema = exports.createBelongingSchema = exports.BELONGING_CATEGORIES = exports.patchIncidentSchema = exports.createIncidentSchema = exports.INCIDENT_KINDS = exports.batchActivitySchema = exports.executeTaskSchema = exports.createTaskSchema = exports.tasksQuerySchema = exports.publicCareSubmitSchema = exports.carePlanPutSchema = exports.careProfilePutSchema = exports.dailyLogSchema = exports.calendarQuerySchema = exports.occupancyQuerySchema = exports.revertHandoffReadySchema = exports.releaseForHandoffSchema = exports.startCheckoutPrepSchema = exports.unitSettingsPatchSchema = exports.unitSettingsQuerySchema = exports.patchReservationSchema = exports.createReservationSchema = exports.openFromApptSchema = exports.dayBoardQuerySchema = exports.daycarePeriodSchema = exports.uuidStr = void 0;
const zod_1 = require("zod");
const boardingOperational_1 = require("./boardingOperational");
exports.uuidStr = zod_1.z.string().uuid();
const ymd = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser YYYY-MM-DD');
const hm = zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário deve ser HH:MM');
const isoTs = zod_1.z.string().datetime({ offset: true });
exports.daycarePeriodSchema = zod_1.z.enum(['full_day', 'half_day']);
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
    status: zod_1.z.enum(['reserved', 'checked_in']).optional(),
    hub_service_type_id: exports.uuidStr.optional().nullable(),
    daycare_period: exports.daycarePeriodSchema.optional().nullable(),
    daycare_shift_key: zod_1.z.string().max(40).optional().nullable(),
    space_id: exports.uuidStr.optional().nullable(),
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
    hub_service_type_id: exports.uuidStr.optional().nullable(),
    daycare_period: exports.daycarePeriodSchema.optional().nullable(),
    daycare_shift_key: zod_1.z.string().max(40).optional().nullable(),
    space_id: exports.uuidStr.optional().nullable(),
    /** Recalcula daily_rate_cents a partir do serviço/período (ignora valor manual). */
    reprice: zod_1.z.boolean().optional(),
    /** Fazer check-in mesmo acima da capacidade (política "alertar"). */
    force_capacity: zod_1.z.boolean().optional(),
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
    daycare_shifts: zod_1.z
        .array(zod_1.z.object({
        key: zod_1.z.string().min(1).max(40),
        label: zod_1.z.string().min(1).max(60),
        start: hm,
        end: hm,
    }))
        .max(8)
        .optional(),
    recreation_windows: zod_1.z
        .array(zod_1.z.object({ start: hm, end: hm.optional().nullable(), label: zod_1.z.string().max(60).optional().nullable() }))
        .max(12)
        .optional(),
    recreation_capacity: zod_1.z.number().int().positive().nullable().optional(),
    overbooking_policy: zod_1.z.enum(['warn', 'block']).optional(),
    meal_slot_times: zod_1.z
        .object({
        breakfast: hm.optional(),
        lunch: hm.optional(),
        snack: hm.optional(),
        dinner: hm.optional(),
    })
        .optional(),
    block_exit_if_charge_pending: zod_1.z.boolean().optional(),
});
exports.startCheckoutPrepSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
})
    .strict();
exports.releaseForHandoffSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    /** Confirma liberação mesmo com pertences ainda pendentes. */
    force_belongings: zod_1.z.boolean().optional(),
    force_belongings_reason: zod_1.z.string().max(500).optional().nullable(),
})
    .strict();
exports.revertHandoffReadySchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
})
    .strict();
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
// ─── Fichas e plano de cuidados ────────────────────────────────────────────
const looseBlock = zod_1.z.unknown().optional();
exports.careProfilePutSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    feeding: looseBlock,
    medications: looseBlock,
    walks: looseBlock,
    handling: looseBlock,
    notes: zod_1.z.string().max(4000).optional().nullable(),
})
    .strict();
const careBlockKey = zod_1.z.enum(['feeding', 'medications', 'walks', 'handling', 'recreation']);
exports.carePlanPutSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    feeding: looseBlock,
    medications: looseBlock,
    walks: looseBlock,
    handling: looseBlock,
    recreation: looseBlock,
    instructions: zod_1.z.string().max(4000).optional().nullable(),
    confirm_blocks: zod_1.z.array(careBlockKey).optional(),
    /** Grava os blocos informados também na ficha permanente do pet. */
    save_to_profile: zod_1.z.array(careBlockKey.exclude(['recreation'])).optional(),
    /** Marca a resposta do tutor como revisada. */
    tutor_submission_reviewed: zod_1.z.boolean().optional(),
})
    .strict();
exports.publicCareSubmitSchema = zod_1.z
    .object({
    feeding: looseBlock,
    medications: looseBlock,
    walks: looseBlock,
    handling: looseBlock,
    notes: zod_1.z.string().max(2000).optional().nullable(),
    contact_name: zod_1.z.string().max(120).optional().nullable(),
})
    .strict();
// ─── Tarefas ──────────────────────────────────────────────────────────────
exports.tasksQuerySchema = zod_1.z.object({
    clinic_id: exports.uuidStr,
    date: ymd.optional(),
    unit_id: exports.uuidStr.optional(),
    reservation_id: exports.uuidStr.optional(),
});
exports.createTaskSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    kind: zod_1.z.enum(['feeding', 'medication', 'walk', 'recreation', 'custom']).default('custom'),
    title: zod_1.z.string().min(1).max(160),
    scheduled_for: isoTs.optional().nullable(),
    notes: zod_1.z.string().max(1000).optional().nullable(),
})
    .strict();
exports.executeTaskSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    outcome: zod_1.z.enum(['ate_all', 'ate_partial', 'refused', 'given', 'not_given', 'done', 'not_done']).optional(),
    skip: zod_1.z.boolean().optional(),
    undo: zod_1.z.boolean().optional(),
    notes: zod_1.z.string().max(1000).optional().nullable(),
    executed_at: isoTs.optional(),
})
    .strict()
    .refine((d) => d.outcome || d.skip || d.undo, { message: 'Informe o resultado' });
exports.batchActivitySchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    reservation_ids: zod_1.z.array(exports.uuidStr).min(1).max(80),
    kind: zod_1.z.enum(['recreation', 'walk', 'custom']),
    title: zod_1.z.string().max(160).optional().nullable(),
    outcome: zod_1.z.enum(['done', 'not_done']).default('done'),
    notes: zod_1.z.string().max(1000).optional().nullable(),
    executed_at: isoTs.optional(),
})
    .strict();
// ─── Intercorrências, pertences, adicionais ───────────────────────────────
exports.INCIDENT_KINDS = ['health', 'injury', 'behavior', 'feeding', 'elimination', 'escape', 'property', 'other'];
exports.createIncidentSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    kind: zod_1.z.enum(exports.INCIDENT_KINDS),
    severity: zod_1.z.enum(['low', 'medium', 'high']).default('low'),
    description: zod_1.z.string().min(1).max(2000),
    occurred_at: isoTs.optional(),
    action_taken: zod_1.z.string().max(2000).optional().nullable(),
    tutor_notified: zod_1.z.boolean().optional(),
})
    .strict();
exports.patchIncidentSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    status: zod_1.z.enum(['open', 'resolved']).optional(),
    resolution_notes: zod_1.z.string().max(2000).optional().nullable(),
    action_taken: zod_1.z.string().max(2000).optional().nullable(),
    tutor_notified: zod_1.z.boolean().optional(),
    severity: zod_1.z.enum(['low', 'medium', 'high']).optional(),
})
    .strict();
exports.BELONGING_CATEGORIES = ['food', 'medication', 'bed', 'toy', 'leash_collar', 'clothing', 'bowl', 'other'];
exports.createBelongingSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    category: zod_1.z.enum(exports.BELONGING_CATEGORIES).default('other'),
    description: zod_1.z.string().min(1).max(200),
    quantity: zod_1.z.number().int().positive().max(999).default(1),
    notes: zod_1.z.string().max(500).optional().nullable(),
})
    .strict();
exports.patchBelongingSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    category: zod_1.z.enum(exports.BELONGING_CATEGORIES).optional(),
    description: zod_1.z.string().min(1).max(200).optional(),
    quantity: zod_1.z.number().int().positive().max(999).optional(),
    notes: zod_1.z.string().max(500).optional().nullable(),
    checkout_status: zod_1.z.enum(['pending', 'returned', 'missing', 'consumed']).optional(),
})
    .strict();
exports.createExtraSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    hub_service_type_id: exports.uuidStr.optional().nullable(),
    description: zod_1.z.string().min(1).max(200).optional(),
    quantity: zod_1.z.number().positive().max(999).default(1),
    unit_amount_cents: zod_1.z.number().int().min(0).optional(),
    service_date: ymd.optional().nullable(),
})
    .strict()
    .refine((d) => d.hub_service_type_id || (d.description && d.unit_amount_cents != null), {
    message: 'Informe um serviço ou descrição e valor',
});
exports.clinicBodySchema = zod_1.z.object({ clinic_id: exports.uuidStr }).passthrough();
exports.clinicQuerySchema = zod_1.z.object({ clinic_id: exports.uuidStr }).passthrough();
// ─── Acomodações ──────────────────────────────────────────────────────────
exports.spacesQuerySchema = zod_1.z.object({
    clinic_id: exports.uuidStr,
    unit_id: exports.uuidStr.optional(),
    include_inactive: zod_1.z.enum(['true', 'false']).optional(),
});
exports.createSpaceSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    unit_id: exports.uuidStr.optional().nullable(),
    name: zod_1.z.string().min(1).max(80),
    kind: zod_1.z.enum(['kennel', 'suite', 'room', 'yard', 'other']).default('kennel'),
    mode: zod_1.z.enum(['hotel', 'daycare', 'shared']).default('hotel'),
    capacity: zod_1.z.number().int().positive().max(200).default(1),
    notes: zod_1.z.string().max(500).optional().nullable(),
    sort_order: zod_1.z.number().int().optional(),
})
    .strict();
exports.patchSpaceSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    name: zod_1.z.string().min(1).max(80).optional(),
    kind: zod_1.z.enum(['kennel', 'suite', 'room', 'yard', 'other']).optional(),
    mode: zod_1.z.enum(['hotel', 'daycare', 'shared']).optional(),
    capacity: zod_1.z.number().int().positive().max(200).optional(),
    notes: zod_1.z.string().max(500).optional().nullable(),
    active: zod_1.z.boolean().optional(),
    sort_order: zod_1.z.number().int().optional(),
})
    .strict();
// ─── Painel, passagem de turno, relatório ao tutor ────────────────────────
exports.opsBoardQuerySchema = zod_1.z.object({
    clinic_id: exports.uuidStr,
    unit_id: exports.uuidStr.optional(),
    date: ymd.optional(),
});
exports.handoffsQuerySchema = zod_1.z.object({
    clinic_id: exports.uuidStr,
    unit_id: exports.uuidStr.optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(50).optional(),
});
exports.createHandoffSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    unit_id: exports.uuidStr.optional().nullable(),
    shift_label: zod_1.z.string().max(60).optional().nullable(),
    notes: zod_1.z.string().max(4000).optional().nullable(),
})
    .strict();
exports.tutorReportQuerySchema = zod_1.z.object({
    clinic_id: exports.uuidStr,
    kind: zod_1.z.enum(['daily', 'stay_summary', 'pickup']).default('daily'),
    date: ymd.optional(),
});
exports.createTutorReportSchema = zod_1.z
    .object({
    clinic_id: exports.uuidStr,
    kind: zod_1.z.enum(['daily', 'stay_summary', 'pickup']),
    report_date: ymd.optional().nullable(),
    body: zod_1.z.string().min(1).max(6000),
    channel: zod_1.z.enum(['whatsapp', 'copy']).default('whatsapp'),
})
    .strict();
