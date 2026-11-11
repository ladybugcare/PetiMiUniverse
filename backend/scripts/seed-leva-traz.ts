/**
 * Seed: cenários de Leva e Traz no dia de hoje.
 *
 * Monta:
 * - 1 motorista + 1 veículo
 * - 1 rota planejada com várias paradas em estágios diferentes
 * - 1 perna avulsa (agendamento sem rota) para testar «Adicionar à rota»
 *
 * Estágios na rota:
 * - coleta pendente
 * - coleta a caminho (en_route)
 * - coleta com pet a bordo (in_transit)
 * - coleta concluída
 * - entrega pendente
 * - entrega concluída
 *
 * A cada execução, soft-deleta o que o seed criou antes e remonta o cenário.
 *
 * Uso (na pasta backend):
 *   npm run seed:leva-traz
 *
 * Opcional:
 *   SEED_CLINIC_ID=…  SEED_UNIT_ID=…
 */
import { supabaseAdmin } from '../src/config/supabase';

const clinicId = process.env.SEED_CLINIC_ID || '0429cf37-6bcd-4179-82c3-e97a881dd1ac';
const unitId = process.env.SEED_UNIT_ID || 'ecac77a0-7bb2-4571-9f71-70faafd482f3';

const MARKER = 'seed-leva-traz';
const PREFIX = '[Demo L&T]';

type StopStage = 'pending' | 'en_route' | 'arrived' | 'in_transit' | 'completed';
type Direction = 'pickup' | 'delivery';

type Scenario = {
  label: string;
  pet: { name: string; breed: string; size_tier: string; coat_type: string; sex: 'M' | 'F' };
  direction: Direction;
  /** Minutos relativos a agora no horário planejado. */
  startsInMin: number;
  durationMin: number;
  /** Se false, cria só o agendamento (sem rota). */
  onRoute?: boolean;
  stopStatus: StopStage;
  address: {
    street: string;
    street_number: string;
    district: string;
    city: string;
    state: string;
    postal_code: string;
  };
  note?: string;
};

const SCENARIOS: Scenario[] = [
  {
    label: 'Coleta pendente',
    pet: { name: `${PREFIX} Mel`, breed: 'Poodle', size_tier: 'pequeno', coat_type: 'longo', sex: 'F' },
    direction: 'pickup',
    startsInMin: 30,
    durationMin: 40,
    onRoute: true,
    stopStatus: 'pending',
    address: {
      street: 'Rua Oscar Freire',
      street_number: '1100',
      district: 'Jardins',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01426001',
    },
    note: 'Primeira parada da manhã.',
  },
  {
    label: 'Coleta a caminho',
    pet: { name: `${PREFIX} Thor`, breed: 'Labrador', size_tier: 'grande', coat_type: 'curto', sex: 'M' },
    direction: 'pickup',
    startsInMin: -10,
    durationMin: 35,
    onRoute: true,
    stopStatus: 'en_route',
    address: {
      street: 'Av. Paulista',
      street_number: '1500',
      district: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01310200',
    },
  },
  {
    label: 'Coleta pet a bordo',
    pet: { name: `${PREFIX} Luna`, breed: 'Shih Tzu', size_tier: 'pequeno', coat_type: 'longo', sex: 'F' },
    direction: 'pickup',
    startsInMin: -45,
    durationMin: 40,
    onRoute: true,
    stopStatus: 'in_transit',
    address: {
      street: 'Rua Augusta',
      street_number: '2200',
      district: 'Consolação',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01412100',
    },
    note: 'Já coletou — a caminho da clínica.',
  },
  {
    label: 'Coleta concluída',
    pet: { name: `${PREFIX} Rex`, breed: 'Beagle', size_tier: 'medio', coat_type: 'curto', sex: 'M' },
    direction: 'pickup',
    startsInMin: -120,
    durationMin: 35,
    onRoute: true,
    stopStatus: 'completed',
    address: {
      street: 'Rua Haddock Lobo',
      street_number: '595',
      district: 'Cerqueira César',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01414001',
    },
  },
  {
    label: 'Entrega pendente',
    pet: { name: `${PREFIX} Nina`, breed: 'Spitz Alemão', size_tier: 'mini', coat_type: 'longo', sex: 'F' },
    direction: 'delivery',
    startsInMin: 60,
    durationMin: 40,
    onRoute: true,
    stopStatus: 'pending',
    address: {
      street: 'Alameda Santos',
      street_number: '700',
      district: 'Jardins',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01419002',
    },
    note: 'Retorno após banho.',
  },
  {
    label: 'Entrega concluída',
    pet: { name: `${PREFIX} Bob`, breed: 'SRD', size_tier: 'medio', coat_type: 'curto', sex: 'M' },
    direction: 'delivery',
    startsInMin: -90,
    durationMin: 35,
    onRoute: true,
    stopStatus: 'completed',
    address: {
      street: 'Rua da Consolação',
      street_number: '3400',
      district: 'Consolação',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01416000',
    },
  },
  {
    label: 'Perna avulsa (sem rota)',
    pet: { name: `${PREFIX} Pipoca`, breed: 'Maltês', size_tier: 'mini', coat_type: 'longo', sex: 'F' },
    direction: 'pickup',
    startsInMin: 90,
    durationMin: 40,
    onRoute: false,
    stopStatus: 'pending',
    address: {
      street: 'Rua Bela Cintra',
      street_number: '900',
      district: 'Consolação',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01415000',
    },
    note: 'Use «Adicionar à rota» no painel.',
  },
];

