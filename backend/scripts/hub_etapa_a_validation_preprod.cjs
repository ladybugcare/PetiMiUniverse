/**
 * Validação técnica final Etapa A — fixtures isoladas em preprod.
 * Não toca dados reais de clientes (cria/apaga UUIDs próprios).
 *
 * node backend/scripts/hub_etapa_a_validation_preprod.cjs
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { randomUUID } = require('crypto');

function loadUrl() {
  const text = fs.readFileSync(path.join(__dirname, '../.env.preprod.local'), 'utf8');
  const m = text.match(/^SB_PREPROD_DB_URL=(.+)$/m);
  if (!m) throw new Error('SB_PREPROD_DB_URL ausente');
  return m[1].trim();
}

function client(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    db: u.pathname.replace(/^\//, '') || 'postgres',
    env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password), PGSSLMODE: 'require' },
  };
}

function psql(url, sql, label) {
  const c = client(url);
  const r = spawnSync(
    'psql',
    ['-h', c.host, '-p', c.port, '-U', c.user, '-d', c.db, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
    { env: c.env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    const err = new Error(`${label}: ${(r.stderr || r.stdout || '').slice(0, 600)}`);
    err.status = r.status;
    err.stderr = r.stderr;
    throw err;
  }
  return (r.stdout || '').trim();
}

function psqlRaw(url, sql) {
  const c = client(url);
  return spawnSync(
    'psql',
    ['-h', c.host, '-p', c.port, '-U', c.user, '-d', c.db, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
    { env: c.env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
}

function runOne(url, sql) {
  const c = client(url);
  return new Promise((resolve) => {
    const child = spawn(
      'psql',
      ['-h', c.host, '-p', c.port, '-U', c.user, '-d', c.db, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
      { env: c.env },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

async function parallel(url, sqlA, sqlB) {
  return Promise.all([runOne(url, sqlA), runOne(url, sqlB)]);
}

function seedInventory(url, clinicId, itemId, lotId) {
  psql(
    url,
    `
    INSERT INTO hub_inventory_items (id, clinic_id, item_kind, name, cost_amount, sale_amount, active)
    VALUES ('${itemId}'::uuid, '${clinicId}'::uuid, 'product', 'QA EtapaA val', 1, 100, true);
    INSERT INTO hub_inventory_lots (id, clinic_id, item_id, lot_code, received_at)
    VALUES ('${lotId}'::uuid, '${clinicId}'::uuid, '${itemId}'::uuid, 'QA-VAL-${Date.now()}', now());
    `,
    'seed inv',
  );
}

function seedReceivable(url, opts) {
  const {
    clinicId,
    unitId,
    recId,
    lines,
    paid,
    guardianId,
    itemId,
    lotId,
    status = 'pending',
  } = opts;
  const original = lines.reduce((s, l) => s + l.amount, 0);
  psql(
    url,
    `
    INSERT INTO hub_receivables (
      id, clinic_id, unit_id, guardian_id, source_type, source_id,
      original_amount, final_amount, net_amount_at_sale, returned_amount, status
    ) VALUES (
      '${recId}'::uuid, '${clinicId}'::uuid, '${unitId}'::uuid,
      ${guardianId ? `'${guardianId}'::uuid` : 'NULL'},
      'manual', gen_random_uuid(),
      ${original}, ${original}, ${original}, 0, '${status}'
    );
    ${lines
      .map(
        (l, i) => `
    INSERT INTO hub_receivable_lines (
      id, clinic_id, receivable_id, line_kind, description, quantity,
      unit_sale_amount, line_total, hub_inventory_item_id, hub_inventory_lot_id, sort_order
    ) VALUES (
      '${l.id}'::uuid, '${clinicId}'::uuid, '${recId}'::uuid, 'product', 'QA L${i}', 1,
      ${l.amount}, ${l.amount}, '${itemId}'::uuid, '${lotId}'::uuid, ${i}
    );`,
      )
      .join('\n')}
    ${
      paid > 0
        ? `INSERT INTO hub_payments (clinic_id, receivable_id, amount, payment_method, status, posting_kind)
           VALUES ('${clinicId}'::uuid, '${recId}'::uuid, ${paid}, 'pix', 'posted', 'operational');
           UPDATE hub_receivables SET status = CASE
             WHEN ${paid} >= ${original} - 0.009 THEN 'paid'
             WHEN ${paid} > 0 THEN 'partially_paid' ELSE status END
           WHERE id = '${recId}'::uuid;`
        : ''
    }
    `,
    'seed rec',
  );
}

function cleanup(url, ids) {
  const { recIds, lineIds, itemId, lotId, guardianId } = ids;
  const recList = recIds.map((id) => `'${id}'::uuid`).join(',');
  const lineList = lineIds.map((id) => `'${id}'::uuid`).join(',');
  psql(
    url,
    `
    DELETE FROM hub_product_return_requests WHERE receivable_id IN (${recList});
    DELETE FROM hub_financial_adjustment_lines WHERE receivable_id IN (${recList});
    DELETE FROM hub_financial_adjustments WHERE receivable_id IN (${recList});
    DELETE FROM hub_product_return_events WHERE receivable_id IN (${recList});
    DELETE FROM hub_customer_credit_movements WHERE receivable_id IN (${recList});
    DELETE FROM hub_cash_movements WHERE notes LIKE 'QA EtapaA%' OR notes LIKE 'Reembolso devolução%';
    DELETE FROM hub_stock_movements WHERE reference_id IN (${lineList});
    DELETE FROM hub_payments WHERE receivable_id IN (${recList});
    DELETE FROM hub_receivable_lines WHERE receivable_id IN (${recList});
    DELETE FROM hub_receivables WHERE id IN (${recList});
    ${lotId ? `DELETE FROM hub_inventory_lots WHERE id = '${lotId}'::uuid;` : ''}
    ${itemId ? `DELETE FROM hub_inventory_items WHERE id = '${itemId}'::uuid;` : ''}
    ${guardianId ? `DELETE FROM hub_guardians WHERE id = '${guardianId}'::uuid;` : ''}
    `,
    'cleanup',
  );
}

function returnSql(clinicId, recId, lineIds, key, opts = {}) {
  const method = opts.method === undefined ? 'pix' : opts.method;
  const date = opts.date === undefined ? 'CURRENT_DATE' : opts.date;
  const condition = opts.condition || 'unsellable';
  const reason = opts.reason || 'QA EtapaA validation';
  const arr = lineIds.map((id) => `'${id}'::uuid`).join(',');
  const methodSql = method == null ? 'NULL' : `'${method}'`;
  const dateSql = date == null ? 'NULL' : date;
  return `
    SELECT public.hub_return_receivable_product_lines(
      '${clinicId}'::uuid, '${recId}'::uuid, NULL, '${reason}', '${condition}',
      ARRAY[${arr}], ${methodSql}, ${dateSql}, '${key}'::uuid
    )::text;
  `;
}

async function main() {
  const url = loadUrl();
  const results = [];
  const clinicId = psql(url, `SELECT id::text FROM clinics ORDER BY created_at NULLS LAST LIMIT 1;`, 'clinic');
  const unitId = psql(
    url,
    `SELECT id::text FROM units WHERE clinic_id = '${clinicId}'::uuid LIMIT 1;`,
    'unit',
  );
  const otherClinic = psql(
    url,
    `SELECT id::text FROM clinics WHERE id <> '${clinicId}'::uuid ORDER BY created_at NULLS LAST LIMIT 1;`,
    'other clinic',
  );

  const itemId = randomUUID();
  const lotId = randomUUID();
  seedInventory(url, clinicId, itemId, lotId);

  const allRec = [];
  const allLines = [];

  // --- 1) Financial net paid after partial ---
  {
    const recId = randomUUID();
    const l1 = randomUUID();
    const l2 = randomUUID();
    allRec.push(recId);
    allLines.push(l1, l2);
    seedReceivable(url, {
      clinicId,
      unitId,
      recId,
      itemId,
      lotId,
      paid: 150,
      lines: [
        { id: l1, amount: 100 },
        { id: l2, amount: 50 },
      ],
    });
    const key = randomUUID();
    const r = psqlRaw(url, returnSql(clinicId, recId, [l1], key));
    const state = psql(
      url,
      `SELECT final_amount::text||'|'||returned_amount::text||'|'||status||'|'||
              public.hub_sum_posted_payments(id)::text||'|'||
              public.hub_sum_line_refund_adjustments(id)::text||'|'||
              public.hub_net_paid_effective(id)::text
       FROM hub_receivables WHERE id='${recId}'::uuid;`,
      'fin state',
    );
    const [finalAmt, returned, status, posted, lineRef, netPaid] = state.split('|');
    results.push({
      name: '1_financial_after_partial_100_of_150',
      ok:
        r.status === 0 &&
        Number(finalAmt) === 50 &&
        Number(returned) === 100 &&
        Number(posted) === 150 &&
        Number(lineRef) === 100 &&
        Number(netPaid) === 50 &&
        status === 'paid',
      detail: { state, out: (r.stdout || r.stderr || '').slice(0, 200) },
    });
  }

  // --- 2a) return × reverse ---
  {
    const recId = randomUUID();
    const l1 = randomUUID();
    const l2 = randomUUID();
    allRec.push(recId);
    allLines.push(l1, l2);
    seedReceivable(url, {
      clinicId,
      unitId,
      recId,
      itemId,
      lotId,
      paid: 150,
      lines: [
        { id: l1, amount: 100 },
        { id: l2, amount: 50 },
      ],
    });
    const payId = psql(
      url,
      `SELECT id::text FROM hub_payments WHERE receivable_id='${recId}'::uuid AND status='posted' LIMIT 1;`,
      'pay',
    );
    const [a, b] = await parallel(
      url,
      returnSql(clinicId, recId, [l1], randomUUID()),
      `SELECT public.hub_reverse_payment('${payId}'::uuid,'${clinicId}'::uuid,NULL,'QA concurrent reverse','payment_reversal',NULL,NULL)::text;`,
    );
    const events = psql(
      url,
      `SELECT COUNT(*)::text FROM hub_product_return_events WHERE receivable_id='${recId}'::uuid;`,
      'ev',
    );
    const payStatus = psql(
      url,
      `SELECT status FROM hub_payments WHERE id='${payId}'::uuid;`,
      'pay st',
    );
    // Exactly one of return-ok or reverse-ok, or return ok and reverse blocked
    const returnOk = a.code === 0;
    const reverseOk = b.code === 0;
    const lineRefunds = psql(
      url,
      `SELECT COALESCE(SUM(amount),0)::text FROM hub_financial_adjustments
       WHERE receivable_id='${recId}'::uuid AND payment_id IS NULL AND adjustment_type='refund';`,
      'lr2a',
    );
    // Incoerente: devolução com reembolso financeiro E reverse do payment (dupla saída).
    // Coerente: reverse primeiro (posted=0) + return só comercial; ou return primeiro + reverse bloqueado.
    const incoherent =
      returnOk && reverseOk && Number(lineRefunds) > 0.009 && payStatus === 'reversed';
    const returnFirstBlockedReverse = returnOk && !reverseOk && events === '1';
    const reverseFirstThenCommercialReturn =
      returnOk && reverseOk && events === '1' && payStatus === 'reversed' && Number(lineRefunds) <= 0.009;
    const reverseOnly = !returnOk && reverseOk && events === '0' && payStatus === 'reversed';
    results.push({
      name: '2a_return_x_reverse',
      ok: !incoherent && (returnFirstBlockedReverse || reverseFirstThenCommercialReturn || reverseOnly),
      detail: {
        returnOk,
        reverseOk,
        events,
        payStatus,
        lineRefunds,
        incoherent,
        a: (a.err || a.out).slice(0, 180),
        b: (b.err || b.out).slice(0, 180),
      },
    });
  }

  // --- 2b) return × post_payment ---
  {
    const recId = randomUUID();
    const l1 = randomUUID();
    const l2 = randomUUID();
    allRec.push(recId);
    allLines.push(l1, l2);
    seedReceivable(url, {
      clinicId,
      unitId,
      recId,
      itemId,
      lotId,
      paid: 50,
      lines: [
        { id: l1, amount: 100 },
        { id: l2, amount: 50 },
      ],
    });
    const [a, b] = await parallel(
      url,
      returnSql(clinicId, recId, [l1], randomUUID(), { method: null, date: null }),
      `SELECT public.hub_post_payment(
        '${clinicId}'::uuid, '${recId}'::uuid, 50, 'pix', NULL, NULL, 1, now(), now(), 'QA concurrent pay',
        '${randomUUID()}'::uuid, NULL, NULL, 'operational', 'on_checkout', NULL, NULL, NULL, NULL, NULL
      )::text;`,
    );
    const state = psql(
      url,
      `SELECT final_amount::text||'|'||public.hub_sum_posted_payments(id)::text||'|'||public.hub_net_paid_effective(id)::text||'|'||status
       FROM hub_receivables WHERE id='${recId}'::uuid;`,
      'state 2b',
    );
    const [finalAmt, posted, netPaid] = state.split('|');
    // Invariants: final either 150 or 50; posted never exceeds what net_paid ceiling allows relative to final
    const okInv =
      Number(netPaid) <= Number(finalAmt) + 0.02 &&
      (a.code === 0 || b.code === 0) &&
      Number(posted) >= 50;
    results.push({
      name: '2b_return_x_post_payment',
      ok: okInv,
      detail: { state, a: a.code, b: b.code, ae: (a.err || '').slice(0, 120), be: (b.err || '').slice(0, 120) },
    });
  }

  // --- 2c) two different lines concurrent ---
  {
    const recId = randomUUID();
    const l1 = randomUUID();
    const l2 = randomUUID();
    allRec.push(recId);
    allLines.push(l1, l2);
    seedReceivable(url, {
      clinicId,
      unitId,
      recId,
      itemId,
      lotId,
      paid: 150,
      lines: [
        { id: l1, amount: 100 },
        { id: l2, amount: 50 },
      ],
    });
    const [a, b] = await parallel(
      url,
      returnSql(clinicId, recId, [l1], randomUUID()),
      returnSql(clinicId, recId, [l2], randomUUID()),
    );
    const events = psql(
      url,
      `SELECT COUNT(*)::text FROM hub_product_return_events WHERE receivable_id='${recId}'::uuid;`,
      'ev2c',
    );
    const financial = psql(
      url,
      `SELECT COALESCE(SUM(amount),0)::text FROM hub_financial_adjustments
       WHERE receivable_id='${recId}'::uuid AND payment_id IS NULL;`,
      'fin2c',
    );
    const state = psql(
      url,
      `SELECT final_amount::text||'|'||returned_amount::text||'|'||status FROM hub_receivables WHERE id='${recId}'::uuid;`,
      'st2c',
    );
    // Both succeed serialized → events=2, financial=150, final=0, refunded
    // Or one fails if race on unique — still must not over-refund
    const ok =
      Number(financial) <= 150.02 &&
      Number(events) <= 2 &&
      ((a.code === 0 && b.code === 0 && events === '2' && Number(financial) === 150) ||
        (Number(events) >= 1 && Number(financial) <= 150.02));
    results.push({
      name: '2c_two_lines_concurrent',
      ok,
      detail: { events, financial, state, a: a.code, b: b.code },
    });
  }

  // --- 2d) same key different payload ---
  {
    const recId = randomUUID();
    const l1 = randomUUID();
    const l2 = randomUUID();
    allRec.push(recId);
    allLines.push(l1, l2);
    seedReceivable(url, {
      clinicId,
      unitId,
      recId,
      itemId,
      lotId,
      paid: 150,
      lines: [
        { id: l1, amount: 100 },
        { id: l2, amount: 50 },
      ],
    });
    const key = randomUUID();
    const first = psqlRaw(url, returnSql(clinicId, recId, [l1], key));
    const second = psqlRaw(url, returnSql(clinicId, recId, [l2], key)); // same key, different lines
    results.push({
      name: '2d_same_key_different_payload',
      ok: first.status === 0 && second.status !== 0,
      detail: {
        first: first.status,
        secondErr: (second.stderr || '').slice(0, 200),
      },
    });
  }

  // --- 2e) retry after commit (lost response) ---
  {
    const recId = randomUUID();
    const l1 = randomUUID();
    const l2 = randomUUID();
    allRec.push(recId);
    allLines.push(l1, l2);
    seedReceivable(url, {
      clinicId,
      unitId,
      recId,
      itemId,
      lotId,
      paid: 80,
      lines: [
        { id: l1, amount: 100 },
        { id: l2, amount: 50 },
      ],
    });
    const key = randomUUID();
    const first = psqlRaw(url, returnSql(clinicId, recId, [l1], key));
    const retry = psqlRaw(url, returnSql(clinicId, recId, [l1], key));
    const events = psql(
      url,
      `SELECT COUNT(*)::text FROM hub_product_return_events WHERE receivable_id='${recId}'::uuid;`,
      'ev2e',
    );
    const adjs = psql(
      url,
      `SELECT COUNT(*)::text FROM hub_financial_adjustments WHERE receivable_id='${recId}'::uuid AND payment_id IS NULL;`,
      'adj2e',
    );
    const replayed = (retry.stdout || '').includes('"replayed": true');
    results.push({
      name: '2e_retry_after_commit',
      ok: first.status === 0 && retry.status === 0 && replayed && events === '1' && adjs === '1',
      detail: { events, adjs, replayed, retryOut: (retry.stdout || '').slice(0, 160) },
    });
  }

  // --- 2f) cancel concurrent with return ---
  {
    const recId = randomUUID();
    const l1 = randomUUID();
    allRec.push(recId);
    allLines.push(l1);
    seedReceivable(url, {
      clinicId,
      unitId,
      recId,
      itemId,
      lotId,
      paid: 0,
      lines: [{ id: l1, amount: 100 }],
    });
    const [a, b] = await parallel(
      url,
      returnSql(clinicId, recId, [l1], randomUUID(), { method: null, date: null }),
      `UPDATE hub_receivables SET status='cancelled' WHERE id='${recId}'::uuid AND status='pending' RETURNING status;`,
    );
    const state = psql(
      url,
      `SELECT status||'|'||(SELECT COUNT(*) FROM hub_product_return_events e WHERE e.receivable_id=r.id)
       FROM hub_receivables r WHERE id='${recId}'::uuid;`,
      'st2f',
    );
    // Cancel while pending OR return succeeds to cancelled/refunded — no double money
    const financial = psql(
      url,
      `SELECT COALESCE(SUM(amount),0)::text FROM hub_financial_adjustments WHERE receivable_id='${recId}'::uuid;`,
      'fin2f',
    );
    results.push({
      name: '2f_cancel_x_return',
      ok: Number(financial) === 0 && (a.code === 0 || b.code === 0),
      detail: { state, financial, a: a.code, b: b.code, ae: (a.err || '').slice(0, 100) },
    });
  }

  // --- 2g) partial then remaining ---
  {
    const recId = randomUUID();
    const l1 = randomUUID();
    const l2 = randomUUID();
    allRec.push(recId);
    allLines.push(l1, l2);
    seedReceivable(url, {
      clinicId,
      unitId,
      recId,
      itemId,
      lotId,
      paid: 150,
      lines: [
        { id: l1, amount: 100 },
        { id: l2, amount: 50 },
      ],
    });
    const r1 = psqlRaw(url, returnSql(clinicId, recId, [l1], randomUUID()));
    const mid = psql(
      url,
      `SELECT final_amount::text||'|'||public.hub_net_paid_effective(id)::text||'|'||
              public.hub_sum_line_refund_adjustments(id)::text
       FROM hub_receivables WHERE id='${recId}'::uuid;`,
      'mid',
    );
    const r2 = psqlRaw(url, returnSql(clinicId, recId, [l2], randomUUID()));
    const end = psql(
      url,
      `SELECT final_amount::text||'|'||returned_amount::text||'|'||status||'|'||
              public.hub_sum_line_refund_adjustments(id)::text||'|'||public.hub_net_paid_effective(id)::text
       FROM hub_receivables WHERE id='${recId}'::uuid;`,
      'end',
    );
    const [f1, net1, lr1] = mid.split('|');
    const [f2, ret2, st2, lr2, net2] = end.split('|');
    results.push({
      name: '2g_partial_then_remaining',
      ok:
        r1.status === 0 &&
        r2.status === 0 &&
        Number(f1) === 50 &&
        Number(lr1) === 100 &&
        Number(net1) === 50 &&
        Number(f2) === 0 &&
        Number(ret2) === 150 &&
        Number(lr2) === 150 &&
        Number(net2) === 0 &&
        st2 === 'refunded',
      detail: { mid, end },
    });
  }

  // --- 3) Rollback real: force failure after writes ---
  // 3a stock failure: invalid lot (FK) via temp break — use sellable with deleted lot mid-TX impossible;
  //    instead: call RPC with condition sellable then raise by using non-existent item in a custom DO block
  //    simulating exception after insert of adjustment.
  {
    const recId = randomUUID();
    const l1 = randomUUID();
    allRec.push(recId);
    allLines.push(l1);
    seedReceivable(url, {
      clinicId,
      unitId,
      recId,
      itemId,
      lotId,
      paid: 100,
      lines: [{ id: l1, amount: 100 }],
    });
    // Break stock insert by pointing line to missing lot mid-flight is hard;
    // Use a wrapper that starts the same writes then RAISE.
    const snapSql = `SELECT
        (SELECT COUNT(*) FROM hub_financial_adjustments WHERE receivable_id='${recId}'::uuid)::text||'|'||
        (SELECT COUNT(*) FROM hub_product_return_events WHERE receivable_id='${recId}'::uuid)::text||'|'||
        (SELECT COUNT(*) FROM hub_stock_movements WHERE reference_id='${l1}'::uuid)::text||'|'||
        (SELECT final_amount::text FROM hub_receivables WHERE id='${recId}'::uuid)`;
    const before = psql(url, snapSql, 'before3a');
    const fail = psqlRaw(
      url,
      `
      DO $$
      DECLARE
        v_rec hub_receivables%ROWTYPE;
        v_adj uuid;
      BEGIN
        SELECT * INTO v_rec FROM hub_receivables WHERE id='${recId}'::uuid FOR UPDATE;
        INSERT INTO hub_financial_adjustments (
          clinic_id, receivable_id, payment_id, adjustment_type, amount, reason, refund_method, refund_effective_date
        ) VALUES (
          '${clinicId}'::uuid, '${recId}'::uuid, NULL, 'refund', 100, 'QA rollback stock', 'pix', CURRENT_DATE
        ) RETURNING id INTO v_adj;
        INSERT INTO hub_product_return_events (
          clinic_id, receivable_id, receivable_line_id, item_id, lot_id, qty, condition, reason
        ) VALUES (
          '${clinicId}'::uuid, '${recId}'::uuid, '${l1}'::uuid, '${itemId}'::uuid, '${lotId}'::uuid, 1, 'sellable', 'QA'
        );
        UPDATE hub_receivables SET final_amount=0, returned_amount=100 WHERE id='${recId}'::uuid;
        -- Falha controlada na movimentação de estoque (item inexistente)
        INSERT INTO hub_stock_movements (
          clinic_id, item_id, lot_id, movement_type, qty, unit_cost, notes,
          reference_type, reference_id
        ) VALUES (
          '${clinicId}'::uuid, '00000000-0000-4000-8000-000000000099'::uuid, '${lotId}'::uuid,
          'adjustment_in', 1, 1, 'QA fail', 'hub_receivable_product_restock', '${l1}'::uuid
        );
      END $$;
      `,
    );
    const after = psql(url, snapSql, 'after3a');
    results.push({
      name: '3a_rollback_stock_failure',
      ok: fail.status !== 0 && before === after && after === '0|0|0|100.00',
      detail: { before, after, err: (fail.stderr || '').slice(0, 220) },
    });
  }

  // 3b credit failure
  {
    const recId = randomUUID();
    const l1 = randomUUID();
    allRec.push(recId);
    allLines.push(l1);
    seedReceivable(url, {
      clinicId,
      unitId,
      recId,
      itemId,
      lotId,
      paid: 100,
      lines: [{ id: l1, amount: 100 }],
      guardianId: null,
    });
    // customer_credit sem tutor → RPC deve falhar antes/durante e rollback
    const before = psql(
      url,
      `SELECT
        (SELECT COUNT(*) FROM hub_financial_adjustments WHERE receivable_id='${recId}'::uuid)::text||'|'||
        (SELECT COUNT(*) FROM hub_product_return_events WHERE receivable_id='${recId}'::uuid)::text||'|'||
        (SELECT COUNT(*) FROM hub_customer_credit_movements WHERE receivable_id='${recId}'::uuid)::text||'|'||
        (SELECT final_amount::text FROM hub_receivables WHERE id='${recId}'::uuid);`,
      'before3b',
    );
    const fail = psqlRaw(
      url,
      returnSql(clinicId, recId, [l1], randomUUID(), { method: 'customer_credit' }),
    );
    const after = psql(
      url,
      `SELECT
        (SELECT COUNT(*) FROM hub_financial_adjustments WHERE receivable_id='${recId}'::uuid)::text||'|'||
        (SELECT COUNT(*) FROM hub_product_return_events WHERE receivable_id='${recId}'::uuid)::text||'|'||
        (SELECT COUNT(*) FROM hub_customer_credit_movements WHERE receivable_id='${recId}'::uuid)::text||'|'||
        (SELECT final_amount::text FROM hub_receivables WHERE id='${recId}'::uuid);`,
      'after3b',
    );
    results.push({
      name: '3b_rollback_credit_without_tutor',
      ok: fail.status !== 0 && before === after,
      detail: { before, after, err: (fail.stderr || '').slice(0, 220) },
    });
  }

  // 3c cash movement failure via DO block
  {
    const recId = randomUUID();
    const l1 = randomUUID();
    allRec.push(recId);
    allLines.push(l1);
    seedReceivable(url, {
      clinicId,
      unitId,
      recId,
      itemId,
      lotId,
      paid: 100,
      lines: [{ id: l1, amount: 100 }],
    });
    const before = psql(
      url,
      `SELECT
        (SELECT COUNT(*) FROM hub_financial_adjustments WHERE receivable_id='${recId}'::uuid)::text||'|'||
        (SELECT COUNT(*) FROM hub_product_return_events WHERE receivable_id='${recId}'::uuid)::text||'|'||
        (SELECT final_amount::text FROM hub_receivables WHERE id='${recId}'::uuid);`,
      'before3c',
    );
    const fail = psqlRaw(
      url,
      `
      DO $$
      BEGIN
        INSERT INTO hub_financial_adjustments (
          clinic_id, receivable_id, payment_id, adjustment_type, amount, reason, refund_method, refund_effective_date
        ) VALUES (
          '${clinicId}'::uuid, '${recId}'::uuid, NULL, 'refund', 100, 'QA rollback cash', 'cash', CURRENT_DATE
        );
        INSERT INTO hub_product_return_events (
          clinic_id, receivable_id, receivable_line_id, item_id, lot_id, qty, condition, reason
        ) VALUES (
          '${clinicId}'::uuid, '${recId}'::uuid, '${l1}'::uuid, '${itemId}'::uuid, '${lotId}'::uuid, 1, 'unsellable', 'QA'
        );
        UPDATE hub_receivables SET final_amount=0, returned_amount=100, status='refunded' WHERE id='${recId}'::uuid;
        -- Falha controlada: cash_session inexistente
        INSERT INTO hub_cash_movements (clinic_id, cash_session_id, movement_type, amount, notes)
        VALUES ('${clinicId}'::uuid, '00000000-0000-4000-8000-000000000099'::uuid, 'withdrawal', 100, 'QA EtapaA fail cash');
      END $$;
      `,
    );
    const after = psql(
      url,
      `SELECT
        (SELECT COUNT(*) FROM hub_financial_adjustments WHERE receivable_id='${recId}'::uuid)::text||'|'||
        (SELECT COUNT(*) FROM hub_product_return_events WHERE receivable_id='${recId}'::uuid)::text||'|'||
        (SELECT final_amount::text FROM hub_receivables WHERE id='${recId}'::uuid);`,
      'after3c',
    );
    results.push({
      name: '3c_rollback_cash_failure',
      ok: fail.status !== 0 && before === after,
      detail: { before, after, err: (fail.stderr || '').slice(0, 220) },
    });
  }

  // --- 4) Security ---
  {
    const grantsReturn = psql(
      url,
      `SELECT string_agg(grantee::text, ',' ORDER BY 1)
       FROM information_schema.routine_privileges
       WHERE specific_schema='public' AND routine_name='hub_return_receivable_product_lines'
         AND privilege_type='EXECUTE';`,
      'grants',
    );
    const grantsPost = psql(
      url,
      `SELECT string_agg(grantee::text, ',' ORDER BY 1)
       FROM information_schema.routine_privileges
       WHERE specific_schema='public' AND routine_name='hub_post_payment' AND privilege_type='EXECUTE';`,
      'grants post',
    );
    const grantsRev = psql(
      url,
      `SELECT string_agg(grantee::text, ',' ORDER BY 1)
       FROM information_schema.routine_privileges
       WHERE specific_schema='public' AND routine_name='hub_reverse_payment' AND privilege_type='EXECUTE';`,
      'grants rev',
    );
    const noAnon =
      !grantsReturn.includes('anon') &&
      !grantsReturn.includes('authenticated') &&
      !grantsPost.includes('anon') &&
      !grantsRev.includes('anon');
    results.push({
      name: '4a_rpc_grants_no_anon_authenticated',
      ok: noAnon && grantsReturn.includes('service_role'),
      detail: { grantsReturn, grantsPost, grantsRev },
    });
  }

  if (otherClinic) {
    const recId = randomUUID();
    const l1 = randomUUID();
    allRec.push(recId);
    allLines.push(l1);
    seedReceivable(url, {
      clinicId,
      unitId,
      recId,
      itemId,
      lotId,
      paid: 50,
      lines: [{ id: l1, amount: 50 }],
    });
    const cross = psqlRaw(url, returnSql(otherClinic, recId, [l1], randomUUID(), { method: null, date: null }));
    results.push({
      name: '4b_cross_tenant_blocked',
      ok: cross.status !== 0,
      detail: (cross.stderr || '').slice(0, 200),
    });
  } else {
    results.push({ name: '4b_cross_tenant_blocked', ok: true, detail: 'skipped — single clinic' });
  }

  // Cleanup
  try {
    cleanup(url, { recIds: allRec, lineIds: allLines, itemId, lotId });
  } catch (e) {
    results.push({ name: 'cleanup', ok: false, detail: String(e.message || e).slice(0, 300) });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ clinicId, results, failed: failed.length }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
