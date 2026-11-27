"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandBoardingAppointmentOriginKeys = expandBoardingAppointmentOriginKeys;
exports.fetchBoardingAppointmentLinks = fetchBoardingAppointmentLinks;
const supabase_1 = require("../../config/supabase");
/**
 * Expande chaves `appointment:` ↔ `boarding_reservation:` quando a reserva
 * está vinculada ao agendamento. Usado no dedupe de unbilled / comandas abertas
 * e no day-board para estadias cobradas via comanda `origin_type=appointment`.
 */
async function expandBoardingAppointmentOriginKeys(clinicId, keys) {
    if (!keys.size)
        return keys;
    const appointmentIds = [];
    const boardingIds = [];
    for (const key of keys) {
        if (key.startsWith('appointment:')) {
            appointmentIds.push(key.slice('appointment:'.length));
        }
        else if (key.startsWith('boarding_reservation:')) {
            boardingIds.push(key.slice('boarding_reservation:'.length));
        }
    }
    if (appointmentIds.length) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('id, hub_appointment_id')
            .eq('clinic_id', clinicId)
            .in('hub_appointment_id', appointmentIds)
            .is('deleted_at', null);
        if (error)
            throw new Error(error.message);
        for (const row of data ?? []) {
            keys.add(`boarding_reservation:${row.id}`);
        }
    }
    if (boardingIds.length) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('id, hub_appointment_id')
            .eq('clinic_id', clinicId)
            .in('id', boardingIds)
            .is('deleted_at', null);
        if (error)
            throw new Error(error.message);
        for (const row of data ?? []) {
            const apptId = row.hub_appointment_id;
            if (apptId)
                keys.add(`appointment:${apptId}`);
        }
    }
    return keys;
}
/** Mapa reserva → agendamento (e o inverso) para alias de billing no day-board. */
async function fetchBoardingAppointmentLinks(clinicId, opts) {
    const appointmentByBoardingId = new Map();
    const boardingIdsByAppointmentId = new Map();
    const boardingIds = opts.boardingIds ?? [];
    const appointmentIds = opts.appointmentIds ?? [];
    if (!boardingIds.length && !appointmentIds.length) {
        return { appointmentByBoardingId, boardingIdsByAppointmentId };
    }
    const rows = [];
    if (boardingIds.length) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('id, hub_appointment_id')
            .eq('clinic_id', clinicId)
            .in('id', boardingIds)
            .is('deleted_at', null);
        if (error)
            throw new Error(error.message);
        for (const row of data ?? []) {
            rows.push({
                id: row.id,
                hub_appointment_id: row.hub_appointment_id ?? null,
            });
        }
    }
    if (appointmentIds.length) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('id, hub_appointment_id')
            .eq('clinic_id', clinicId)
            .in('hub_appointment_id', appointmentIds)
            .is('deleted_at', null);
        if (error)
            throw new Error(error.message);
        for (const row of data ?? []) {
            rows.push({
                id: row.id,
                hub_appointment_id: row.hub_appointment_id ?? null,
            });
        }
    }
    for (const row of rows) {
        const apptId = row.hub_appointment_id;
        if (!apptId)
            continue;
        appointmentByBoardingId.set(row.id, apptId);
        const list = boardingIdsByAppointmentId.get(apptId) ?? [];
        if (!list.includes(row.id))
            list.push(row.id);
        boardingIdsByAppointmentId.set(apptId, list);
    }
    return { appointmentByBoardingId, boardingIdsByAppointmentId };
}