const APPOINTMENT_STATUS: Record<StopStage, string> = {
  pending: 'confirmed',
  en_route: 'in_progress',
  arrived: 'in_progress',
  in_transit: 'in_progress',
  completed: 'done',
};

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: sem retorno`);
  return res.data;
}

function minutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString();
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

async function cleanupPrevious() {
  const now = new Date().toISOString();

  const { data: oldAppts } = await supabaseAdmin
    .from('hub_appointments')
    .select('id')
    .eq('clinic_id', clinicId)
    .like('notes', `%${MARKER}%`)
    .is('deleted_at', null);
  const apptIds = (oldAppts ?? []).map((a: { id: string }) => a.id);

  if (apptIds.length > 0) {
    await supabaseAdmin.from('hub_pickup_stops').delete().in('hub_appointment_id', apptIds);
    await supabaseAdmin
      .from('hub_appointments')
      .update({ deleted_at: now })
      .in('id', apptIds);
  }

  const { data: oldRoutes } = await supabaseAdmin
    .from('hub_pickup_routes')
    .select('id')
    .eq('clinic_id', clinicId)
    .like('notes', `%${MARKER}%`)
    .is('deleted_at', null);
  const routeIds = (oldRoutes ?? []).map((r: { id: string }) => r.id);
  if (routeIds.length > 0) {
    await supabaseAdmin.from('hub_pickup_stops').delete().in('hub_pickup_route_id', routeIds);
    await supabaseAdmin
      .from('hub_pickup_routes')
      .update({ deleted_at: now })
      .in('id', routeIds);
  }

  console.log(
    `Limpeza: ${apptIds.length} agendamento(s) e ${routeIds.length} rota(s) anterior(es) do seed removido(s).`,
  );
}

async function ensureServiceType(): Promise<{ id: string; name: string }> {
  const rows = must(
    await supabaseAdmin
      .from('hub_service_types')
      .select('id, name, code')
      .eq('clinic_id', clinicId)
      .eq('service_group', 'leva_traz')
      .eq('is_addon', false)
      .is('deleted_at', null),
    'tipos leva_traz',
  ) as { id: string; name: string; code: string }[];

  const preferred = rows.find((r) => r.code === 'leva_traz_showcase') ?? rows.find((r) => r.code === 'leva_traz') ?? rows[0];
  if (preferred) return preferred;

  const created = must(
    await supabaseAdmin
      .from('hub_service_types')
      .insert({
        clinic_id: clinicId,
        code: 'leva_traz_seed',
        name: 'Leva e Traz',
        service_group: 'leva_traz',
        sale_amount: 45,
        cost_amount: 15,
        allow_scheduling: true,
        is_addon: false,
        agenda_color: '#5d4037',
        internal_notes: MARKER,
      })
      .select('id, name')
      .single(),
    'criar tipo leva_traz',
  ) as { id: string; name: string };
  console.log('Tipo de serviço criado:', created.name);
  return created;
}

async function ensureDriver(): Promise<{ id: string; full_name: string }> {
  const name = `${PREFIX} Carlos Motorista`;
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
        job_title: 'Motorista',
        professional_kind: 'driver',
        active: true,
        accepts_appointments: true,
        default_unit_id: unitId,
        operational_areas: ['leva_traz'],
        agenda_color: '#5d4037',
        internal_notes: MARKER,
      })
      .select('id, full_name')
      .single(),
    'motorista',
  ) as { id: string; full_name: string };
  console.log('Motorista criado:', created.full_name);
  return created;
}

async function ensureVehicle(): Promise<{ id: string; name: string } | null> {
  const name = `${PREFIX} Van 01`;
  const { data: existing } = await supabaseAdmin
    .from('hub_pickup_vehicles')
    .select('id, name')
    .eq('clinic_id', clinicId)
    .eq('name', name)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return existing as { id: string; name: string };

  const { data, error } = await supabaseAdmin
    .from('hub_pickup_vehicles')
    .insert({
      clinic_id: clinicId,
      name,
      license_plate: 'DEMO1A23',
      capacity_animals: 6,
      active: true,
      notes: MARKER,
    })
    .select('id, name')
    .single();
  if (error) {
    console.log(`Aviso: veículo não criado (${error.message}).`);
    return null;
  }
  console.log('Veículo criado:', (data as { name: string }).name);
  return data as { id: string; name: string };
}

async function ensureGuardian(sc: Scenario): Promise<string> {
  const name = `${PREFIX} Tutor(a) ${sc.pet.name.replace(PREFIX, '').trim()}`;
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
        phone: '11987654321',
        notes: MARKER,
        client_status: 'active',
        ...sc.address,
      })
      .select('id')
      .single(),
    `tutor ${name}`,
  ) as { id: string };
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

async function main() {
  console.log(`Clínica: ${clinicId}`);
  console.log(`Unidade: ${unitId}`);
  console.log(`Marcador: ${MARKER}`);
  console.log(`Hoje (SP): ${ymdSaoPaulo(0)}`);

  await cleanupPrevious();

  const serviceType = await ensureServiceType();
  const driver = await ensureDriver();
  const vehicle = await ensureVehicle();
  console.log(`Serviço: ${serviceType.name}`);

  const route = must(
    await supabaseAdmin
      .from('hub_pickup_routes')
      .insert({
        clinic_id: clinicId,
        unit_id: unitId,
        route_date: ymdSaoPaulo(0),
        driver_staff_id: driver.id,
        vehicle_id: vehicle?.id ?? null,
        vehicle_label: vehicle?.name ?? 'Van demo',
        label: `${PREFIX} Rota manhã`,
        status: 'in_progress',
        sort_order: 0,
        notes: `${MARKER} — rota demo do dia`,
        start_kind: 'clinic',
      })
      .select('id')
      .single(),
    'rota',
  ) as { id: string };
  console.log(`Rota: ${route.id}`);

  let sequence = 0;
  console.log('\nCenários:');
  for (const sc of SCENARIOS) {
    const guardianId = await ensureGuardian(sc);
    const petId = await ensurePet(sc.pet, guardianId);
    const startsAt = minutesFromNow(sc.startsInMin);
    const endsAt = minutesFromNow(sc.startsInMin + sc.durationMin);
    const notes = `${MARKER} — ${sc.label}${sc.note ? ` · ${sc.note}` : ''}`;

    const appt = must(
      await supabaseAdmin
        .from('hub_appointments')
        .insert({
          clinic_id: clinicId,
          unit_id: unitId,
          hub_service_type_id: serviceType.id,
          hub_staff_member_id: driver.id,
          pet_id: petId,
          guardian_id: guardianId,
          starts_at: startsAt,
          ends_at: endsAt,
          status: APPOINTMENT_STATUS[sc.stopStatus],
          appointment_kind: 'pickup_route',
          title: `${sc.direction === 'pickup' ? 'Coleta' : 'Entrega'} · ${sc.pet.name}`,
          notes,
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
      sale_amount_applied: 45,
      cost_amount_applied: 15,
    });
    if (lineErr) console.log(`Aviso: linha de serviço de ${sc.pet.name} (${lineErr.message}).`);

    const addressSnapshot = {
      street: sc.address.street,
      street_number: sc.address.street_number,
      district: sc.address.district,
      city: sc.address.city,
      state: sc.address.state,
      postal_code: sc.address.postal_code,
      label: `${sc.address.street}, ${sc.address.street_number}`,
    };

    const stopPayload: Record<string, unknown> = {
      clinic_id: clinicId,
      hub_appointment_id: appt.id,
      pet_id: petId,
      guardian_id: guardianId,
      direction: sc.direction,
      address_snapshot: addressSnapshot,
      sequence: sc.onRoute === false ? 0 : sequence,
      status: sc.stopStatus,
      planned_at: startsAt,
      notes: sc.note ?? null,
      completed_at: sc.stopStatus === 'completed' ? minutesFromNow(sc.startsInMin + sc.durationMin) : null,
    };
    if (sc.onRoute !== false) {
      stopPayload.hub_pickup_route_id = route.id;
      sequence += 1;
    }

    must(
      await supabaseAdmin.from('hub_pickup_stops').insert(stopPayload).select('id').single(),
      `parada ${sc.pet.name}`,
    );

    const routeLabel = sc.onRoute === false ? 'sem rota' : `seq ${sequence - 1}`;
    console.log(
      `  ${sc.pet.name.padEnd(24)} ${sc.direction.padEnd(10)} ${sc.stopStatus.padEnd(12)} ${routeLabel}`,
    );
  }

  console.log(`\nPronto. Abra /hub/leva-e-traz na unidade de teste.`);
  console.log(`Motorista: ${driver.full_name}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
