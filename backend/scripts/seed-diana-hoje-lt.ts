/**
 * Seed one-shot: agenda de HOJE na Clínica Diana Paixão (preprod),
 * com muitos serviços e pernas de Leva e Traz (coleta + entrega).
 *
 * Uso (pasta backend):
 *   set -a && source .env.preprod.local && source .env.diana.staging.local && set +a
 *   npx tsx scripts/seed-diana-hoje-lt.ts
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env.preprod.local'), override: true });
dotenv.config({ path: path.join(ROOT, '.env.diana.staging.local'), override: true });

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL?.includes('afstcbhcbrkvbihtjbww') || !SERVICE_ROLE) {
  console.error('Use .env.preprod.local (Preprod). Abortando.');
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CLINIC_ID = process.env.SEED_CLINIC_ID?.trim() || 'd1a0a111-1111-4111-8111-111111111111';
const UNIT_ID = process.env.SEED_UNIT_ID?.trim() || '';
const MARKER = 'seed-diana-hoje-lt';

type SizeTier = 'mini' | 'pequeno' | 'medio' | 'grande';
type Address = {
  street: string;
  street_number: string;
  district: string;
  city: string;
  state: string;
  postal_code: string;
};

type ClientSpec = {
  tutor: string;
  phone: string;
  pet: string;
  breed: string;
  size_tier: SizeTier;
  sex: 'M' | 'F';
  address: Address;
  service: 'banho' | 'tosa' | 'consulta' | 'creche_dia';
  /** Horário do serviço principal (America/Sao_Paulo). */
  hour: number;
  minute: number;
  durationMin: number;
  status: 'pending_confirm' | 'confirmed' | 'checked_in' | 'in_progress';
  /** Coleta antes / entrega depois. */
  lt: 'both' | 'pickup' | 'delivery' | 'none';
  onRoute?: boolean;
  stopPickupStatus?: 'pending' | 'en_route' | 'in_transit' | 'completed';
  stopDeliveryStatus?: 'pending' | 'en_route' | 'completed';
};

const ADDRESSES: Address[] = [
  { street: 'Rua Harmonia', street_number: '450', district: 'Vila Madalena', city: 'São Paulo', state: 'SP', postal_code: '05435001' },
  { street: 'Rua Aspicuelta', street_number: '220', district: 'Vila Madalena', city: 'São Paulo', state: 'SP', postal_code: '05433010' },
  { street: 'Rua Girassol', street_number: '88', district: 'Vila Madalena', city: 'São Paulo', state: 'SP', postal_code: '05433001' },
  { street: 'Av. Faria Lima', street_number: '1500', district: 'Pinheiros', city: 'São Paulo', state: 'SP', postal_code: '01452001' },
  { street: 'Rua dos Pinheiros', street_number: '700', district: 'Pinheiros', city: 'São Paulo', state: 'SP', postal_code: '05422001' },
  { street: 'Rua Teodoro Sampaio', street_number: '1020', district: 'Pinheiros', city: 'São Paulo', state: 'SP', postal_code: '05406000' },
  { street: 'Rua Cardeal Arcoverde', street_number: '350', district: 'Pinheiros', city: 'São Paulo', state: 'SP', postal_code: '05407000' },
  { street: 'Rua Henrique Schaumann', street_number: '180', district: 'Pinheiros', city: 'São Paulo', state: 'SP', postal_code: '05413010' },
  { street: 'Rua Cristiano Viana', street_number: '401', district: 'Cerqueira César', city: 'São Paulo', state: 'SP', postal_code: '05411000' },
  { street: 'Alameda Franca', street_number: '560', district: 'Jardins', city: 'São Paulo', state: 'SP', postal_code: '01422000' },
  { street: 'Rua Estados Unidos', street_number: '1200', district: 'Jardins', city: 'São Paulo', state: 'SP', postal_code: '01427001' },
  { street: 'Rua Joaquim Antunes', street_number: '77', district: 'Pinheiros', city: 'São Paulo', state: 'SP', postal_code: '05415010' },
  { street: 'Rua Artur de Azevedo', street_number: '1330', district: 'Pinheiros', city: 'São Paulo', state: 'SP', postal_code: '05404013' },
  { street: 'Rua Padre João Manuel', street_number: '222', district: 'Cerqueira César', city: 'São Paulo', state: 'SP', postal_code: '01411000' },
  { street: 'Rua Peixoto Gomide', street_number: '980', district: 'Jardins', city: 'São Paulo', state: 'SP', postal_code: '01409001' },
  { street: 'Rua Augusta', street_number: '2690', district: 'Jardins', city: 'São Paulo', state: 'SP', postal_code: '01412100' },
  { street: 'Rua da Consolação', street_number: '2470', district: 'Consolação', city: 'São Paulo', state: 'SP', postal_code: '01416000' },
  { street: 'Rua Bela Cintra', street_number: '1450', district: 'Consolação', city: 'São Paulo', state: 'SP', postal_code: '01415000' },
];

