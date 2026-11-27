"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandGroomingAppointmentOriginKeys = expandGroomingAppointmentOriginKeys;
exports.findLinkedGroomingSessionIdForAppointment = findLinkedGroomingSessionIdForAppointment;
exports.fetchGroomingAppointmentLinks = fetchGroomingAppointmentLinks;
const supabase_1 = require("../../config/supabase");
/**
 * Expande chaves `appointment:` ↔ `grooming_session:` quando a sessão
 * está vinculada ao agendamento (hub_appointment_id). Espelha o padrão do hotel.
 */
async function expandGroomingAppointmentOriginKeys(clinicId, keys) {
    if (!keys.size)
        return keys;
    const appointmentIds = [];
    const sessionIds = [];
    for (const key of keys) {
        if (key.startsWith('appointment:')) {
            appointmentIds.push(key.slice('appointment:'.length));
        }
        else if (key.startsWith('grooming_session:')) {
            sessionIds.push(key.slice('grooming_session:'.length));
        }
    }
    if (appointmentIds.length) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select('id, hub_appointment_id')
            .eq('clinic_id', clinicId)
            .in('hub_appointment_id', appointmentIds)
            .is('deleted_at', null);
        if (error)
            throw new Error(error.message);
        for (const row of data ?? []) {
            keys.add(`grooming_session:${row.id}`);
        }
    }
    if (sessionIds.length) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select('id, hub_appointment_id')
            .eq('clinic_id', clinicId)
            .in('id', sessionIds)
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
/** Sessão ativa (não cancelada) ligada ao agendamento — origem canônica do banho. */
async function findLinkedGroomingSessionIdForAppointment(clinicId, appointmentId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_grooming_sessions')
        .select('id, grooming_stage, created_at')
        .eq('clinic_id', clinicId)
        .eq('hub_appointment_id', appointmentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    return data?.id ?? null;
}
/** Mapa sessão → agendamento (e o inverso) para alias de billing no day-board. */
async function fetchGroomingAppointmentLinks(clinicId, opts) {
    const appointmentBySessionId = new Map();
    const sessionIdsByAppointmentId = new Map();
    const sessionIds = opts.sessionIds ?? [];
    const appointmentIds = opts.appointmentIds ?? [];
    if (!sessionIds.length && !appointmentIds.length) {
        return { appointmentBySessionId, sessionIdsByAppointmentId };
    }
    const rows = [];
    if (sessionIds.length) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select('id, hub_appointment_id')
            .eq('clinic_id', clinicId)
            .in('id', sessionIds)
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
            .from('hub_grooming_sessions')
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
        appointmentBySessionId.set(row.id, apptId);
        const list = sessionIdsByAppointmentId.get(apptId) ?? [];
        if (!list.includes(row.id))
            list.push(row.id);
        sessionIdsByAppointmentId.set(apptId, list);
    }
    return { appointmentBySessionId, sessionIdsByAppointmentId };
}
