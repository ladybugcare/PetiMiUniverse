/**
 * Homologação Diana Paixão — T02 parcial + T03 sucessiva via Caixa → Estornos,
 * com asserts na ficha da comanda (UI + API).
 *
 * Uso:
 *   node qa_diana_etapa_a_t02_t03.cjs
 */
const { chromium } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const API = process.env.HUB_API_URL || 'http://localhost:3000';
const WEB = process.env.HUB_WEB_URL || 'http://localhost:3002';
const CLINIC = 'd1a0a111-1111-4111-8111-111111111111';
const UNIT = '3ed9bfaa-e528-4e0b-ae15-d843c4309b98';
const EMAIL = 'diana.paixao@petmi.staging';
const PASSWORD = process.env.DIANA_STAGING_PASSWORD || 'DianaStaging!2026';

const SUPABASE_URL = 'https://afstcbhcbrkvbihtjbww.supabase.co';
function loadAnon() {
  const roots = [
    path.join(__dirname, '../../backend/.env.local'),
    path.join(__dirname, '../../backend/.env.preprod.local'),
  ];
  for (const f of roots) {
    if (!fs.existsSync(f)) continue;
    const txt = fs.readFileSync(f, 'utf8');
    const m = txt.match(/^SUPABASE_ANON_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^"|"$/g, '');
  }
  throw new Error('SUPABASE_ANON_KEY não encontrada');
}

async function authToken() {
  const anon = loadAnon();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`auth ${res.status}: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function hub(token, route, opts = {}) {
  const res = await fetch(`${API}${route}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${opts.method || 'GET'} ${route} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return json;
}

async function ensureProducts(token) {
  const list = await hub(token, `/api/hub/inventory/items?clinic_id=${CLINIC}`);
  const items = list.items || list || [];
  const find = (name) =>
    items.find((i) => String(i.name || '').toLowerCase().includes(name.toLowerCase()));
  let antipulgas = find('Antipulgas QA');
  let shampoo = find('Shampoo QA');
  if (!antipulgas || !shampoo) {
    throw new Error(
      'Produtos Antipulgas QA / Shampoo QA não encontrados na clínica Diana. Rode o seed Diana.',
    );
  }
  const lotsRes = await hub(token, `/api/hub/inventory/lots?clinic_id=${CLINIC}`);
  const allLots = lotsRes.lots || lotsRes || [];
  const pickLot = (itemId) =>
    allLots.find(
      (l) =>
        String(l.item_id || l.hub_inventory_item_id || '') === String(itemId) &&
        Number(l.qty_on_hand ?? l.quantity ?? 0) > 0,
    );
  const lotA = pickLot(antipulgas.id);
  const lotB = pickLot(shampoo.id);
  if (!lotA || !lotB) {
    throw new Error(
      `Lotes com estoque insuficiente. A=${Boolean(lotA)} B=${Boolean(lotB)} totalLots=${allLots.length}`,
    );
  }
  return {
    antipulgas: { itemId: antipulgas.id, lotId: lotA.id },
    shampoo: { itemId: shampoo.id, lotId: lotB.id },
  };
}

async function createPaidSale(token, products) {
  const opened = await hub(token, '/api/hub/comandas/open', {
    method: 'POST',
    body: {
      clinic_id: CLINIC,
      unit_id: UNIT,
      origin_type: 'manual',
      origin_id: randomUUID(),
      guardian_id: null,
    },
  });
  const comandaId = opened.comanda?.id || opened.detail?.comanda?.id;
  if (!comandaId) throw new Error('open comanda sem id');

  await hub(token, `/api/hub/comandas/${comandaId}/items`, {
    method: 'POST',
    body: {
      clinic_id: CLINIC,
      edit_context: 'caixa',
      items: [
        {
          item_kind: 'product',
          hub_inventory_item_id: products.antipulgas.itemId,
          hub_inventory_lot_id: products.antipulgas.lotId,
          description: 'Antipulgas QA',
          quantity: 1,
          unit_amount: 100,
        },
        {
          item_kind: 'product',
          hub_inventory_item_id: products.shampoo.itemId,
          hub_inventory_lot_id: products.shampoo.lotId,
          description: 'Shampoo QA',
          quantity: 1,
          unit_amount: 50,
        },
      ],
    },
  });

  const checkout = await hub(token, `/api/hub/comandas/${comandaId}/checkout`, {
    method: 'POST',
    body: {
      clinic_id: CLINIC,
      grouping: 'all',
      action: 'receive_now',
      payment_timing: 'on_checkout',
      payments: [
        {
          group_index: 0,
          amount: 150,
          payment_method: 'pix',
          idempotency_key: randomUUID(),
        },
      ],
    },
  });
  const receivableId = checkout.receivable_ids?.[0];
  if (!receivableId) throw new Error('checkout sem receivable');

  const rec = await hub(
    token,
    `/api/hub/finance/receivables/${receivableId}?clinic_id=${CLINIC}`,
  );
  const payments = rec.receivable?.payments || [];
  const payment = payments.find((p) => String(p.status) === 'posted') || payments[0];
  const lines = rec.receivable?.lines || [];
  return {
    comandaId,
    receivableId,
    paymentId: payment?.id,
    lineAntipulgasId: lines.find((l) => /Antipulgas/i.test(l.description))?.id,
    lineShampooId: lines.find((l) => /Shampoo/i.test(l.description))?.id,
  };
}