const CLIENTS: ClientSpec[] = [
  { tutor: 'Amanda Ribeiro', phone: '11992002001', pet: 'Amora', breed: 'Poodle', size_tier: 'pequeno', sex: 'F', address: ADDRESSES[0]!, service: 'banho', hour: 8, minute: 0, durationMin: 60, status: 'confirmed', lt: 'both', onRoute: true, stopPickupStatus: 'completed', stopDeliveryStatus: 'pending' },
  { tutor: 'Breno Carvalho', phone: '11992002002', pet: 'Bolt', breed: 'Border Collie', size_tier: 'medio', sex: 'M', address: ADDRESSES[1]!, service: 'tosa', hour: 8, minute: 30, durationMin: 75, status: 'confirmed', lt: 'both', onRoute: true, stopPickupStatus: 'in_transit' },
  { tutor: 'Camila Duarte', phone: '11992002003', pet: 'Cacau', breed: 'Shih Tzu', size_tier: 'pequeno', sex: 'F', address: ADDRESSES[2]!, service: 'banho', hour: 9, minute: 0, durationMin: 60, status: 'checked_in', lt: 'both', onRoute: true, stopPickupStatus: 'completed', stopDeliveryStatus: 'pending' },
  { tutor: 'Daniel Prado', phone: '11992002004', pet: 'Duna', breed: 'Golden', size_tier: 'grande', sex: 'F', address: ADDRESSES[3]!, service: 'consulta', hour: 9, minute: 30, durationMin: 40, status: 'confirmed', lt: 'both', onRoute: true, stopPickupStatus: 'en_route' },
  { tutor: 'Eduarda Melo', phone: '11992002005', pet: 'Elvis', breed: 'Bulldog', size_tier: 'medio', sex: 'M', address: ADDRESSES[4]!, service: 'banho', hour: 10, minute: 0, durationMin: 70, status: 'confirmed', lt: 'both', onRoute: true, stopPickupStatus: 'pending' },
  { tutor: 'Felipe Andrade', phone: '11992002006', pet: 'Floquinho', breed: 'Maltês', size_tier: 'mini', sex: 'M', address: ADDRESSES[5]!, service: 'tosa', hour: 10, minute: 30, durationMin: 60, status: 'pending_confirm', lt: 'both', onRoute: false },
  { tutor: 'Giovana Pires', phone: '11992002007', pet: 'Gigi', breed: 'Spitz', size_tier: 'mini', sex: 'F', address: ADDRESSES[6]!, service: 'banho', hour: 11, minute: 0, durationMin: 55, status: 'confirmed', lt: 'both', onRoute: true, stopPickupStatus: 'pending' },
  { tutor: 'Henrique Lopes', phone: '11992002008', pet: 'Hulk', breed: 'Rottweiler', size_tier: 'grande', sex: 'M', address: ADDRESSES[7]!, service: 'consulta', hour: 11, minute: 30, durationMin: 45, status: 'confirmed', lt: 'pickup', onRoute: true, stopPickupStatus: 'pending' },
  { tutor: 'Isabela Nogueira', phone: '11992002009', pet: 'Íris', breed: 'Lhasa', size_tier: 'pequeno', sex: 'F', address: ADDRESSES[8]!, service: 'banho', hour: 12, minute: 0, durationMin: 60, status: 'confirmed', lt: 'both', onRoute: false },
  { tutor: 'Júlio César', phone: '11992002010', pet: 'Joca', breed: 'SRD', size_tier: 'medio', sex: 'M', address: ADDRESSES[9]!, service: 'creche_dia', hour: 8, minute: 0, durationMin: 480, status: 'checked_in', lt: 'both', onRoute: true, stopPickupStatus: 'completed', stopDeliveryStatus: 'pending' },
  { tutor: 'Karina Vieira', phone: '11992002011', pet: 'Kika', breed: 'Yorkshire', size_tier: 'mini', sex: 'F', address: ADDRESSES[10]!, service: 'tosa', hour: 13, minute: 0, durationMin: 60, status: 'confirmed', lt: 'both', onRoute: true, stopPickupStatus: 'pending' },
  { tutor: 'Leandro Souza', phone: '11992002012', pet: 'Lucky', breed: 'Beagle', size_tier: 'medio', sex: 'M', address: ADDRESSES[11]!, service: 'banho', hour: 13, minute: 30, durationMin: 60, status: 'confirmed', lt: 'both', onRoute: false },
  { tutor: 'Marcela Tavares', phone: '11992002013', pet: 'Muffin', breed: 'Pug', size_tier: 'pequeno', sex: 'F', address: ADDRESSES[12]!, service: 'consulta', hour: 14, minute: 0, durationMin: 40, status: 'confirmed', lt: 'both', onRoute: true, stopPickupStatus: 'pending' },
  { tutor: 'Nelson Barbosa', phone: '11992002014', pet: 'Nero', breed: 'Pastor Alemão', size_tier: 'grande', sex: 'M', address: ADDRESSES[13]!, service: 'banho', hour: 14, minute: 30, durationMin: 75, status: 'confirmed', lt: 'delivery', onRoute: true, stopDeliveryStatus: 'pending' },
  { tutor: 'Olga Fernandes', phone: '11992002015', pet: 'Ozzy', breed: 'Dachshund', size_tier: 'pequeno', sex: 'M', address: ADDRESSES[14]!, service: 'tosa', hour: 15, minute: 0, durationMin: 55, status: 'confirmed', lt: 'both', onRoute: false },
  { tutor: 'Patrícia Gomes', phone: '11992002016', pet: 'Pérola', breed: 'Persa', size_tier: 'pequeno', sex: 'F', address: ADDRESSES[15]!, service: 'consulta', hour: 15, minute: 30, durationMin: 40, status: 'pending_confirm', lt: 'pickup', onRoute: false },
  { tutor: 'Renato Almeida', phone: '11992002017', pet: 'Rocky', breed: 'Boxer', size_tier: 'grande', sex: 'M', address: ADDRESSES[16]!, service: 'banho', hour: 16, minute: 0, durationMin: 70, status: 'confirmed', lt: 'both', onRoute: true, stopPickupStatus: 'pending' },
  { tutor: 'Simone Castro', phone: '11992002018', pet: 'Sushi', breed: 'Spitz', size_tier: 'mini', sex: 'F', address: ADDRESSES[17]!, service: 'banho', hour: 16, minute: 30, durationMin: 55, status: 'confirmed', lt: 'both', onRoute: false },
  { tutor: 'Thiago Mendes', phone: '11992002019', pet: 'Toby', breed: 'Labrador', size_tier: 'grande', sex: 'M', address: ADDRESSES[0]!, service: 'creche_dia', hour: 8, minute: 15, durationMin: 480, status: 'in_progress', lt: 'both', onRoute: true, stopPickupStatus: 'completed', stopDeliveryStatus: 'pending' },
  { tutor: 'Úrsula Campos', phone: '11992002020', pet: 'Ursa', breed: 'Husky', size_tier: 'grande', sex: 'F', address: ADDRESSES[3]!, service: 'banho', hour: 17, minute: 0, durationMin: 75, status: 'confirmed', lt: 'both', onRoute: false },
  { tutor: 'Vinícius Rocha', phone: '11992002021', pet: 'Vini', breed: 'SRD', size_tier: 'medio', sex: 'M', address: ADDRESSES[5]!, service: 'tosa', hour: 17, minute: 30, durationMin: 60, status: 'confirmed', lt: 'none' },
  { tutor: 'Wendy Martins', phone: '11992002022', pet: 'Willow', breed: 'Cocker', size_tier: 'medio', sex: 'F', address: ADDRESSES[7]!, service: 'banho', hour: 9, minute: 15, durationMin: 60, status: 'confirmed', lt: 'both', onRoute: true, stopPickupStatus: 'pending' },
];

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data == null) throw new Error(`${what}: sem retorno`);
  return res.data;
}

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

