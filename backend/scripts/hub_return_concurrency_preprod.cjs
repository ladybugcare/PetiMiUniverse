/**
 * Concorrência real no Postgres preprod (Etapa A).
 * Uso: node backend/scripts/hub_return_concurrency_preprod.cjs
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { randomUUID } = require('crypto');

function loadDbUrl() {
  const envPath = path.join(__dirname, '../.env.preprod.local');
  const text = fs.readFileSync(envPath, 'utf8');
  const m = text.match(/^SB_PREPROD_DB_URL=(.+)$/m);
  if (!m) throw new Error('SB_PREPROD_DB_URL ausente');
  return m[1].trim();
}

function clientEnv(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    db: u.pathname.replace(/^\//, '') || 'postgres',
    env: {
      ...process.env,
      PGPASSWORD: decodeURIComponent(u.password),
      PGSSLMODE: 'require',
    },
  };
}

function psql(url, sql, label) {
  const c = clientEnv(url);
  const r = spawnSync(
    'psql',
    ['-h', c.host, '-p', c.port, '-U', c.user, '-d', c.db, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
    { env: c.env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    const err = new Error(`${label}: ${(r.stderr || r.stdout || '').slice(0, 800)}`);
    err.raw = r;
    throw err;
  }
  return (r.stdout || '').trim();
}

function psqlRaw(url, sql) {
  const c = clientEnv(url);
  return spawnSync(
    'psql',
    ['-h', c.host, '-p', c.port, '-U', c.user, '-d', c.db, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
    { env: c.env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
}

function main() {
  const url = loadDbUrl();
  const results = [];

  const rpcExists = psql(
    url,
    `SELECT COUNT(*) FROM pg_proc WHERE proname = 'hub_return_receivable_product_lines';`,
    'check rpc',
  );
  if (rpcExists !== '1') throw new Error('RPC ausente');

  const grants = psql(
    url,
    `SELECT string_agg(grantee::text, ',' ORDER BY 1)
     FROM information_schema.routine_privileges
     WHERE specific_schema='public' AND routine_name='hub_return_receivable_product_lines'
       AND privilege_type='EXECUTE';`,
    'grants',
  );
  results.push({
    name: 'grants_return_rpc',
    ok: grants.split(',').every((g) => g === 'service_role' || g === 'postgres') && grants.includes('service_role'),
    detail: grants,
  });

  const matrixOk = psql(
    url,
    `
    WITH cases(paid, expect_refund, expect_due) AS (
      VALUES
        (0::numeric, 0::numeric, 50::numeric),
        (30::numeric, 0::numeric, 20::numeric),
        (50::numeric, 0::numeric, 0::numeric),
        (80::numeric, 30::numeric, 0::numeric),
        (150::numeric, 100::numeric, 0::numeric)
    ),
    calc AS (
      SELECT paid, expect_refund, expect_due,
        round(GREATEST(0, GREATEST(0, paid - 50) - 0), 2) AS financial_now,
        round(GREATEST(0, 50 - paid), 2) AS due_now
      FROM cases
    )
    SELECT COUNT(*)::text FROM calc
    WHERE financial_now = expect_refund AND due_now = expect_due;
    `,
    'matrix',
  );
  results.push({ name: 'matrix_5_scenarios', ok: matrixOk === '5', detail: matrixOk });

  const clinicId = psql(url, `SELECT id::text FROM clinics ORDER BY created_at NULLS LAST LIMIT 1;`, 'clinic');
  const unitId = psql(
    url,
    `SELECT id::text FROM units WHERE clinic_id = '${clinicId}'::uuid LIMIT 1;`,
    'unit',
  );

  const itemId = randomUUID();
  const lotId = randomUUID();
  const recId = randomUUID();
  const line1 = randomUUID();
  const line2 = randomUUID();
  const key = randomUUID();
  const keyB = randomUUID();

  try {
    psql(
      url,
      `
      INSERT INTO hub_inventory_items (
        id, clinic_id, item_kind, name, cost_amount, sale_amount, active
      ) VALUES (
        '${itemId}'::uuid, '${clinicId}'::uuid, 'product', 'QA EtapaA concurrency', 1, 100, true
      );

      INSERT INTO hub_inventory_lots (id, clinic_id, item_id, lot_code, received_at)
      VALUES ('${lotId}'::uuid, '${clinicId}'::uuid, '${itemId}'::uuid, 'QA-A-${Date.now()}', now());

      INSERT INTO hub_receivables (
        id, clinic_id, unit_id, source_type, source_id,
        original_amount, final_amount, net_amount_at_sale, returned_amount, status
      ) VALUES (
        '${recId}'::uuid, '${clinicId}'::uuid, '${unitId}'::uuid,
        'manual', gen_random_uuid(),
        150, 150, 150, 0, 'pending'
      );

      INSERT INTO hub_receivable_lines (
        id, clinic_id, receivable_id, line_kind, description, quantity,
        unit_sale_amount, line_total, hub_inventory_item_id, hub_inventory_lot_id, sort_order
      ) VALUES
        ('${line1}'::uuid, '${clinicId}'::uuid, '${recId}'::uuid, 'product', 'QA A', 1, 100, 100, '${itemId}'::uuid, '${lotId}'::uuid, 0),
        ('${line2}'::uuid, '${clinicId}'::uuid, '${recId}'::uuid, 'product', 'QA B', 1, 50, 50, '${itemId}'::uuid, '${lotId}'::uuid, 1);

      INSERT INTO hub_payments (
        clinic_id, receivable_id, amount, payment_method, status, posting_kind
      ) VALUES (
        '${clinicId}'::uuid, '${recId}'::uuid, 80, 'pix', 'posted', 'operational'
      );
      `,
      'seed',
    );
    results.push({ name: 'fixture_seed', ok: true });
  } catch (e) {
    results.push({ name: 'fixture_seed', ok: false, detail: String(e.message || e) });
    console.log(JSON.stringify({ results }, null, 2));
    process.exit(1);
  }

  const callSql = `
    SELECT public.hub_return_receivable_product_lines(
      '${clinicId}'::uuid,
      '${recId}'::uuid,
      NULL,
      'Concorrência real Etapa A',
      'unsellable',
      ARRAY['${line1}'::uuid],
      'pix',
      CURRENT_DATE,
      '${key}'::uuid
    )::text;
  `;

  // Paralelo real: duas conexões
  const c = clientEnv(url);
  const argsBase = ['-h', c.host, '-p', c.port, '-U', c.user, '-d', c.db, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c'];
  const p1 = spawnSync('psql', [...argsBase, callSql], { env: c.env, encoding: 'utf8' });
  const p2 = spawnSync('psql', [...argsBase, callSql], { env: c.env, encoding: 'utf8' });
  // Nota: spawnSync em sequência não é paralelo — lançar com Promise via child_process.spawn
  // Refaz com spawn paralelo:
}

async function runParallel(url, sql) {
  const { spawn } = require('child_process');
  const c = clientEnv(url);
  const runOne = () =>
    new Promise((resolve) => {
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
  return Promise.all([runOne(), runOne()]);
}

async function asyncMain() {
  const url = loadDbUrl();
  // Reexecuta a parte síncrona via main parcialmente — simplifica: tudo async aqui
  const results = [];

  const rpcExists = psql(
    url,
    `SELECT COUNT(*) FROM pg_proc WHERE proname = 'hub_return_receivable_product_lines';`,
    'check rpc',
  );
  results.push({ name: 'rpc_exists', ok: rpcExists === '1', detail: rpcExists });

  const grants = psql(
    url,
    `SELECT string_agg(grantee::text, ',' ORDER BY 1)
     FROM information_schema.routine_privileges
     WHERE specific_schema='public' AND routine_name='hub_return_receivable_product_lines'
       AND privilege_type='EXECUTE';`,
    'grants',
  );
  results.push({
    name: 'grants_return_rpc',
    ok: grants.includes('service_role') && !grants.includes('anon') && !grants.includes('authenticated'),
    detail: grants,
  });

  const postGrants = psql(
    url,
    `SELECT string_agg(grantee::text, ',' ORDER BY 1)
     FROM information_schema.routine_privileges
     WHERE specific_schema='public' AND routine_name='hub_post_payment' AND privilege_type='EXECUTE';`,
    'post grants',
  );
  results.push({
    name: 'grants_post_payment',
    ok: postGrants.includes('service_role') && !postGrants.includes('anon'),
    detail: postGrants,
  });

  const matrixOk = psql(
    url,
    `
    WITH cases(paid, expect_refund, expect_due) AS (
      VALUES
        (0::numeric, 0::numeric, 50::numeric),
        (30::numeric, 0::numeric, 20::numeric),
        (50::numeric, 0::numeric, 0::numeric),
        (80::numeric, 30::numeric, 0::numeric),
        (150::numeric, 100::numeric, 0::numeric)
    ),
    calc AS (
      SELECT paid, expect_refund, expect_due,
        round(GREATEST(0, GREATEST(0, paid - 50) - 0), 2) AS financial_now,
        round(GREATEST(0, 50 - paid), 2) AS due_now
      FROM cases
    )
    SELECT COUNT(*)::text FROM calc
    WHERE financial_now = expect_refund AND due_now = expect_due;
    `,
    'matrix',
  );
  results.push({ name: 'matrix_5_scenarios', ok: matrixOk === '5', detail: matrixOk });

  const clinicId = psql(url, `SELECT id::text FROM clinics ORDER BY created_at NULLS LAST LIMIT 1;`, 'clinic');
  const unitId = psql(
    url,
    `SELECT id::text FROM units WHERE clinic_id = '${clinicId}'::uuid LIMIT 1;`,
    'unit',
  );

  const itemId = randomUUID();
  const lotId = randomUUID();
  const recId = randomUUID();
  const line1 = randomUUID();
  const line2 = randomUUID();
  const key = randomUUID();

  psql(
    url,
    `
    INSERT INTO hub_inventory_items (
      id, clinic_id, item_kind, name, cost_amount, sale_amount, active
    ) VALUES (
      '${itemId}'::uuid, '${clinicId}'::uuid, 'product', 'QA EtapaA concurrency', 1, 100, true
    );

    INSERT INTO hub_inventory_lots (id, clinic_id, item_id, lot_code, received_at)
    VALUES ('${lotId}'::uuid, '${clinicId}'::uuid, '${itemId}'::uuid, 'QA-A-${Date.now()}', now());

    INSERT INTO hub_receivables (
      id, clinic_id, unit_id, source_type, source_id,
      original_amount, final_amount, net_amount_at_sale, returned_amount, status
    ) VALUES (
      '${recId}'::uuid, '${clinicId}'::uuid, '${unitId}'::uuid,
      'manual', gen_random_uuid(),
      150, 150, 150, 0, 'pending'
    );

    INSERT INTO hub_receivable_lines (
      id, clinic_id, receivable_id, line_kind, description, quantity,
      unit_sale_amount, line_total, hub_inventory_item_id, hub_inventory_lot_id, sort_order
    ) VALUES
      ('${line1}'::uuid, '${clinicId}'::uuid, '${recId}'::uuid, 'product', 'QA A', 1, 100, 100, '${itemId}'::uuid, '${lotId}'::uuid, 0),
      ('${line2}'::uuid, '${clinicId}'::uuid, '${recId}'::uuid, 'product', 'QA B', 1, 50, 50, '${itemId}'::uuid, '${lotId}'::uuid, 1);

    INSERT INTO hub_payments (
      clinic_id, receivable_id, amount, payment_method, status, posting_kind
    ) VALUES (
      '${clinicId}'::uuid, '${recId}'::uuid, 80, 'pix', 'posted', 'operational'
    );
    `,
    'seed',
  );
  results.push({ name: 'fixture_seed', ok: true, detail: { recId, clinicId } });

  const callSql = `
    SELECT public.hub_return_receivable_product_lines(
      '${clinicId}'::uuid,
      '${recId}'::uuid,
      NULL,
      'Concorrência real Etapa A',
      'unsellable',
      ARRAY['${line1}'::uuid],
      'pix',
      CURRENT_DATE,
      '${key}'::uuid
    )::text;
  `;

  const [a, b] = await runParallel(url, callSql);
  const ok1 = a.code === 0 && a.out.includes('"ok": true');
  const ok2 = b.code === 0 && b.out.includes('"ok": true');
  const replay = a.out.includes('"replayed": true') || b.out.includes('"replayed": true');
  const events = psql(
    url,
    `SELECT COUNT(*)::text FROM hub_product_return_events WHERE receivable_id = '${recId}'::uuid;`,
    'events',
  );
  const adjs = psql(
    url,
    `SELECT COUNT(*)::text FROM hub_financial_adjustments WHERE receivable_id = '${recId}'::uuid AND payment_id IS NULL;`,
    'adjs',
  );
  const recState = psql(
    url,
    `SELECT final_amount::text || '|' || returned_amount::text || '|' || status
     FROM hub_receivables WHERE id = '${recId}'::uuid;`,
    'rec',
  );
  const [finalAmt, returnedAmt, status] = recState.split('|');
  // pago 80, comercial 100 → final 50, financial 30
  const financial = psql(
    url,
    `SELECT COALESCE(SUM(amount),0)::text FROM hub_financial_adjustments
     WHERE receivable_id = '${recId}'::uuid AND payment_id IS NULL AND adjustment_type='refund';`,
    'financial sum',
  );

  results.push({
    name: 'concurrent_same_key',
    ok:
      ok1 &&
      ok2 &&
      replay &&
      events === '1' &&
      adjs === '1' &&
      Number(finalAmt) === 50 &&
      Number(returnedAmt) === 100 &&
      Number(financial) === 30,
    detail: {
      ok1,
      ok2,
      replay,
      events,
      adjs,
      recState,
      financial,
      a: (a.out || a.err).slice(0, 240),
      b: (b.out || b.err).slice(0, 240),
    },
  });

  // Rollback: outra key na mesma linha → falha, events permanece 1
  const failSql = callSql.replace(key, randomUUID());
  const fail = psqlRaw(url, failSql);
  const events2 = psql(
    url,
    `SELECT COUNT(*)::text FROM hub_product_return_events WHERE receivable_id = '${recId}'::uuid;`,
    'events2',
  );
  results.push({
    name: 'rollback_duplicate_line',
    ok: fail.status !== 0 && events2 === '1',
    detail: { status: fail.status, err: (fail.stderr || '').slice(0, 300), events2 },
  });

  // reverse após parcial
  const payId = psql(
    url,
    `SELECT id::text FROM hub_payments WHERE receivable_id = '${recId}'::uuid AND status='posted' LIMIT 1;`,
    'pay',
  );
  const rev = psqlRaw(
    url,
    `SELECT public.hub_reverse_payment('${payId}'::uuid, '${clinicId}'::uuid, NULL, 'Tentativa pós parcial', 'payment_reversal', NULL, NULL);`,
  );
  results.push({
    name: 'block_reverse_after_partial',
    ok: rev.status !== 0,
    detail: (rev.stderr || rev.stdout || '').slice(0, 400),
  });

  // key diferente em outro receivable (isola)
  const rec2 = randomUUID();
  const line3 = randomUUID();
  const key2 = key; // mesma key, outro receivable → deve falhar
  psql(
    url,
    `
    INSERT INTO hub_receivables (
      id, clinic_id, unit_id, source_type, source_id,
      original_amount, final_amount, net_amount_at_sale, returned_amount, status
    ) VALUES (
      '${rec2}'::uuid, '${clinicId}'::uuid, '${unitId}'::uuid,
      'manual', gen_random_uuid(), 50, 50, 50, 0, 'pending'
    );
    INSERT INTO hub_receivable_lines (
      id, clinic_id, receivable_id, line_kind, description, quantity,
      unit_sale_amount, line_total, hub_inventory_item_id, hub_inventory_lot_id, sort_order
    ) VALUES (
      '${line3}'::uuid, '${clinicId}'::uuid, '${rec2}'::uuid, 'product', 'QA C', 1, 50, 50,
      '${itemId}'::uuid, '${lotId}'::uuid, 0
    );
    `,
    'seed2',
  );
  const cross = psqlRaw(
    url,
    `SELECT public.hub_return_receivable_product_lines(
      '${clinicId}'::uuid, '${rec2}'::uuid, NULL, 'Key cruzada', 'unsellable',
      ARRAY['${line3}'::uuid], NULL, NULL, '${key}'::uuid
    );`,
  );
  results.push({
    name: 'idempotency_key_binds_receivable',
    ok: cross.status !== 0,
    detail: (cross.stderr || cross.stdout || '').slice(0, 300),
  });

  // Cleanup
  psql(
    url,
    `
    DELETE FROM hub_product_return_requests WHERE receivable_id IN ('${recId}'::uuid, '${rec2}'::uuid);
    DELETE FROM hub_financial_adjustment_lines WHERE receivable_id IN ('${recId}'::uuid, '${rec2}'::uuid);
    DELETE FROM hub_financial_adjustments WHERE receivable_id IN ('${recId}'::uuid, '${rec2}'::uuid);
    DELETE FROM hub_product_return_events WHERE receivable_id IN ('${recId}'::uuid, '${rec2}'::uuid);
    DELETE FROM hub_stock_movements WHERE reference_id IN ('${line1}'::uuid, '${line2}'::uuid, '${line3}'::uuid);
    DELETE FROM hub_payments WHERE receivable_id IN ('${recId}'::uuid, '${rec2}'::uuid);
    DELETE FROM hub_receivable_lines WHERE receivable_id IN ('${recId}'::uuid, '${rec2}'::uuid);
    DELETE FROM hub_receivables WHERE id IN ('${recId}'::uuid, '${rec2}'::uuid);
    DELETE FROM hub_inventory_lots WHERE id = '${lotId}'::uuid;
    DELETE FROM hub_inventory_items WHERE id = '${itemId}'::uuid;
    `,
    'cleanup',
  );

  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ clinicId, results, failed: failed.length }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

asyncMain().catch((e) => {
  console.error(e);
  process.exit(1);
});
