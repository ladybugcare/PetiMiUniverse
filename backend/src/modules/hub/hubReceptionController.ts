import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { checkPermission } from '../../middleware/authMiddleware';
import { handoffInDay, resolveReceptionHandoff, syncReceptionUnit } from './receptionHandoffService';
import { todayYmdSaoPaulo } from './receptionCustody';

const uuidStr = z.string().uuid();
const dateYmd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const boardQuery = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr,
  date: dateYmd.optional(),
});

function originModule(sourceType: string, kind: string): { key: string; label: string; href: string } {
  if (sourceType === 'grooming_session' || sourceType === 'grooming_event') {
    return { key: 'banho', label: 'Banho & Tosa', href: '/hub/banho-tosa' };
  }
  if (sourceType === 'encounter') {
    return { key: 'clinica', label: 'Clínica', href: '/hub/clinica' };
  }
  if (sourceType === 'hospitalization') {
    return { key: 'internacao', label: 'Internação', href: '/hub/clinica' };
  }
  if (sourceType === 'pickup_stop') {
    return { key: 'leva_traz', label: 'Leva e Traz', href: '/hub/leva-e-traz' };
  }
  if (kind === 'chegada') {
    return { key: 'agenda', label: 'Agenda', href: '/hub/appointments' };
  }
  return { key: 'operacao', label: 'Operação', href: '/hub/recepcao' };
}

