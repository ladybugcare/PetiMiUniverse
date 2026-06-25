#!/usr/bin/env node
/**
 * Smoke test dos fluxos de Caixa unificado (API).
 * Uso: node scripts/smoke-caixa-flows.mjs
 * Requer backend em http://localhost:3000 e credenciais em backend/.env.local ou HUB_SEED_PASSWORD.
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function loadDotEnvFile(absPath) {
  if (!existsSync(absPath)) return;
  for (const rawLine of readFileSync(absPath, 'utf8').split('\n')) {
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

const API = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.HUB_SEED_EMAIL || 'beatriz+cadmin@petmihub.com';
const PASSWORD = process.env.HUB_SEED_PASSWORD || process.env.TEST_PASSWORD;

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ''}`);
}
function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.log(`✗ ${name}${detail ? `: ${detail}` : ''}`);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text };
  }
  return { res, data };
}

async function main() {
  console.log(`API: ${API}`);

  // 1. Backend up
  try {
    const { res } = await fetchJson(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ping@test', password: 'x' }),
    });
    if (res.status === 0) throw new Error('connection refused');
    pass('Backend responde');
  } catch (e) {
    fail('Backend responde', (e).message);
    process.exit(1);
  }

  if (!PASSWORD) {
    fail('Login (sem HUB_SEED_PASSWORD/TEST_PASSWORD no ambiente)');
    console.log('\nDefina HUB_SEED_PASSWORD para testar endpoints autenticados.');
    process.exit(1);
  }

  // 2. Login
  const { res: loginRes, data: loginData } = await fetchJson(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok || !loginData.token) {
    fail('Login', loginData.error || loginRes.statusText);
    process.exit(1);
  }
  const token = loginData.token;
  const clinicId = loginData.clinic_id || loginData.clinicId;
  const unitId = loginData.unit_id || loginData.unitId || loginData.selected_unit_id;
  pass('Login', EMAIL);

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  if (!clinicId) {
    fail('clinic_id no login');
    process.exit(1);
  }
  pass('clinic_id presente', clinicId.slice(0, 8) + '…');

  // Resolve unit if missing
  let resolvedUnitId = unitId;
  if (!resolvedUnitId) {
    const { res, data } = await fetchJson(`${API}/api/hub/units?clinic_id=${clinicId}`, { headers });
    if (res.ok && data.units?.length) {
      resolvedUnitId = data.units[0].id;
      pass('unit_id resolvida via /hub/units', resolvedUnitId.slice(0, 8) + '…');
    } else {
      fail('unit_id', 'não encontrada');
    }
  } else {
    pass('unit_id presente', resolvedUnitId.slice(0, 8) + '…');
  }

  // 3. listHubComandas enrich=true
  const listQ = new URLSearchParams({ clinic_id: clinicId, status: 'aberta', enrich: 'true' });
  if (resolvedUnitId) listQ.set('unit_id', resolvedUnitId);
  const { res: listRes, data: listData } = await fetchJson(`${API}/api/hub/comandas?${listQ}`, { headers });
  if (!listRes.ok) {
    fail('listHubComandas enrich=true', listData.error || listRes.statusText);
  } else {
    const comandas = listData.comandas ?? [];
    const hasEnrich = comandas.length === 0 || comandas.some((c) => 'guardian' in c || 'pet' in c || 'paid_total' in c);
    if (hasEnrich) pass('listHubComandas enrich=true', `${comandas.length} comanda(s)`);
    else fail('listHubComandas enrich=true', 'resposta sem campos enriquecidos');
  }

  // 4. cash session summary totals_by_method shape
  const { res: cashRes, data: cashData } = await fetchJson(
    `${API}/api/hub/finance/cash-sessions/open?clinic_id=${clinicId}&unit_id=${resolvedUnitId}`,
    { headers },
  );
  if (!cashRes.ok) {
    fail('getCashSessionOpen', cashData.error || cashRes.statusText);
  } else if (cashData.cash_session?.id) {
    pass('Sessão de caixa aberta', cashData.cash_session.id.slice(0, 8) + '…');
    const { res: sumRes, data: sumData } = await fetchJson(
      `${API}/api/hub/finance/cash-sessions/${cashData.cash_session.id}/summary?clinic_id=${clinicId}`,
      { headers },
    );
    if (!sumRes.ok) {
      fail('getCashSessionSummary', sumData.error || sumRes.statusText);
    } else if (sumData.summary && 'totals_by_method' in sumData.summary) {
      pass('totals_by_method no summary', JSON.stringify(sumData.summary.totals_by_method));
      if (typeof sumData.summary.expected_balance === 'number') {
        pass('expected_balance presente (só dinheiro)', String(sumData.summary.expected_balance));
      }
    } else {
      fail('totals_by_method no summary', 'campo ausente');
    }
  } else {
    pass('getCashSessionOpen', 'sem sessão aberta (ok para teste)');
  }

  // 5. getComandaDetail enrichment (if open comanda exists)
  const comandas = listData.comandas ?? [];
  if (comandas.length > 0) {
    const cid = comandas[0].id;
    const { res: detRes, data: detData } = await fetchJson(
      `${API}/api/hub/comandas/${cid}?clinic_id=${clinicId}`,
      { headers },
    );
    if (!detRes.ok) {
      fail('getComandaDetail', detData.error || detRes.statusText);
    } else {
      const comanda = detData.comanda ?? {};
      const hasNames = 'guardian' in comanda || detData.items?.some((it) => it.pet_name);
      if (hasNames) pass('getComandaDetail enriquecido', cid.slice(0, 8) + '…');
      else pass('getComandaDetail', 'ok (sem nomes — tutor/pet podem estar vazios)');
    }
  } else {
    pass('getComandaDetail', 'pulado — nenhuma comanda aberta');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks OK`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
