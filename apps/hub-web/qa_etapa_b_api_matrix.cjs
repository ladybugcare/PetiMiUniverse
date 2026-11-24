/**
 * Matriz API Etapa B (comercial líquido) — fixtures Antipulgas 100 / Shampoo 50.
 * Uso (após deploy preprod ou API local apontando ao DB preprod):
 *   node apps/hub-web/qa_etapa_b_api_matrix.cjs
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

function loadEnv(file) {
  const text = fs.readFileSync(file, 'utf8');
  const out = {};
  for (const line of text.split(/\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  return out;
}

const repo = path.join(__dirname, '../..');
const pre = loadEnv(path.join(repo, 'backend/.env.preprod.local'));
const smoke = loadEnv(path.join(repo, 'backend/.env.smoke.preprod.local'));
const API = (process.env.E2E_API_URL || process.env.VITE_API_URL || 'https://backend-staging-334260f3.up.railway.app').replace(/\/$/, '');
const SB = pre.SUPABASE_URL;
const ANON = pre.SUPABASE_ANON_KEY;
const PW = smoke.QA_STAGING_PASSWORD;
const CLINIC = smoke.HUB_SMOKE_CLINIC_A;
const UNIT = smoke.HUB_SMOKE_UNIT_A;
const EMAIL = 'qa.staging.a.cfinance@petmi.test';

async function login() {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PW }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`login ${r.status} ${JSON.stringify(j)}`);
  return j.access_token;
}

async function api(token, method, urlPath, body) {
  const r = await fetch(`${API}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-clinic-id': CLINIC,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: r.status, json };
}

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const token = await login();
  const from = ymd(new Date(Date.now() - 7 * 86400000));
  const to = ymd();
  const q = `clinic_id=${CLINIC}&unit_id=${UNIT}&from=${from}&to=${to}`;
  const matrix = [];

  const productSales = await api(token, 'GET', `/api/hub/finance/reports/product-sales?${q}`);
  matrix.push({
    id: 'API-product-sales',
    ok: productSales.status === 200 && productSales.json?.summary?.revenue != null,
    expected: 'HTTP 200 + summary.revenue + notes comerciais',
    observed: {
      status: productSales.status,
      revenue: productSales.json?.summary?.revenue,
      returns: productSales.json?.summary?.returns_commercial,
      margin_complete: productSales.json?.summary?.margin_complete,
      notes: Boolean(productSales.json?.notes),
      competence: productSales.json?.competence,
    },
  });

  const sector = await api(token, 'GET', `/api/hub/finance/reports/movement-by-sector?${q}`);
  matrix.push({
    id: 'API-movement-by-sector',
    ok: sector.status === 200 && typeof sector.json?.summary?.total === 'number',
    expected: 'HTTP 200 + total líquido + notes',
    observed: {
      status: sector.status,
      total: sector.json?.summary?.total,
      returns: sector.json?.summary?.returns_commercial,
      notes: Boolean(sector.json?.notes),
    },
  });

  const ticket = await api(token, 'GET', `/api/hub/finance/reports/ticket-average?${q}`);
  matrix.push({
    id: 'API-ticket-historical',
    ok:
      ticket.status === 200 &&
      ticket.json?.kind === 'historical_commercial_ticket' &&
      (ticket.json.ticket_average === null || typeof ticket.json.ticket_average === 'number'),
    expected: 'kind historical_commercial_ticket; null se sem cobranças',
    observed: {
      status: ticket.status,
      kind: ticket.json?.kind,
      ticket_average: ticket.json?.ticket_average,
      count: ticket.json?.receivables_count,
    },
  });

  const commissions = await api(token, 'GET', `/api/hub/finance/reports/commissions?${q}`);
  matrix.push({
    id: 'API-commissions-estimated',
    ok: commissions.status === 200 && commissions.json?.estimation === true,
    expected: 'estimation:true + notes Comissão estimada',
    observed: {
      status: commissions.status,
      estimation: commissions.json?.estimation,
      total: commissions.json?.summary?.total_commission,
      notes: String(commissions.json?.notes || '').slice(0, 80),
    },
  });

  const salesAdj = await api(token, 'GET', `/api/hub/finance/reports/sales-adjustments?${q}`);
  matrix.push({
    id: 'API-sales-adjustments',
    ok:
      salesAdj.status === 200 &&
      typeof salesAdj.json?.sales?.total_at_sale === 'number' &&
      Boolean(salesAdj.json?.adjustments?.note),
    expected: 'total_at_sale + note separando refund financeiro de devolução comercial',
    observed: {
      status: salesAdj.status,
      total_at_sale: salesAdj.json?.sales?.total_at_sale,
      adj_note: Boolean(salesAdj.json?.adjustments?.note),
    },
  });

  const aging = await api(token, 'GET', `/api/hub/finance/reports/aging?clinic_id=${CLINIC}&unit_id=${UNIT}`);
  matrix.push({
    id: 'API-aging-balanceDue',
    ok: aging.status === 200 && aging.json?.buckets != null,
    expected: 'buckets com saldo a receber (balanceDue)',
    observed: { status: aging.status, buckets: Object.keys(aging.json?.buckets || {}) },
  });

  const revenue = await api(token, 'GET', `/api/hub/finance/reports/revenue?${q}`);
  matrix.push({
    id: 'API-revenue-recebimentos',
    ok: revenue.status === 200 && revenue.json?.kind === 'recebimentos',
    expected: 'kind recebimentos (não receita líquida comercial)',
    observed: { status: revenue.status, kind: revenue.json?.kind, total: revenue.json?.total },
  });

  const failed = matrix.filter((r) => !r.ok);
  const out = {
    run_id: randomUUID(),
    api: API,
    clinic: CLINIC,
    unit: UNIT,
    period: { from, to },
    passed: matrix.length - failed.length,
    total: matrix.length,
    matrix,
  };
  fs.writeFileSync('/tmp/etapa_b_api_matrix.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ passed: out.passed, total: out.total, failed: failed.map((f) => f.id) }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