async function petHasOpenCharge(clinicId: string, petId: string | null): Promise<boolean> {
  if (!petId) return false;
  const { count, error } = await supabaseAdmin
    .from('hub_comandas')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .in('financial_status', ['open', 'awaiting_balance']);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/** Recupera pet_id pela origem quando o handoff ficou sem pet (ex.: ON DELETE SET NULL). */
async function resolvePetIdFromSource(
  clinicId: string,
  sourceType: string,
  sourceId: string,
): Promise<string | null> {
  const tableBySource: Record<string, string> = {
    appointment: 'hub_appointments',
    grooming_session: 'hub_grooming_sessions',
    grooming_event: 'hub_grooming_session_events',
    encounter: 'hub_encounters',
    hospitalization: 'hub_hospitalizations',
    pickup_stop: 'hub_pickup_stops',
  };
  const table = tableBySource[sourceType];
  if (!table) return null;

  if (sourceType === 'grooming_event') {
    const { data: ev } = await supabaseAdmin
      .from('hub_grooming_session_events')
      .select('hub_grooming_session_id')
      .eq('id', sourceId)
      .maybeSingle();
    const sessionId = ev?.hub_grooming_session_id as string | undefined;
    if (!sessionId) return null;
    const { data: session } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select('pet_id')
      .eq('id', sessionId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    return (session?.pet_id as string | null | undefined) ?? null;
  }

  const { data } = await supabaseAdmin
    .from(table)
    .select('pet_id')
    .eq('id', sourceId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  return (data?.pet_id as string | null | undefined) ?? null;
}

async function staffIdForUser(clinicId: string, userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data: clinicUser } = await supabaseAdmin
    .from('clinic_users')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!clinicUser?.id) return null;
  const { data: staff } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('clinic_user_id', clinicUser.id)
    .is('deleted_at', null)
    .maybeSingle();
  return (staff?.id as string | undefined) ?? null;
}

/** GET /reception/board */
export const getHubReceptionBoard = async (req: Request, res: Response) => {
  try {
    const parsed = boardQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'clinic_id e unit_id são obrigatórios' });
    const day = parsed.data.date || todayYmdSaoPaulo();
    try {
      await syncReceptionUnit(parsed.data.clinic_id, parsed.data.unit_id, day);
    } catch (syncErr) {
      console.error('getHubReceptionBoard sync', syncErr);
    }

    const { data, error } = await supabaseAdmin
      .from('hub_reception_handoffs')
      .select(
        'id, kind, source_type, source_id, status, context, opened_at, resolved_at, resolution, pet_id, guardian_id',
      )
      .eq('clinic_id', parsed.data.clinic_id)
      .eq('unit_id', parsed.data.unit_id)
      .order('opened_at', { ascending: true })
      .limit(300);
    if (error) return res.status(500).json({ error: error.message });

    const dayRows = (data ?? []).filter((row) =>
      handoffInDay(
        {
          status: String(row.status),
          opened_at: String(row.opened_at),
          resolved_at: (row.resolved_at as string | null) ?? null,
        },
        day,
      ),
    );

    const resolvedPetIds = new Map<string, string>();
    await Promise.all(
      dayRows.map(async (row) => {
        const existing = (row.pet_id as string | null) ?? null;
        if (existing) {
          resolvedPetIds.set(row.id as string, existing);
          return;
        }
        const recovered = await resolvePetIdFromSource(
          parsed.data.clinic_id,
          String(row.source_type),
          String(row.source_id),
        );
        if (!recovered) return;
        resolvedPetIds.set(row.id as string, recovered);
        void supabaseAdmin
          .from('hub_reception_handoffs')
          .update({ pet_id: recovered, updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .is('pet_id', null);
      }),
    );

    const petIds = [...new Set([...resolvedPetIds.values()])];
    const guardianIds = [
      ...new Set(dayRows.map((r) => r.guardian_id as string | null).filter((id): id is string => Boolean(id))),
    ];

    const [petsRes, guardiansRes] = await Promise.all([
      petIds.length
        ? supabaseAdmin.from('hub_pets').select('id, name').in('id', petIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }>, error: null }),
      guardianIds.length
        ? supabaseAdmin.from('hub_guardians').select('id, full_name, phone').in('id', guardianIds)
        : Promise.resolve({
            data: [] as Array<{ id: string; full_name: string | null; phone: string | null }>,
            error: null,
          }),
    ]);
    if (petsRes.error) return res.status(500).json({ error: petsRes.error.message });
    if (guardiansRes.error) return res.status(500).json({ error: guardiansRes.error.message });

    const petById = new Map((petsRes.data ?? []).map((p) => [p.id as string, p]));
    const guardianById = new Map((guardiansRes.data ?? []).map((g) => [g.id as string, g]));

    const items = dayRows.map((row) => {
      const petId = resolvedPetIds.get(row.id as string) ?? null;
      const guardianId = (row.guardian_id as string | null) ?? null;
      const petRow = petId ? petById.get(petId) : undefined;
      const guardianRow = guardianId ? guardianById.get(guardianId) : undefined;
      const petName = typeof petRow?.name === 'string' ? petRow.name.trim() : '';
      return {
        id: row.id,
        kind: row.kind,
        source_type: row.source_type,
        source_id: row.source_id,
        status: row.status,
        context: row.context,
        opened_at: row.opened_at,
        resolved_at: row.resolved_at,
        resolution: row.resolution,
        pet: {
          id: petId,
          name: petName || 'Sem nome',
        },
        guardian: guardianRow
          ? {
              id: guardianId,
              full_name: (guardianRow.full_name as string | null)?.trim() || 'Tutor',
              phone: (guardianRow.phone as string | null) ?? null,
            }
          : null,
      };
    });

    return res.json({ date: day, items });
  } catch (e: unknown) {
    console.error('getHubReceptionBoard', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar a recepção' });
  }
};

const resolveBody = z
  .object({
    clinic_id: uuidStr,
    action: z.enum(['entreguei', 'embarquei', 'chegou', 'autorizar', 'dispensar', 'recebi']),
  })
  .strict();

type ReceptionCue = { key: string; label: string; detail?: string };

async function pickupLegsForAppointment(
  clinicId: string,
  appointmentId: string,
): Promise<Array<{ direction: string; status: string; route_id: string | null }>> {
  const { data: legs } = await supabaseAdmin
    .from('hub_appointments')
    .select('id, status')
    .eq('clinic_id', clinicId)
    .eq('parent_appointment_id', appointmentId)
    .eq('appointment_kind', 'pickup_route')
    .is('deleted_at', null);
  if (!legs?.length) return [];
  const legIds = legs.map((l) => l.id as string);
  const { data: stops } = await supabaseAdmin
    .from('hub_pickup_stops')
    .select('hub_appointment_id, direction, status, hub_pickup_route_id')
    .eq('clinic_id', clinicId)
    .in('hub_appointment_id', legIds);
  return (stops ?? []).map((s) => ({
    direction: String(s.direction || ''),
    status: String(s.status || ''),
    route_id: (s.hub_pickup_route_id as string | null) ?? null,
  }));
}