/** Cria Date em America/Sao_Paulo para o dia de hoje no horário informado. */
function todayAtSaoPaulo(hour: number, minute: number): Date {
  const ymd = ymdSaoPaulo(0);
  // Offset fixo -03:00 (Brasília sem DST desde 2019)
  return new Date(`${ymd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`);
}

function addressSnapshot(a: Address) {
  return {
    street: a.street,
    street_number: a.street_number,
    district: a.district,
    city: a.city,
    state: a.state,
    postal_code: a.postal_code,
    label: `${a.street}, ${a.street_number}`,
  };
}

async function resolveUnitId(): Promise<string> {
  if (UNIT_ID) return UNIT_ID;
  const { data } = await admin
    .from('units')
    .select('id')
    .eq('clinic_id', CLINIC_ID)
    .eq('nickname', 'Principal')
    .maybeSingle();
  if (data?.id) return data.id as string;
  const fallback = must(
    await admin.from('units').select('id').eq('clinic_id', CLINIC_ID).limit(1).single(),
    'unidade Diana',
  ) as { id: string };
  return fallback.id;
}

async function cleanupPrevious() {
  const now = new Date().toISOString();
  const { data: oldAppts } = await admin
    .from('hub_appointments')
    .select('id')
    .eq('clinic_id', CLINIC_ID)
    .like('notes', `%${MARKER}%`)
    .is('deleted_at', null);
  const ids = (oldAppts ?? []).map((a: { id: string }) => a.id);
  if (ids.length > 0) {
    await admin.from('hub_pickup_stops').delete().in('hub_appointment_id', ids);
    await admin.from('hub_appointments').update({ deleted_at: now }).in('id', ids);
  }
  const { data: oldRoutes } = await admin
    .from('hub_pickup_routes')
    .select('id')
    .eq('clinic_id', CLINIC_ID)
    .like('notes', `%${MARKER}%`)
    .is('deleted_at', null);
  const routeIds = (oldRoutes ?? []).map((r: { id: string }) => r.id);
  if (routeIds.length > 0) {
    await admin.from('hub_pickup_stops').delete().in('hub_pickup_route_id', routeIds);
    await admin.from('hub_pickup_routes').update({ deleted_at: now }).in('id', routeIds);
  }
  console.log(`Limpeza: ${ids.length} agendamento(s), ${routeIds.length} rota(s).`);
}