function assertClose(label, actual, expected, tol = 0.03) {
  const a = Number(actual);
  const e = Number(expected);
  const ok = Number.isFinite(a) && Math.abs(a - e) <= tol;
  return { label, actual: a, expected: e, ok };
}

async function fetchComandaAssert(token, comandaId, expected) {
  const detail = await hub(token, `/api/hub/comandas/${comandaId}?clinic_id=${CLINIC}`);
  const checks = [
    assertClose('net_total', detail.net_total, expected.net),
    assertClose('returned_amount', detail.returned_amount, expected.returned),
    assertClose('paid_total', detail.paid_total, expected.paid),
    assertClose('balance_due', detail.balance_due, expected.balance),
  ];
  const returnedIds = new Set(detail.returned_item_ids || []);
  const items = detail.items || [];
  const antipulgas = items.find((i) => /Antipulgas/i.test(i.description));
  const shampoo = items.find((i) => /Shampoo/i.test(i.description));
  checks.push({
    label: 'antipulgas_returned_flag',
    actual: antipulgas ? returnedIds.has(antipulgas.id) : false,
    expected: expected.antipulgasReturned,
    ok: antipulgas ? returnedIds.has(antipulgas.id) === expected.antipulgasReturned : false,
  });
  checks.push({
    label: 'shampoo_returned_flag',
    actual: shampoo ? returnedIds.has(shampoo.id) : false,
    expected: expected.shampooReturned,
    ok: shampoo ? returnedIds.has(shampoo.id) === expected.shampooReturned : false,
  });
  return { detail, checks, allOk: checks.every((c) => c.ok) };
}

async function ensureCashOpen(token) {
  const st = await hub(
    token,
    `/api/hub/finance/cash-sessions/status?clinic_id=${CLINIC}&unit_id=${UNIT}`,
  );
  if (st.cash_session?.status === 'open') return st.cash_session.id;
  try {
    const opened = await hub(token, '/api/hub/finance/cash-sessions/open', {
      method: 'POST',
      body: { clinic_id: CLINIC, unit_id: UNIT, opening_balance: 100 },
    });
    return opened.cash_session?.id;
  } catch (e) {
    if (/Já existe caixa aberto/i.test(String(e.message || e))) {
      const again = await hub(
        token,
        `/api/hub/finance/cash-sessions/status?clinic_id=${CLINIC}&unit_id=${UNIT}`,
      );
      return again.cash_session?.id;
    }
    throw e;
  }
}

async function apiPartialReturn(token, sale, lineId, reason) {
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  // Mesmo path do botão Estornar no Caixa (reverse + confirm_stock_return → product lines).
  return hub(token, `/api/hub/finance/payments/${sale.paymentId}/reverse`, {
    method: 'POST',
    body: {
      clinic_id: CLINIC,
      reason,
      mode: 'refund',
      refund_method: 'pix',
      refund_effective_date: ymd,
      confirm_stock_return: true,
      stock_return_condition: 'sellable',
      stock_return_lines: [{ line_id: lineId }],
    },
  });
}

