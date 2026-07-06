import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase.js';

const uuidStr = z.string().uuid();

const patientContextQuerySchema = z.object({
  clinic_id: uuidStr,
  pet_id: uuidStr.optional(),
  encounter_id: uuidStr.optional(),
  appointment_id: uuidStr.optional(),
});

const PET_SELECT =
  'id, name, species, breed, sex, birth_date, size_tier, coat_type, notes';

/** GET /clinical/cockpit/patient-context */
export async function getHubVetCockpitPatientContext(req: Request, res: Response) {
  try {
    const parsed = patientContextQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, pet_id, encounter_id, appointment_id } = parsed.data;

    let resolvedPetId = pet_id ?? null;
    let resolvedGuardianId: string | null = null;
    let chiefComplaint: string | null = null;
    let encounterRow: Record<string, unknown> | null = null;
    let appointmentRow: Record<string, unknown> | null = null;

    if (encounter_id) {
      const { data: enc, error: encErr } = await supabaseAdmin
        .from('hub_encounters')
        .select(
          'id, pet_id, guardian_id, chief_complaint, summary_notes, hub_case_id, status, operational_phase, physical_exam, hub_appointment_id',
        )
        .eq('id', encounter_id)
        .eq('clinic_id', clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (encErr) return res.status(500).json({ error: encErr.message });
      if (!enc) return res.status(404).json({ error: 'Atendimento não encontrado' });
      encounterRow = enc as Record<string, unknown>;
      resolvedPetId = (enc.pet_id as string | null) ?? resolvedPetId;
      resolvedGuardianId = (enc.guardian_id as string | null) ?? null;
      chiefComplaint = (enc.chief_complaint as string | null) ?? null;
    }

    if (appointment_id) {
      const { data: appt, error: apptErr } = await supabaseAdmin
        .from('hub_appointments')
        .select('id, pet_id, guardian_id, title, notes, status, appointment_kind, starts_at')
        .eq('id', appointment_id)
        .eq('clinic_id', clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (apptErr) return res.status(500).json({ error: apptErr.message });
      appointmentRow = appt as Record<string, unknown> | null;
      if (appt) {
        resolvedPetId = resolvedPetId ?? (appt.pet_id as string | null);
        resolvedGuardianId = resolvedGuardianId ?? (appt.guardian_id as string | null);
        if (!chiefComplaint) {
          chiefComplaint = (appt.notes as string | null) ?? (appt.title as string | null);
        }
      }
    }

    if (!resolvedPetId) {
      return res.status(400).json({ error: 'pet_id ou encounter/appointment com pet é obrigatório' });
    }

    const [
      petRes,
      guardianRes,
      flagsRes,
      casesRes,
      encountersRes,
      examsRes,
      rxRes,
      vacRes,
      hospRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('hub_pets')
        .select(PET_SELECT)
        .eq('id', resolvedPetId)
        .eq('clinic_id', clinic_id)
        .is('deleted_at', null)
        .maybeSingle(),
      resolvedGuardianId
        ? supabaseAdmin
            .from('hub_guardians')
            .select('id, full_name, phone')
            .eq('id', resolvedGuardianId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from('hub_pet_clinical_flags')
        .select('id, flag_key, label, notes')
        .eq('clinic_id', clinic_id)
        .eq('pet_id', resolvedPetId)
        .eq('active', true)
        .is('deleted_at', null),
      supabaseAdmin
        .from('hub_clinical_cases')
        .select('id, title, status, opened_at, summary')
        .eq('clinic_id', clinic_id)
        .eq('pet_id', resolvedPetId)
        .in('status', ['active', 'monitoring'])
        .is('deleted_at', null)
        .order('opened_at', { ascending: false })
        .limit(5),
      supabaseAdmin
        .from('hub_encounters')
        .select('id, chief_complaint, status, started_at, completed_at')
        .eq('clinic_id', clinic_id)
        .eq('pet_id', resolvedPetId)
        .is('deleted_at', null)
        .order('started_at', { ascending: false })
        .limit(3),
      supabaseAdmin
        .from('hub_clinical_exams')
        .select('id, exam_type, status, requested_at, result_at, result_text')
        .eq('clinic_id', clinic_id)
        .eq('pet_id', resolvedPetId)
        .is('deleted_at', null)
        .order('requested_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('hub_prescriptions')
        .select('id, status, prescribed_at')
        .eq('clinic_id', clinic_id)
        .eq('pet_id', resolvedPetId)
        .in('status', ['active', 'issued', 'draft'])
        .is('deleted_at', null)
        .order('prescribed_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('hub_vaccinations')
        .select('id, vaccine_name, administered_at, batch_number')
        .eq('clinic_id', clinic_id)
        .eq('pet_id', resolvedPetId)
        .is('deleted_at', null)
        .order('administered_at', { ascending: false })
        .limit(5),
      supabaseAdmin
        .from('hub_hospitalizations')
        .select('id, status, admitted_at, hub_hospital_beds(code, label)')
        .eq('clinic_id', clinic_id)
        .eq('pet_id', resolvedPetId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle(),
    ]);

    if (petRes.error) return res.status(500).json({ error: petRes.error.message });
    if (!petRes.data) return res.status(404).json({ error: 'Pet não encontrado' });

    const exams = examsRes.data ?? [];
    const examsGrouped = {
      requested: exams.filter((e) => e.status === 'requested'),
      awaiting: exams.filter((e) => ['collected', 'sent'].includes(String(e.status))),
      available: exams.filter((e) => ['result_received', 'completed'].includes(String(e.status))),
    };

    const physicalExam = (encounterRow?.physical_exam ?? {}) as Record<string, unknown>;
    const weightKg = physicalExam.weight_kg ?? null;

    const activeCase = (casesRes.data ?? [])[0] ?? null;
    const draftPrescriptions = (rxRes.data ?? []).filter((r) => r.status === 'draft');

    return res.json({
      pet: petRes.data,
      guardian: guardianRes.data ?? null,
      chief_complaint: chiefComplaint,
      weight_kg: weightKg,
      flags: flagsRes.data ?? [],
      active_case: activeCase,
      cases: casesRes.data ?? [],
      recent_encounters: encountersRes.data ?? [],
      recent_exams: exams.slice(0, 5),
      exams_grouped: examsGrouped,
      active_prescriptions: (rxRes.data ?? []).filter((r) => r.status === 'active' || r.status === 'issued'),
      draft_prescriptions_count: draftPrescriptions.length,
      recent_vaccinations: vacRes.data ?? [],
      active_hospitalization: hospRes.data ?? null,
      encounter: encounterRow
        ? {
            id: encounterRow.id,
            status: encounterRow.status,
            operational_phase: encounterRow.operational_phase ?? null,
            hub_case_id: encounterRow.hub_case_id ?? null,
          }
        : null,
      appointment: appointmentRow
        ? {
            id: appointmentRow.id,
            status: appointmentRow.status,
            appointment_kind: appointmentRow.appointment_kind,
            starts_at: appointmentRow.starts_at,
          }
        : null,
    });
  } catch (e: unknown) {
    console.error('getHubVetCockpitPatientContext', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar contexto do paciente' });
  }
}
