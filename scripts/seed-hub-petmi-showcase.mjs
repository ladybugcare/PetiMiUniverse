#!/usr/bin/env node
/**
 * Provisiona e popula a clínica de vitrine **PetMi** (unidade Jardins) no Hub.
 *
 * Cria (ou reutiliza, de forma idempotente):
 * - Conta CADMIN + onboarding (opcional com HUB_SEED_PROVISION=1)
 * - Catálogo de serviços com preços + tipos extras
 * - Tutores PF/PJ e pets (co-tutoria e vínculo multi-tutor)
 * - Equipe (sem convite de login)
 * - Pacotes de banho / combo / hotel
 * - Orçamentos e agenda nos próximos dias
 *
 * Pré-requisitos:
 * 1) Backend a correr (ex.: http://localhost:3000) apontando ao Supabase compartilhado.
 * 2) HUB_SEED_PASSWORD e HUB_SEED_CONFIRM=PETMI
 *
 * Uso (primeira vez — cria conta + clínica + dados):
 *   HUB_SEED_PASSWORD='…' HUB_SEED_CONFIRM=PETMI HUB_SEED_PROVISION=1 \
 *     npm run seed:hub-petmi-showcase
 *
 * Uso (só re-popular dados):
 *   HUB_SEED_PASSWORD='…' HUB_SEED_CONFIRM=PETMI npm run seed:hub-petmi-showcase
 *
 * Opcional:
 *   HUB_SEED_EMAIL=demo.cadmin@petmihub.com
 *   HUB_STAFF_PASSWORD=…   — senha dos CSTAFF (default = HUB_SEED_PASSWORD)
 *   API_URL=http://localhost:3000
 *   SEED_FORCE=1
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const SEED_MARKER = 'seed-hub-petmi-showcase';
const DEFAULT_EMAIL = 'demo.cadmin@petmihub.com';
const CLINIC_NAME = 'PetMi';
const UNIT_NAME = 'Unidade Jardins';
const UNIT_NICKNAME = 'Jardins';

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
const EMAIL = process.env.HUB_SEED_EMAIL || DEFAULT_EMAIL;
const PASSWORD = process.env.HUB_SEED_PASSWORD;
const FORCE = process.env.SEED_FORCE === '1' || process.env.SEED_FORCE === 'true';
const PROVISION = process.env.HUB_SEED_PROVISION === '1' || process.env.HUB_SEED_PROVISION === 'true';
const CONFIRM = process.env.HUB_SEED_CONFIRM;

/** CPFs/CNPJs válidos (dígitos verificadores) reservados para a vitrine. */
const SHOWCASE = {
  clinicCnpj: '11222333000181',
  marina: {
    full_name: 'Marina Alves',
    tax_id: '52998224725',
    phone: '11987654321',
    email: 'marina.alves@example.com',
    client_kind: 'individual',
    street: 'Rua Oscar Freire',
    street_number: '1200',
    district: 'Jardins',
    city: 'São Paulo',
    state: 'SP',
    postal_code: '01426001',
  },
  rafael: {
    full_name: 'Rafael Alves',
    tax_id: '39053344705',
    phone: '11976543210',
    email: 'rafael.alves@example.com',
    client_kind: 'individual',
    street: 'Rua Oscar Freire',
    street_number: '1200',
    district: 'Jardins',
    city: 'São Paulo',
    state: 'SP',
    postal_code: '01426001',
  },
  camila: {
    full_name: 'Camila Rocha',
    tax_id: '11144477735',
    phone: '11999887766',
    email: 'camila.rocha@example.com',
    client_kind: 'individual',
    street: 'Av. Paulista',
    street_number: '900',
    district: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    postal_code: '01310100',
  },
  empresa: {
    full_name: 'Pata Empresa',
    legal_name: 'Pata Empresa Ltda',
    tax_id: '27865757000102',
    phone: '1133334444',
    email: 'rh@pataempresa.example.com',
    client_kind: 'company',
    street: 'Av. Brigadeiro Faria Lima',
    street_number: '3500',
    district: 'Itaim Bibi',
    city: 'São Paulo',
    state: 'SP',
    postal_code: '04538132',
  },
  fernanda: {
    full_name: 'Fernanda Souza',
    tax_id: '15350946056',
    phone: '11981112233',
    email: 'fernanda.souza@example.com',
    client_kind: 'individual',
    street: 'Rua Augusta',
    street_number: '1500',
    district: 'Consolação',
    city: 'São Paulo',
    state: 'SP',
    postal_code: '01305000',
  },
  lucas: {
    full_name: 'Lucas Mendes',
    tax_id: '23100299981',
    phone: '11982223344',
    email: 'lucas.mendes@example.com',
    client_kind: 'individual',
    street: 'Rua Haddock Lobo',
    street_number: '595',
    district: 'Cerqueira César',
    city: 'São Paulo',
    state: 'SP',
    postal_code: '01414001',
  },
  beatriz: {
    full_name: 'Beatriz Nogueira',
    tax_id: '88689271287',
    phone: '11983334455',
    email: 'beatriz.nogueira@example.com',
    client_kind: 'individual',
    street: 'Alameda Santos',
    street_number: '700',
    district: 'Jardim Paulista',
    city: 'São Paulo',
    state: 'SP',
    postal_code: '01418000',
  },
  carlos: {
    full_name: 'Carlos Eduardo Lima',
    tax_id: '45317828791',
    phone: '11984445566',
    email: 'carlos.lima@example.com',
    client_kind: 'individual',
    street: 'Rua da Consolação',
    street_number: '2200',
    district: 'Consolação',
    city: 'São Paulo',
    state: 'SP',
    postal_code: '01302001',
  },
  petcare: {
    full_name: 'PetCare Corp',
    legal_name: 'PetCare Corporativo Ltda',
    tax_id: '04547232000115',
    phone: '1140005000',
    email: 'contato@petcare.example.com',
    client_kind: 'company',
    street: 'Av. Engenheiro Luís Carlos Berrini',
    street_number: '105',
    district: 'Cidade Monções',
    city: 'São Paulo',
    state: 'SP',
    postal_code: '04571010',
  },
  pets: {
    thor: { name: 'Thor', species: 'Cão', breed: 'Golden Retriever', size_tier: 'grande', coat_type: 'medio', sex: 'M' },
    luna: { name: 'Luna', species: 'Gato', breed: 'SRD', size_tier: 'pequeno', coat_type: 'curto', sex: 'F' },
    mel: { name: 'Mel', species: 'Cão', breed: 'Poodle', size_tier: 'pequeno', coat_type: 'curto', sex: 'F' },
    rex: { name: 'Rex', species: 'Cão', breed: 'Labrador', size_tier: 'grande', coat_type: 'curto', sex: 'M' },
    nina: { name: 'Nina', species: 'Cão', breed: 'Shih Tzu', size_tier: 'mini', coat_type: 'longo', sex: 'F' },
    bob: { name: 'Bob', species: 'Cão', breed: 'Beagle', size_tier: 'medio', coat_type: 'curto', sex: 'M' },
    mia: { name: 'Mia', species: 'Gato', breed: 'Persa', size_tier: 'pequeno', coat_type: 'longo', sex: 'F' },
    pretinho: { name: 'Pretinho', species: 'Cão', breed: 'SRD', size_tier: 'medio', coat_type: 'curto', sex: 'M' },
    dulce: { name: 'Dulce', species: 'Cão', breed: 'Yorkshire', size_tier: 'mini', coat_type: 'longo', sex: 'F' },
    apollo: { name: 'Apollo', species: 'Cão', breed: 'Border Collie', size_tier: 'medio', coat_type: 'medio', sex: 'M' },
    kiwi: { name: 'Kiwi', species: 'Gato', breed: 'Siamês', size_tier: 'pequeno', coat_type: 'curto', sex: 'F' },
    pipoca: { name: 'Pipoca', species: 'Cão', breed: 'Maltês', size_tier: 'mini', coat_type: 'longo', sex: 'F' },
    ziggy: { name: 'Ziggy', species: 'Cão', breed: 'Bulldog Francês', size_tier: 'pequeno', coat_type: 'curto', sex: 'M' },
    amora: { name: 'Amora', species: 'Gato', breed: 'SRD', size_tier: 'pequeno', coat_type: 'curto', sex: 'F' },
  },
  staff: {
    ana: {
      full_name: 'Ana Tosador',
      job_title: 'Tosador(a)',
      professional_kind: 'groomer',
      agenda_color: '#f0642f',
      hub_access_email: 'demo.banho@petmihub.com',
      operational_areas: ['banho_tosa'],
    },
    pedro: {
      full_name: 'Dr. Pedro Vet',
      job_title: 'Médico veterinário',
      professional_kind: 'vet',
      crmv: '12345',
      crmv_uf: 'SP',
      agenda_color: '#2e7d32',
      hub_access_email: 'demo.clinica@petmihub.com',
      operational_areas: ['clinica'],
    },
    carla: {
      full_name: 'Carla Recepção',
      job_title: 'Recepção',
      professional_kind: 'reception',
      agenda_color: '#5c6bc0',
      hub_access_email: 'demo.recepcao@petmihub.com',
      operational_areas: ['recepcao', 'caixa'],
    },
    diego: {
      full_name: 'Diego Motorista',
      job_title: 'Motorista',
      professional_kind: 'driver',
      agenda_color: '#5d4037',
      hub_access_email: 'demo.levatraz@petmihub.com',
      operational_areas: ['leva_traz'],
    },
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
    const msg =
      data.error || data.message || JSON.stringify(data.details || data._raw || '') || res.statusText;
    throw new Error(`${res.status} ${url}: ${msg}`);
  }
  return data;
}

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
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${parts.year}-${parts.month}-${parts.day}T${hh}:${mm}:00-03:00`;
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

function cnpjFromStamp() {
  const n = Date.now().toString().slice(-12).padStart(12, '0');
  return `${n}81`;
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

async function hubPatch(path, authHeaders, body) {
  return fetchJson(`${API_URL}/api/hub${path}`, {
    method: 'PATCH',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function hubPut(path, authHeaders, body) {
  return fetchJson(`${API_URL}/api/hub${path}`, {
    method: 'PUT',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function login() {
  const login = await fetchJson(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const accessToken = login.session?.access_token;
  if (!accessToken) throw new Error('Login sem session.access_token');
  return { login, authHeaders: { Authorization: `Bearer ${accessToken}` } };
}

async function tryLogin() {
  try {
    return await login();
  } catch (e) {
    const msg = String(e.message || e).toLowerCase();
    if (msg.includes('401') || msg.includes('invalid') || msg.includes('credencial')) return null;
    throw e;
  }
}

async function provisionAccount() {
  console.log('Provisionando CADMIN + clínica PetMi…');
  try {
    await fetchJson(`${API_URL}/api/hub/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Admin PetMi Vitrine',
        email: EMAIL,
        password: PASSWORD,
        phone: '11999990000',
      }),
    });
    console.log('Signup OK:', EMAIL);
  } catch (e) {
    const msg = String(e.message || e).toLowerCase();
    if (msg.includes('já') || msg.includes('already') || msg.includes('registered') || msg.includes('409')) {
      console.log('Conta já existia:', EMAIL);
    } else {
      throw e;
    }
  }

  const { authHeaders } = await login();

  const ctx = await hubGet('/session/context', authHeaders);
  const existingClinic =
    ctx.onboarding?.clinicId || ctx.clinicUser?.clinic_id || null;
  if (existingClinic) {
    console.log('Clínica já onboardada:', existingClinic);
    return { authHeaders, clinicId: existingClinic };
  }

  const cnpjs = [SHOWCASE.clinicCnpj, cnpjFromStamp(), cnpjFromStamp()];
  let lastErr;
  for (const cnpj of cnpjs) {
    try {
      await hubPost('/onboarding/clinic', authHeaders, {
        clinic: {
          name: CLINIC_NAME,
          cnpj,
          address: 'Rua Oscar Freire, 500',
          city: 'São Paulo',
          state: 'SP',
          phone: '1130004000',
          description: 'Clínica de vitrine PetMi Hub para demos com clientes.',
        },
        unit: {
          name: UNIT_NAME,
          nickname: UNIT_NICKNAME,
          address: 'Rua Oscar Freire, 500',
          city: 'São Paulo',
          state: 'SP',
          phone: '1130004000',
          is_main: true,
          technical_manager: 'Dr. Pedro Vet',
        },
        plan_slug: 'beta',
        beta_terms_accepted: true,
      });
      console.log('Onboarding OK — clínica', CLINIC_NAME, '/ unidade', UNIT_NICKNAME);
      return { authHeaders, clinicId: null };
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e).toLowerCase();
      if (msg.includes('cnpj') || msg.includes('já')) {
        console.log('CNPJ ocupado, tentando outro…');
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('Falha no onboarding da clínica PetMi');
}

async function resolveClinicAndUnit(authHeaders) {
  const ctx = await hubGet('/session/context', authHeaders);
  let clinicId = ctx.onboarding?.clinicId || ctx.clinicUser?.clinic_id || null;
  if (!clinicId) {
    const { login: again } = await login();
    clinicId = again.onboarding?.clinicId || again.clinicUser?.clinic_id || null;
  }
  if (!clinicId) {
    throw new Error(
      'Sem clinic_id. Rode com HUB_SEED_PROVISION=1 ou complete o onboarding na UI.'
    );
  }

  const { units } = await fetchJson(`${API_URL}/units/clinic/${clinicId}?activeOnly=true`, {
    headers: authHeaders,
  });
  const approved = (units || []).filter((u) =>
    ['approved', 'active'].includes(String(u.status || '').toLowerCase())
  );
  if (approved.length === 0) {
    throw new Error('Nenhuma unidade active/approved.');
  }

  const preferred =
    approved.find((u) => String(u.nickname || '').toLowerCase() === 'jardins') ||
    approved.find((u) => String(u.name || '').includes('Jardins')) ||
    approved[0];

  return { clinicId, unitId: preferred.id, authHeaders };
}

async function ensureServiceTypes(clinicId, authHeaders) {
  await hubPost(`/service-types/bootstrap?clinic_id=${clinicId}`, authHeaders, {});
  let { service_types: types } = await hubGet('/service-types', authHeaders, { clinic_id: clinicId });
  const addonsListed = await hubGet('/service-types', authHeaders, {
    clinic_id: clinicId,
    addons_only: 'true',
  });
  types = [...(types || []), ...(addonsListed.service_types || [])];

  const byCode = Object.fromEntries(types.map((t) => [t.code, t]));
  const byName = Object.fromEntries(types.map((t) => [t.name, t]));

  const priceDefaults = {
    consulta: { cost_amount: 40, sale_amount: 150 },
    banho_tosa: { cost_amount: 25, sale_amount: 95 },
    hotel_daycare: { cost_amount: 30, sale_amount: 120 },
  };

  for (const [code, prices] of Object.entries(priceDefaults)) {
    const row = byCode[code];
    if (!row) continue;
    const needsPrice = Number(row.sale_amount) === 0 || Number(row.cost_amount) === 0;
    if (needsPrice || FORCE) {
      await hubPatch(`/service-types/${row.id}`, authHeaders, {
        clinic_id: clinicId,
        ...prices,
      });
      console.log('Preço atualizado:', row.name, prices.sale_amount);
    }
  }

  const extras = [
    {
      name: 'Tosa',
      service_group: 'banho_tosa',
      cost_amount: 30,
      sale_amount: 110,
      default_duration_minutes: 45,
      allow_scheduling: true,
      code: 'tosa_showcase',
    },
    {
      name: 'Hidratação',
      service_group: 'banho_tosa',
      cost_amount: 12,
      sale_amount: 45,
      default_duration_minutes: 20,
      allow_scheduling: false,
      is_addon: true,
      code: 'hidratacao_showcase',
    },
    {
      name: 'Perfume pet',
      service_group: 'banho_tosa',
      cost_amount: 5,
      sale_amount: 25,
      default_duration_minutes: 5,
      allow_scheduling: false,
      is_addon: true,
      code: 'perfume_showcase',
    },
    {
      name: 'Corte de unha',
      service_group: 'banho_tosa',
      cost_amount: 8,
      sale_amount: 30,
      default_duration_minutes: 10,
      allow_scheduling: false,
      is_addon: true,
      code: 'unha_showcase',
    },
    {
      name: 'Limpeza de ouvido',
      service_group: 'banho_tosa',
      cost_amount: 10,
      sale_amount: 35,
      default_duration_minutes: 10,
      allow_scheduling: false,
      is_addon: true,
      code: 'ouvido_showcase',
    },
    {
      name: 'Escovação dental',
      service_group: 'banho_tosa',
      cost_amount: 15,
      sale_amount: 55,
      default_duration_minutes: 15,
      allow_scheduling: false,
      is_addon: true,
      code: 'dental_showcase',
    },
    {
      name: 'Vacina',
      service_group: 'clinica',
      cost_amount: 35,
      sale_amount: 90,
      default_duration_minutes: 20,
      allow_scheduling: true,
      code: 'vacina_showcase',
    },
    {
      name: 'Aplicação de medicamento',
      service_group: 'clinica',
      cost_amount: 10,
      sale_amount: 40,
      default_duration_minutes: 10,
      allow_scheduling: false,
      is_addon: true,
      code: 'medicamento_showcase',
    },
    {
      name: 'Coleta para exame',
      service_group: 'clinica',
      cost_amount: 20,
      sale_amount: 70,
      default_duration_minutes: 15,
      allow_scheduling: false,
      is_addon: true,
      code: 'coleta_exame_showcase',
    },
    {
      name: 'Diária de hotel',
      service_group: 'hotel',
      cost_amount: 40,
      sale_amount: 140,
      default_duration_minutes: null,
      allow_scheduling: true,
      code: 'diaria_hotel_showcase',
    },
    {
      name: 'Kit conforto (hotel)',
      service_group: 'hotel',
      cost_amount: 18,
      sale_amount: 50,
      default_duration_minutes: 5,
      allow_scheduling: false,
      is_addon: true,
      code: 'kit_conforto_showcase',
    },
    {
      name: 'Creche (diária)',
      service_group: 'creche',
      cost_amount: 25,
      sale_amount: 85,
      default_duration_minutes: null,
      allow_scheduling: true,
      code: 'creche_showcase',
    },
    {
      name: 'Atividade extra (creche)',
      service_group: 'creche',
      cost_amount: 12,
      sale_amount: 40,
      default_duration_minutes: 30,
      allow_scheduling: false,
      is_addon: true,
      code: 'atividade_creche_showcase',
    },
    {
      name: 'Leva e Traz',
      service_group: 'leva_traz',
      cost_amount: 15,
      sale_amount: 55,
      default_duration_minutes: 30,
      allow_scheduling: true,
      pickup_price_scope: 'round_trip',
      code: 'leva_traz_showcase',
    },
  ];

  for (const spec of extras) {
    let row = byCode[spec.code] || byName[spec.name];
    if (!row) {
      const r = await hubPost('/service-types', authHeaders, {
        clinic_id: clinicId,
        ...spec,
        internal_notes: SEED_MARKER,
      });
      row = r.service_type;
      console.log(spec.is_addon ? 'Adicional criado:' : 'Serviço criado:', row.name);
      types.push(row);
      byCode[row.code] = row;
      byName[row.name] = row;
    } else {
      console.log(spec.is_addon ? 'Adicional existente:' : 'Serviço existente:', row.name);
    }
  }

  ({ service_types: types } = await hubGet('/service-types', authHeaders, { clinic_id: clinicId }));
  const addonsAgain = await hubGet('/service-types', authHeaders, {
    clinic_id: clinicId,
    addons_only: 'true',
  });
  types = [...(types || []), ...(addonsAgain.service_types || [])];
  const finalByCode = Object.fromEntries((types || []).map((t) => [t.code, t]));
  const finalByName = Object.fromEntries((types || []).map((t) => [t.name, t]));

  const pick = (code, name) => finalByCode[code] || finalByName[name];
  const consulta = pick('consulta', 'Consulta veterinária');
  const banho = pick('banho_tosa', 'Banho e tosa');
  const hotel = pick('hotel_daycare', 'Hotel / daycare');
  const tosa = pick('tosa_showcase', 'Tosa');
  const hidratacao = pick('hidratacao_showcase', 'Hidratação');
  const perfume = pick('perfume_showcase', 'Perfume pet');
  const unha = pick('unha_showcase', 'Corte de unha');
  const ouvido = pick('ouvido_showcase', 'Limpeza de ouvido');
  const dental = pick('dental_showcase', 'Escovação dental');
  const vacina = pick('vacina_showcase', 'Vacina');
  const medicamento = pick('medicamento_showcase', 'Aplicação de medicamento');
  const coleta = pick('coleta_exame_showcase', 'Coleta para exame');
  const diaria = pick('diaria_hotel_showcase', 'Diária de hotel');
  const kitConforto = pick('kit_conforto_showcase', 'Kit conforto (hotel)');
  const creche = pick('creche_showcase', 'Creche (diária)');
  const atividadeCreche = pick('atividade_creche_showcase', 'Atividade extra (creche)');
  const levaTraz = pick('leva_traz_showcase', 'Leva e Traz');

  if (!consulta?.id || !banho?.id) {
    throw new Error('Tipos consulta/banho_tosa ausentes após bootstrap.');
  }

  await ensureGroupAddons(clinicId, authHeaders, {
    banho_tosa: [hidratacao, perfume, unha, ouvido, dental].filter(Boolean),
    clinica: [medicamento, coleta].filter(Boolean),
    hotel: [kitConforto].filter(Boolean),
    creche: [atividadeCreche].filter(Boolean),
  });

  return {
    consulta,
    banho,
    hotel,
    tosa,
    hidratacao,
    perfume,
    unha,
    ouvido,
    dental,
    vacina,
    medicamento,
    coleta,
    diaria,
    kitConforto,
    creche,
    atividadeCreche,
    levaTraz,
  };
}

async function ensureGroupAddons(clinicId, authHeaders, bySlug) {
  const { service_groups: groups } = await hubGet('/service-groups', authHeaders, {
    clinic_id: clinicId,
  });
  const groupBySlug = Object.fromEntries((groups || []).map((g) => [g.slug, g]));

  for (const [slug, addons] of Object.entries(bySlug)) {
    const group = groupBySlug[slug];
    if (!group?.id) {
      console.log('Grupo ausente para adicionais:', slug);
      continue;
    }
    const ids = addons.map((a) => a.id).filter(Boolean);
    if (ids.length === 0) continue;

    const current = await hubGet(`/service-groups/${group.id}/addons`, authHeaders, {
      clinic_id: clinicId,
    });
    const currentIds = new Set(current.addon_service_type_ids || []);
    const merged = [...new Set([...(current.addon_service_type_ids || []), ...ids])];
    const missing = ids.filter((id) => !currentIds.has(id));
    if (missing.length === 0) {
      console.log(`Adicionais do grupo ${slug} já vinculados (${merged.length})`);
      continue;
    }
    await hubPut(`/service-groups/${group.id}/addons`, authHeaders, {
      clinic_id: clinicId,
      addon_service_type_ids: merged,
    });
    console.log(`Adicionais vinculados ao grupo ${slug}:`, addons.map((a) => a.name).join(', '));
  }
}

async function ensureGuardian(clinicId, authHeaders, list, spec) {
  const found =
    (list || []).find((g) => g.full_name === spec.full_name) ||
    (list || []).find((g) => g.tax_id === spec.tax_id);
  if (found) {
    console.log('Tutor existente:', found.full_name);
    return found;
  }
  const r = await hubPost('/guardians', authHeaders, {
    clinic_id: clinicId,
    ...spec,
    notes: SEED_MARKER,
    client_status: 'active',
  });
  console.log('Tutor criado:', r.guardian.full_name, `(${spec.client_kind})`);
  return r.guardian;
}

async function ensureGuardians(clinicId, authHeaders) {
  const { guardians: list } = await hubGet('/guardians', authHeaders, { clinic_id: clinicId });
  const marina = await ensureGuardian(clinicId, authHeaders, list, SHOWCASE.marina);
  const rafael = await ensureGuardian(clinicId, authHeaders, list, SHOWCASE.rafael);
  const camila = await ensureGuardian(clinicId, authHeaders, list, SHOWCASE.camila);
  const empresa = await ensureGuardian(clinicId, authHeaders, list, SHOWCASE.empresa);
  const fernanda = await ensureGuardian(clinicId, authHeaders, list, SHOWCASE.fernanda);
  const lucas = await ensureGuardian(clinicId, authHeaders, list, SHOWCASE.lucas);
  const beatriz = await ensureGuardian(clinicId, authHeaders, list, SHOWCASE.beatriz);
  const carlos = await ensureGuardian(clinicId, authHeaders, list, SHOWCASE.carlos);
  const petcare = await ensureGuardian(clinicId, authHeaders, list, SHOWCASE.petcare);
  return { marina, rafael, camila, empresa, fernanda, lucas, beatriz, carlos, petcare };
}

async function ensurePet(clinicId, authHeaders, list, spec, primaryId, secondaryId = null) {
  const found = (list || []).find((p) => p.name === spec.name);
  if (found) {
    console.log('Pet existente:', found.name);
    return found;
  }
  const body = {
    clinic_id: clinicId,
    ...spec,
    primary_guardian_id: primaryId,
    notes: SEED_MARKER,
  };
  if (secondaryId) body.secondary_guardian_id = secondaryId;
  const r = await hubPost('/pets', authHeaders, body);
  console.log(
    'Pet criado:',
    r.pet.name,
    secondaryId ? '(primary + secondary)' : '(só primary)'
  );
  return r.pet;
}

async function ensurePets(clinicId, authHeaders, g) {
  const { pets: list } = await hubGet('/pets', authHeaders, { clinic_id: clinicId });
  const thor = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.thor, g.marina.id, g.rafael.id);
  const luna = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.luna, g.marina.id);
  const mel = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.mel, g.camila.id);
  const rex = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.rex, g.empresa.id, g.camila.id);
  const nina = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.nina, g.empresa.id, g.camila.id);
  const bob = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.bob, g.fernanda.id, g.lucas.id);
  const mia = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.mia, g.fernanda.id);
  const pretinho = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.pretinho, g.lucas.id);
  const dulce = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.dulce, g.beatriz.id, g.carlos.id);
  const apollo = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.apollo, g.beatriz.id);
  const kiwi = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.kiwi, g.carlos.id);
  const pipoca = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.pipoca, g.petcare.id, g.fernanda.id);
  const ziggy = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.ziggy, g.petcare.id, g.lucas.id);
  const amora = await ensurePet(clinicId, authHeaders, list, SHOWCASE.pets.amora, g.marina.id, g.beatriz.id);
  return {
    thor,
    luna,
    mel,
    rex,
    nina,
    bob,
    mia,
    pretinho,
    dulce,
    apollo,
    kiwi,
    pipoca,
    ziggy,
    amora,
  };
}

