/**
 * Seed demo staging — Clínica Diana Paixão (cenário rico).
 *
 * - CADMIN Diana + staff Diana Paixão
 * - Catálogo básico (grupos, tipos, banheiras)
 * - Muitos tutores/pets
 * - Em seguida rode: npm run seed:ops-demo (com SEED_CLINIC_ID / SEED_UNIT_ID)
 *
 * Uso:
 *   npm run seed:diana-staging
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(__dirname, '..');
// Carrega Preprod ANTES de qualquer import que use supabaseAdmin.
dotenv.config({ path: path.join(ROOT, '.env.preprod.local'), override: true });
process.env.SUPABASE_URL = process.env.SUPABASE_URL?.trim();
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY?.trim();

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const ANON = process.env.SUPABASE_ANON_KEY?.trim();

if (!SUPABASE_URL?.includes('afstcbhcbrkvbihtjbww') || !SERVICE_ROLE || !ANON) {
  console.error('Use .env.preprod.local (Preprod). Abortando.');
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CLINIC_ID = 'd1a0a111-1111-4111-8111-111111111111';
const EMAIL = 'diana.paixao@petmi.staging';
const PASSWORD = process.env.DIANA_STAGING_PASSWORD?.trim() || 'DianaStaging!2026';
const FULL_NAME = 'Diana Paixão';
const CLINIC_NAME = 'Clínica Diana Paixão';
const BETA_PLAN_ID = 'a1000000-0000-4000-8000-000000000001';
const MARKER = 'seed-diana-staging';

const SERVICE_CATALOG: Array<{
  code: string;
  name: string;
  service_group: string;
  sale_amount: number;
  agenda_color: string;
}> = [
  { code: 'banho', name: 'Banho', service_group: 'banho_tosa', sale_amount: 80, agenda_color: '#f0642f' },
  { code: 'tosa', name: 'Tosa higiênica', service_group: 'banho_tosa', sale_amount: 60, agenda_color: '#f0642f' },
  { code: 'consulta', name: 'Consulta clínica', service_group: 'clinica', sale_amount: 180, agenda_color: '#7b1fa2' },
  { code: 'retorno', name: 'Retorno clínico', service_group: 'clinica', sale_amount: 0, agenda_color: '#7b1fa2' },
  { code: 'hotel_diaria', name: 'Hotel — diária', service_group: 'hotel', sale_amount: 120, agenda_color: '#1565c0' },
  { code: 'creche_dia', name: 'Creche — dia', service_group: 'creche', sale_amount: 90, agenda_color: '#00897b' },
  { code: 'leva_traz', name: 'Leva e Traz', service_group: 'leva_traz', sale_amount: 45, agenda_color: '#5d4037' },
  { code: 'cirurgia_seed', name: 'Cirurgia eletiva', service_group: 'cirurgia', sale_amount: 800, agenda_color: '#c62828' },
  { code: 'internacao_seed', name: 'Internação — diária', service_group: 'internacao', sale_amount: 250, agenda_color: '#546e7a' },
];

const TUTORS: Array<{ name: string; phone: string; pets: Array<{ name: string; breed: string; size_tier: string }> }> = [
  { name: 'Ana Souza', phone: '11991001001', pets: [{ name: 'Thor', breed: 'Labrador', size_tier: 'grande' }, { name: 'Mel', breed: 'Poodle', size_tier: 'pequeno' }] },
  { name: 'Bruno Lima', phone: '11991001002', pets: [{ name: 'Bob', breed: 'SRD', size_tier: 'medio' }] },
  { name: 'Carla Mendes', phone: '11991001003', pets: [{ name: 'Luna', breed: 'Shih Tzu', size_tier: 'pequeno' }, { name: 'Nina', breed: 'Spitz', size_tier: 'mini' }] },
  { name: 'Diego Alves', phone: '11991001004', pets: [{ name: 'Rex', breed: 'Pastor Alemão', size_tier: 'grande' }] },
  { name: 'Elena Castro', phone: '11991001005', pets: [{ name: 'Mimi', breed: 'Persa', size_tier: 'pequeno' }] },
  { name: 'Fábio Rocha', phone: '11991001006', pets: [{ name: 'Pipoca', breed: 'Beagle', size_tier: 'medio' }, { name: 'Cookie', breed: 'Bulldog', size_tier: 'medio' }] },
  { name: 'Gabi Nunes', phone: '11991001007', pets: [{ name: 'Amora', breed: 'Yorkshire', size_tier: 'mini' }] },
  { name: 'Hugo Martins', phone: '11991001008', pets: [{ name: 'Zeus', breed: 'Rottweiler', size_tier: 'grande' }] },
  { name: 'Iris Barbosa', phone: '11991001009', pets: [{ name: 'Jade', breed: 'Golden', size_tier: 'grande' }, { name: 'Kiara', breed: 'SRD', size_tier: 'medio' }] },
  { name: 'João Pedro', phone: '11991001010', pets: [{ name: 'Fred', breed: 'Dachshund', size_tier: 'pequeno' }] },
  { name: 'Karen Dias', phone: '11991001011', pets: [{ name: 'Belinha', breed: 'Lhasa', size_tier: 'pequeno' }] },
  { name: 'Lucas Freitas', phone: '11991001012', pets: [{ name: 'Max', breed: 'Border Collie', size_tier: 'medio' }] },
  { name: 'Marina Costa', phone: '11991001013', pets: [{ name: 'Chico', breed: 'SRD', size_tier: 'medio' }, { name: 'Bela', breed: 'Pug', size_tier: 'pequeno' }] },
  { name: 'Nicolas Vieira', phone: '11991001014', pets: [{ name: 'Thorinho', breed: 'Pinscher', size_tier: 'mini' }] },
  { name: 'Olívia Ramos', phone: '11991001015', pets: [{ name: 'Sofia', breed: 'Maltês', size_tier: 'pequeno' }] },
  { name: 'Paulo Henrique', phone: '11991001016', pets: [{ name: 'Duke', breed: 'Boxer', size_tier: 'grande' }] },
  { name: 'Queila Santos', phone: '11991001017', pets: [{ name: 'Lili', breed: 'Shih Tzu', size_tier: 'pequeno' }] },
  { name: 'Rafael Gomes', phone: '11991001018', pets: [{ name: 'Bidu', breed: 'SRD', size_tier: 'medio' }, { name: 'Tobias', breed: 'Cocker', size_tier: 'medio' }] },
  { name: 'Sabrina Lopes', phone: '11991001019', pets: [{ name: 'Pandora', breed: 'Husky', size_tier: 'grande' }] },
  { name: 'Tiago Ferreira', phone: '11991001020', pets: [{ name: 'Luke', breed: 'Labrador', size_tier: 'grande' }, { name: 'Maya', breed: 'Poodle', size_tier: 'pequeno' }] },
];

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data == null) throw new Error(`${what}: sem retorno`);
  return res.data;
}

async function ensureAuthUser(): Promise<string> {
  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: FULL_NAME, full_name: FULL_NAME, source: MARKER },
  });
  if (created.data.user?.id) return created.data.user.id;
  const msg = (created.error?.message || '').toLowerCase();
  if (!msg.includes('already') && !msg.includes('registered')) {
    throw new Error(created.error?.message || 'createUser');
  }
  for (let page = 1; page <= 20; page++) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw listed.error;
    const hit = listed.data.users.find((u) => u.email?.toLowerCase() === EMAIL);
    if (hit) {
      await admin.auth.admin.updateUserById(hit.id, { password: PASSWORD, email_confirm: true });
      return hit.id;
    }
    if (listed.data.users.length < 200) break;
  }
  throw new Error('Usuário Diana não encontrado');
}

async function ensureClinic(userId: string) {
  const now = new Date().toISOString();
  const { data: existing } = await admin.from('clinics').select('id').eq('id', CLINIC_ID).maybeSingle();
  if (!existing) {
    must(
      await admin
        .from('clinics')
        .insert({
          id: CLINIC_ID,
          name: CLINIC_NAME,
          cnpj: '33333333000133',
          email: EMAIL,
          address: 'Rua das Palmeiras, 250',
          city: 'São Paulo',
          state: 'SP',
          phone: '11990001122',
          status: 'active',
          technical_manager: FULL_NAME,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single(),
      'clinic',
    );
  } else {
    await admin
      .from('clinics')
      .update({ name: CLINIC_NAME, status: 'active', email: EMAIL, updated_at: now })
      .eq('id', CLINIC_ID);
  }

  let unitId: string;
  const { data: unitExisting } = await admin
    .from('units')
    .select('id')
    .eq('clinic_id', CLINIC_ID)
    .eq('nickname', 'Principal')
    .maybeSingle();
  if (unitExisting?.id) {
    unitId = unitExisting.id as string;
  } else {
    const unit = must(
      await admin
        .from('units')
        .insert({
          clinic_id: CLINIC_ID,
          name: 'Unidade Principal',
          nickname: 'Principal',
          address: 'Rua das Palmeiras, 250',
          city: 'São Paulo',
          state: 'SP',
          phone: '11990001122',
          is_main: true,
          technical_manager: FULL_NAME,
          status: 'active',
        })
        .select('id')
        .single(),
      'unit',
    ) as { id: string };
    unitId = unit.id;
  }

  const { data: cu } = await admin.from('clinic_users').select('id').eq('user_id', userId).maybeSingle();
  const cuRow = {
    user_id: userId,
    clinic_id: CLINIC_ID,
    unit_id: unitId,
    role: 'CADMIN',
    status: 'active',
    name: FULL_NAME,
    email: EMAIL,
    first_login_completed_at: now,
    onboarding_state: { source: MARKER, completed: true },
    updated_at: now,
  };
  if (cu?.id) {
    await admin.from('clinic_users').update(cuRow).eq('id', cu.id);
  } else {
    await admin.from('clinic_users').insert({ id: crypto.randomUUID(), ...cuRow, created_at: now });
  }

  const { data: sub } = await admin
    .from('clinic_hub_subscriptions')
    .select('id')
    .eq('clinic_id', CLINIC_ID)
    .maybeSingle();
  if (!sub) {
    await admin.from('clinic_hub_subscriptions').insert({
      clinic_id: CLINIC_ID,
      base_plan_id: BETA_PLAN_ID,
      status: 'beta',
      is_beta: true,
      beta_notes: 'Demo Diana staging',
      enabled_modules: ['hub_core', 'clinic', 'grooming', 'boarding'],
      started_at: now,
      created_at: now,
      updated_at: now,
    });
  }

  return unitId;
}

async function ensureDianaStaff(unitId: string, clinicUserId: string | null): Promise<string> {
  const { data: existing } = await admin
    .from('hub_staff_members')
    .select('id')
    .eq('clinic_id', CLINIC_ID)
    .ilike('full_name', FULL_NAME)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const created = must(
    await admin
      .from('hub_staff_members')
      .insert({
        clinic_id: CLINIC_ID,
        full_name: FULL_NAME,
        job_title: 'Médica Veterinária / Administradora',
        professional_kind: 'vet',
        active: true,
        has_hub_access: true,
        hub_access_email: EMAIL,
        hub_access_role: 'CADMIN',
        accepts_appointments: true,
        default_unit_id: unitId,
        clinic_user_id: clinicUserId,
        operational_areas: ['clinica', 'cirurgia', 'internacao', 'banho_tosa', 'hotel_creche', 'leva_traz'],
        agenda_color: '#7b1fa2',
        internal_notes: MARKER,
      })
      .select('id')
      .single(),
    'staff Diana',
  ) as { id: string };
  return created.id;
}

async function ensureCatalog(unitId: string) {
  const { ensureDefaultGroupJobFunctions } = await import(
    '../src/modules/hub/hubServiceGroupsController'
  );
  await ensureDefaultGroupJobFunctions(CLINIC_ID);

  for (const s of SERVICE_CATALOG) {
    const { data: ex } = await admin
      .from('hub_service_types')
      .select('id')
      .eq('clinic_id', CLINIC_ID)
      .eq('code', s.code)
      .is('deleted_at', null)
      .maybeSingle();
    if (ex) continue;
    await admin.from('hub_service_types').insert({
      clinic_id: CLINIC_ID,
      code: s.code,
      name: s.name,
      service_group: s.service_group,
      sale_amount: s.sale_amount,
      cost_amount: Math.round(s.sale_amount * 0.35),
      allow_scheduling: true,
      is_addon: false,
      agenda_color: s.agenda_color,
      internal_notes: MARKER,
    });
  }

  // Banheiras
  let kindId: string;
  const { data: kind } = await admin
    .from('hub_resource_kinds')
    .select('id')
    .eq('clinic_id', CLINIC_ID)
    .eq('service_group_slug', 'banho_tosa')
    .is('deleted_at', null)
    .maybeSingle();
  if (kind?.id) {
    kindId = kind.id as string;
  } else {
    const created = must(
      await admin
        .from('hub_resource_kinds')
        .insert({
          clinic_id: CLINIC_ID,
          name: 'Banheira',
          service_group_slug: 'banho_tosa',
          active: true,
        })
        .select('id')
        .single(),
      'resource kind',
    ) as { id: string };
    kindId = created.id;
  }

  for (const name of ['Banheira 1', 'Banheira 2', 'Banheira 3']) {
    const { data: r } = await admin
      .from('hub_resources')
      .select('id')
      .eq('clinic_id', CLINIC_ID)
      .eq('unit_id', unitId)
      .eq('name', name)
      .is('deleted_at', null)
      .maybeSingle();
    if (r) continue;
    await admin.from('hub_resources').insert({
      clinic_id: CLINIC_ID,
      unit_id: unitId,
      resource_kind_id: kindId,
      name,
      active: true,
    });
  }
}

async function ensureClientsAndAgenda(staffId: string, unitId: string) {
  const { data: types } = await admin
    .from('hub_service_types')
    .select('id, code, name, service_group')
    .eq('clinic_id', CLINIC_ID)
    .is('deleted_at', null);
  const byCode = new Map((types ?? []).map((t: { code: string; id: string; name: string; service_group: string }) => [t.code, t]));

  const dayMs = 24 * 60 * 60 * 1000;
  let slot = 0;

  for (const tutor of TUTORS) {
    let guardianId: string;
    const { data: gEx } = await admin
      .from('hub_guardians')
      .select('id')
      .eq('clinic_id', CLINIC_ID)
      .eq('full_name', tutor.name)
      .is('deleted_at', null)
      .maybeSingle();
    if (gEx?.id) {
      guardianId = gEx.id as string;
    } else {
      const g = must(
        await admin
          .from('hub_guardians')
          .insert({
            clinic_id: CLINIC_ID,
            full_name: tutor.name,
            phone: tutor.phone,
            email: `${tutor.name.toLowerCase().replace(/\s+/g, '.')}@petmi.test`,
            client_kind: 'individual',
            client_status: 'active',
            notes: MARKER,
          })
          .select('id')
          .single(),
        `tutor ${tutor.name}`,
      ) as { id: string };
      guardianId = g.id;
    }

    for (const petSpec of tutor.pets) {
      let petId: string;
      const { data: pEx } = await admin
        .from('hub_pets')
        .select('id')
        .eq('clinic_id', CLINIC_ID)
        .eq('name', petSpec.name)
        .is('deleted_at', null)
        .maybeSingle();
      if (pEx?.id) {
        petId = pEx.id as string;
      } else {
        const p = must(
          await admin
            .from('hub_pets')
            .insert({
              clinic_id: CLINIC_ID,
              name: petSpec.name,
              species: 'Cão',
              breed: petSpec.breed,
              size_tier: petSpec.size_tier,
              coat_type: 'medio',
              sex: 'M',
              notes: MARKER,
            })
            .select('id')
            .single(),
          `pet ${petSpec.name}`,
        ) as { id: string };
        petId = p.id;
        await admin.from('hub_pet_guardians').insert({
          pet_id: petId,
          guardian_id: guardianId,
          role: 'primary',
        });
      }

      // Um agendamento por pet, espalhado nos serviços
      const codes = ['banho', 'consulta', 'hotel_diaria', 'creche_dia', 'leva_traz', 'cirurgia_seed', 'internacao_seed'];
      const code = codes[slot % codes.length];
      const st = byCode.get(code);
      slot += 1;
      if (!st) continue;

      const dayOffset = (slot % 5) - 1; // ontem … +3 dias
      const hour = 9 + (slot % 7);
      const starts = new Date(Date.now() + dayOffset * dayMs);
      starts.setHours(hour, 0, 0, 0);
      const ends = new Date(starts.getTime() + 60 * 60 * 1000);

      const title = `${st.name} · ${petSpec.name}`;
      const { data: apEx } = await admin
        .from('hub_appointments')
        .select('id')
        .eq('clinic_id', CLINIC_ID)
        .eq('pet_id', petId)
        .eq('title', title)
        .is('deleted_at', null)
        .maybeSingle();
      if (apEx) continue;

      const appt = must(
        await admin
          .from('hub_appointments')
          .insert({
            clinic_id: CLINIC_ID,
            unit_id: unitId,
            hub_service_type_id: st.id,
            hub_staff_member_id: staffId,
            pet_id: petId,
            guardian_id: guardianId,
            starts_at: starts.toISOString(),
            ends_at: ends.toISOString(),
            status: 'confirmed',
            appointment_kind: 'standard',
            title,
            notes: `${MARKER} agenda demo`,
          })
          .select('id')
          .single(),
        `appt ${title}`,
      ) as { id: string };

      await admin.from('hub_appointment_services').insert({
        appointment_id: appt.id,
        hub_service_type_id: st.id,
        duration_minutes: 60,
        order_index: 0,
      });
    }
  }
}

async function main() {
  console.log(`Seed Diana → ${SUPABASE_URL}`);
  const userId = await ensureAuthUser();
  const unitId = await ensureClinic(userId);
  const { data: cu } = await admin
    .from('clinic_users')
    .select('id')
    .eq('user_id', userId)
    .eq('clinic_id', CLINIC_ID)
    .maybeSingle();
  const staffId = await ensureDianaStaff(unitId, (cu?.id as string) || null);
  await ensureCatalog(unitId);
  await ensureClientsAndAgenda(staffId, unitId);

  const out = path.join(ROOT, '.env.diana.staging.local');
  fs.writeFileSync(
    out,
    [
      `SEED_CLINIC_ID=${CLINIC_ID}`,
      `SEED_UNIT_ID=${unitId}`,
      `SEED_VET_NAME=${FULL_NAME}`,
      `DIANA_STAGING_EMAIL=${EMAIL}`,
      `DIANA_STAGING_PASSWORD=${PASSWORD}`,
      `SUPABASE_URL=${SUPABASE_URL}`,
    ].join('\n') + '\n',
    { mode: 0o600 },
  );

  console.log('\nOK clínica Diana');
  console.log(`  Login:    ${EMAIL}`);
  console.log(`  Senha:    ${PASSWORD}`);
  console.log(`  Clínica:  ${CLINIC_ID}`);
  console.log(`  Unidade:  ${unitId}`);
  console.log(`  Creds →   ${out}`);
  console.log('\nAgora rode os seeds ops (banho, hotel, leva-traz, clínica):');
  console.log('  set -a && source .env.preprod.local && source .env.diana.staging.local && set +a && npm run seed:ops-demo');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
