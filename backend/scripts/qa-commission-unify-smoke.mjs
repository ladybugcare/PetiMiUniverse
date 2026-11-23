/**
 * Smoke: unificação de comissões (serviço + produto) no Preprod.
 *
 * Uso:
 *   node backend/scripts/qa-commission-unify-smoke.mjs
 *   HUB_SMOKE_API=http://localhost:3000 node backend/scripts/qa-commission-unify-smoke.mjs
 *
 * Requer: backend/.env.preprod.local + backend/.env.smoke.preprod.local
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function getEnv(txt, k) {
  for (const line of txt.split('\n')) {
    if (line.startsWith(`${k}=`)) return line.slice(k.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const smoke = readFileSync(resolve(root, 'backend/.env.smoke.preprod.local'), 'utf8');
const pre = readFileSync(resolve(root, 'backend/.env.preprod.local'), 'utf8');
const pw = getEnv(smoke, 'QA_STAGING_PASSWORD');
const supabaseUrl = getEnv(pre, 'SUPABASE_URL');
const anon = getEnv(pre, 'SUPABASE_ANON_KEY');
const serviceKey = getEnv(pre, 'SUPABASE_SERVICE_ROLE_KEY');
const BASE =
  process.env.HUB_SMOKE_API ||
  getEnv(smoke, 'HUB_SMOKE_BASE_URL') ||
  'https://backend-staging-334260f3.up.railway.app';

const clinic = getEnv(smoke, 'HUB_SMOKE_CLINIC_A') || 'a1111111-1111-4111-8111-111111111111';
const unit = getEnv(smoke, 'HUB_SMOKE_UNIT_A') || 'ac9e17b6-d19c-4aad-a098-5fbd3e7fe4af';

const SERVICE_ID = '4609ee2e-20de-48fe-9b45-fb8652b71246'; // QA Banho Completo (bate com o recebível)
const PRODUCT_ID = '5d1cffdb-de81-42f8-bd88-c30af06715bb'; // QA Vacina Diagnóstico V10
const RECEIVABLE_SERVICE = '884a0b19-d9f2-4b94-b2b9-deeeececfa27'; // linha QA Banho Completo 80

const marker = `QA_COMM_UNIFY_${Date.now()}`;
const results = [];

function record(id, title, ok, detail) {
  results.push({ id, title, ok, detail });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${id} — ${title}`);
  if (detail) console.log(`       ${detail}`);
}

async function login(email) {
  const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`login ${email}: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function api(tok, path, { method = 'GET', body } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: r.status, data };
}

async function main() {
  console.log(`API: ${BASE}`);
  console.log(`Clinic: ${clinic}`);
  console.log(`Marker: ${marker}\n`);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- DB cases ---
  {
    // TC-DB-1 already seeded earlier may exist; ensure clean product rule for our marker
    await admin.from('hub_commission_rules').delete().eq('notes', marker);
    await admin
      .from('hub_commission_rules')
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq('clinic_id', clinic)
      .eq('hub_inventory_item_id', PRODUCT_ID)
      .is('deleted_at', null);
    await admin
      .from('hub_commission_rules')
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq('clinic_id', clinic)
      .eq('hub_service_type_id', SERVICE_ID)
      .is('deleted_at', null);

    const { data: prodRule, error: prodErr } = await admin
      .from('hub_commission_rules')
      .insert({
        clinic_id: clinic,
        hub_service_type_id: null,
        hub_inventory_item_id: PRODUCT_ID,
        basis: 'percent_of_sale',
        rate: 10,
        active: true,
        notes: marker,
      })
      .select('id, hub_inventory_item_id, hub_service_type_id')
      .single();
    record(
      'TC-DB-01',
      'Inserir regra só de produto (service null)',
      !prodErr && prodRule?.hub_inventory_item_id === PRODUCT_ID && prodRule?.hub_service_type_id == null,
      prodErr?.message || `id=${prodRule?.id}`
    );

    const { data: svcRule, error: svcErr } = await admin
      .from('hub_commission_rules')
      .insert({
        clinic_id: clinic,
        hub_service_type_id: SERVICE_ID,
        hub_inventory_item_id: null,
        basis: 'fixed_per_sale',
        rate: 5,
        active: true,
        notes: marker,
      })
      .select('id, hub_inventory_item_id, hub_service_type_id')
      .single();
    record(
      'TC-DB-02',
      'Inserir regra só de serviço (product null)',
      !svcErr && svcRule?.hub_service_type_id === SERVICE_ID && svcRule?.hub_inventory_item_id == null,
      svcErr?.message || `id=${svcRule?.id}`
    );

    const { error: bothErr } = await admin.from('hub_commission_rules').insert({
      clinic_id: clinic,
      hub_service_type_id: SERVICE_ID,
      hub_inventory_item_id: PRODUCT_ID,
      basis: 'percent_of_sale',
      rate: 1,
      active: true,
      notes: `${marker}_both`,
    });
    record(
      'TC-DB-03',
      'Rejeitar regra com serviço E produto (CHECK)',
      Boolean(bothErr),
      bothErr?.message || 'inseriu indevidamente'
    );

    const { error: neitherErr } = await admin.from('hub_commission_rules').insert({
      clinic_id: clinic,
      hub_service_type_id: null,
      hub_inventory_item_id: null,
      basis: 'percent_of_sale',
      rate: 1,
      active: true,
      notes: `${marker}_neither`,
    });
    record(
      'TC-DB-04',
      'Rejeitar regra sem alvo (CHECK)',
      Boolean(neitherErr),
      neitherErr?.message || 'inseriu indevidamente'
    );

    const { error: dupProdErr } = await admin.from('hub_commission_rules').insert({
      clinic_id: clinic,
      hub_service_type_id: null,
      hub_inventory_item_id: PRODUCT_ID,
      basis: 'percent_of_sale',
      rate: 3,
      active: true,
      notes: `${marker}_dup`,
    });
    record(
      'TC-DB-05',
      'Rejeitar 2ª regra ativa do mesmo produto (unique)',
      Boolean(dupProdErr),
      dupProdErr?.message || 'inseriu duplicata'
    );

    // product line for preview/report math
    const { data: qaLine, error: lineErr } = await admin
      .from('hub_receivable_lines')
      .insert({
        clinic_id: clinic,
        receivable_id: RECEIVABLE_SERVICE,
        line_kind: 'product',
        description: `${marker} produto linha`,
        quantity: 1,
        unit_sale_amount: 40,
        line_total: 40,
        hub_service_type_id: null,
        hub_inventory_item_id: PRODUCT_ID,
        sort_order: 99,
      })
      .select('id, line_total, hub_inventory_item_id')
      .single();
    record(
      'TC-DB-06',
      'Criar linha de produto no recebível para preview',
      !lineErr && qaLine?.hub_inventory_item_id === PRODUCT_ID,
      lineErr?.message || `line=${qaLine?.id} total=${qaLine?.line_total}`
    );
  }

  // --- API cases ---
  const tok = await login('qa.staging.a.cfinance@petmi.test');

  {
    const list = await api(
      tok,
      `/api/hub/finance/commission-rules?clinic_id=${clinic}&include_inactive=true`
    );
    const rules = list.data?.rules ?? [];
    const hasProduct = rules.some((r) => r.hub_inventory_item_id === PRODUCT_ID && !r.deleted_at);
    const hasService = rules.some((r) => r.hub_service_type_id === SERVICE_ID);
    record(
      'TC-API-01',
      'Listar regras inclui embed de serviço/produto (ou ao menos regras existentes)',
      list.status === 200 && Array.isArray(rules),
      `status=${list.status} count=${rules.length} hasProduct=${hasProduct} hasService=${hasService}`
    );

    const createProduct = await api(tok, '/api/hub/finance/commission-rules', {
      method: 'POST',
      body: {
        clinic_id: clinic,
        hub_inventory_item_id: PRODUCT_ID,
        hub_service_type_id: null,
        basis: 'percent_of_sale',
        rate: 15,
        notes: `${marker}_api_product`,
      },
    });
    const productOk =
      (createProduct.status === 200 || createProduct.status === 201) &&
      createProduct.data?.rule?.hub_inventory_item_id === PRODUCT_ID;
    record(
      'TC-API-02',
      'POST regra de produto via API',
      productOk,
      `status=${createProduct.status} err=${createProduct.data?.error || JSON.stringify(createProduct.data).slice(0, 180)}`
    );

    const createService = await api(tok, '/api/hub/finance/commission-rules', {
      method: 'POST',
      body: {
        clinic_id: clinic,
        hub_service_type_id: SERVICE_ID,
        hub_inventory_item_id: null,
        basis: 'fixed_per_sale',
        rate: 7,
        notes: `${marker}_api_service`,
      },
    });
    const serviceOk =
      (createService.status === 200 || createService.status === 201) &&
      createService.data?.rule?.hub_service_type_id === SERVICE_ID;
    record(
      'TC-API-03',
      'POST regra de serviço via API',
      serviceOk,
      `status=${createService.status} err=${createService.data?.error || JSON.stringify(createService.data).slice(0, 180)}`
    );

    const rejectBoth = await api(tok, '/api/hub/finance/commission-rules', {
      method: 'POST',
      body: {
        clinic_id: clinic,
        hub_service_type_id: SERVICE_ID,
        hub_inventory_item_id: PRODUCT_ID,
        basis: 'percent_of_sale',
        rate: 1,
      },
    });
    record(
      'TC-API-04',
      'POST com os dois alvos deve falhar (400)',
      rejectBoth.status === 400,
      `status=${rejectBoth.status} err=${rejectBoth.data?.error || ''}`
    );

    const rejectNeither = await api(tok, '/api/hub/finance/commission-rules', {
      method: 'POST',
      body: {
        clinic_id: clinic,
        basis: 'percent_of_sale',
        rate: 1,
      },
    });
    record(
      'TC-API-05',
      'POST sem alvo deve falhar (400)',
      rejectNeither.status === 400,
      `status=${rejectNeither.status} err=${rejectNeither.data?.error || ''}`
    );

    const preview = await api(
      tok,
      `/api/hub/finance/commission-preview?clinic_id=${clinic}&receivable_id=${RECEIVABLE_SERVICE}`
    );
    const lines = preview.data?.lines ?? [];
    const productLine = lines.find((l) => l.hub_inventory_item_id === PRODUCT_ID);
    const serviceLine = lines.find((l) => l.hub_service_type_id && Number(l.commission_amount) > 0);
    const expectedProduct =
      productLine != null
        ? Math.round((Number(productLine.line_total) * (Number(productLine.rate) / 100) + Number.EPSILON) * 100) / 100
        : null;
    const productCommissionOk =
      productLine != null && Number(productLine.commission_amount) === expectedProduct && expectedProduct > 0;
    record(
      'TC-API-06',
      'Preview calcula comissão de linha de produto (% sobre line_total)',
      preview.status === 200 && productCommissionOk,
      `status=${preview.status} got=${productLine?.commission_amount} expected=${expectedProduct} line=${JSON.stringify(productLine || null).slice(0, 220)} total=${preview.data?.total_commission}`
    );
    const servicePreviewOk =
      serviceLine != null &&
      Number(serviceLine.commission_amount) > 0 &&
      (serviceLine.basis === 'fixed_per_sale' || serviceLine.basis === 'percent_of_sale');
    record(
      'TC-API-07',
      'Preview calcula comissão de linha de serviço',
      preview.status === 200 && servicePreviewOk,
      serviceLine
        ? `commission=${serviceLine.commission_amount} basis=${serviceLine.basis} rate=${serviceLine.rate}`
        : `sem linha de serviço comissionada; lines=${lines.length}`
    );

    const from = new Date();
    from.setDate(from.getDate() - 30);
    const to = new Date();
    const ymd = (d) => d.toISOString().slice(0, 10);
    const report = await api(
      tok,
      `/api/hub/finance/reports/commissions?clinic_id=${clinic}&unit_id=${unit}&from=${ymd(from)}&to=${ymd(to)}`
    );
    const hasByProduct = Array.isArray(report.data?.by_product);
    const productInReport = (report.data?.by_product ?? []).some((p) => p.product_id === PRODUCT_ID);
    record(
      'TC-API-08',
      'Relatório de comissões expõe by_product',
      report.status === 200 && hasByProduct,
      `status=${report.status} by_product=${hasByProduct} productInReport=${productInReport} keys=${Object.keys(report.data || {}).join(',')}`
    );
  }

  // cleanup soft-delete API notes / DB marker lines
  {
    await admin
      .from('hub_commission_rules')
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq('clinic_id', clinic)
      .like('notes', `${marker}%`);
    await admin
      .from('hub_receivable_lines')
      .delete()
      .eq('clinic_id', clinic)
      .like('description', `${marker}%`);
    // also soft-delete earlier QA_COMM_UNIFY_PRODUCT if still active
    await admin
      .from('hub_commission_rules')
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq('notes', 'QA_COMM_UNIFY_PRODUCT');
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== RESUMO: ${passed} PASS / ${failed} FAIL (total ${results.length}) ===`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