async function buildReceptionCues(opts: {
  clinicId: string;
  kind: string;
  sourceType: string;
  sourceId: string;
  context: Record<string, unknown>;
}): Promise<{
  cues: ReceptionCue[];
  next_step: string | null;
  appointment_id: string | null;
  starts_at: string | null;
  service_name: string | null;
  is_late: boolean;
}> {
  const cues: ReceptionCue[] = [];
  let nextStep: string | null = null;
  let appointmentId =
    typeof opts.context.appointment_id === 'string'
      ? opts.context.appointment_id
      : opts.sourceType === 'appointment'
        ? opts.sourceId
        : null;
  let startsAt: string | null =
    typeof opts.context.starts_at === 'string' ? opts.context.starts_at : null;
  let serviceName: string | null =
    typeof opts.context.label === 'string' ? opts.context.label : null;
  let isLate = false;

  if (opts.kind === 'chegada') {
    if (!appointmentId && opts.sourceType === 'appointment') appointmentId = opts.sourceId;
    let apptStatus: string | null = null;
    if (appointmentId) {
      const { data: appt } = await supabaseAdmin
        .from('hub_appointments')
        .select('id, status, starts_at, hub_service_type_id')
        .eq('id', appointmentId)
        .eq('clinic_id', opts.clinicId)
        .maybeSingle();
      if (appt) {
        apptStatus = String(appt.status);
        startsAt = (appt.starts_at as string | null) ?? startsAt;
        if (appt.hub_service_type_id) {
          const { data: st } = await supabaseAdmin
            .from('hub_service_types')
            .select('name')
            .eq('id', appt.hub_service_type_id as string)
            .maybeSingle();
          if (st?.name) serviceName = String(st.name);
        }
      }
      const legs = await pickupLegsForAppointment(opts.clinicId, appointmentId);
      const pickups = legs.filter((l) => l.direction === 'pickup' && l.status !== 'failed');
      if (pickups.length === 0) {
        cues.push({
          key: 'arrival_tutor',
          label: 'Tutor traz o pet',
          detail: 'Aguarde na recepção. Não há coleta de Leva e Traz para este horário.',
        });
        nextStep = 'Quando o tutor chegar com o pet, registre a chegada.';
      } else if (pickups.some((l) => l.status === 'completed')) {
        cues.push({
          key: 'arrival_pickup_done',
          label: 'Chegada pelo Leva e Traz',
          detail: 'A coleta já foi concluída pelo motorista.',
        });
        nextStep = 'Confirme o recebimento na clínica e encaminhe ao setor.';
      } else if (pickups.some((l) => l.route_id)) {
        cues.push({
          key: 'arrival_pickup_en_route',
          label: 'Motorista traz o pet',
          detail: 'Há coleta de Leva e Traz em andamento ou na rota.',
        });
        nextStep = 'Espere o motorista. Só registre chegada se o pet já estiver na clínica.';
      } else {
        cues.push({
          key: 'arrival_pickup_pending',
          label: 'Leva e Traz previsto',
          detail: 'Há perna de coleta, mas ainda sem rota/motorista.',
        });
        nextStep = 'Confirme com o tutor se virá trazer ou se aguarda o motorista.';
      }
    } else {
      cues.push({ key: 'arrival_tutor', label: 'Tutor traz o pet' });
      nextStep = 'Quando o tutor chegar com o pet, registre a chegada.';
    }
    if (startsAt && new Date(startsAt).getTime() < Date.now() && apptStatus !== 'checked_in') {
      isLate = true;
      cues.push({ key: 'late', label: 'Horário já passou', detail: 'Chegada em atraso em relação à agenda.' });
    }
  } else if (opts.kind === 'retirada_balcao') {
    cues.push({
      key: 'exit_counter',
      label: 'Retirada no balcão',
      detail: 'O tutor busca o pet na recepção.',
    });
    nextStep = 'Confirme a identidade do tutor e entregue o pet.';
    appointmentId =
      typeof opts.context.appointment_id === 'string' ? opts.context.appointment_id : appointmentId;
  } else if (opts.kind === 'embarque') {
    cues.push({
      key: 'exit_board',
      label: 'Embarque / Leva e Traz',
      detail: 'Há devolução prevista, mas ainda sem motorista ou rota pronta.',
    });
    nextStep = 'Prepare o pet para embarcar quando o motorista chegar ou liberar a rota.';
    appointmentId =
      typeof opts.context.appointment_id === 'string' ? opts.context.appointment_id : appointmentId;
    if (appointmentId) {
      const legs = await pickupLegsForAppointment(opts.clinicId, appointmentId);
      const deliveries = legs.filter((l) => l.direction === 'delivery' && l.status !== 'failed');
      if (deliveries.some((l) => l.route_id)) {
        cues.push({
          key: 'exit_wait_driver',
          label: 'Já tem rota',
          detail: 'Há entrega com rota — a recepção só acompanha se o pet ainda estiver aqui.',
        });
      }
    }
  } else if (opts.kind === 'autorizar_extra') {
    const extraName =
      (typeof opts.context.extra_name === 'string' && opts.context.extra_name) ||
      (typeof opts.context.label === 'string' && opts.context.label) ||
      'Serviço extra';
    cues.push({
      key: 'extra',
      label: 'Pedido de extra no salão',
      detail: extraName,
    });
    nextStep = 'Fale com o tutor, autorize o extra ou dispense o pedido.';
  } else if (opts.kind === 'encaminhar') {
    cues.push({
      key: 'route_unknown',
      label: 'Chegou sem setor',
      detail: 'O pet chegou (ex.: motorista), mas o destino operacional não está claro.',
    });
    nextStep =
      'Agende o destino (banho, consulta, hotel…) com o pet já preenchido. Depois disso a tarefa some sozinha; use “Só recebi” só se ainda não for agendar.';
  }

  if (opts.sourceType === 'hospitalization') {
    cues.push({ key: 'discharge', label: 'Alta hospitalar', detail: 'Pet liberado da internação.' });
    if (!nextStep) nextStep = 'Entregue o pet ao tutor ou prepare o embarque.';
  }
  if (opts.sourceType === 'encounter') {
    cues.push({ key: 'consult_done', label: 'Consulta concluída' });
    if (!nextStep) nextStep = 'Pet livre para saída — confirme com o tutor.';
  }

  return {
    cues,
    next_step: nextStep,
    appointment_id: appointmentId,
    starts_at: startsAt,
    service_name: serviceName,
    is_late: isLate,
  };
}

