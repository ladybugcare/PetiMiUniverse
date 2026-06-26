import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { buildGroomingDisplayTags } from './groomingPetTags';

const uuidStr = z.string().uuid();

const RESERVATION_SELECT = `
  id, clinic_id, unit_id, pet_id, guardian_id, hub_appointment_id,
  mode, status, expected_check_in, expected_check_out,
  checked_in_at, checked_out_at, daily_rate_cents, notes,
  created_at, updated_at
`;

const DAILY_LOG_SELECT = `
  id, clinic_id, hub_boarding_reservation_id, log_date,
  fed, medication, walks, mood, notes, created_by_staff_id, created_at
`;

function calcNights(checkedInAt: string | null, checkedOutAt: string | null): number {
  if (!checkedInAt) return 0;
  const inMs = new Date(checkedInAt).getTime();
  const outMs = checkedOutAt ? new Date(checkedOutAt).getTime() : Date.now();
  if (isNaN(inMs) || isNaN(outMs)) return 0;
  return Math.max(0, Math.floor((outMs - inMs) / (1000 * 60 * 60 * 24)));
}

// ─── GET /boarding/reservations/:id/drawer ─────────────────────────────────

export const getHubBoardingReservationDrawer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { clinic_id } = req.query as { clinic_id?: string };

    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      return res.status(400).json({ error: 'ID de reserva inválido' });
    }
    const clinicParsed = uuidStr.safeParse(clinic_id);
    if (!clinicParsed.success) return res.status(400).json({ error: 'clinic_id inválido' });

    const { data: reservation, error: rsvErr } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select(RESERVATION_SELECT)
      .eq('id', id)
      .eq('clinic_id', clinicParsed.data)
      .is('deleted_at', null)
      .maybeSingle();
    if (rsvErr) return res.status(500).json({ error: rsvErr.message });
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    const petId = (reservation as { pet_id: string }).pet_id;
    const guardianId = (reservation as { guardian_id: string | null }).guardian_id;
    const checkedInAt = (reservation as { checked_in_at: string | null }).checked_in_at;
    const checkedOutAt = (reservation as { checked_out_at: string | null }).checked_out_at;
    const mode = (reservation as { mode: string }).mode;

    const nightsCount = mode === 'hotel' ? calcNights(checkedInAt, checkedOutAt) : checkedInAt ? 1 : 0;

    const [petRes, guRes, flagsRes, logsRes] = await Promise.all([
      supabaseAdmin
        .from('hub_pets')
        .select('id, name, species, breed, size_tier, birth_date, notes, avatar_url')
        .eq('id', petId)
        .maybeSingle(),
      guardianId
        ? supabaseAdmin
            .from('hub_guardians')
            .select('id, full_name, phone')
            .eq('id', guardianId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin
        .from('hub_pet_clinical_flags')
        .select('pet_id, flag_key, label')
        .eq('clinic_id', clinicParsed.data)
        .eq('pet_id', petId)
        .eq('active', true)
        .is('deleted_at', null),
      supabaseAdmin
        .from('hub_boarding_daily_logs')
        .select(DAILY_LOG_SELECT)
        .eq('hub_boarding_reservation_id', id)
        .eq('clinic_id', clinicParsed.data)
        .order('log_date', { ascending: false }),
    ]);

    if (petRes.error) return res.status(500).json({ error: petRes.error.message });

    const pet = petRes.data;
    const flags = (flagsRes.data ?? []).map((f: { flag_key: unknown; label: unknown }) => ({
      flag_key: String(f.flag_key),
      label: String(f.label || ''),
    }));
    const clinicalTags = buildGroomingDisplayTags(flags, (pet as { notes?: string | null } | null)?.notes ?? null);
    const dailyLogs = logsRes.data ?? [];

    return res.json({
      reservation,
      pet: pet ?? null,
      guardian: guRes.data ?? null,
      clinical_tags: clinicalTags,
      nights_count: nightsCount,
      daily_logs: dailyLogs,
    });
  } catch (e: unknown) {
    console.error('getHubBoardingReservationDrawer', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar drawer da reserva' });
  }
};

// ─── POST /boarding/reservations/:id/daily-logs ────────────────────────────

const dailyLogSchema = z
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

export const postHubBoardingDailyLog = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      return res.status(400).json({ error: 'ID de reserva inválido' });
    }

    const parsed = dailyLogSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, log_date, ...rest } = parsed.data;

    // Garante que a reserva pertence à clínica
    const { data: rsv, error: rsvErr } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select('id')
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (rsvErr) return res.status(500).json({ error: rsvErr.message });
    if (!rsv) return res.status(404).json({ error: 'Reserva não encontrada' });

    // Upsert: um log por dia por reserva
    const { data: log, error: logErr } = await supabaseAdmin
      .from('hub_boarding_daily_logs')
      .upsert(
        {
          clinic_id,
          hub_boarding_reservation_id: id,
          log_date,
          ...rest,
        },
        { onConflict: 'hub_boarding_reservation_id,log_date', ignoreDuplicates: false },
      )
      .select(DAILY_LOG_SELECT)
      .single();
    if (logErr) return res.status(500).json({ error: logErr.message });

    return res.status(201).json({ log });
  } catch (e: unknown) {
    console.error('postHubBoardingDailyLog', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao salvar relatório diário' });
  }
};
