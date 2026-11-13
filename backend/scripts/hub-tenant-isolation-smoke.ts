/**
 * Smoke de isolamento multi-tenant contra API real (staging).
 *
 * Uso:
 *   HUB_SMOKE_BASE_URL=https://api-staging... \
 *   HUB_SMOKE_TOKEN_A=<jwt CADMIN clínica A> \
 *   HUB_SMOKE_TOKEN_B=<jwt CADMIN clínica B> \
 *   HUB_SMOKE_CLINIC_A=<uuid> \
 *   HUB_SMOKE_CLINIC_B=<uuid> \
 *   HUB_SMOKE_GUARDIAN_A=<uuid guardian da clínica A> \
 *   npx tsx scripts/hub-tenant-isolation-smoke.ts
 *
 * Critério: clínica B NÃO recebe payload da clínica A (403/404).
 * Mock Supabase NÃO substitui este script.
 */

type Check = { name: string; ok: boolean; detail: string };

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Falta variável ${name}`);
    process.exit(2);
  }
  return v;
}

async function main() {
  const base = required('HUB_SMOKE_BASE_URL').replace(/\/$/, '');
  const tokenA = required('HUB_SMOKE_TOKEN_A');
  const tokenB = required('HUB_SMOKE_TOKEN_B');
  const clinicA = required('HUB_SMOKE_CLINIC_A');
  const clinicB = required('HUB_SMOKE_CLINIC_B');
  const guardianA = required('HUB_SMOKE_GUARDIAN_A');

  const checks: Check[] = [];
  const origin =
    process.env.HUB_SMOKE_ORIGIN?.trim() || 'https://hub-staging.petmi.app';

  const headers = (token: string): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    Origin: origin,
  });

  // Positivo: A lê o próprio guardian
  {
    const res = await fetch(
      `${base}/api/hub/guardians/${encodeURIComponent(guardianA)}?clinic_id=${encodeURIComponent(clinicA)}`,
      { headers: headers(tokenA) },
    );
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      guardian?: { id?: string };
    };
    const id = String(body.guardian?.id || body.id || '');
    const ok = res.status === 200 && id === guardianA;
    checks.push({
      name: 'A lê guardian próprio',
      ok,
      detail: `status=${res.status} id=${id || '—'}`,
    });
  }

  // Negativo: B tenta ler guardian de A com clinic_id de B
  {
    const res = await fetch(
      `${base}/api/hub/guardians/${encodeURIComponent(guardianA)}?clinic_id=${encodeURIComponent(clinicB)}`,
      { headers: headers(tokenB) },
    );
    const bodyText = await res.text();
    let leaked = false;
    try {
      const body = JSON.parse(bodyText) as { id?: string; clinic_id?: string };
      if (body.id === guardianA || body.clinic_id === clinicA) leaked = true;
    } catch {
      /* ignore */
    }
    const ok = res.status >= 400 && res.status < 500 && !leaked;
    checks.push({
      name: 'B não lê guardian de A (clinic B)',
      ok,
      detail: `status=${res.status} leaked=${leaked}`,
    });
  }

  // Negativo: B tenta clinic_id de A (sem ser membro)
  {
    const res = await fetch(
      `${base}/api/hub/guardians?clinic_id=${encodeURIComponent(clinicA)}`,
      { headers: headers(tokenB) },
    );
    const bodyText = await res.text();
    let leaked = false;
    try {
      const body = JSON.parse(bodyText) as { guardians?: unknown[]; data?: unknown[] };
      const list = body.guardians || body.data || (Array.isArray(body) ? body : []);
      if (Array.isArray(list) && list.length > 0) leaked = true;
    } catch {
      /* ignore */
    }
    const ok = (res.status === 403 || res.status === 401 || res.status === 404) && !leaked;
    checks.push({
      name: 'B não lista guardians com clinic_id de A',
      ok,
      detail: `status=${res.status} leaked=${leaked}`,
    });
  }

  console.log('\nHub tenant isolation smoke\n');
  let failed = 0;
  for (const c of checks) {
    console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}  (${c.detail})`);
    if (!c.ok) failed += 1;
  }
  console.log(failed === 0 ? '\nPASS\n' : `\nFAIL (${failed})\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
