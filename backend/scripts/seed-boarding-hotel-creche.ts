/**
 * Seed: cenários de Hotel e Creche no painel do dia (hoje).
 *
 * Hotel:
 * - 1 reservado (chegada hoje) — aparece na fila para check-in
 * - 1 check-in em andamento (estadia multi-dia cobrindo hoje) + log diário
 * - 1 check-out hoje
 * - 1 agendamento sem reserva (para testar «Abrir reserva»)
 * - 1 atrasado (check-in com saída prevista no passado)
 *
 * Creche:
 * - 1 reservada (turno de hoje)
 * - 1 check-in no turno de hoje
 * - 1 walk-in (reserva sem agendamento)
 *
 * Também configura capacidade da unidade (vagas hotel / creche).
 *
 * A cada execução, soft-deleta o que o seed criou antes e remonta o cenário.
 *
 * Uso (na pasta backend):
 *   npm run seed:hotel-creche
 *
 * Opcional:
 *   SEED_CLINIC_ID=…  SEED_UNIT_ID=…
 */
import { supabaseAdmin } from '../src/config/supabase';

const clinicId = process.env.SEED_CLINIC_ID || '0429cf37-6bcd-4179-82c3-e97a881dd1ac';
const unitId = process.env.SEED_UNIT_ID || 'ecac77a0-7bb2-4571-9f71-70faafd482f3';

const MARKER = 'seed-hotel-creche';
const PREFIX = '[Demo Hotel]';

type Mode = 'hotel' | 'daycare';
type Stage = 'reserved' | 'checked_in' | 'checked_out' | 'appointment_only';

type Scenario = {
  label: string;
  mode: Mode;
  stage: Stage;
  pet: { name: string; breed: string; size_tier: string; coat_type: string; sex: 'M' | 'F' };
  /** Check-in esperado: dias relativos a hoje (SP) + hora local. */
  checkIn: { dayOffset: number; hour: number; minute?: number };
  checkOut: { dayOffset: number; hour: number; minute?: number };
  /** Se true, cria reserva sem hub_appointment_id (walk-in). */
  walkIn?: boolean;
  dailyRateCents?: number;
  withDailyLog?: boolean;
  note?: string;
};

const SCENARIOS: Scenario[] = [
  // ── Hotel ──────────────────────────────────────────────────────────────
  {
    label: 'Hotel reservado (chegada hoje)',
    mode: 'hotel',
    stage: 'reserved',
    pet: { name: `${PREFIX} Max`, breed: 'Labrador', size_tier: 'grande', coat_type: 'curto', sex: 'M' },
    checkIn: { dayOffset: 0, hour: 14, minute: 0 },
    checkOut: { dayOffset: 3, hour: 11, minute: 0 },
    dailyRateCents: 14000,
    note: 'Chegada prevista à tarde.',
  },
  {
    label: 'Hotel em estadia (check-in)',
    mode: 'hotel',
    stage: 'checked_in',
    pet: { name: `${PREFIX} Mel`, breed: 'Golden Retriever', size_tier: 'grande', coat_type: 'medio', sex: 'F' },
    checkIn: { dayOffset: -2, hour: 10, minute: 0 },
    checkOut: { dayOffset: 2, hour: 11, minute: 0 },
    dailyRateCents: 15000,
    withDailyLog: true,
    note: 'Gosta de passeio longo pela manhã.',
  },
  {
    label: 'Hotel check-out hoje',
    mode: 'hotel',
    stage: 'checked_out',
    pet: { name: `${PREFIX} Toby`, breed: 'Beagle', size_tier: 'medio', coat_type: 'curto', sex: 'M' },
    checkIn: { dayOffset: -3, hour: 9, minute: 0 },
    checkOut: { dayOffset: 0, hour: 10, minute: 30 },
    dailyRateCents: 12000,
    note: 'Saída pela manhã.',
  },
  {
    label: 'Hotel agendado sem reserva',
    mode: 'hotel',
    stage: 'appointment_only',
    pet: { name: `${PREFIX} Nina`, breed: 'Border Collie', size_tier: 'medio', coat_type: 'medio', sex: 'F' },
    checkIn: { dayOffset: 0, hour: 16, minute: 0 },
    checkOut: { dayOffset: 4, hour: 11, minute: 0 },
    note: 'Use «Abrir reserva» no painel.',
  },
  {
    label: 'Hotel atrasado (checkout vencido)',
    mode: 'hotel',
    stage: 'checked_in',
    pet: { name: `${PREFIX} Zeus`, breed: 'Rottweiler', size_tier: 'grande', coat_type: 'curto', sex: 'M' },
    checkIn: { dayOffset: -5, hour: 10, minute: 0 },
    checkOut: { dayOffset: -1, hour: 12, minute: 0 },
    dailyRateCents: 16000,
    note: 'Checkout previsto ontem — aparece como atrasado.',
  },
  // ── Creche ─────────────────────────────────────────────────────────────
  {
    label: 'Creche reservada (hoje)',
    mode: 'daycare',
    stage: 'reserved',
    pet: { name: `${PREFIX} Lola`, breed: 'Poodle', size_tier: 'pequeno', coat_type: 'longo', sex: 'F' },
    checkIn: { dayOffset: 0, hour: 8, minute: 0 },
    checkOut: { dayOffset: 0, hour: 18, minute: 0 },
    dailyRateCents: 8500,
    note: 'Turno integral.',
  },
  {
    label: 'Creche em check-in',
    mode: 'daycare',
    stage: 'checked_in',
    pet: { name: `${PREFIX} Pipoca`, breed: 'Spitz Alemão', size_tier: 'mini', coat_type: 'longo', sex: 'F' },
    checkIn: { dayOffset: 0, hour: 8, minute: 30 },
    checkOut: { dayOffset: 0, hour: 17, minute: 30 },
    dailyRateCents: 8500,
    withDailyLog: true,
    note: 'Já entrou hoje de manhã.',
  },
  {
    label: 'Creche walk-in',
    mode: 'daycare',
    stage: 'checked_in',
    walkIn: true,
    pet: { name: `${PREFIX} Duque`, breed: 'SRD', size_tier: 'medio', coat_type: 'curto', sex: 'M' },
    checkIn: { dayOffset: 0, hour: 9, minute: 0 },
    checkOut: { dayOffset: 0, hour: 17, minute: 0 },
    dailyRateCents: 8500,
    note: 'Entrada avulsa sem agendamento.',
  },
];