async function ensureStaff(clinicId, unitId, authHeaders, serviceTypes, staffPassword) {
  const { staff: list } = await hubGet('/staff', authHeaders, { clinic_id: clinicId });
  const created = {};

  const specs = [
    [
      'ana',
      {
        ...SHOWCASE.staff.ana,
        service_type_ids: [serviceTypes.banho.id, serviceTypes.tosa?.id].filter(Boolean),
        accepts_appointments: true,
      },
    ],
    [
      'pedro',
      {
        ...SHOWCASE.staff.pedro,
        service_type_ids: [serviceTypes.consulta.id, serviceTypes.vacina?.id].filter(Boolean),
        accepts_appointments: true,
      },
    ],
    [
      'carla',
      {
        ...SHOWCASE.staff.carla,
        service_type_ids: [],
        accepts_appointments: false,
      },
    ],
    [
      'diego',
      {
        ...SHOWCASE.staff.diego,
        service_type_ids: [serviceTypes.levaTraz?.id].filter(Boolean),
        accepts_appointments: true,
      },
    ],
  ];

  for (const [key, spec] of specs) {
    const {
      hub_access_email,
      operational_areas,
      service_type_ids,
      accepts_appointments,
      ...profile
    } = spec;

    let row =
      (list || []).find((s) => s.full_name === profile.full_name) ||
      (list || []).find(
        (s) =>
          (s.hub_access_email || '').trim().toLowerCase() === hub_access_email.toLowerCase()
      );

    if (!row) {
      const r = await hubPost('/staff', authHeaders, {
        clinic_id: clinicId,
        default_unit_id: unitId,
        active: true,
        has_hub_access: true,
        hub_access_email,
        hub_access_role: 'CSTAFF',
        operational_areas,
        email: hub_access_email,
        service_type_ids,
        accepts_appointments,
        internal_notes: SEED_MARKER,
        ...profile,
      });
      row = r.staff || r.member || r;
      console.log('Equipe criada:', profile.full_name);
    } else {
      console.log('Equipe existente:', profile.full_name);
      const needsAccessPatch =
        !row.has_hub_access ||
        (row.hub_access_email || '').toLowerCase() !== hub_access_email.toLowerCase() ||
        row.hub_access_role !== 'CSTAFF' ||
        !row.default_unit_id;
      if (needsAccessPatch || FORCE) {
        const patched = await hubPatch(`/staff/${row.id}`, authHeaders, {
          clinic_id: clinicId,
          has_hub_access: true,
          hub_access_email,
          hub_access_role: 'CSTAFF',
          operational_areas,
          default_unit_id: unitId,
          email: hub_access_email,
          service_type_ids,
          accepts_appointments,
        });
        row = patched.staff || patched.member || patched || row;
        console.log('  acesso Hub ativado:', hub_access_email);
      }
    }

    await ensureStaffLogin(clinicId, authHeaders, row, {
      email: hub_access_email,
      password: staffPassword,
      full_name: profile.full_name,
    });

    created[key] = row;
  }

  return created;
}