async function ensureServiceMap(): Promise<Map<string, { id: string; name: string }>> {
  const { data, error } = await admin
    .from('hub_service_types')
    .select('id, code, name')
    .eq('clinic_id', CLINIC_ID)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  const map = new Map<string, { id: string; name: string }>();
  for (const row of data ?? []) {
    map.set(row.code as string, { id: row.id as string, name: row.name as string });
  }
  const needed = ['banho', 'tosa', 'consulta', 'creche_dia', 'leva_traz'] as const;
  for (const code of needed) {
    if (map.has(code)) continue;
    const catalog: Record<string, { name: string; group: string; sale: number; color: string }> = {
      banho: { name: 'Banho', group: 'banho_tosa', sale: 80, color: '#f0642f' },
      tosa: { name: 'Tosa higiênica', group: 'banho_tosa', sale: 60, color: '#f0642f' },
      consulta: { name: 'Consulta clínica', group: 'clinica', sale: 180, color: '#7b1fa2' },
      creche_dia: { name: 'Creche — dia', group: 'creche', sale: 90, color: '#00897b' },
      leva_traz: { name: 'Leva e Traz', group: 'leva_traz', sale: 45, color: '#5d4037' },
    };
    const c = catalog[code]!;
    const created = must(
      await admin
        .from('hub_service_types')
        .insert({
          clinic_id: CLINIC_ID,
          code,
          name: c.name,
          service_group: c.group,
          sale_amount: c.sale,
          cost_amount: Math.round(c.sale * 0.35),
          allow_scheduling: true,
          is_addon: false,
          agenda_color: c.color,
          internal_notes: MARKER,
        })
        .select('id, name')
        .single(),
      `serviço ${code}`,
    ) as { id: string; name: string };
    map.set(code, created);
  }
  return map;
}