const APPOINTMENT_STATUS: Record<Exclude<Stage, 'appointment_only'>, string> = {
  reserved: 'confirmed',
  checked_in: 'in_progress',
  checked_out: 'done',
};

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: sem retorno`);
  return res.data;
}

/** YYYY-MM-DD em America/Sao_Paulo. */
function ymdSaoPaulo(dayOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** ISO com offset fixo -03:00 (horário de Brasília). */
function slotBr(dayOffset: number, hour: number, minute = 0): string {
  const ymd = ymdSaoPaulo(dayOffset);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${ymd}T${hh}:${mm}:00-03:00`;
}

function appointmentKind(mode: Mode): 'hotel_stay' | 'daycare_block' {
  return mode === 'daycare' ? 'daycare_block' : 'hotel_stay';
}

async function cleanupPrevious() {
  const now = new Date().toISOString();

  const { data: oldAppts } = await supabaseAdmin
    .from('hub_appointments')
    .select('id')
    .eq('clinic_id', clinicId)
    .like('notes', `%${MARKER}%`)
    .is('deleted_at', null);
  const apptIds = (oldAppts ?? []).map((a: { id: string }) => a.id);

  const { data: oldRsvByNotes } = await supabaseAdmin
    .from('hub_boarding_reservations')
    .select('id')
    .eq('clinic_id', clinicId)
    .like('notes', `%${MARKER}%`)
    .is('deleted_at', null);

  let rsvIds = new Set((oldRsvByNotes ?? []).map((r: { id: string }) => r.id));

  if (apptIds.length > 0) {
    const { data: rsvByAppt } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select('id')
      .eq('clinic_id', clinicId)
      .in('hub_appointment_id', apptIds)
      .is('deleted_at', null);
    for (const r of rsvByAppt ?? []) rsvIds.add((r as { id: string }).id);
  }

  if (rsvIds.size > 0) {
    await supabaseAdmin
      .from('hub_boarding_reservations')
      .update({ deleted_at: now })
      .in('id', [...rsvIds]);
  }

  if (apptIds.length > 0) {
    await supabaseAdmin
      .from('hub_appointments')
      .update({ deleted_at: now })
      .in('id', apptIds);
  }

  console.log(
    `Limpeza: ${apptIds.length} agendamento(s) e ${rsvIds.size} reserva(s) anterior(es) do seed removido(s).`,
  );
}

