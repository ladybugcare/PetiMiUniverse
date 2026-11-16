/**
 * Smoke de isolamento multi-tenant + amostragem RBAC contra API real (staging).
 *
 * Uso:
 *   set -a && source backend/.env.smoke.preprod.local && set +a
 *   npm run smoke:tenant-isolation
 *
 * Obrigatório:
 *   HUB_SMOKE_BASE_URL, HUB_SMOKE_TOKEN_A, HUB_SMOKE_TOKEN_B,
 *   HUB_SMOKE_CLINIC_A, HUB_SMOKE_CLINIC_B, HUB_SMOKE_GUARDIAN_A
 *
 * Opcional (seed Fase 0 ampliado):
 *   HUB_SMOKE_PET_A, HUB_SMOKE_UNIT_A,
 *   HUB_SMOKE_TOKEN_A_ASSISTANT, HUB_SMOKE_TOKEN_A_VET, HUB_SMOKE_TOKEN_A_FINANCE
 *
 * Critério: clínica B NÃO recebe payload da clínica A (401/403/404).
 * Mock Supabase NÃO substitui este script.
 */

type Check = { name: string; ok: boolean; detail: string; optional?: boolean };

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Falta variável ${name}`);
    process.exit(2);
  }
  return v;
}

function optional(name: string): string | null {
  const v = process.env[name]?.trim();
  return v || null;
}

function headers(token: string, origin: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Origin: origin,
    'Content-Type': 'application/json',
  };
}

async function getJson(
  url: string,
  token: string,
  origin: string,
): Promise<{ status: number; body: unknown; text: string }> {
  const res = await fetch(url, { headers: headers(token, origin) });
  const text = await res.text();
  let body: unknown = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, body, text };
}

function listLen(body: unknown): number {
  if (!body || typeof body !== 'object') return 0;
  const o = body as Record<string, unknown>;
  for (const key of [
    'guardians',
    'pets',
    'appointments',
    'staff',
    'comandas',
    'receivables',
    'payments',
    'items',
    'reservations',
    'sessions',
    'encounters',
    'hospitalizations',
    'prescriptions',
    'exams',
    'expenses',
    'suppliers',
    'movements',
    'data',
  ]) {
    if (Array.isArray(o[key])) return (o[key] as unknown[]).length;
  }
  if (Array.isArray(body)) return body.length;
  return 0;
}

function leakedClinicA(body: unknown, clinicA: string, resourceId?: string): boolean {
  if (!body || typeof body !== 'object') return false;
  const o = body as Record<string, unknown>;
  if (o.clinic_id === clinicA) return true;
  if (resourceId && (o.id === resourceId || (o.guardian as { id?: string } | undefined)?.id === resourceId)) {
    return true;
  }
  if (listLen(body) > 0) return true;
  return false;
}

async function main() {
  const base = required('HUB_SMOKE_BASE_URL').replace(/\/$/, '');
  const tokenA = required('HUB_SMOKE_TOKEN_A');
  const tokenB = required('HUB_SMOKE_TOKEN_B');
  const clinicA = required('HUB_SMOKE_CLINIC_A');
  const clinicB = required('HUB_SMOKE_CLINIC_B');
  const guardianA = required('HUB_SMOKE_GUARDIAN_A');
  const petA = optional('HUB_SMOKE_PET_A');
  const tokenAssistant = optional('HUB_SMOKE_TOKEN_A_ASSISTANT');
  const tokenVet = optional('HUB_SMOKE_TOKEN_A_VET');
  const tokenFinance = optional('HUB_SMOKE_TOKEN_A_FINANCE');
  const origin = process.env.HUB_SMOKE_ORIGIN?.trim() || 'https://hub-staging.petmi.app';

  const checks: Check[] = [];

  // ─── Isolamento tutores (baseline) ───────────────────────────────────────
  {
    const res = await getJson(
      `${base}/api/hub/guardians/${encodeURIComponent(guardianA)}?clinic_id=${encodeURIComponent(clinicA)}`,
      tokenA,
      origin,
    );
    const body = res.body as { id?: string; guardian?: { id?: string } };
    const id = String(body.guardian?.id || body.id || '');
    checks.push({
      name: 'A lê guardian próprio',
      ok: res.status === 200 && id === guardianA,
      detail: `status=${res.status} id=${id || '—'}`,
    });
  }

  {
    const res = await getJson(
      `${base}/api/hub/guardians/${encodeURIComponent(guardianA)}?clinic_id=${encodeURIComponent(clinicB)}`,
      tokenB,
      origin,
    );
    const leaked = leakedClinicA(res.body, clinicA, guardianA);
    checks.push({
      name: 'B não lê guardian de A (clinic B)',
      ok: res.status >= 400 && res.status < 500 && !leaked,
      detail: `status=${res.status} leaked=${leaked}`,
    });
  }

  {
    const res = await getJson(
      `${base}/api/hub/guardians?clinic_id=${encodeURIComponent(clinicA)}`,
      tokenB,
      origin,
    );
    const leaked = leakedClinicA(res.body, clinicA);
    checks.push({
      name: 'B não lista guardians com clinic_id de A',
      ok: (res.status === 403 || res.status === 401 || res.status === 404) && !leaked,
      detail: `status=${res.status} leaked=${leaked}`,
    });
  }

  // ─── Listas: B tenta clinic_id=A em vários módulos ───────────────────────
  const listPaths: Array<{ name: string; path: string }> = [
    { name: 'pets', path: '/api/hub/pets' },
    { name: 'appointments', path: '/api/hub/appointments' },
    { name: 'staff', path: '/api/hub/staff' },
    { name: 'comandas', path: '/api/hub/comandas' },
    { name: 'finance/receivables', path: '/api/hub/finance/receivables' },
    { name: 'finance/payments', path: '/api/hub/finance/payments' },
    { name: 'inventory/items', path: '/api/hub/inventory/items' },
    { name: 'boarding/day-board', path: '/api/hub/boarding/day-board' },
    { name: 'grooming/day-board', path: '/api/hub/grooming/day-board' },
    { name: 'encounters', path: '/api/hub/encounters' },
    { name: 'clinical/prescriptions', path: '/api/hub/clinical/prescriptions' },
    { name: 'clinical/exams', path: '/api/hub/clinical/exams' },
    { name: 'clinical/hospitalizations', path: '/api/hub/clinical/hospitalizations' },
    { name: 'pickup/day-board', path: '/api/hub/pickup/day-board' },
    { name: 'reports/absent-clients', path: '/api/hub/reports/absent-clients' },
  ];

  for (const p of listPaths) {
    const q =
      p.path.includes('day-board') || p.path.includes('appointments') || p.path.includes('encounters')
        ? `clinic_id=${encodeURIComponent(clinicA)}&date=${encodeURIComponent(new Date().toISOString().slice(0, 10))}`
        : `clinic_id=${encodeURIComponent(clinicA)}`;
    const res = await getJson(`${base}${p.path}?${q}`, tokenB, origin);
    const leaked = leakedClinicA(res.body, clinicA);
    checks.push({
      name: `B não lista ${p.name} com clinic_id de A`,
      ok: (res.status === 403 || res.status === 401 || res.status === 404) && !leaked,
      detail: `status=${res.status} leaked=${leaked}`,
    });
  }

  // ─── Pet get-by-id (se seed criou pet) ────────────────────────────────────
  if (petA) {
    const okA = await getJson(
      `${base}/api/hub/pets?clinic_id=${encodeURIComponent(clinicA)}`,
      tokenA,
      origin,
    );
    const pets = (okA.body as { pets?: Array<{ id?: string }> })?.pets ?? [];
    const found = pets.some((p) => p.id === petA);
    checks.push({
      name: 'A lista inclui pet próprio',
      ok: okA.status === 200 && found,
      detail: `status=${okA.status} found=${found}`,
      optional: true,
    });

    const bad = await getJson(
      `${base}/api/hub/pets?clinic_id=${encodeURIComponent(clinicA)}`,
      tokenB,
      origin,
    );
    const leaked = leakedClinicA(bad.body, clinicA);
    checks.push({
      name: 'B não lista pets com clinic_id de A (pet seed)',
      ok: (bad.status === 403 || bad.status === 401 || bad.status === 404) && !leaked,
      detail: `status=${bad.status} leaked=${leaked}`,
      optional: true,
    });
  }

  // ─── FK cruzada: B tenta criar receita com pet de A ─────────────────────
  if (petA) {
    const res = await fetch(`${base}/api/hub/clinical/prescriptions`, {
      method: 'POST',
      headers: headers(tokenB, origin),
      body: JSON.stringify({
        clinic_id: clinicB,
        pet_id: petA,
        items: [{ medication_name: 'Smoke isolation' }],
      }),
    });
    const text = await res.text();
    let leaked = false;
    try {
      const body = JSON.parse(text) as { prescription?: { pet_id?: string }; pet_id?: string };
      if (body.prescription?.pet_id === petA || body.pet_id === petA) leaked = true;
    } catch {
      /* ignore */
    }
    checks.push({
      name: 'B não cria prescription com pet_id de A',
      ok: res.status >= 400 && res.status < 500 && !leaked,
      detail: `status=${res.status} leaked=${leaked}`,
      optional: true,
    });
  }

  // ─── RBAC amostrado (tokens opcionais do seed) ───────────────────────────
  async function expectStatus(
    name: string,
    token: string | null,
    path: string,
    allowed: number[],
    denied: number[],
  ) {
    if (!token) {
      checks.push({
        name,
        ok: true,
        detail: 'skipped (sem token)',
        optional: true,
      });
      return;
    }
    const res = await getJson(`${base}${path}`, token, origin);
    // Se `allowed` não vazio, status deve estar nele; senão deve estar em denied.
    const pass = allowed.length > 0 ? allowed.includes(res.status) : denied.includes(res.status);
    checks.push({
      name,
      ok: pass,
      detail: `status=${res.status} want=${(allowed.length ? allowed : denied).join('|')}`,
      optional: true,
    });
  }

  const clinicQ = `clinic_id=${encodeURIComponent(clinicA)}`;

  // CASSISTANT: lê guardians OK; write financeiro (expenses list é read — usa financial.read)
  await expectStatus(
    'CASSISTANT lê guardians',
    tokenAssistant,
    `/api/hub/guardians?${clinicQ}`,
    [200],
    [],
  );
  await expectStatus(
    'CASSISTANT sem clinic write (lista hospitalizações)',
    tokenAssistant,
    `/api/hub/clinical/hospitalizations?${clinicQ}`,
    [],
    [403, 401],
  );

  // CVET: clínica OK; financeiro deny
  await expectStatus(
    'CVET lê prescriptions',
    tokenVet,
    `/api/hub/clinical/prescriptions?${clinicQ}`,
    [200],
    [],
  );
  await expectStatus(
    'CVET sem finance receivables',
    tokenVet,
    `/api/hub/finance/receivables?${clinicQ}`,
    [],
    [403, 401],
  );

  // CFINANCE: finance OK; clinic deny
  await expectStatus(
    'CFINANCE lê receivables',
    tokenFinance,
    `/api/hub/finance/receivables?${clinicQ}`,
    [200],
    [],
  );
  await expectStatus(
    'CFINANCE sem clinical prescriptions',
    tokenFinance,
    `/api/hub/clinical/prescriptions?${clinicQ}`,
    [],
    [403, 401],
  );

  // ─── Resultado ───────────────────────────────────────────────────────────
  console.log('\nHub tenant isolation + RBAC smoke\n');
  let failed = 0;
  let skipped = 0;
  for (const c of checks) {
    if (c.optional && c.detail.includes('skipped')) {
      console.log(`SKIP ${c.name}  (${c.detail})`);
      skipped += 1;
      continue;
    }
    console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}  (${c.detail})`);
    if (!c.ok) failed += 1;
  }
  console.log(
    failed === 0
      ? `\nPASS (${checks.length - skipped} checks, ${skipped} skipped)\n`
      : `\nFAIL (${failed} failed, ${skipped} skipped)\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
