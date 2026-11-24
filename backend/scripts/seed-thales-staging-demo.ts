/**
 * Seed demo staging — conta Thales Lima (cliente).
 *
 * - CADMIN thaleslima@petmihub.app + staff
 * - Clínica/unidade fictícia + assinatura beta
 * - Catálogo: ≥1 serviço por grupo + banheiras
 * - Tutores/pets + alguns agendamentos
 * - Produtos/medicamentos/vacinas com estoque inicial
 *
 * Uso:
 *   npm run seed:thales-staging
 *
 * Opcional:
 *   THALES_STAGING_PASSWORD='...'  (default gerado no script / .env.thales)
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env.preprod.local'), override: true });
process.env.SUPABASE_URL = process.env.SUPABASE_URL?.trim();
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY?.trim();

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const ANON = process.env.SUPABASE_ANON_KEY?.trim();

if (!SUPABASE_URL?.includes('afstcbhcbrkvbihtjbww') || !SERVICE_ROLE || !ANON) {
  console.error('Use .env.preprod.local (Preprod/staging Hub). Abortando.');
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CLINIC_ID = 'a7b3c1d0-4e5f-4689-9a0b-1c2d3e4f5a6b';
const EMAIL = 'thaleslima@petmihub.app';
const PASSWORD = process.env.THALES_STAGING_PASSWORD?.trim() || 'ThalesHub!2215efc8';
const FULL_NAME = 'Thales Lima';
const CLINIC_NAME = 'Pet Center Lima';
const BETA_PLAN_ID = 'a1000000-0000-4000-8000-000000000001';
const MARKER = 'seed-thales-staging';

const SERVICE_CATALOG: Array<{
  code: string;
  name: string;
  service_group: string;
  sale_amount: number;
  agenda_color: string;
}> = [
  { code: 'banho', name: 'Banho', service_group: 'banho_tosa', sale_amount: 75, agenda_color: '#f0642f' },
  { code: 'tosa', name: 'Tosa higiênica', service_group: 'banho_tosa', sale_amount: 55, agenda_color: '#f0642f' },
  { code: 'consulta', name: 'Consulta clínica', service_group: 'clinica', sale_amount: 160, agenda_color: '#7b1fa2' },
  { code: 'hotel_diaria', name: 'Hotel — diária', service_group: 'hotel', sale_amount: 110, agenda_color: '#1565c0' },
  { code: 'creche_dia', name: 'Creche — dia', service_group: 'creche', sale_amount: 85, agenda_color: '#00897b' },
  { code: 'leva_traz', name: 'Leva e Traz', service_group: 'leva_traz', sale_amount: 40, agenda_color: '#5d4037' },
  { code: 'cirurgia_seed', name: 'Cirurgia eletiva', service_group: 'cirurgia', sale_amount: 750, agenda_color: '#c62828' },
  { code: 'internacao_seed', name: 'Internação — diária', service_group: 'internacao', sale_amount: 220, agenda_color: '#546e7a' },
];

const TUTORS: Array<{
  name: string;
  phone: string;
  pets: Array<{ name: string; species: string; breed: string; size_tier: string }>;
}> = [
  {
    name: 'Camila Andrade',
    phone: '11987651001',
    pets: [
      { name: 'Toby', species: 'Cão', breed: 'Golden Retriever', size_tier: 'grande' },
      { name: 'Mila', species: 'Gato', breed: 'SRD', size_tier: 'pequeno' },
    ],
  },
  {
    name: 'Eduardo Martins',
    phone: '11987651002',
    pets: [{ name: 'Bolt', species: 'Cão', breed: 'Border Collie', size_tier: 'medio' }],
  },
  {
    name: 'Fernanda Ribeiro',
    phone: '11987651003',
    pets: [
      { name: 'Lola', species: 'Cão', breed: 'Shih Tzu', size_tier: 'pequeno' },
      { name: 'Nala', species: 'Cão', breed: 'Poodle', size_tier: 'pequeno' },
    ],
  },
  {
    name: 'Gustavo Pires',
    phone: '11987651004',
    pets: [{ name: 'Thor', species: 'Cão', breed: 'Labrador', size_tier: 'grande' }],
  },
  {
    name: 'Helena Castro',
    phone: '11987651005',
    pets: [{ name: 'Mingau', species: 'Gato', breed: 'Persa', size_tier: 'pequeno' }],
  },
  {
    name: 'Igor Nogueira',
    phone: '11987651006',
    pets: [{ name: 'Pipoca', species: 'Cão', breed: 'Beagle', size_tier: 'medio' }],
  },
  {
    name: 'Juliana Freitas',
    phone: '11987651007',
    pets: [
      { name: 'Mel', species: 'Cão', breed: 'Yorkshire', size_tier: 'mini' },
      { name: 'Fred', species: 'Cão', breed: 'SRD', size_tier: 'medio' },
    ],
  },
  {
    name: 'Ricardo Almeida',
    phone: '11987651008',
    pets: [{ name: 'Zeus', species: 'Cão', breed: 'Rottweiler', size_tier: 'grande' }],
  },
];

const INVENTORY: Array<{
  item_kind: 'product' | 'medication' | 'vaccine';
  name: string;
  store_sku: string;
  unit_label: string;
  cost_amount: number;
  sale_amount: number;
  qty: number;
  min_stock_qty: number;
}> = [
  {
    item_kind: 'product',
    name: 'Antipulgas Spot-on Cães',
    store_sku: 'PROD-ANTIPULGAS',
    unit_label: 'un',
    cost_amount: 42,
    sale_amount: 89.9,
    qty: 40,
    min_stock_qty: 5,
  },
  {
    item_kind: 'product',
    name: 'Shampoo Neutro Pet',
    store_sku: 'PROD-SHAMPOO',
    unit_label: 'un',
    cost_amount: 18,
    sale_amount: 45,
    qty: 30,
    min_stock_qty: 5,
  },
  {
    item_kind: 'product',
    name: 'Ração Premium Adulto 15kg',
    store_sku: 'PROD-RACAO15',
    unit_label: 'saco',
    cost_amount: 95,
    sale_amount: 179.9,
    qty: 12,
    min_stock_qty: 2,
  },
  {
    item_kind: 'medication',
    name: 'Dipirona Gotas Pet',
    store_sku: 'MED-DIPIRONA',
    unit_label: 'frasco',
    cost_amount: 12,
    sale_amount: 28.5,
    qty: 25,
    min_stock_qty: 4,
  },
  {
    item_kind: 'medication',
    name: 'Antibiótico Amox Pet 250mg',
    store_sku: 'MED-AMOX250',
    unit_label: 'cx',
    cost_amount: 22,
    sale_amount: 49.9,
    qty: 18,
    min_stock_qty: 3,
  },
  {
    item_kind: 'vaccine',
    name: 'Vacina V10',
    store_sku: 'VAC-V10',
    unit_label: 'dose',
    cost_amount: 35,
    sale_amount: 95,
    qty: 20,
    min_stock_qty: 4,
  },
  {
    item_kind: 'vaccine',
    name: 'Vacina Antirrábica',
    store_sku: 'VAC-RAIVA',
    unit_label: 'dose',
    cost_amount: 28,
    sale_amount: 75,
    qty: 15,
    min_stock_qty: 3,
  },
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
      await admin.auth.admin.updateUserById(hit.id, {
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name: FULL_NAME, full_name: FULL_NAME, source: MARKER },
      });
      return hit.id;
    }
    if (listed.data.users.length < 200) break;
  }
  throw new Error('Usuário Thales não encontrado');
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
          cnpj: '44556677000188',
          email: EMAIL,
          address: 'Av. Brigadeiro Faria Lima, 1500',
          city: 'São Paulo',
          state: 'SP',
          phone: '11994002211',
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
          address: 'Av. Brigadeiro Faria Lima, 1500',
          city: 'São Paulo',
          state: 'SP',
          phone: '11994002211',
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
      beta_notes: 'Demo Thales Lima staging',
      enabled_modules: ['hub_core', 'clinic', 'grooming', 'boarding'],
      started_at: now,
      created_at: now,
      updated_at: now,
    });
  }

  return unitId;
}

async function ensureStaff(
  unitId: string,
  clinicUserId: string | null,
): Promise<{ ownerId: string; groomerId: string; vetId: string }> {
  async function upsertStaff(args: {
    full_name: string;
    job_title: string;
    professional_kind: string;
    agenda_color: string;
    hub_access_email?: string | null;
    clinic_user_id?: string | null;
    operational_areas: string[];
  }): Promise<string> {
    const { data: existing } = await admin
      .from('hub_staff_members')
      .select('id')
      .eq('clinic_id', CLINIC_ID)
      .ilike('full_name', args.full_name)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing?.id) return existing.id as string;
    const created = must(
      await admin
        .from('hub_staff_members')
        .insert({
          clinic_id: CLINIC_ID,
          full_name: args.full_name,
          job_title: args.job_title,
          professional_kind: args.professional_kind,
          active: true,
          has_hub_access: Boolean(args.hub_access_email),
          hub_access_email: args.hub_access_email ?? null,
          hub_access_role: args.hub_access_email ? 'CADMIN' : null,
          accepts_appointments: true,
          default_unit_id: unitId,
          clinic_user_id: args.clinic_user_id ?? null,
          operational_areas: args.operational_areas,
          agenda_color: args.agenda_color,
          internal_notes: MARKER,
        })
        .select('id')
        .single(),
      `staff ${args.full_name}`,
    ) as { id: string };
    return created.id;
  }

  const ownerId = await upsertStaff({
    full_name: FULL_NAME,
    job_title: 'Administrador / Proprietário',
    professional_kind: 'other',
    agenda_color: '#1565c0',
    hub_access_email: EMAIL,
    clinic_user_id: clinicUserId,
    operational_areas: ['clinica', 'cirurgia', 'internacao', 'banho_tosa', 'hotel_creche', 'leva_traz'],
  });
  const groomerId = await upsertStaff({
    full_name: 'Ana Tosadora',
    job_title: 'Banho & Tosa',
    professional_kind: 'groomer',
    agenda_color: '#f0642f',
    operational_areas: ['banho_tosa'],
  });
  const vetId = await upsertStaff({
    full_name: 'Dr. Pedro Vet',
    job_title: 'Médico(a) Veterinário(a)',
    professional_kind: 'vet',
    agenda_color: '#7b1fa2',
    operational_areas: ['clinica', 'cirurgia', 'internacao'],
  });
  return { ownerId, groomerId, vetId };
}

async function ensureCatalog(unitId: string) {
  const { ensureDefaultHubServiceGroups, ensureDefaultGroupJobFunctions } = await import(
    '../src/modules/hub/hubServiceGroupsController'
  );
  await ensureDefaultHubServiceGroups(CLINIC_ID);
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

  for (const name of ['Banheira 1', 'Banheira 2']) {
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

async function ensureInventory() {
  let created = 0;
  let skipped = 0;
  for (const item of INVENTORY) {
    const { data: ex } = await admin
      .from('hub_inventory_items')
      .select('id')
      .eq('clinic_id', CLINIC_ID)
      .eq('store_sku', item.store_sku)
      .is('deleted_at', null)
      .maybeSingle();
    if (ex?.id) {
      skipped += 1;
      continue;
    }

    const row = must(
      await admin
        .from('hub_inventory_items')
        .insert({
          clinic_id: CLINIC_ID,
          item_kind: item.item_kind,
          name: item.name,
          store_sku: item.store_sku,
          unit_label: item.unit_label,
          cost_amount: item.cost_amount,
          sale_amount: item.sale_amount,
          allow_price_override_on_sale: true,
          min_stock_qty: item.min_stock_qty,
          expiry_alert_policy: item.item_kind === 'vaccine' || item.item_kind === 'medication' ? 'd60' : 'none',
          active: true,
          description: `${MARKER} · demo`,
        })
        .select('id')
        .single(),
      `inventory ${item.name}`,
    ) as { id: string };

    const lot = must(
      await admin
        .from('hub_inventory_lots')
        .insert({
          clinic_id: CLINIC_ID,
          item_id: row.id,
          lot_code: `THALES-${item.store_sku}`,
          received_at: new Date().toISOString().slice(0, 10),
          expiry_date:
            item.item_kind === 'vaccine' || item.item_kind === 'medication'
              ? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
              : null,
        })
        .select('id')
        .single(),
      `lot ${item.name}`,
    ) as { id: string };

    must(
      await admin
        .from('hub_stock_movements')
        .insert({
          clinic_id: CLINIC_ID,
          item_id: row.id,
          lot_id: lot.id,
          movement_type: 'initial_in',
          qty: item.qty,
          unit_cost: item.cost_amount,
          notes: `${MARKER} lote inicial`,
        })
        .select('id')
        .single(),
      `stock movement ${item.name}`,
    );
    created += 1;
  }
  console.log(`  Estoque: ${created} novo(s), ${skipped} já existia(m).`);
}

async function ensureClientsAndAgenda(
  staff: { ownerId: string; groomerId: string; vetId: string },
  unitId: string,
) {
  const { data: types } = await admin
    .from('hub_service_types')
    .select('id, code, name, service_group, sale_amount')
    .eq('clinic_id', CLINIC_ID)
    .is('deleted_at', null);
  const byCode = new Map(
    (types ?? []).map(
      (t: { code: string; id: string; name: string; service_group: string; sale_amount: number | null }) => [
        t.code,
        { ...t, sale_amount: Number(t.sale_amount ?? 0) },
      ],
    ),
  );

  const agendaPlan: Array<{
    code: string;
    status: string;
    dayOffset: number;
    hour: number;
    staffId: string;
  }> = [
    { code: 'banho', status: 'confirmed', dayOffset: 0, hour: 9, staffId: staff.groomerId },
    { code: 'consulta', status: 'checked_in', dayOffset: 0, hour: 10, staffId: staff.vetId },
    { code: 'tosa', status: 'in_progress', dayOffset: 0, hour: 11, staffId: staff.groomerId },
    { code: 'hotel_diaria', status: 'confirmed', dayOffset: 1, hour: 8, staffId: staff.ownerId },
    { code: 'creche_dia', status: 'pending_confirm', dayOffset: 1, hour: 9, staffId: staff.ownerId },
    { code: 'leva_traz', status: 'confirmed', dayOffset: 1, hour: 14, staffId: staff.ownerId },
    { code: 'cirurgia_seed', status: 'confirmed', dayOffset: 2, hour: 8, staffId: staff.vetId },
    { code: 'internacao_seed', status: 'confirmed', dayOffset: 2, hour: 10, staffId: staff.vetId },
    { code: 'consulta', status: 'done', dayOffset: -1, hour: 15, staffId: staff.vetId },
    { code: 'banho', status: 'done', dayOffset: -1, hour: 10, staffId: staff.groomerId },
  ];

  const dayMs = 24 * 60 * 60 * 1000;
  let tutorIdx = 0;
  let createdAppts = 0;
  let skippedAppts = 0;
  let createdGuardians = 0;
  let createdPets = 0;

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
      createdGuardians += 1;
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
              species: petSpec.species,
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
        createdPets += 1;
      }
    }
  }

  // Um agendamento por plano, rotacionando pets
  const { data: allPets } = await admin
    .from('hub_pets')
    .select('id, name, hub_pet_guardians(guardian_id)')
    .eq('clinic_id', CLINIC_ID)
    .is('deleted_at', null);

  const pets = (allPets ?? []).map((p: any) => ({
    id: p.id as string,
    name: p.name as string,
    guardianId: (p.hub_pet_guardians?.[0]?.guardian_id as string) || null,
  }));

  for (let i = 0; i < agendaPlan.length; i++) {
    const plan = agendaPlan[i];
    const pet = pets[i % Math.max(pets.length, 1)];
    if (!pet?.id || !pet.guardianId) continue;
    const st = byCode.get(plan.code);
    if (!st) continue;

    const starts = new Date(Date.now() + plan.dayOffset * dayMs);
    starts.setHours(plan.hour, 0, 0, 0);
    const ends = new Date(starts.getTime() + 60 * 60 * 1000);
    const title = `${st.name} · ${pet.name}`;
    const notes = `${MARKER} agenda demo · status=${plan.status}`;

    const { data: apEx } = await admin
      .from('hub_appointments')
      .select('id')
      .eq('clinic_id', CLINIC_ID)
      .eq('pet_id', pet.id)
      .eq('title', title)
      .is('deleted_at', null)
      .maybeSingle();

    if (apEx?.id) {
      skippedAppts += 1;
      continue;
    }

    const appt = must(
      await admin
        .from('hub_appointments')
        .insert({
          clinic_id: CLINIC_ID,
          unit_id: unitId,
          hub_service_type_id: st.id,
          hub_staff_member_id: plan.staffId,
          pet_id: pet.id,
          guardian_id: pet.guardianId,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          status: plan.status,
          appointment_kind: 'standard',
          title,
          notes,
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
      sale_amount_applied: st.sale_amount,
      cost_amount_applied: Math.round(st.sale_amount * 0.3),
      pricing_source: 'catalog',
    });
    createdAppts += 1;
    tutorIdx += 1;
  }

  console.log(
    `  Clientes: ${createdGuardians} tutor(es) novo(s), ${createdPets} pet(s) novo(s); agenda: ${createdAppts} novo(s), ${skippedAppts} já existia(m).`,
  );
}

async function main() {
  console.log(`Seed Thales → ${SUPABASE_URL}`);
  const userId = await ensureAuthUser();
  const unitId = await ensureClinic(userId);
  const { data: cu } = await admin
    .from('clinic_users')
    .select('id')
    .eq('user_id', userId)
    .eq('clinic_id', CLINIC_ID)
    .maybeSingle();
  const staff = await ensureStaff(unitId, (cu?.id as string) || null);
  await ensureCatalog(unitId);
  await ensureInventory();
  await ensureClientsAndAgenda(staff, unitId);

  const out = path.join(ROOT, '.env.thales.staging.local');
  fs.writeFileSync(
    out,
    [
      `SEED_CLINIC_ID=${CLINIC_ID}`,
      `SEED_UNIT_ID=${unitId}`,
      `THALES_STAGING_EMAIL=${EMAIL}`,
      `THALES_STAGING_PASSWORD=${PASSWORD}`,
      `SUPABASE_URL=${SUPABASE_URL}`,
    ].join('\n') + '\n',
    { mode: 0o600 },
  );

  console.log('\nOK clínica Thales');
  console.log(`  Login:    ${EMAIL}`);
  console.log(`  Senha:    ${PASSWORD}`);
  console.log(`  Clínica:  ${CLINIC_NAME} (${CLINIC_ID})`);
  console.log(`  Unidade:  ${unitId}`);
  console.log(`  URL:      https://hub-staging.petmi.app`);
  console.log(`  Creds →   ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