async function ensureServiceType(
  group: 'hotel' | 'creche',
  preferredCodes: string[],
  createSpec: { code: string; name: string; sale_amount: number; agenda_color: string },
): Promise<{ id: string; name: string }> {
  const rows = must(
    await supabaseAdmin
      .from('hub_service_types')
      .select('id, name, code')
      .eq('clinic_id', clinicId)
      .eq('service_group', group)
      .eq('is_addon', false)
      .is('deleted_at', null),
    `tipos ${group}`,
  ) as { id: string; name: string; code: string }[];

  for (const code of preferredCodes) {
    const hit = rows.find((r) => r.code === code);
    if (hit) return hit;
  }
  if (rows[0]) return rows[0];

  const created = must(
    await supabaseAdmin
      .from('hub_service_types')
      .insert({
        clinic_id: clinicId,
        code: createSpec.code,
        name: createSpec.name,
        service_group: group,
        sale_amount: createSpec.sale_amount,
        cost_amount: Math.round(createSpec.sale_amount * 0.3),
        allow_scheduling: true,
        is_addon: false,
        agenda_color: createSpec.agenda_color,
        internal_notes: MARKER,
      })
      .select('id, name')
      .single(),
    `criar tipo ${group}`,
  ) as { id: string; name: string };
  console.log(`Tipo de serviço criado (${group}):`, created.name);
  return created;
}

async function ensureUnitSettings() {
  const { data, error } = await supabaseAdmin
    .from('hub_unit_boarding_settings')
    .upsert(
      {
        unit_id: unitId,
        clinic_id: clinicId,
        hotel_slots: 8,
        daycare_slots_per_shift: 12,
        checkout_cutoff_time: '12:00:00',
      },
      { onConflict: 'unit_id' },
    )
    .select('unit_id, hotel_slots, daycare_slots_per_shift, checkout_cutoff_time')
    .single();
  if (error) throw new Error(`config unidade: ${error.message}`);
  console.log(
    `Capacidade: hotel=${data.hotel_slots} vagas, creche=${data.daycare_slots_per_shift}/turno, corte checkout=${data.checkout_cutoff_time}`,
  );
}

async function ensureStaff(): Promise<{ id: string; full_name: string }> {
  const name = `${PREFIX} Rita Recreadora`;
  const { data: existing } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id, full_name')
    .eq('clinic_id', clinicId)
    .eq('full_name', name)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return existing as { id: string; full_name: string };

  const created = must(
    await supabaseAdmin
      .from('hub_staff_members')
      .insert({
        clinic_id: clinicId,
        full_name: name,
        job_title: 'Recreador(a)',
        professional_kind: 'other',
        active: true,
        accepts_appointments: true,
        default_unit_id: unitId,
        operational_areas: ['hotel_creche'],
        agenda_color: '#1565c0',
        internal_notes: MARKER,
      })
      .select('id, full_name')
      .single(),
    'recreadora',
  ) as { id: string; full_name: string };
  console.log('Equipe criada:', created.full_name);
  return created;
}

async function ensureGuardian(): Promise<string> {
  const name = `${PREFIX} Camila Borges`;
  const { data: existing } = await supabaseAdmin
    .from('hub_guardians')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('full_name', name)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const created = must(
    await supabaseAdmin
      .from('hub_guardians')
      .insert({
        clinic_id: clinicId,
        full_name: name,
        phone: '11988770011',
        email: 'camila.hotel.demo@example.com',
        notes: MARKER,
        client_status: 'active',
      })
      .select('id')
      .single(),
    'tutora',
  ) as { id: string };
  console.log('Tutora criada:', name);
  return created.id;
}

async function ensurePet(spec: Scenario['pet'], guardianId: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('hub_pets')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('name', spec.name)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const pet = must(
    await supabaseAdmin
      .from('hub_pets')
      .insert({ clinic_id: clinicId, species: 'Cão', notes: MARKER, ...spec })
      .select('id')
      .single(),
    `pet ${spec.name}`,
  ) as { id: string };

  must(
    await supabaseAdmin
      .from('hub_pet_guardians')
      .insert({ pet_id: pet.id, guardian_id: guardianId, role: 'primary' })
      .select('id')
      .single(),
    `vínculo ${spec.name}`,
  );
  return pet.id;
}

async function insertDailyLog(reservationId: string, staffId: string, mood: string, notes: string) {
  const logDate = ymdSaoPaulo(0);
  const { error } = await supabaseAdmin.from('hub_boarding_daily_logs').upsert(
    {
      clinic_id: clinicId,
      hub_boarding_reservation_id: reservationId,
      log_date: logDate,
      fed: { done: true },
      medication: { done: false },
      walks: { done: true, count: 2 },
      mood,
      notes: `${MARKER} — ${notes}`,
      created_by_staff_id: staffId,
    },
    { onConflict: 'hub_boarding_reservation_id,log_date' },
  );
  if (error) console.log(`Aviso: log diário não criado (${error.message}).`);
  else console.log(`  · log diário de hoje (${logDate})`);
}