function tokenFromInvite(payload) {
  if (payload?.invitation?.token) return payload.invitation.token;
  const url = payload?.invitation_url || '';
  try {
    return new URL(url).searchParams.get('token') || '';
  } catch {
    const m = url.match(/[?&]token=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }
}

async function tryLoginEmail(email, password) {
  try {
    await fetchJson(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return true;
  } catch (e) {
    const msg = String(e.message || e).toLowerCase();
    if (msg.includes('401') || msg.includes('invalid') || msg.includes('credencial')) return false;
    throw e;
  }
}

async function ensureStaffLogin(clinicId, authHeaders, staffRow, { email, password, full_name }) {
  if (staffRow?.clinic_user_id) {
    const ok = await tryLoginEmail(email, password);
    if (ok) {
      console.log('  conta Hub OK:', email);
      return;
    }
    throw new Error(
      `Funcionário ${full_name} (${email}) já tem conta, mas a senha não confere. Redefina no Supabase ou use HUB_STAFF_PASSWORD correta.`
    );
  }

  const invite = await hubPost(`/staff/${staffRow.id}/invite`, authHeaders, {
    clinic_id: clinicId,
  });
  const token = tokenFromInvite(invite);
  if (!token) {
    throw new Error(`Convite de ${email} não devolveu token.`);
  }

  try {
    await fetchJson(`${API_URL}/api/hub/invitations/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        full_name,
        password,
        phone: '11988887777',
      }),
    });
    console.log('  conta Hub criada:', email);
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes('409') || msg.toLowerCase().includes('já')) {
      const ok = await tryLoginEmail(email, password);
      if (ok) {
        console.log('  conta Hub já existia:', email);
        return;
      }
      throw new Error(
        `Conta ${email} já existe, mas a senha não confere. Redefina no Supabase.`
      );
    }
    throw e;
  }
}

async function ensurePackages(clinicId, authHeaders, serviceTypes) {
  const { packages: list } = await hubGet('/finance/packages', authHeaders, {
    clinic_id: clinicId,
    include_inactive: 'true',
  });
  const byName = Object.fromEntries((list || []).map((p) => [p.name, p]));

  const wanted = [
    {
      name: 'Pacote 5 Banhos',
      items: [{ hub_service_type_id: serviceTypes.banho.id, quantity: 5 }],
      discount_percent: 10,
      validity_days: 90,
      description: 'Cinco sessões de banho com 10% de desconto.',
      notes: SEED_MARKER,
    },
    {
      name: 'Combo Banho + Tosa',
      items: [
        { hub_service_type_id: serviceTypes.banho.id, quantity: 4 },
        { hub_service_type_id: (serviceTypes.tosa || serviceTypes.banho).id, quantity: 2 },
      ],
      discount_percent: 12,
      validity_days: 120,
      description: 'Quatro banhos e duas tosas.',
      notes: SEED_MARKER,
    },
    {
      name: 'Pacote Hotel 5 Diárias',
      items: [
        {
          hub_service_type_id: (serviceTypes.diaria || serviceTypes.hotel).id,
          quantity: 5,
        },
      ],
      discount_percent: 8,
      validity_days: 180,
      description: 'Cinco diárias de hotel.',
      notes: SEED_MARKER,
    },
  ];

  const out = [];
  for (const spec of wanted) {
    if (byName[spec.name] && !FORCE) {
      console.log('Pacote existente:', spec.name);
      out.push(byName[spec.name]);
      continue;
    }
    if (byName[spec.name] && FORCE) {
      console.log('Pacote já existe (FORCE ignora create):', spec.name);
      out.push(byName[spec.name]);
      continue;
    }
    const r = await hubPost('/finance/packages', authHeaders, {
      clinic_id: clinicId,
      pricing_mode: 'catalog_sum',
      ...spec,
    });
    console.log('Pacote criado:', r.package.name);
    out.push(r.package);
  }
  return out;
}

async function ensureQuotes(clinicId, unitId, authHeaders, serviceTypes) {
  const { quotes: list } = await hubGet('/quotes', authHeaders, { clinic_id: clinicId });
  const seeded = (list || []).filter((q) => hasMarker(q.notes));
  if (seeded.length >= 2 && !FORCE) {
    console.log(`Orçamentos vitrine já existem (${seeded.length}). Use SEED_FORCE=1 para criar mais.`);
    return seeded;
  }

  const draft = await hubPost('/quotes', authHeaders, {
    clinic_id: clinicId,
    unit_id: unitId,
    notes: `${SEED_MARKER} rascunho banho`,
    prospect: {
      full_name: 'Contato Orçamento Vitrine',
      tax_id: '12345678909',
      phone: '11988776655',
      email: 'orcamento.vitrine@example.com',
    },
    pets: [
      {
        client_id: 'bob',
        display_name: 'Bob',
        species: 'Cão',
        breed: 'Beagle',
        size_tier: 'medio',
        coat_type: 'curto',
        sex: 'M',
      },
    ],
    lines: [
      {
        hub_service_type_id: serviceTypes.banho.id,
        line_pets: [{ pet_client_id: 'bob', unit_price: 95 }],
      },
    ],
  });
  console.log('Orçamento rascunho:', (draft.quote || draft).id);

  const sent = await hubPost('/quotes', authHeaders, {
    clinic_id: clinicId,
    unit_id: unitId,
    notes: `${SEED_MARKER} enviado consulta`,
    prospect: {
      full_name: 'Família Costa',
      tax_id: '98765432100',
      phone: '11977665544',
      email: 'costa.vitrine@example.com',
    },
    pets: [
      {
        client_id: 'pipoca',
        display_name: 'Pipoca',
        species: 'Cão',
        breed: 'Maltês',
        size_tier: 'mini',
        coat_type: 'longo',
        sex: 'F',
      },
    ],
    lines: [
      {
        hub_service_type_id: serviceTypes.consulta.id,
        line_pets: [{ pet_client_id: 'pipoca', unit_price: 150 }],
      },
    ],
  });
  const sentId = (sent.quote || sent).id;
  await hubPost(`/quotes/${sentId}/send?clinic_id=${clinicId}`, authHeaders, {});
  console.log('Orçamento enviado:', sentId);

  return [draft.quote || draft, sent.quote || sent];
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
  if (seeded.length >= 5 && !FORCE) {
    console.log(`Agendamentos vitrine já existem (${seeded.length}). Use SEED_FORCE=1 para criar mais.`);
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
      guardian: ctx.guardians.marina,
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
      guardian: ctx.guardians.marina,
      status: 'confirmed',
    },
    {
      label: 'Tosa Mel',
      days: 3,
      hour: 11,
      min: 0,
      duration: 45,
      service: ctx.serviceTypes.tosa || ctx.serviceTypes.banho,
      staff: ctx.staff.ana,
      pet: ctx.pets.mel,
      guardian: ctx.guardians.camila,
      status: 'confirmed',
    },
    {
      label: 'Vacina Rex',
      days: 4,
      hour: 9,
      min: 30,
      duration: 20,
      service: ctx.serviceTypes.vacina || ctx.serviceTypes.consulta,
      staff: ctx.staff.pedro,
      pet: ctx.pets.rex,
      guardian: ctx.guardians.empresa,
      status: 'pending_confirm',
    },
    {
      label: 'Banho Nina',
      days: 5,
      hour: 15,
      min: 0,
      duration: 60,
      service: ctx.serviceTypes.banho,
      staff: ctx.staff.ana,
      pet: ctx.pets.nina,
      guardian: ctx.guardians.empresa,
      status: 'confirmed',
    },
    {
      label: 'Consulta Thor',
      days: 7,
      hour: 10,
      min: 0,
      duration: 30,
      service: ctx.serviceTypes.consulta,
      staff: ctx.staff.pedro,
      pet: ctx.pets.thor,
      guardian: ctx.guardians.marina,
      status: 'confirmed',
    },
  ];

  const created = [];
  for (const s of slots) {
    if (!s.service?.id) continue;
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
      title: s.label,
      notes: `${SEED_MARKER} — ${s.label}`,
    };
    const r = await hubPost('/appointments', authHeaders, body);
    created.push(r.appointment || r);
    console.log('Agendamento:', s.label, starts_at);
  }
  return created;
}

async function main() {
  if (CONFIRM !== 'PETMI') {
    console.error('Defina HUB_SEED_CONFIRM=PETMI para confirmar a vitrine PetMi.');
    process.exit(1);
  }
  if (!PASSWORD) {
    console.error(
      "Defina HUB_SEED_PASSWORD. Ex.: HUB_SEED_PASSWORD='…' HUB_SEED_CONFIRM=PETMI npm run seed:hub-petmi-showcase"
    );
    process.exit(1);
  }
  if (PASSWORD.length < 8) {
    console.error('HUB_SEED_PASSWORD precisa ter pelo menos 8 caracteres.');
    process.exit(1);
  }

  console.log(`API: ${API_URL}`);
  console.log(`Conta: ${EMAIL}`);
  console.log(`Marcador: ${SEED_MARKER}`);
  console.log(`Provision: ${PROVISION ? 'sim' : 'não'}`);

  let authHeaders;
  if (PROVISION) {
    const prov = await provisionAccount();
    authHeaders = prov.authHeaders;
  } else {
    const logged = await tryLogin();
    if (!logged) {
      console.error(
        'Login falhou. Use HUB_SEED_PROVISION=1 na primeira execução ou confira e-mail/senha.'
      );
      process.exit(1);
    }
    authHeaders = logged.authHeaders;
  }

  const resolved = await resolveClinicAndUnit(authHeaders);
  const { clinicId, unitId } = resolved;
  authHeaders = resolved.authHeaders;
  console.log(`Clínica: ${clinicId}`);
  console.log(`Unidade: ${unitId}`);

  const serviceTypes = await ensureServiceTypes(clinicId, authHeaders);
  const guardians = await ensureGuardians(clinicId, authHeaders);
  const pets = await ensurePets(clinicId, authHeaders, guardians);
  const staffPassword = process.env.HUB_STAFF_PASSWORD || PASSWORD;
  const staff = await ensureStaff(clinicId, unitId, authHeaders, serviceTypes, staffPassword);
  await ensurePackages(clinicId, authHeaders, serviceTypes);
  await ensureQuotes(clinicId, unitId, authHeaders, serviceTypes);
  await ensureAppointments(clinicId, unitId, authHeaders, {
    serviceTypes,
    guardians,
    pets,
    staff,
  });

  console.log('\nConcluído. No Hub verifique:');
  console.log('  • CADMIN —', EMAIL);
  console.log('  • CSTAFF banho — demo.banho@petmihub.com');
  console.log('  • CSTAFF clínica — demo.clinica@petmihub.com');
  console.log('  • CSTAFF recepção — demo.recepcao@petmihub.com');
  console.log('  • CSTAFF leva e traz — demo.levatraz@petmihub.com');
  console.log('  • Senha dos funcionários: a mesma do CADMIN (ou HUB_STAFF_PASSWORD)');
  console.log('  • Clientes, pets, serviços, adicionais, pacotes, agenda');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