/** GET /reception/handoffs/:id — detalhes operacionais (sem valores financeiros). */
export const getHubReceptionHandoffDetail = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const clinicId = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinicId.success) return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });

    const { data: row, error } = await supabaseAdmin
      .from('hub_reception_handoffs')
      .select(
        'id, kind, source_type, source_id, status, context, opened_at, resolved_at, resolution, pet_id, guardian_id, unit_id',
      )
      .eq('id', id.data)
      .eq('clinic_id', clinicId.data)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!row) return res.status(404).json({ error: 'Tarefa não encontrada' });

    let petId = (row.pet_id as string | null) ?? null;
    const guardianId = (row.guardian_id as string | null) ?? null;
    const unitId = (row.unit_id as string | null) ?? null;

    if (!petId) {
      petId = await resolvePetIdFromSource(clinicId.data, String(row.source_type), String(row.source_id));
      if (petId) {
        void supabaseAdmin
          .from('hub_reception_handoffs')
          .update({ pet_id: petId, updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .is('pet_id', null);
      }
    }

    const [petRes, guardianRes, unitRes] = await Promise.all([
      petId
        ? supabaseAdmin
            .from('hub_pets')
            .select('id, name, species, breed, size_tier, birth_date, coat_type, notes')
            .eq('id', petId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      guardianId
        ? supabaseAdmin
            .from('hub_guardians')
            .select('id, full_name, phone, email')
            .eq('id', guardianId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      unitId
        ? supabaseAdmin.from('units').select('id, name').eq('id', unitId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (petRes.error) return res.status(500).json({ error: petRes.error.message });
    if (guardianRes.error) return res.status(500).json({ error: guardianRes.error.message });
    if (unitRes.error) return res.status(500).json({ error: unitRes.error.message });

    const context = (row.context ?? {}) as Record<string, unknown>;
    const kind = String(row.kind);
    const sourceType = String(row.source_type);
    const origin = originModule(sourceType, kind);
    const ops = await buildReceptionCues({
      clinicId: clinicId.data,
      kind,
      sourceType,
      sourceId: String(row.source_id),
      context,
    });

    let chargePending: boolean | null = null;
    const userId = req.user?.id;
    if (userId) {
      const canSeeCharge =
        (await checkPermission(userId, clinicId.data, 'hub.financial.read')) ||
        (await checkPermission(userId, clinicId.data, 'hub.cash.receive'));
      if (canSeeCharge) {
        chargePending = await petHasOpenCharge(clinicId.data, petId);
      }
    }

    const petRow = petRes.data;
    const guardianRow = guardianRes.data;
    const petName =
      typeof petRow?.name === 'string' && petRow.name.trim() ? petRow.name.trim() : 'Sem nome';

    return res.json({
      id: row.id,
      kind: row.kind,
      source_type: row.source_type,
      source_id: row.source_id,
      status: row.status,
      context: {
        ...context,
        label: ops.service_name || (typeof context.label === 'string' ? context.label : 'Operação'),
        starts_at: ops.starts_at ?? context.starts_at ?? null,
        appointment_id: ops.appointment_id ?? context.appointment_id ?? null,
      },
      opened_at: row.opened_at,
      resolved_at: row.resolved_at,
      resolution: row.resolution,
      unit_id: unitId,
      unit_name: (unitRes.data?.name as string | undefined) ?? null,
      pet: {
        id: (petRow?.id as string | undefined) ?? petId,
        name: petName,
        species: (petRow?.species as string | null | undefined) ?? null,
        breed: (petRow?.breed as string | null | undefined) ?? null,
        size_tier: (petRow?.size_tier as string | null | undefined) ?? null,
        birth_date: (petRow?.birth_date as string | null | undefined) ?? null,
        coat_type: (petRow?.coat_type as string | null | undefined) ?? null,
        /** Coluna opcional (migration 033); não selecionamos para não quebrar bancos sem ela. */
        avatar_url: null,
        notes: (petRow?.notes as string | null | undefined) ?? null,
      },
      guardian: guardianRow
        ? {
            id: guardianRow.id as string,
            full_name: (guardianRow.full_name as string) || 'Tutor',
            phone: (guardianRow.phone as string | null) ?? null,
            email: (guardianRow.email as string | null) ?? null,
          }
        : null,
      origin,
      cues: ops.cues,
      next_step: ops.next_step,
      is_late: ops.is_late,
      charge_pending: chargePending,
    });
  } catch (e: unknown) {
    console.error('getHubReceptionHandoffDetail', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar detalhes' });
  }
};

/** POST /reception/handoffs/:id/resolve */
export const postHubReceptionResolve = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const body = resolveBody.safeParse(req.body);
    if (!id.success || !body.success) return res.status(400).json({ error: 'Dados inválidos' });
    const staffId = await staffIdForUser(body.data.clinic_id, req.user?.id);
    const result = await resolveReceptionHandoff({
      clinicId: body.data.clinic_id,
      handoffId: id.data,
      action: body.data.action,
      staffId,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ ok: true });
  } catch (e: unknown) {
    console.error('postHubReceptionResolve', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao concluir a tarefa' });
  }
};
