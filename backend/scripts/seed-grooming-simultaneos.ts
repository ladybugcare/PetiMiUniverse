/**
 * Seed: vários pets em atendimento ao mesmo tempo no Banho & Tosa (dia de hoje).
 *
 * Cenário montado para a mesma banhista:
 * - 3 pets em atendimento, cada um numa banheira (todas ocupadas);
 * - 2 pets aguardando na fila (iniciar um deles mostra «Iniciar sem alocar»);
 * - 1 pet agendado para mais tarde;
 * - 1 pet já pronto (banheira liberada).
 *
 * A cada execução, apaga (soft delete) o que o seed criou antes e remonta o cenário com horários de agora.
 *
 * Uso (na pasta backend):
 *   npm run seed:banho-simultaneo
 *
 * Opcional:
 *   SEED_CLINIC_ID=…  SEED_UNIT_ID=…
 */
import { supabaseAdmin } from '../src/config/supabase';

const clinicId = process.env.SEED_CLINIC_ID || '0429cf37-6bcd-4179-82c3-e97a881dd1ac';
const unitId = process.env.SEED_UNIT_ID || 'ecac77a0-7bb2-4571-9f71-70faafd482f3';

const MARKER = 'seed-banho-simultaneo';
const PREFIX = '[Demo Salão]';

type Scenario = {
  pet: { name: string; breed: string; size_tier: string; coat_type: string; sex: 'M' | 'F' };
  stage: 'scheduled' | 'queued' | 'in_service' | 'ready';
  /** Minutos em relação a agora (negativo = passado). */
  startsInMin: number;
  durationMin: number;
  checkedInMinAgo?: number;
  startedMinAgo?: number;
  readyMinAgo?: number;
  /** Índice da banheira no catálogo (ordem por nome). */
  tubIndex?: number;
  operationalNote?: string;
};

const SCENARIOS: Scenario[] = [
  {
    pet: { name: `${PREFIX} Bolinha`, breed: 'Poodle', size_tier: 'pequeno', coat_type: 'longo', sex: 'F' },
    stage: 'in_service',
    startsInMin: -60,
    durationMin: 90,
    checkedInMinAgo: 65,
    startedMinAgo: 50,
    tubIndex: 0,
    operationalNote: 'Na secadora.',
  },
  {
    pet: { name: `${PREFIX} Pandora`, breed: 'Shih Tzu', size_tier: 'pequeno', coat_type: 'longo', sex: 'F' },
    stage: 'in_service',
    startsInMin: -30,
    durationMin: 60,
    checkedInMinAgo: 35,
    startedMinAgo: 20,
    tubIndex: 1,
    operationalNote: 'No banho.',
  },
  {
    pet: { name: `${PREFIX} Biscoito`, breed: 'Golden Retriever', size_tier: 'grande', coat_type: 'medio', sex: 'M' },
    stage: 'in_service',
    startsInMin: -10,
    durationMin: 90,
    checkedInMinAgo: 15,
    startedMinAgo: 5,
    tubIndex: 2,
  },
  {
    pet: { name: `${PREFIX} Feijão`, breed: 'SRD', size_tier: 'medio', coat_type: 'curto', sex: 'M' },
    stage: 'queued',
    startsInMin: 0,
    durationMin: 60,
    checkedInMinAgo: 20,
  },
  {
    pet: { name: `${PREFIX} Paçoca`, breed: 'Lhasa Apso', size_tier: 'pequeno', coat_type: 'longo', sex: 'F' },
    stage: 'queued',
    startsInMin: 15,
    durationMin: 60,
    checkedInMinAgo: 5,
  },
  {
    pet: { name: `${PREFIX} Amora`, breed: 'Spitz Alemão', size_tier: 'mini', coat_type: 'longo', sex: 'F' },
    stage: 'scheduled',
    startsInMin: 120,
    durationMin: 60,
  },
  {
    pet: { name: `${PREFIX} Cacau`, breed: 'Labrador', size_tier: 'grande', coat_type: 'curto', sex: 'M' },
    stage: 'ready',
    startsInMin: -150,
    durationMin: 60,
    checkedInMinAgo: 155,
    startedMinAgo: 140,
    readyMinAgo: 70,
  },
];

const APPOINTMENT_STATUS: Record<Scenario['stage'], string> = {
  scheduled: 'confirmed',
  queued: 'checked_in',
  in_service: 'in_progress',
  ready: 'done',
};

function minutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString();
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: sem retorno`);
  return res.data;
}

async function cleanupPrevious() {
  const now = new Date().toISOString();
  const { data: oldAppts } = await supabaseAdmin
    .from('hub_appointments')
    .select('id')
    .eq('clinic_id', clinicId)
    .like('notes', `%${MARKER}%`)
    .is('deleted_at', null);
  const ids = (oldAppts ?? []).map((a: { id: string }) => a.id);
  if (ids.length > 0) {
    await supabaseAdmin
      .from('hub_grooming_sessions')
      .update({ deleted_at: now })
      .eq('clinic_id', clinicId)
      .in('hub_appointment_id', ids)
      .is('deleted_at', null);
    await supabaseAdmin
      .from('hub_appointments')
      .update({ deleted_at: now, resource_released_at: now })
      .in('id', ids);
  }
  console.log(`Limpeza: ${ids.length} agendamento(s) anterior(es) do seed removido(s).`);
}

async function ensureGroomingServiceType(): Promise<{ id: string; name: string }> {
  const rows = must(
    await supabaseAdmin
      .from('hub_service_types')
      .select('id, name, code')
      .eq('clinic_id', clinicId)
      .eq('service_group', 'banho_tosa')
      .eq('is_addon', false)
      .is('deleted_at', null),
    'tipos de serviço',
  ) as { id: string; name: string; code: string }[];
  const pick = rows.find((r) => r.code === 'banho') ?? rows[0];
  if (!pick) throw new Error('Nenhum tipo de serviço de Banho & Tosa na clínica.');
  return pick;
}

async function ensureStaff(): Promise<{ id: string; full_name: string }> {
  const name = `${PREFIX} Ana Banhista`;
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
        job_title: 'Banhista',
        professional_kind: 'bather',
        active: true,
        accepts_appointments: true,
        default_unit_id: unitId,
        operational_areas: ['banho_tosa'],
        agenda_color: '#f0642f',
        internal_notes: MARKER,
      })
      .select('id, full_name')
      .single(),
    'banhista',
  ) as { id: string; full_name: string };
  console.log('Banhista criada:', created.full_name);
  return created;
}

async function ensureGuardian(): Promise<string> {
  const name = `${PREFIX} Fernanda Lima`;
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
      .insert({ clinic_id: clinicId, full_name: name, phone: '11987650000', notes: MARKER })
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

async function loadTubs(): Promise<{ id: string; name: string }[]> {
  const { data: kinds } = await supabaseAdmin
    .from('hub_resource_kinds')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('service_group_slug', 'banho_tosa')
    .eq('active', true)
    .is('deleted_at', null);
  const kindIds = (kinds ?? []).map((k: { id: string }) => k.id);
  if (kindIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('hub_resources')
    .select('id, name')
    .eq('clinic_id', clinicId)
    .eq('unit_id', unitId)
    .eq('active', true)
    .in('resource_kind_id', kindIds)
    .is('deleted_at', null)
    .order('name', { ascending: true });
  return (data ?? []) as { id: string; name: string }[];
}

async function logEvent(sessionId: string, eventType: string, title: string, at: string, staffId: string, body?: string) {
  await supabaseAdmin.from('hub_grooming_events').insert({
    clinic_id: clinicId,
    hub_grooming_session_id: sessionId,
    event_type: eventType,
    title,
    body: body ?? null,
    created_by_staff_id: staffId,
    created_at: at,
  });
}

async function main() {
  console.log(`Clínica: ${clinicId}`);
  console.log(`Unidade: ${unitId}`);

  await cleanupPrevious();
  const serviceType = await ensureGroomingServiceType();
  const staff = await ensureStaff();
  const guardianId = await ensureGuardian();
  const tubs = await loadTubs();
  if (tubs.length === 0) {
    console.log('Aviso: sem banheiras no catálogo desta unidade — os atendimentos ficam sem recurso alocado.');
  } else {
    console.log(`Banheiras: ${tubs.map((t) => t.name).join(', ')}`);
  }

  for (const sc of SCENARIOS) {
    const petId = await ensurePet(sc.pet, guardianId);
    const startsAt = minutesFromNow(sc.startsInMin);
    const endsAt = minutesFromNow(sc.startsInMin + sc.durationMin);
    const tub = sc.tubIndex !== undefined ? tubs[sc.tubIndex] : undefined;
    const readyAt = sc.readyMinAgo !== undefined ? minutesFromNow(-sc.readyMinAgo) : null;

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
          status: APPOINTMENT_STATUS[sc.stage],
          appointment_kind: 'standard',
          title: `${serviceType.name} · ${sc.pet.name}`,
          notes: `${MARKER} — ${sc.pet.name}`,
          hub_resource_id: tub?.id ?? null,
          resource_label: tub?.name ?? null,
          resource_released_at: sc.stage === 'ready' && tub ? readyAt : null,
        })
        .select('id')
        .single(),
      `agendamento ${sc.pet.name}`,
    ) as { id: string };

    const { error: lineErr } = await supabaseAdmin.from('hub_appointment_services').insert({
      appointment_id: appt.id,
      hub_service_type_id: serviceType.id,
      duration_minutes: sc.durationMin,
      order_index: 0,
    });
    if (lineErr) console.log(`Aviso: linha de serviço de ${sc.pet.name} não criada (${lineErr.message}).`);

    let stageLabel = 'Agendado';
    if (sc.stage !== 'scheduled') {
      const checkedInAt = minutesFromNow(-(sc.checkedInMinAgo ?? 0));
      const startedAt = sc.startedMinAgo !== undefined ? minutesFromNow(-sc.startedMinAgo) : null;
      const session = must(
        await supabaseAdmin
          .from('hub_grooming_sessions')
          .insert({
            clinic_id: clinicId,
            unit_id: unitId,
            pet_id: petId,
            guardian_id: guardianId,
            hub_appointment_id: appt.id,
            hub_staff_member_id: staff.id,
            grooming_stage: sc.stage,
            checked_in_at: checkedInAt,
            started_at: startedAt,
            ready_at: readyAt,
            operational_notes: sc.operationalNote ?? null,
          })
          .select('id')
          .single(),
        `sessão ${sc.pet.name}`,
      ) as { id: string };

      await logEvent(session.id, 'check_in', 'Check-in realizado', checkedInAt, staff.id);
      if (startedAt) await logEvent(session.id, 'start', 'Atendimento iniciado', startedAt, staff.id);
      if (readyAt) await logEvent(session.id, 'ready', 'Pet pronto', readyAt, staff.id);
      stageLabel = { queued: 'Aguardando', in_service: 'Em atendimento', ready: 'Pronto' }[sc.stage];
    }

    console.log(`  ${sc.pet.name.padEnd(26)} ${stageLabel.padEnd(15)} ${tub ? `banheira ${tub.name}` : ''}`);
  }

  console.log(`\nPronto. Abra /hub/banho-tosa/minha-fila (ou /hub/banho-tosa) na unidade de teste.`);
  console.log(`Profissional de todos os pets: ${staff.full_name}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