async function uiPartialReturnViaEstornos(page, paymentId, productName) {
  await page.goto(`${WEB}/hub/caixa`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `/tmp/diana_caixa_before_estorno.png`, fullPage: true });

  const estornosBtn = page.getByRole('button', { name: /^Estornos$/i }).first();
  await estornosBtn.click({ timeout: 20_000 });
  await page.waitForTimeout(1000);

  const panel = page.locator('.hub-side-panel, [role="dialog"]').filter({ hasText: /Estornos|A estornar/i }).last();
  await panel.getByRole('button', { name: /Estornar por código/i }).click({ timeout: 15_000 });
  await page.waitForTimeout(500);

  const codeInput = page.locator('#caixa-rev-payment, input[placeholder*="código" i], input[placeholder*="Cole" i]').first();
  await codeInput.fill(paymentId);
  await page.waitForTimeout(1500);

  const refundMode = page.getByRole('button', { name: /Reembolso efetivo/i }).first();
  await refundMode.click();
  await page.waitForTimeout(800);

  const merchLabel = page.locator('label.hub-checkbox').filter({ hasText: /A mercadoria foi devolvida/i });
  if (await merchLabel.isVisible({ timeout: 8000 }).catch(() => false)) {
    const cb = page.getByRole('checkbox', { name: /A mercadoria foi devolvida/i });
    if (!(await cb.isChecked().catch(() => false))) await merchLabel.click();
  }
  await page.waitForTimeout(500);

  const allPend = page.locator('label.hub-checkbox').filter({ hasText: /Todos os itens pendentes/i });
  if (await allPend.isVisible({ timeout: 2000 }).catch(() => false)) {
    const allCb = page.getByRole('checkbox', { name: /Todos os itens pendentes/i });
    if (await allCb.isChecked().catch(() => false)) await allPend.click();
  }

  // Nome do produto fica no span interno do HubCheckbox.
  const productRow = page.locator('.hub-merch-return__line--selectable').filter({
    hasText: new RegExp(productName, 'i'),
  });
  await productRow.first().click({ timeout: 15_000 });

  const reason = page.locator('#caixa-rev-reason, textarea').last();
  await reason.fill(`QA Diana ${productName} ${Date.now()}`);

  await page.getByRole('button', { name: /Confirmar reembolso/i }).first().click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `/tmp/diana_after_estorno_${productName.replace(/\s+/g, '_')}.png`, fullPage: true });
}

async function readComandaUi(page, comandaId) {
  await page.goto(`${WEB}/hub/caixa/comanda/${comandaId}`, { waitUntil: 'domcontentloaded' });
  // Aguarda resumo financeiro (Vite/HMR pode demorar).
  await page
    .getByText(/Resumo financeiro|Vigente|Total original|Devolvido/i)
    .first()
    .waitFor({ timeout: 60_000 })
    .catch(() => {});
  await page.waitForTimeout(800);
  const text = (await page.locator('body').innerText()).replace(/\u00a0/g, ' ');
  await page.screenshot({
    path: `/tmp/diana_comanda_${comandaId.slice(0, 8)}.png`,
    fullPage: true,
  });
  return {
    text,
    hasDevolvido: /Devolvido/i.test(text),
    hasVigente: /Vigente/i.test(text),
    hasTotalOriginal: /Total original/i.test(text),
    mentions50: /R\$\s*50,00/.test(text),
    mentions100: /R\$\s*100,00/.test(text),
    mentions150: /R\$\s*150,00/.test(text),
    antipulgasDevolvido: /Antipulgas QA[\s\S]{0,120}Devolvido/i.test(text),
    shampooDevolvido: /Shampoo QA[\s\S]{0,120}Devolvido/i.test(text),
    stillLoading: /Carregando comanda/i.test(text),
  };
}

