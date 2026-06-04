#!/usr/bin/env node
/**
 * Popula dados de demonstração no Hub para a conta da clínica (CADMIN).
 *
 * Cria (ou reutiliza, de forma idempotente):
 * - Tutores e co-tutor + pets com vínculo primary/secondary
 * - Equipe (tosador, veterinário, recepção)
 * - Orçamentos (rascunho + enviado)
 * - Agenda com vários agendamentos nos próximos dias
 *
 * Pré-requisitos:
 * 1) Backend a correr (ex.: http://localhost:3000).
 * 2) Conta Hub com clínica e unidade ativa (onboarding concluído).
 * 3) Senha no ambiente (não commitar).
 *
 * Uso:
 *   HUB_SEED_PASSWORD='sua_senha' node scripts/seed-hub-beatriz-demo.mjs
 *
 * Opcional:
 *   HUB_SEED_EMAIL=beatriz+cadmin@petmihub.com
 *   API_URL=http://localhost:3000
 *   SEED_FORCE=1          — cria agendamentos/orçamentos extra mesmo se o marcador já existir
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const SEED_MARKER = 'seed-hub-beatriz-demo';
const DEMO_PREFIX = '[Demo]';

function loadDotEnvFile(absPath) {
  if (!existsSync(absPath)) return;
  const txt = readFileSync(absPath, 'utf8');
  for (const rawLine of txt.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnvFile(join(repoRoot, 'backend', '.env'));
loadDotEnvFile(join(repoRoot, 'backend', '.env.local'));

const API_URL = (process.env.API_URL || process.env.REACT_APP_API_URL || 'http://localhost:3000').replace(
  /\/$/,
  ''
);
const EMAIL = process.env.HUB_SEED_EMAIL || 'beatriz+cadmin@petmihub.com';
const PASSWORD = process.env.HUB_SEED_PASSWORD;
const FORCE = process.env.SEED_FORCE === '1' || process.env.SEED_FORCE === 'true';

const DEMO = {
  maria: { full_name: `${DEMO_PREFIX} Maria Silva`, tax_id: '52998224725', phone: '11987654321' },
  joao: { full_name: `${DEMO_PREFIX} João Silva (co-tutor)`, tax_id: '39053344705', phone: '11976543210' },
  prospect: {
    full_name: `${DEMO_PREFIX} Contato Orçamento`,
    tax_id: '12345678909',
    phone: '11999887766',
    email: 'demo.orcamento@example.com',
  },
  staff: {
    ana: {
      full_name: `${DEMO_PREFIX} Ana Tosador`,
      job_title: 'Tosador(a)',
      professional_kind: 'groomer',
      agenda_color: '#f0642f',
    },
    pedro: {
      full_name: `${DEMO_PREFIX} Dr. Pedro Vet`,
      job_title: 'Médico veterinário',
      professional_kind: 'vet',
      crmv: '12345',
      crmv_uf: 'SP',
      agenda_color: '#2e7d32',
    },
    carla: {
      full_name: `${DEMO_PREFIX} Carla Recepção`,
      job_title: 'Recepção',
      professional_kind: 'reception',
      agenda_color: '#5c6bc0',
    },
  },
  pets: {
    thor: { name: `${DEMO_PREFIX} Thor`, species: 'Cão', breed: 'Golden Retriever', size_tier: 'grande', coat_type: 'medio', sex: 'M' },
    luna: { name: `${DEMO_PREFIX} Luna`, species: 'Gato', breed: 'SRD', size_tier: 'pequeno', coat_type: 'curto', sex: 'F' },
  },
};

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text };
  }
  if (!res.ok) {
    const msg = data.error || data.message || JSON.stringify(data.details || data._raw || '') || res.statusText;
    throw new Error(`${res.status} ${url}: ${msg}`);
  }
  return data;
}

/** ISO com offset fixo America/São Paulo (UTC-3, sem horário de verão). */
function slotBr(daysFromNow, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(d)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const y = parts.year;
  const mo = parts.month;
  const da = parts.day;
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${y}-${mo}-${da}T${hh}:${mm}:00-03:00`;
}

function addMinutesBr(startIso, minutes) {
  const ms = new Date(startIso).getTime() + minutes * 60_000;
  const d = new Date(ms);
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
  return `${s.replace(' ', 'T')}-03:00`;
}

function hasMarker(notes) {
  return typeof notes === 'string' && notes.includes(SEED_MARKER);
}

async function hubGet(path, authHeaders, query = {}) {
  const qs = new URLSearchParams(query).toString();
  const url = `${API_URL}/api/hub${path}${qs ? `?${qs}` : ''}`;
  return fetchJson(url, { headers: authHeaders });
}

async function hubPost(path, authHeaders, body) {
  return fetchJson(`${API_URL}/api/hub${path}`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function resolveClinicAndUnit(token) {
  const login = await fetchJson(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  const accessToken = login.session?.access_token;
  if (!accessToken) throw new Error('Login sem session.access_token');

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  let clinicId = login.onboarding?.clinicId || null;
  if (!clinicId) {
    const ctx = await hubGet('/session/context', authHeaders);
    clinicId = ctx.onboarding?.clinicId || ctx.clinicUser?.clinic_id || null;
  }
  if (!clinicId) {
    throw new Error(
      'Não foi possível resolver clinic_id. Confirma que a conta concluiu o onboarding Hub e tem vínculo em clinic_users.'
    );
  }

  const { units } = await fetchJson(`${API_URL}/units/clinic/${clinicId}?activeOnly=true`, {
    headers: authHeaders,
  });
  const approved = (units || []).filter((u) =>
    ['approved', 'active'].includes(String(u.status || '').toLowerCase())
  );
  if (approved.length === 0) {
    throw new Error('Nenhuma unidade active/approved. Completa o onboarding da unidade.');
  }

  return { clinicId, unitId: approved[0].id, authHeaders };
}

async function ensureServiceTypes(clinicId, authHeaders) {
  await hubPost(`/service-types/bootstrap?clinic_id=${clinicId}`, authHeaders, {});
  const { service_types: types } = await hubGet('/service-types', authHeaders, { clinic_id: clinicId });
  const byCode = Object.fromEntries((types || []).map((t) => [t.code, t]));
  const consulta = byCode.consulta;
  const banho = byCode.banho_tosa;
  if (!consulta?.id || !banho?.id) {
    throw new Error('Tipos de serviço consulta/banho_tosa ausentes após bootstrap.');
  }
  return { consulta, banho };
}

async function findGuardianByName(guardians, name) {
  return (guardians || []).find((g) => g.full_name === name) || null;
}

async function ensureGuardians(clinicId, authHeaders) {
  const { guardians: list } = await hubGet('/guardians', authHeaders, { clinic_id: clinicId, q: DEMO_PREFIX });
  let maria = findGuardianByName(list, DEMO.maria.full_name);
  let joao = findGuardianByName(list, DEMO.joao.full_name);

  if (!maria) {
    const r = await hubPost('/guardians', authHeaders, {
      clinic_id: clinicId,
      ...DEMO.maria,
      email: 'maria.demo@example.com',
      notes: SEED_MARKER,
      client_status: 'active',
    });
    maria = r.guardian;
    console.log('Tutor criado:', maria.full_name);
  } else {
    console.log('Tutor existente:', maria.full_name);
  }

  if (!joao) {
    const r = await hubPost('/guardians', authHeaders, {
      clinic_id: clinicId,
      ...DEMO.joao,
      email: 'joao.demo@example.com',
      notes: SEED_MARKER,
      client_status: 'active',
    });
    joao = r.guardian;
    console.log('Co-tutor criado:', joao.full_name);
  } else {
    console.log('Co-tutor existente:', joao.full_name);
  }

  return { maria, joao };
}

async function ensurePets(clinicId, authHeaders, maria, joao) {
  const { pets: list } = await hubGet('/pets', authHeaders, { clinic_id: clinicId });
  const byName = (name) => (list || []).find((p) => p.name === name);

  let thor = byName(DEMO.pets.thor.name);
  let luna = byName(DEMO.pets.luna.name);

  if (!thor) {
    const r = await hubPost('/pets', authHeaders, {
      clinic_id: clinicId,
      ...DEMO.pets.thor,
      primary_guardian_id: maria.id,
      secondary_guardian_id: joao.id,
      notes: SEED_MARKER,
    });
    thor = r.pet;
    console.log('Pet criado (tutor + co-tutor):', thor.name);
  } else {
    console.log('Pet existente:', thor.name);
  }

  if (!luna) {
    const r = await hubPost('/pets', authHeaders, {
      clinic_id: clinicId,
      ...DEMO.pets.luna,
      primary_guardian_id: maria.id,
      notes: SEED_MARKER,
    });
    luna = r.pet;
    console.log('Pet criado (só tutor):', luna.name);
  } else {
    console.log('Pet existente:', luna.name);
  }

  return { thor, luna };
}

async function findStaffByName(staffList, name) {
  return (staffList || []).find((s) => s.full_name === name) || null;
}

async function ensureStaff(clinicId, unitId, authHeaders, serviceTypes) {
  const { staff: list } = await hubGet('/staff', authHeaders, { clinic_id: clinicId });
  const created = {};

  for (const [key, spec] of [
    ['ana', { ...DEMO.staff.ana, service_type_ids: [serviceTypes.banho.id], accepts_appointments: true }],
    ['pedro', { ...DEMO.staff.pedro, service_type_ids: [serviceTypes.consulta.id], accepts_appointments: true }],
    ['carla', { ...DEMO.staff.carla, service_type_ids: [], accepts_appointments: false }],
  ]) {
    let row = findStaffByName(list, spec.full_name);
    if (!row) {
      const r = await hubPost('/staff', authHeaders, {
        clinic_id: clinicId,
        default_unit_id: unitId,
        active: true,
        has_hub_access: false,
        internal_notes: SEED_MARKER,
        ...spec,
      });
      row = r.staff || r.member || r;
      console.log('Equipe criada:', spec.full_name);
    } else {
      console.log('Equipe existente:', spec.full_name);
    }
    created[key] = row;
  }

  return created;
}

async function ensureQuotes(clinicId, unitId, authHeaders, serviceTypes) {
  const { quotes: list } = await hubGet('/quotes', authHeaders, { clinic_id: clinicId });
  const seeded = (list || []).filter((q) => hasMarker(q.notes));
  if (seeded.length >= 2 && !FORCE) {
    console.log(`Orçamentos demo já existem (${seeded.length}). Use SEED_FORCE=1 para criar mais.`);
    return seeded;
  }

  const created = [];

  const draftBody = {
    clinic_id: clinicId,
    unit_id: unitId,
    notes: `${SEED_MARKER} rascunho banho`,
    prospect: DEMO.prospect,
    pets: [
      {
        client_id: 'mel',
        display_name: `${DEMO_PREFIX} Mel`,
        species: 'Cão',
        breed: 'Poodle',
        size_tier: 'pequeno',
        coat_type: 'curto',
        sex: 'F',
      },
    ],
    lines: [
      {
        hub_service_type_id: serviceTypes.banho.id,
        line_pets: [{ pet_client_id: 'mel', unit_price: 95 }],
      },
    ],
  };

  const draft = await hubPost('/quotes', authHeaders, draftBody);
  created.push(draft.quote || draft);
  console.log('Orçamento rascunho:', (draft.quote || draft).id);

  const sentBody = {
    clinic_id: clinicId,
    unit_id: unitId,
    notes: `${SEED_MARKER} enviado consulta`,
    prospect: {
      full_name: `${DEMO_PREFIX} Família Costa`,
      tax_id: '98765432100',
      phone: '11988776655',
      email: 'costa.demo@example.com',
    },
    pets: [
      {
        client_id: 'rex',
        display_name: `${DEMO_PREFIX} Rex`,
        species: 'Cão',
        breed: 'Labrador',
        size_tier: 'grande',
        coat_type: 'curto',
        sex: 'M',
      },
      {
        client_id: 'nina',
        display_name: `${DEMO_PREFIX} Nina`,
        species: 'Cão',
        breed: 'Shih Tzu',
        size_tier: 'mini',
        coat_type: 'longo',
        sex: 'F',
      },
    ],
    lines: [
      {
        hub_service_type_id: serviceTypes.consulta.id,
        line_pets: [
          { pet_client_id: 'rex', unit_price: 120 },
          { pet_client_id: 'nina', unit_price: 120 },
        ],
      },
    ],
  };

  const sent = await hubPost('/quotes', authHeaders, sentBody);
  const sentId = (sent.quote || sent).id;
  await hubPost(`/quotes/${sentId}/send?clinic_id=${clinicId}`, authHeaders, {});
  created.push(sent.quote || sent);
  console.log('Orçamento enviado:', sentId);

  return created;
}

async function ensureAppointments(clinicId, unitId, authHeaders, ctx) {
  const from = `${slotBr(0, 0, 0).slice(0, 10)}T00:00:00-03:00`;
  const to = `${slotBr(14, 23, 59).slice(0, 10)}T23:59:59-03:00`;
  const { appointments: existing } = await hubGet('/appointments', authHeaders, {
    clinic_id: clinicId,
    from,
    to,
  });
  const seeded = (existing || []).filter((a) => hasMarker(a.notes));
  if (seeded.length >= 4 && !FORCE) {
    console.log(`Agendamentos demo já existem (${seeded.length}). Use SEED_FORCE=1 para criar mais.`);
    return seeded;
  }

  const slots = [
    {
      label: 'Banho Thor',
      days: 1,
      hour: 10,
      min: 0,
      duration: 60,
      service: ctx.serviceTypes.banho,
      staff: ctx.staff.ana,
      pet: ctx.pets.thor,
      guardian: ctx.guardians.maria,
      status: 'confirmed',
    },
    {
      label: 'Consulta Luna',
      days: 2,
      hour: 14,
      min: 30,
      duration: 30,
      service: ctx.serviceTypes.consulta,
      staff: ctx.staff.pedro,
      pet: ctx.pets.luna,
      guardian: ctx.guardians.maria,
      status: 'confirmed',
    },
    {
      label: 'Banho Thor (retorno)',
      days: 4,
      hour: 9,
      min: 0,
      duration: 60,
      service: ctx.serviceTypes.banho,
      staff: ctx.staff.ana,
      pet: ctx.pets.thor,
      guardian: ctx.guardians.maria,
      status: 'pending_confirm',
    },
    {
      label: 'Consulta Thor',
      days: 5,
      hour: 11,
      min: 0,
      duration: 30,
      service: ctx.serviceTypes.consulta,
      staff: ctx.staff.pedro,
      pet: ctx.pets.thor,
      guardian: ctx.guardians.maria,
      status: 'confirmed',
    },
    {
      label: 'Banho Luna',
      days: 7,
      hour: 16,
      min: 0,
      duration: 60,
      service: ctx.serviceTypes.banho,
      staff: ctx.staff.ana,
      pet: ctx.pets.luna,
      guardian: ctx.guardians.maria,
      status: 'confirmed',
    },
  ];

  const created = [];
  for (const s of slots) {
    const starts_at = slotBr(s.days, s.hour, s.min);
    const ends_at = addMinutesBr(starts_at, s.duration);
    const body = {
      clinic_id: clinicId,
      unit_id: unitId,
      hub_service_type_id: s.service.id,
      hub_staff_member_id: s.staff?.id ?? null,
      pet_id: s.pet.id,
      guardian_id: s.guardian.id,
      starts_at,
      ends_at,
      status: s.status,
      appointment_kind: 'standard',
      title: `${DEMO_PREFIX} ${s.label}`,
      notes: `${SEED_MARKER} — ${s.label}`,
    };
    const r = await hubPost('/appointments', authHeaders, body);
    const appt = r.appointment || r;
    created.push(appt);
    console.log('Agendamento:', s.label, starts_at);
  }

  return created;
}

async function main() {
  if (!PASSWORD) {
    console.error(
      "Define HUB_SEED_PASSWORD. Ex.: HUB_SEED_PASSWORD='…' npm run seed:hub-beatriz-demo"
    );
    process.exit(1);
  }

  console.log(`API: ${API_URL}`);
  console.log(`Conta: ${EMAIL}`);
  console.log(`Marcador: ${SEED_MARKER}`);

  const { clinicId, unitId, authHeaders } = await resolveClinicAndUnit();
  console.log(`Clínica: ${clinicId}`);
  console.log(`Unidade: ${unitId}`);

  const serviceTypes = await ensureServiceTypes(clinicId, authHeaders);
  const guardians = await ensureGuardians(clinicId, authHeaders);
  const pets = await ensurePets(clinicId, authHeaders, guardians.maria, guardians.joao);
  const staff = await ensureStaff(clinicId, unitId, authHeaders, serviceTypes);
  await ensureQuotes(clinicId, unitId, authHeaders, serviceTypes);
  await ensureAppointments(clinicId, unitId, authHeaders, {
    serviceTypes,
    guardians,
    pets,
    staff,
  });

  console.log('\nConcluído. No Hub verifica:');
  console.log('  • Clientes — tutores [Demo] Maria / João e pets Thor (co-tutor) + Luna');
  console.log('  • Equipe — Ana, Pedro, Carla');
  console.log('  • Orçamentos — rascunho + enviado');
  console.log('  • Agenda — próximos ~7 dias com agendamentos [Demo]');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
