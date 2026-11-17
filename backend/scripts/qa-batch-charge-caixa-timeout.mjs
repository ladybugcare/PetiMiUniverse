/**
 * QA local + Supabase Preprod: Cobrar em conjunto (timeout / retry / total sessão).
 *
 * Uso (API em :3000, env smoke preprod):
 *   node backend/scripts/qa-batch-charge-caixa-timeout.mjs
 *
 * Não envia cobranças reais a tutores — só PIX sintético em comandas manuais QA.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function getEnv(txt, k) {
  for (const line of txt.split('\n')) {
    if (line.startsWith(`${k}=`)) return line.slice(k.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const smoke = readFileSync(resolve(root, 'backend/.env.smoke.preprod.local'), 'utf8');
const pre = readFileSync(
  resolve(root, 'backend/.env.preprod.local'),
  'utf8',
);
const pw = getEnv(smoke, 'QA_STAGING_PASSWORD');
const supabaseUrl = getEnv(pre, 'SUPABASE_URL');
const anon = getEnv(pre, 'SUPABASE_ANON_KEY');
const BASE = 'http://localhost:3000';
const clinic = 'a1111111-1111-4111-8111-111111111111';
const unit = 'ac9e17b6-d19c-4aad-a098-5fbd3e7fe4af';
const guardian = '46de1925-ff80-49df-840a-d431260508d1';
const pet = 'ef127b0c-bd31-407b-95df-3497d0964531';

async function login(email) {
  const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j.access_token;
}

async function call(tok, path, { method = 'GET', body, timeoutMs = 120_000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tok}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = text;
    }
    return { status: r.status, data, timedOut: false };
  } catch (e) {
    if (e?.name === 'AbortError') return { status: 0, data: 'timed out', timedOut: true };
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function openManual(tok, amount, label, marker) {
  const { status, data } = await call(tok, '/api/hub/comandas/open', {
    method: 'POST',
    body: {
      clinic_id: clinic,
      unit_id: unit,
      guardian_id: guardian,
      pet_id: pet,
      origin_type: 'manual',
      manual_lines: [{ description: `${marker} ${label}`, quantity: 1, unit_amount: amount }],
    },
  });
  const cid = data?.comanda?.id ?? data?.id;
  if (!cid) throw new Error(`open failed ${status} ${JSON.stringify(data)}`);
  return cid;
}

async function main() {
  const marker = `QA_BATCH_TO_${Date.now()}`;
  const tok = await login('qa.staging.a.cassistant@petmi.test');
  const openSess = await call(tok, `/api/hub/finance/cash-sessions/open?clinic_id=${clinic}&unit_id=${unit}`);
  const sessionId = openSess.data?.cash_session?.id;
  if (!sessionId) throw new Error('sem sessão de caixa aberta');

  const sum0 = await call(tok, `/api/hub/finance/cash-sessions/${sessionId}/summary?clinic_id=${clinic}`);
  const pix0 = Number(sum0.data?.summary?.totals_by_method?.pix ?? 0);

  const a = [await openManual(tok, 15, 'A1', marker), await openManual(tok, 25, 'A2', marker)];
  const keysA = Object.fromEntries(a.map((id) => [id, randomUUID()]));
  const full = await call(tok, '/api/hub/comandas/checkout-bulk', {
    method: 'POST',
    timeoutMs: 180_000,
    body: {
      clinic_id: clinic,
      comanda_ids: a,
      action: 'receive_now',
      payment_method: 'pix',
      cash_session_id: sessionId,
      idempotency_keys: keysA,
    },
  });
  if (full.status !== 201) throw new Error(`full ${full.status} ${JSON.stringify(full.data)}`);

  const sum1 = await call(tok, `/api/hub/finance/cash-sessions/${sessionId}/summary?clinic_id=${clinic}`);
  const pix1 = Number(sum1.data?.summary?.totals_by_method?.pix ?? 0);
  if (Math.abs(pix1 - pix0 - 40) > 0.02) throw new Error(`total sessão esperado +40, got ${pix1 - pix0}`);

  const c = [
    await openManual(tok, 8, 'C1', marker),
    await openManual(tok, 9, 'C2', marker),
    await openManual(tok, 7, 'C3', marker),
  ];
  const keysC = Object.fromEntries(c.map((id) => [id, randomUUID()]));
  const timed = await call(tok, '/api/hub/comandas/checkout-bulk', {
    method: 'POST',
    timeoutMs: 8_000,
    body: {
      clinic_id: clinic,
      comanda_ids: c,
      action: 'receive_now',
      payment_method: 'pix',
      cash_session_id: sessionId,
      idempotency_keys: keysC,
    },
  });
  if (!timed.timedOut && timed.status === 201) {
    console.log('aviso: lote C concluiu antes do timeout curto (ok se backend estiver rápido)');
  } else {
    console.log('timeout cliente simulado; aguardando server…');
    await new Promise((r) => setTimeout(r, 25_000));
  }

  const retryable = [];
  for (const cid of c) {
    const d = await call(tok, `/api/hub/comandas/${cid}?clinic_id=${clinic}`);
    const paid = Number(d.data?.paid_total ?? 0);
    const bal = Number(d.data?.balance_due ?? 0);
    const st = d.data?.comanda?.status;
    if (!(paid > 0.009 && bal <= 0.02) && st === 'aberta') retryable.push(cid);
  }
  if (retryable.length) {
    const retry = await call(tok, '/api/hub/comandas/checkout-bulk', {
      method: 'POST',
      timeoutMs: 180_000,
      body: {
        clinic_id: clinic,
        comanda_ids: retryable,
        action: 'receive_now',
        payment_method: 'pix',
        cash_session_id: sessionId,
        idempotency_keys: Object.fromEntries(retryable.map((id) => [id, keysC[id]])),
      },
    });
    console.log('retry', retry.status);
  }

  const closedResend = await call(tok, '/api/hub/comandas/checkout-bulk', {
    method: 'POST',
    timeoutMs: 60_000,
    body: {
      clinic_id: clinic,
      comanda_ids: a,
      action: 'receive_now',
      payment_method: 'pix',
      cash_session_id: sessionId,
      idempotency_keys: Object.fromEntries(a.map((id) => [id, randomUUID()])),
    },
  });
  if (closedResend.status !== 409) throw new Error(`esperado 409 quitadas, got ${closedResend.status}`);

  const sum2 = await call(tok, `/api/hub/finance/cash-sessions/${sessionId}/summary?clinic_id=${clinic}`);
  const pays = sum2.data?.all_payments ?? [];
  const uniq = new Set(pays.map((p) => p.id));
  if (uniq.size !== pays.length) throw new Error('pagamentos duplicados no summary');

  console.log('OK', {
    marker,
    pixDelta: Number(sum2.data?.summary?.totals_by_method?.pix ?? 0) - pix0,
    payments: pays.length,
    unique: uniq.size,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