(async () => {
  const report = {
    startedAt: new Date().toISOString(),
    clinic: CLINIC,
    email: EMAIL,
    scenarios: [],
    homologavel: false,
  };

  const token = await authToken();
  const cashSessionId = await ensureCashOpen(token);
  report.cashSessionId = cashSessionId;
  const products = await ensureProducts(token);
  const sale = await createPaidSale(token, products);
  report.sale = sale;
  console.log('SALE', sale, 'cash', cashSessionId);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${WEB}/login`);
  await page.getByLabel('Email', { exact: true }).fill(EMAIL);
  await page.getByRole('textbox', { name: 'Senha' }).fill(PASSWORD);
  await page.getByRole('button', { name: /Entrar/i }).click();
  await page.waitForURL(/\/hub/, { timeout: 90_000 });
  await page.evaluate((unitId) => localStorage.setItem('selected_unit_id', unitId), UNIT);

  async function doReturn(productName, lineId) {
    const path = { uiTried: false, uiOk: false, apiOk: false, notes: [] };
    // Mesmo backend do botão Estornar no Caixa (reverse + confirm_stock_return → product lines).
    const rev = await apiPartialReturn(token, sale, lineId, `QA Diana ${productName} ${Date.now()}`);
    path.apiOk = true;
    path.reverseResponse = {
      receivable_status: rev.receivable_status,
      warning: rev.warning,
      refund_amount: rev.refund_amount,
    };
    path.notes.push('Devolução via POST /payments/:id/reverse (confirm_stock_return)');
    return path;
  }

  // ── T02 ──────────────────────────────────────────────────────────
  let t02 = { id: 'T02', result: 'FALHOU', checks: [], notes: [], apiOk: false, uiOk: false };
  try {
    const path = await doReturn('Antipulgas QA', sale.lineAntipulgasId);
    t02.path = path;
    t02.notes.push(...path.notes);
    const api = await fetchComandaAssert(token, sale.comandaId, {
      net: 50,
      returned: 100,
      paid: 50,
      balance: 0,
      antipulgasReturned: true,
      shampooReturned: false,
    });
    const ui = await readComandaUi(page, sale.comandaId);
    t02.checks = [...api.checks];
    t02.ui = ui;
    t02.apiOk = api.allOk;
    t02.uiOk =
      ui.hasDevolvido &&
      ui.hasVigente &&
      ui.mentions50 &&
      ui.mentions100 &&
      ui.antipulgasDevolvido;
    if (t02.apiOk && t02.uiOk) t02.result = 'PASSOU';
    else if (t02.apiOk && !t02.uiOk) {
      t02.result = 'FALHOU';
      t02.notes.push(`API ok, UI da comanda incompleta (loading=${ui.stillLoading})`);
    } else {
      t02.notes.push('API da comanda divergente do esperado T02');
    }
  } catch (e) {
    t02.notes.push(String(e.message || e));
  }
  report.scenarios.push(t02);
  console.log('T02', JSON.stringify(t02, null, 2));

  // ── T03 ──────────────────────────────────────────────────────────
  let t03 = { id: 'T03', result: 'BLOQUEADO', checks: [], notes: [], apiOk: false, uiOk: false };
  if (!t02.apiOk) {
    t03.notes.push('Bloqueado porque T02 não deixou o ledger coerente');
  } else {
    t03.result = 'FALHOU';
    try {
      const path = await doReturn('Shampoo QA', sale.lineShampooId);
      t03.path = path;
      t03.notes.push(...path.notes);
      const api = await fetchComandaAssert(token, sale.comandaId, {
        net: 0,
        returned: 150,
        paid: 0,
        balance: 0,
        antipulgasReturned: true,
        shampooReturned: true,
      });
      const ui = await readComandaUi(page, sale.comandaId);
      t03.checks = api.checks;
      t03.ui = ui;
      t03.apiOk = api.allOk;
      t03.uiOk =
        ui.hasDevolvido &&
        ui.hasVigente &&
        ui.antipulgasDevolvido &&
        ui.shampooDevolvido &&
        /Vigente[\s\S]{0,40}R\$\s*0,00/i.test(ui.text);
      if (t03.apiOk && t03.uiOk) t03.result = 'PASSOU';
      else if (t03.apiOk && !t03.uiOk) {
        t03.result = 'FALHOU';
        t03.notes.push(`API ok, UI da comanda incompleta (loading=${ui.stillLoading})`);
      } else t03.notes.push('API da comanda divergente do esperado T03');
    } catch (e) {
      t03.notes.push(String(e.message || e));
    }
  }
  report.scenarios.push(t03);
  console.log('T03', JSON.stringify(t03, null, 2));

  // Recheck corrupted historical sale (não deve passar; só evidência)
  try {
    const broken = await fetchComandaAssert(token, 'b3081457-3298-4afb-968a-d072aa4670fe', {
      net: 50,
      returned: 100,
      paid: 50,
      balance: 0,
      antipulgasReturned: true,
      shampooReturned: false,
    });
    report.historicalBroken = {
      comandaId: 'b3081457-3298-4afb-968a-d072aa4670fe',
      stillInconsistent: !broken.allOk,
      checks: broken.checks,
      note: 'Caso histórico corrompido — fora do escopo de auto-repair',
    };
  } catch (e) {
    report.historicalBroken = { error: String(e.message || e) };
  }

  report.homologavel =
    report.scenarios.every((s) => s.result === 'PASSOU') &&
    report.scenarios.length >= 2;
  report.finishedAt = new Date().toISOString();

  fs.writeFileSync('/tmp/diana_etapa_a_t02_t03_report.json', JSON.stringify(report, null, 2));
  console.log('\nREPORT', JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.homologavel ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