async function ensureStaff(unitId: string): Promise<{ vetId: string; driverId: string }> {
  const { data: vet } = await admin
    .from('hub_staff_members')
    .select('id')
    .eq('clinic_id', CLINIC_ID)
    .ilike('full_name', 'Diana Paixão')
    .is('deleted_at', null)
    .maybeSingle();
  let vetId = vet?.id as string | undefined;
  if (!vetId) {
    const created = must(
      await admin
        .from('hub_staff_members')
        .insert({
          clinic_id: CLINIC_ID,
          full_name: 'Diana Paixão',
          job_title: 'Médica Veterinária',
          professional_kind: 'vet',
          active: true,
          accepts_appointments: true,
          default_unit_id: unitId,
          operational_areas: ['clinica', 'banho_tosa', 'hotel_creche', 'leva_traz'],
          agenda_color: '#7b1fa2',
          internal_notes: MARKER,
        })
        .select('id')
        .single(),
      'staff Diana',
    ) as { id: string };
    vetId = created.id;
  }

  const driverName = '[Hoje L&T] Motorista Ana';
  const { data: driverEx } = await admin
    .from('hub_staff_members')
    .select('id')
    .eq('clinic_id', CLINIC_ID)
    .eq('full_name', driverName)
    .is('deleted_at', null)
    .maybeSingle();
  let driverId = driverEx?.id as string | undefined;
  if (!driverId) {
    const created = must(
      await admin
        .from('hub_staff_members')
        .insert({
          clinic_id: CLINIC_ID,
          full_name: driverName,
          job_title: 'Motorista',
          professional_kind: 'driver',
          active: true,
          accepts_appointments: true,
          default_unit_id: unitId,
          operational_areas: ['leva_traz'],
          agenda_color: '#5d4037',
          internal_notes: MARKER,
        })
        .select('id')
        .single(),
      'motorista',
    ) as { id: string };
    driverId = created.id;
  }
  return { vetId, driverId };
}

async function ensureVehicle(): Promise<{ id: string; name: string } | null> {
  const name = '[Hoje L&T] Van Pinheiros';
  const { data: existing } = await admin
    .from('hub_pickup_vehicles')
    .select('id, name')
    .eq('clinic_id', CLINIC_ID)
    .eq('name', name)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return existing as { id: string; name: string };
  const { data, error } = await admin
    .from('hub_pickup_vehicles')
    .insert({
      clinic_id: CLINIC_ID,
      name,
      license_plate: 'LTD2A26',
      capacity_animals: 8,
      active: true,
      notes: MARKER,
    })
    .select('id, name')
    .single();
  if (error) {
    console.log(`Aviso: veículo (${error.message})`);
    return null;
  }
  return data as { id: string; name: string };
}

async function ensureGuardian(spec: ClientSpec): Promise<string> {
  const { data: existing } = await admin
    .from('hub_guardians')
    .select('id')
    .eq('clinic_id', CLINIC_ID)
    .eq('full_name', spec.tutor)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const created = must(
    await admin
      .from('hub_guardians')
      .insert({
        clinic_id: CLINIC_ID,
        full_name: spec.tutor,
        phone: spec.phone,
        email: `${spec.tutor.toLowerCase().replace(/\s+/g, '.')}@petmi.test`,
        client_kind: 'individual',
        client_status: 'active',
        notes: MARKER,
        ...spec.address,
      })
      .select('id')
      .single(),
    `tutor ${spec.tutor}`,
  ) as { id: string };
  return created.id;
}

async function ensurePet(spec: ClientSpec, guardianId: string): Promise<string> {
  const { data: existing } = await admin
    .from('hub_pets')
    .select('id')
    .eq('clinic_id', CLINIC_ID)
    .eq('name', spec.pet)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing?.id) {
    const { data: link } = await admin
      .from('hub_pet_guardians')
      .select('id')
      .eq('pet_id', existing.id)
      .eq('guardian_id', guardianId)
      .maybeSingle();
    if (!link) {
      await admin.from('hub_pet_guardians').insert({
        pet_id: existing.id,
        guardian_id: guardianId,
        role: 'primary',
      });
    }
    return existing.id as string;
  }
  const pet = must(
    await admin
      .from('hub_pets')
      .insert({
        clinic_id: CLINIC_ID,
        name: spec.pet,
        species: 'Cão',
        breed: spec.breed,
        size_tier: spec.size_tier,
        coat_type: 'medio',
        sex: spec.sex,
        notes: MARKER,
      })
      .select('id')
      .single(),
    `pet ${spec.pet}`,
  ) as { id: string };
  await admin.from('hub_pet_guardians').insert({
    pet_id: pet.id,
    guardian_id: guardianId,
    role: 'primary',
  });
  return pet.id;
}

