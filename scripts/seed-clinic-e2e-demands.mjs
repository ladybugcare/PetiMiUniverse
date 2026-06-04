#!/usr/bin/env node
/**
 * Cria várias demandas (vet, freelancer, clinic, other) autenticado como utilizador de clínica.
 *
 * Pré-requisitos:
 * 1) Backend a correr (ex.: http://localhost:3000).
 * 2) Especialidades `clinic` e `other` na BD — se GET /specialties?category=clinic estiver vazio,
 *    executar `backend/database_migrations/petimi_vet/seed_specialties_clinic_other_minimal.sql` no Supabase.
 * 3) Definir a senha da conta E2E no ambiente (não commitar).
 *
 * Uso:
 *   CLINIC_E2E_PASSWORD='a_tua_senha' node scripts/seed-clinic-e2e-demands.mjs
 *
 * Opcional:
 *   CLINIC_E2E_EMAIL=clinic_e2e_1779392996@example.com
 *   API_URL=http://localhost:3000
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

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

loadDotEnvFile(join(repoRoot, 'frontend', '.env.local'));
loadDotEnvFile(join(repoRoot, 'backend', '.env'));
loadDotEnvFile(join(repoRoot, 'backend', '.env.local'));

const API_URL = (process.env.API_URL || process.env.REACT_APP_API_URL || 'http://localhost:3000').replace(
  /\/$/,
  ''
);
const EMAIL = process.env.CLINIC_E2E_EMAIL || 'clinic_e2e_1779392996@example.com';
const PASSWORD = process.env.CLINIC_E2E_PASSWORD;

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
    const msg = data.error || data.message || data._raw || res.statusText;
    throw new Error(`${res.status} ${url}: ${msg}`);
  }
  return data;
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function firstActiveSpecialty(category) {
  const { specialties } = await fetchJson(`${API_URL}/specialties?category=${encodeURIComponent(category)}`);
  const row = (specialties || []).find((s) => s.active !== false);
  if (!row) {
    throw new Error(
      `Sem especialidades ativas para role="${category}". Executa seed_specialties_clinic_other_minimal.sql no Supabase (ou confirma dados em public.specialties).`
    );
  }
  return row.name;
}

async function main() {
  if (!PASSWORD) {
    console.error(
      'Define CLINIC_E2E_PASSWORD (senha da conta de clínica E2E). Ex.: CLINIC_E2E_PASSWORD=\'…\' node scripts/seed-clinic-e2e-demands.mjs'
    );
    process.exit(1);
  }

  console.log(`API: ${API_URL}`);
  console.log(`Login: ${EMAIL}`);

  const login = await fetchJson(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  const token = login.session?.access_token;
  if (!token) throw new Error('Resposta de login sem session.access_token');

  const clinicId = login.onboarding?.clinicId;
  if (!clinicId) {
    throw new Error(
      'Login sem onboarding.clinicId (conta sem clínica resolvida?). Confirma que o utilizador é de clínica e tem clínica associada.'
    );
  }

  const { units } = await fetchJson(`${API_URL}/units/clinic/${clinicId}?activeOnly=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const approved = (units || []).filter((u) => ['approved', 'active'].includes(String(u.status || '').toLowerCase()));
  if (approved.length === 0) {
    throw new Error('Nenhuma unidade aprovada/active para esta clínica. Completa onboarding da unidade primeiro.');
  }
  const unitId = approved[0].id;
  if (approved.length > 1) {
    console.warn(`Aviso: ${approved.length} unidades aprovadas; a usar a primeira: ${unitId}`);
  }

  const spec = {
    vet: await firstActiveSpecialty('vet'),
    freelancer: await firstActiveSpecialty('freelancer'),
    clinic: await firstActiveSpecialty('clinic'),
    other: await firstActiveSpecialty('other'),
  };
  console.log('Especialidades:', spec);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const categories = ['vet', 'freelancer', 'clinic', 'other'];
  let offset = 1;
  for (const category of categories) {
    for (let i = 1; i <= 2; i++) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() + offset);
      offset += 1;
      const demand_date = ymd(day);
      const title = `[E2E] ${category} #${i} ${demand_date}`;
      const body = {
        clinic_id: clinicId,
        unit_id: unitId,
        category,
        title,
        description: `Demanda de teste (${category}) criada por scripts/seed-clinic-e2e-demands.mjs.`,
        demand_date,
        start_time: '09:00',
        end_time: '17:00',
        is_overnight: false,
        payment: 600 + i * 50,
        positions: [
          {
            slots: 1,
            specialties: [spec[category]],
            payment: 600 + i * 50,
          },
        ],
      };
      const created = await fetchJson(`${API_URL}/demands`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      console.log('Criada:', created.demand?.id, title);
    }
  }

  console.log('Concluído: 8 demandas (2 por categoria).');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