async function main() {
  console.log(`Clínica: ${clinicId}`);
  console.log(`Unidade: ${unitId}`);
  console.log(`Marcador: ${MARKER}`);
  console.log(`Hoje (SP): ${ymdSaoPaulo(0)}`);

  await cleanupPrevious();

  const hotelType = await ensureServiceType('hotel', ['hotel_daycare', 'diaria_hotel_showcase'], {
    code: 'hotel_seed',
    name: 'Diária de hotel',
    sale_amount: 140,
    agenda_color: '#1565c0',
  });
  const crecheType = await ensureServiceType('creche', ['creche_showcase', 'creche'], {
    code: 'creche_seed',
    name: 'Creche (diária)',
    sale_amount: 85,
    agenda_color: '#00897b',
  });
  console.log(`Serviços: hotel=${hotelType.name}, creche=${crecheType.name}`);

  await ensureUnitSettings();
  const staff = await ensureStaff();
  const guardianId = await ensureGuardian();

  console.log('\nCenários:');
  for (const sc of SCENARIOS) {
    const petId = await ensurePet(sc.pet, guardianId);
    const serviceType = sc.mode === 'daycare' ? crecheType : hotelType;
    const startsAt = slotBr(sc.checkIn.dayOffset, sc.checkIn.hour, sc.checkIn.minute ?? 0);
    const endsAt = slotBr(sc.checkOut.dayOffset, sc.checkOut.hour, sc.checkOut.minute ?? 0);
    const kind = appointmentKind(sc.mode);
    const notes = `${MARKER} — ${sc.label}${sc.note ? ` · ${sc.note}` : ''}`;

    let appointmentId: string | null = null;

    if (!sc.walkIn) {
      const apptStatus =
        sc.stage === 'appointment_only' ? 'confirmed' : APPOINTMENT_STATUS[sc.stage];
      const appt = must(
        await supabaseAdmin
          .from('hub_appointments')
          .insert({
            clinic_id: clinicId,
            unit_id: unitId,
            hub_service_type_id: serviceType.id,
            hub_staff_member_id: staff.id,
            pet_id: petId,
            guardian_id: guardianId,
            starts_at: startsAt,
            ends_at: endsAt,
            status: apptStatus,
            appointment_kind: kind,
            title: `${serviceType.name} · ${sc.pet.name}`,
            notes,
          })
          .select('id')
          .single(),
        `agendamento ${sc.pet.name}`,
      ) as { id: string };
      appointmentId = appt.id;

      const durationMin = Math.max(
        30,
        Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000),
      );
      const { error: lineErr } = await supabaseAdmin.from('hub_appointment_services').insert({
        appointment_id: appt.id,
        hub_service_type_id: serviceType.id,
        duration_minutes: Math.min(durationMin, 24 * 60),
        order_index: 0,
      });
      if (lineErr) console.log(`Aviso: linha de serviço de ${sc.pet.name} não criada (${lineErr.message}).`);
    }

    if (sc.stage !== 'appointment_only') {
      const checkedInAt = sc.stage === 'reserved' ? null : startsAt;
      const checkedOutAt = sc.stage === 'checked_out' ? endsAt : null;
      const rsv = must(
        await supabaseAdmin
          .from('hub_boarding_reservations')
          .insert({
            clinic_id: clinicId,
            unit_id: unitId,
            pet_id: petId,
            guardian_id: guardianId,
            hub_appointment_id: appointmentId,
            mode: sc.mode,
            status: sc.stage,
            expected_check_in: startsAt,
            expected_check_out: endsAt,
            checked_in_at: checkedInAt,
            checked_out_at: checkedOutAt,
            daily_rate_cents: sc.dailyRateCents ?? null,
            notes,
          })
          .select('id')
          .single(),
        `reserva ${sc.pet.name}`,
      ) as { id: string };

      if (sc.withDailyLog && sc.stage === 'checked_in') {
        await insertDailyLog(
          rsv.id,
          staff.id,
          sc.mode === 'daycare' ? 'animada' : 'tranquilo',
          sc.note ?? sc.label,
        );
      }
    }

    const modeLabel = sc.mode === 'daycare' ? 'creche' : 'hotel';
    const stageLabel =
      sc.stage === 'appointment_only'
        ? 'só agenda'
        : sc.walkIn
          ? `${sc.stage} (walk-in)`
          : sc.stage;
    console.log(`  ${sc.pet.name.padEnd(24)} ${modeLabel.padEnd(7)} ${stageLabel}`);
  }

  console.log(`\nPronto. Abra /hub/hotel-creche na unidade de teste.`);
  console.log(`Profissional: ${staff.full_name}.`);
  console.log('Abas Hotel e Creche devem listar os cenários de hoje.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