async function insertServiceLine(
  appointmentId: string,
  serviceTypeId: string,
  durationMin: number,
  sale: number,
  cost: number,
) {
  const { error } = await admin.from('hub_appointment_services').insert({
    appointment_id: appointmentId,
    hub_service_type_id: serviceTypeId,
    duration_minutes: durationMin,
    order_index: 0,
    sale_amount_applied: sale,
    cost_amount_applied: cost,
  });
  if (error) console.log(`Aviso linha serviço: ${error.message}`);
}

async function main() {
  console.log(`Seed Diana hoje L&T → ${SUPABASE_URL}`);
  console.log(`Clínica: ${CLINIC_ID}`);
  console.log(`Hoje (SP): ${ymdSaoPaulo(0)}`);

  const unitId = await resolveUnitId();
  console.log(`Unidade: ${unitId}`);

  await cleanupPrevious();
  const services = await ensureServiceMap();
  const { vetId, driverId } = await ensureStaff(unitId);
  const vehicle = await ensureVehicle();
  const lt = services.get('leva_traz')!;

  const route = must(
    await admin
      .from('hub_pickup_routes')
      .insert({
        clinic_id: CLINIC_ID,
        unit_id: unitId,
        route_date: ymdSaoPaulo(0),
        driver_staff_id: driverId,
        vehicle_id: vehicle?.id ?? null,
        vehicle_label: vehicle?.name ?? 'Van Pinheiros',
        label: '[Hoje L&T] Rota Pinheiros',
        status: 'in_progress',
        sort_order: 0,
        notes: `${MARKER} — rota do dia`,
        start_kind: 'clinic',
      })
      .select('id')
      .single(),
    'rota',
  ) as { id: string };

  let seq = 0;
  let parents = 0;
  let legs = 0;
  let stops = 0;

  for (const spec of CLIENTS) {
    const st = services.get(spec.service);
    if (!st) {
      console.log(`Pulando ${spec.pet}: serviço ${spec.service} ausente`);
      continue;
    }
    const guardianId = await ensureGuardian(spec);
    const petId = await ensurePet(spec, guardianId);
    const starts = todayAtSaoPaulo(spec.hour, spec.minute);
    const ends = new Date(starts.getTime() + spec.durationMin * 60_000);
    const title = `${st.name} · ${spec.pet}`;
    const notes = `${MARKER} · ${spec.tutor} · lt=${spec.lt}`;

    const parent = must(
      await admin
        .from('hub_appointments')
        .insert({
          clinic_id: CLINIC_ID,
          unit_id: unitId,
          hub_service_type_id: st.id,
          hub_staff_member_id: vetId,
          pet_id: petId,
          guardian_id: guardianId,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          status: spec.status,
          appointment_kind: spec.service === 'creche_dia' ? 'daycare_block' : 'standard',
          title,
          notes,
        })
        .select('id')
        .single(),
      `pai ${title}`,
    ) as { id: string };
    parents += 1;
    await insertServiceLine(parent.id, st.id, spec.durationMin, 80, 28);

    const wantPickup = spec.lt === 'both' || spec.lt === 'pickup';
    const wantDelivery = spec.lt === 'both' || spec.lt === 'delivery';

    if (wantPickup) {
      const pStarts = new Date(starts.getTime() - 45 * 60_000);
      const pEnds = new Date(pStarts.getTime() + 30 * 60_000);
      const pickup = must(
        await admin
          .from('hub_appointments')
          .insert({
            clinic_id: CLINIC_ID,
            unit_id: unitId,
            hub_service_type_id: lt.id,
            hub_staff_member_id: driverId,
            pet_id: petId,
            guardian_id: guardianId,
            starts_at: pStarts.toISOString(),
            ends_at: pEnds.toISOString(),
            status: spec.stopPickupStatus === 'completed' ? 'done' : spec.stopPickupStatus === 'pending' || !spec.stopPickupStatus ? 'confirmed' : 'in_progress',
            appointment_kind: 'pickup_route',
            parent_appointment_id: parent.id,
            title: `Coleta · ${spec.pet}`,
            notes: `${MARKER} · coleta`,
          })
          .select('id')
          .single(),
        `coleta ${spec.pet}`,
      ) as { id: string };
      legs += 1;
      await insertServiceLine(pickup.id, lt.id, 30, 45, 15);

      const stopStatus = spec.stopPickupStatus ?? 'pending';
      const stopPayload: Record<string, unknown> = {
        clinic_id: CLINIC_ID,
        hub_appointment_id: pickup.id,
        pet_id: petId,
        guardian_id: guardianId,
        direction: 'pickup',
        address_snapshot: addressSnapshot(spec.address),
        sequence: spec.onRoute ? seq : 0,
        status: stopStatus,
        planned_at: pStarts.toISOString(),
        notes: `Coleta ${spec.pet}`,
        completed_at: stopStatus === 'completed' ? pEnds.toISOString() : null,
      };
      if (spec.onRoute) {
        stopPayload.hub_pickup_route_id = route.id;
        seq += 1;
      }
      must(await admin.from('hub_pickup_stops').insert(stopPayload).select('id').single(), `stop coleta ${spec.pet}`);
      stops += 1;
    }

    if (wantDelivery) {
      const dStarts = new Date(ends.getTime() + 15 * 60_000);
      const dEnds = new Date(dStarts.getTime() + 30 * 60_000);
      const delivery = must(
        await admin
          .from('hub_appointments')
          .insert({
            clinic_id: CLINIC_ID,
            unit_id: unitId,
            hub_service_type_id: lt.id,
            hub_staff_member_id: driverId,
            pet_id: petId,
            guardian_id: guardianId,
            starts_at: dStarts.toISOString(),
            ends_at: dEnds.toISOString(),
            status: spec.stopDeliveryStatus === 'completed' ? 'done' : 'confirmed',
            appointment_kind: 'pickup_route',
            parent_appointment_id: parent.id,
            title: `Entrega · ${spec.pet}`,
            notes: `${MARKER} · entrega`,
          })
          .select('id')
          .single(),
        `entrega ${spec.pet}`,
      ) as { id: string };
      legs += 1;
      await insertServiceLine(delivery.id, lt.id, 30, 45, 15);

      const stopStatus = spec.stopDeliveryStatus ?? 'pending';
      const stopPayload: Record<string, unknown> = {
        clinic_id: CLINIC_ID,
        hub_appointment_id: delivery.id,
        pet_id: petId,
        guardian_id: guardianId,
        direction: 'delivery',
        address_snapshot: addressSnapshot(spec.address),
        sequence: spec.onRoute ? seq : 0,
        status: stopStatus,
        planned_at: dStarts.toISOString(),
        notes: `Entrega ${spec.pet}`,
        completed_at: stopStatus === 'completed' ? dEnds.toISOString() : null,
      };
      if (spec.onRoute) {
        stopPayload.hub_pickup_route_id = route.id;
        seq += 1;
      }
      must(await admin.from('hub_pickup_stops').insert(stopPayload).select('id').single(), `stop entrega ${spec.pet}`);
      stops += 1;
    }

    console.log(
      `  ${spec.pet.padEnd(12)} ${st.name.padEnd(18)} ${String(spec.hour).padStart(2, '0')}:${String(spec.minute).padStart(2, '0')}  lt=${spec.lt.padEnd(8)} ${spec.onRoute ? 'na rota' : 'avulso'}`,
    );
  }

  // Persiste unit id se ainda não estava no arquivo diana
  const dianaEnv = path.join(ROOT, '.env.diana.staging.local');
  if (fs.existsSync(dianaEnv)) {
    let txt = fs.readFileSync(dianaEnv, 'utf8');
    if (!txt.includes('SEED_UNIT_ID=')) {
      txt += `SEED_UNIT_ID=${unitId}\n`;
      fs.writeFileSync(dianaEnv, txt, { mode: 0o600 });
    }
  }

  console.log(`\nPronto.`);
  console.log(`  Serviços (pais): ${parents}`);
  console.log(`  Pernas L&T:      ${legs}`);
  console.log(`  Paradas:         ${stops}`);
  console.log(`  Rota:            ${route.id}`);
  console.log(`  Login:           diana.paixao@petmi.staging`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
