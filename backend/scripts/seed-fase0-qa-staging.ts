/**
 * Seed Fase 0 — matriz QA no Supabase Preprod / staging.
 *
 * Cria:
 * - Clínica A: CADMIN, CMANAGER, CASSISTANT, CVET_INTERNAL, CFINANCE + unidades A1/A2 + 1 guardian
 * - Clínica B: CADMIN + unidade B1
 * - Assinatura beta em ambas
 *
 * Uso (pasta backend):
 *   # carrega só .env.preprod.local (nunca prod)
 *   npm run seed:fase0-qa-staging
 *
 * Saída: .env.smoke.preprod.local (gitignored) com vars do smoke de isolamento.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(__dirname, '..');
const PREPROD_ENV = path.join(ROOT, '.env.preprod.local');
const SMOKE_OUT = path.join(ROOT, '.env.smoke.preprod.local');

if (!fs.existsSync(PREPROD_ENV)) {
  console.error('Falta backend/.env.preprod.local');
  process.exit(2);
}

dotenv.config({ path: PREPROD_ENV, override: true });

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const API_STAGING =
  process.env.RAILWAY_STAGING_API_URL?.trim() ||
  'https://backend-staging-334260f3.up.railway.app';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes em .env.preprod.local');
  process.exit(2);
}

if (!SUPABASE_URL.includes('afstcbhcbrkvbihtjbww')) {
  console.error(
    `Recusa: SUPABASE_URL não parece Preprod (${SUPABASE_URL}). Abortando para não tocar prod.`,
  );
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const QA_PASSWORD = process.env.QA_STAGING_PASSWORD?.trim() || 'QaStaging!2026';
const PREFIX = 'QA STAGING';

type Role =
  | 'CADMIN'
  | 'CMANAGER'
  | 'CASSISTANT'
  | 'CVET_INTERNAL'
  | 'CFINANCE';

type UserSpec = {
  role: Role;
  email: string;
  name: string;
};

const CLINIC_A_USERS: UserSpec[] = [
  { role: 'CADMIN', email: 'qa.staging.a.cadmin@petmi.test', name: `${PREFIX} CADMIN A` },
  { role: 'CMANAGER', email: 'qa.staging.a.cmanager@petmi.test', name: `${PREFIX} CMANAGER A` },
  { role: 'CASSISTANT', email: 'qa.staging.a.cassistant@petmi.test', name: `${PREFIX} CASSISTANT A` },
  { role: 'CVET_INTERNAL', email: 'qa.staging.a.cvet@petmi.test', name: `${PREFIX} CVET A` },
  { role: 'CFINANCE', email: 'qa.staging.a.cfinance@petmi.test', name: `${PREFIX} CFINANCE A` },
];

const CLINIC_B_USERS: UserSpec[] = [
  { role: 'CADMIN', email: 'qa.staging.b.cadmin@petmi.test', name: `${PREFIX} CADMIN B` },
];

const BETA_PLAN_ID = 'a1000000-0000-4000-8000-000000000001';

async function ensureAuthUser(email: string, name: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  // tenta criar; se já existe, busca via list (paginação simples)
  const created = await admin.auth.admin.createUser({
    email: normalized,
    password: QA_PASSWORD,
    email_confirm: true,
    user_metadata: { name, full_name: name, source: 'fase0_qa_seed' },
  });

  if (created.data.user?.id) return created.data.user.id;

  const msg = (created.error?.message || '').toLowerCase();
  if (!msg.includes('already') && !msg.includes('registered')) {
    throw new Error(`createUser ${normalized}: ${created.error?.message}`);
  }

  let page = 1;
  for (;;) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw listed.error;
    const hit = listed.data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (hit) return hit.id;
    if (listed.data.users.length < 200) break;
    page += 1;
    if (page > 20) break;
  }
  throw new Error(`Usuário já existia mas não foi encontrado: ${normalized}`);
}

async function upsertClinicUser(args: {
  userId: string;
  clinicId: string;
  unitId: string;
  role: Role;
  email: string;
  name: string;
}) {
  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from('clinic_users')
    .select('id')
    .eq('user_id', args.userId)
    .maybeSingle();

  const row = {
    user_id: args.userId,
    clinic_id: args.clinicId,
    unit_id: args.unitId,
    role: args.role,
    status: 'active',
    name: args.name,
    email: args.email.toLowerCase(),
    first_login_completed_at: now,
    onboarding_state: { source: 'fase0_qa_seed', completed: true },
    updated_at: now,
  };

  if (existing?.id) {
    const { error } = await admin.from('clinic_users').update(row).eq('id', existing.id);
    if (error) throw error;
    return existing.id as string;
  }

  const id = crypto.randomUUID();
  const { error } = await admin.from('clinic_users').insert({
    id,
    ...row,
    created_at: now,
  });
  if (error) throw error;
  return id;
}

async function ensureClinic(args: {
  id: string;
  name: string;
  cnpj: string;
  email: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing } = await admin.from('clinics').select('id').eq('id', args.id).maybeSingle();
  if (existing) {
    await admin
      .from('clinics')
      .update({
        name: args.name,
        status: 'active',
        email: args.email,
        updated_at: now,
      })
      .eq('id', args.id);
    return;
  }
  const { error } = await admin.from('clinics').insert({
    id: args.id,
    name: args.name,
    cnpj: args.cnpj,
    email: args.email,
    address: 'Rua QA Staging, 100',
    city: 'São Paulo',
    state: 'SP',
    phone: '11999990000',
    status: 'active',
    technical_manager: `${PREFIX} Responsável Técnico`,
    created_at: now,
    updated_at: now,
  });
  if (error) throw error;
}

async function ensureUnit(args: {
  clinicId: string;
  name: string;
  nickname: string;
  isMain: boolean;
}): Promise<string> {
  const { data: existing } = await admin
    .from('units')
    .select('id')
    .eq('clinic_id', args.clinicId)
    .eq('nickname', args.nickname)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await admin
    .from('units')
    .insert({
      clinic_id: args.clinicId,
      name: args.name,
      nickname: args.nickname,
      address: 'Rua QA Staging, 100',
      city: 'São Paulo',
      state: 'SP',
      phone: '11999990000',
      is_main: args.isMain,
      technical_manager: `${PREFIX} RT`,
      status: 'active',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function ensureBeta(clinicId: string) {
  const { data: existing } = await admin
    .from('clinic_hub_subscriptions')
    .select('id')
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (existing) return;
  const now = new Date().toISOString();
  const { error } = await admin.from('clinic_hub_subscriptions').insert({
    clinic_id: clinicId,
    base_plan_id: BETA_PLAN_ID,
    status: 'beta',
    is_beta: true,
    beta_notes: 'Fase 0 QA seed',
    enabled_modules: ['hub_core', 'clinic', 'grooming', 'boarding'],
    started_at: now,
    created_at: now,
    updated_at: now,
  });
  if (error && error.code !== '23505') throw error;
}

async function ensureGuardian(clinicId: string): Promise<string> {
  const fullName = `${PREFIX} Tutor A`;
  const { data: existing } = await admin
    .from('hub_guardians')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('full_name', fullName)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await admin
    .from('hub_guardians')
    .insert({
      clinic_id: clinicId,
      full_name: fullName,
      phone: '11988887777',
      email: 'qa.staging.tutor.a@petmi.test',
      client_kind: 'individual',
      client_status: 'active',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function provisionClinic(args: {
  clinicId: string;
  clinicName: string;
  cnpj: string;
  users: UserSpec[];
  units: Array<{ name: string; nickname: string; isMain: boolean }>;
}) {
  const adminUser = args.users.find((u) => u.role === 'CADMIN');
  if (!adminUser) throw new Error('CADMIN obrigatório');

  const adminId = await ensureAuthUser(adminUser.email, adminUser.name);
  await ensureClinic({
    id: args.clinicId,
    name: args.clinicName,
    cnpj: args.cnpj,
    email: adminUser.email,
  });

  const unitIds: string[] = [];
  for (const u of args.units) {
    unitIds.push(
      await ensureUnit({
        clinicId: args.clinicId,
        name: u.name,
        nickname: u.nickname,
        isMain: u.isMain,
      }),
    );
  }
  const mainUnitId = unitIds[0];

  for (const spec of args.users) {
    const userId = spec.role === 'CADMIN' ? adminId : await ensureAuthUser(spec.email, spec.name);
    await upsertClinicUser({
      userId,
      clinicId: args.clinicId,
      unitId: mainUnitId,
      role: spec.role,
      email: spec.email,
      name: spec.name,
    });
  }

  await ensureBeta(args.clinicId);
  return { adminId, mainUnitId, unitIds };
}

async function signIn(email: string): Promise<string> {
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  if (!anon) throw new Error('SUPABASE_ANON_KEY ausente para obter JWT');
  const client = createClient(SUPABASE_URL!, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: email.toLowerCase(),
    password: QA_PASSWORD,
  });
  if (error || !data.session?.access_token) {
    throw new Error(`signIn ${email}: ${error?.message || 'sem token'}`);
  }
  return data.session.access_token;
}

async function main() {
  console.log(`Seed Fase 0 QA → ${SUPABASE_URL}`);

  // IDs estáveis (derivados) para reexecução idempotente
  const clinicAId = 'a1111111-1111-4111-8111-111111111111';
  const clinicBId = 'b2222222-2222-4222-8222-222222222222';

  const a = await provisionClinic({
    clinicId: clinicAId,
    clinicName: `${PREFIX} Clínica A`,
    cnpj: '11111111000111',
    users: CLINIC_A_USERS,
    units: [
      { name: `${PREFIX} Unidade A1`, nickname: 'A1', isMain: true },
      { name: `${PREFIX} Unidade A2`, nickname: 'A2', isMain: false },
    ],
  });

  await provisionClinic({
    clinicId: clinicBId,
    clinicName: `${PREFIX} Clínica B`,
    cnpj: '22222222000122',
    users: CLINIC_B_USERS,
    units: [{ name: `${PREFIX} Unidade B1`, nickname: 'B1', isMain: true }],
  });

  const guardianA = await ensureGuardian(clinicAId);
  const tokenA = await signIn(CLINIC_A_USERS[0].email);
  const tokenB = await signIn(CLINIC_B_USERS[0].email);

  const smoke = [
    `HUB_SMOKE_BASE_URL=${API_STAGING.replace(/\/$/, '')}`,
    `HUB_SMOKE_TOKEN_A=${tokenA}`,
    `HUB_SMOKE_TOKEN_B=${tokenB}`,
    `HUB_SMOKE_CLINIC_A=${clinicAId}`,
    `HUB_SMOKE_CLINIC_B=${clinicBId}`,
    `HUB_SMOKE_GUARDIAN_A=${guardianA}`,
    `QA_STAGING_PASSWORD=${QA_PASSWORD}`,
  ].join('\n');

  fs.writeFileSync(SMOKE_OUT, `${smoke}\n`, { mode: 0o600 });

  console.log('\nOK seed Fase 0');
  console.log(`  Clínica A: ${clinicAId} (units ${a.unitIds.join(', ')})`);
  console.log(`  Clínica B: ${clinicBId}`);
  console.log(`  Guardian A: ${guardianA}`);
  console.log(`  Senha QA: ${QA_PASSWORD}`);
  console.log(`  Logins A: ${CLINIC_A_USERS.map((u) => u.email).join(', ')}`);
  console.log(`  Logins B: ${CLINIC_B_USERS.map((u) => u.email).join(', ')}`);
  console.log(`  Smoke env → ${SMOKE_OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
