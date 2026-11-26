const { chromium } = require('@playwright/test');
const fs = require('fs');

const PW = (() => {
  const t = fs.readFileSync(
    '/Users/beatrizdias/Documents/Ladybug/Platforms/PetiMiUniverse/backend/.env.smoke.preprod.local',
    'utf8',
  );
  const m = t.match(/^QA_STAGING_PASSWORD=(.*)$/m);
  return (m?.[1] || '').trim().replace(/^"|"$/g, '');
})();

const QUOTE_ID = '679d15a6-3486-4999-81f4-f9813787af31';
const evidence = { steps: [], clicks_failed: [], api: [] };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const log = (...a) => console.log(...a);

  page.on('response', async (res) => {
    const u = res.url();
    if (!/\/api\/hub\/(comandas|quotes)/.test(u)) return;
    if (!['POST', 'PATCH'].includes(res.request().method())) return;
    let body = '';
    try { body = (await res.text()).slice(0, 280); } catch (_) {}
    evidence.api.push({ method: res.request().method(), status: res.status(), url: u.split('?')[0], body });
    log('API', res.request().method(), res.status(), u.split('?')[0].replace('http://localhost:3000', ''), body.slice(0, 120));
  });

  await page.goto('http://localhost:3002/login');
  await page.getByLabel('Email', { exact: true }).fill('qa.staging.a.cadmin@petmi.test');
  await page.getByRole('textbox', { name: 'Senha' }).fill(PW);
  await page.getByRole('button', { name: /Entrar/i }).click();
  await page.waitForURL(/\/hub/, { timeout: 60000 });
  await page.evaluate(() => localStorage.setItem('selected_unit_id', 'ac9e17b6-d19c-4aad-a098-5fbd3e7fe4af'));
  evidence.steps.push('login');

  // 1) Gerar venda / Cobrar twice
  await page.goto(`http://localhost:3002/hub/orcamentos/${QUOTE_ID}`);
  await page.waitForTimeout(2500);
  const cobrar = page.locator('button').filter({ hasText: /^Cobrar$/ }).first();
  await cobrar.waitFor({ state: 'visible', timeout: 30000 });
  await cobrar.click();
  await page.getByText(/Saldo a cobrar/i).waitFor({ timeout: 60000 });
  let t = (await page.locator('body').innerText()).replace(/\u00a0/g, ' ');
  evidence.firstDrawer = {
    saldo95: /Saldo a cobrar[\s\S]{0,30}R\$\s*95,00/i.test(t),
    items2: /ITENS EM ABERTO \(2\)/i.test(t),
    has500: /uniq_hub_comandas_active_origin|duplicate key/i.test(t),
  };
  log('DRAWER1', evidence.firstDrawer);
  await page.getByRole('button', { name: /^Fechar$/ }).first().click();
  await page.waitForTimeout(800);

  await cobrar.click();
  await page.getByText(/Saldo a cobrar/i).waitFor({ timeout: 60000 });
  t = (await page.locator('body').innerText()).replace(/\u00a0/g, ' ');
  evidence.secondDrawer = {
    saldo95: /Saldo a cobrar[\s\S]{0,30}R\$\s*95,00/i.test(t),
    items2: /ITENS EM ABERTO \(2\)/i.test(t),
    has500: /uniq_hub_comandas_active_origin|duplicate key/i.test(t),
  };
  log('DRAWER2', evidence.secondDrawer);
  await page.getByRole('button', { name: /^Fechar$/ }).first().click();
  evidence.steps.push('double_cobrar_ok');

  // 2) Caixa — histórico da sessão vs grade
  await page.goto('http://localhost:3002/hub/caixa');
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    if (/Tutor Aceite UI Orçamento|Comanda aberta|Comanda criada|indisponível/i.test(body) && !/Carregando ações pendentes…/i.test(body)) break;
    const retry = page.getByRole('button', { name: /Tentar de novo|Atualizar/i });
    if (await retry.first().isVisible().catch(() => false)) await retry.first().click();
  }
  let caixa = await page.locator('body').innerText();
  evidence.caixaAuthErr = /AUTH_UPSTREAM|indisponível|Não foi possível verificar o caixa/i.test(caixa);
  evidence.caixaHistoryHasTutor = /Comanda (aberta|criada)[\s\S]{0,80}Tutor Aceite UI Orçamento|Tutor Aceite UI Orçamento/i.test(caixa);
  evidence.caixaHistory95 = /R\$\s*95/.test(caixa.replace(/\u00a0/g, ' '));
  evidence.caixaSnippet = caixa.slice(0, 2800);
  log('CAIXA auth?', evidence.caixaAuthErr, 'tutor?', evidence.caixaHistoryHasTutor, '95?', evidence.caixaHistory95);

  const filtro = page.getByRole('button', { name: /Comanda aberta/i });
  if (await filtro.isVisible().catch(() => false)) {
    await filtro.click();
    await page.waitForTimeout(2000);
    const filtered = await page.locator('body').innerText();
    evidence.filterComandaAbertaHasTutor = /Tutor Aceite UI Orçamento/i.test(filtered);
    evidence.filterSnippet = filtered.slice(0, 1500);
    log('FILTER comanda_aberta tutor?', evidence.filterComandaAbertaHasTutor);
  }
  await page.screenshot({ path: '/tmp/qa_pendencias_caixa.png', fullPage: true });

  // 3) Salvar rascunho — first click
  await page.goto('http://localhost:3002/hub/orcamentos/novo');
  await page.waitForTimeout(1500);
  const stamp = Date.now().toString().slice(-6);
  await page.getByLabel(/Nome \*/i).first().fill(`Tutor Save ${stamp}`);
  await page.getByLabel(/Telefone/i).fill('11988776655');
  await page.getByLabel(/CPF/i).fill('39053344705');
  await page.getByPlaceholder('Pet 1').fill(`Pet Save ${stamp}`);
  if (await page.getByRole('button', { name: /^Espécie$/ }).isVisible()) {
    await page.getByRole('button', { name: /^Espécie$/ }).click();
    await page.getByRole('option', { name: 'Cão' }).click();
  }
  await page.getByRole('button', { name: /\+ Adicionar serviço/ }).first().click();
  await page.getByRole('button', { name: /^Serviço$/ }).last().click();
  const search = page.getByRole('textbox', { name: /Buscar na lista/i });
  await search.waitFor({ state: 'visible', timeout: 10000 });
  await search.fill('Banho Completo');
  await page.getByRole('option', { name: /QA Banho Completo/ }).first().click();
  await page.waitForTimeout(800);
  const price = page.getByLabel(/Valor para Pet Save/i).first();
  if ((await price.inputValue()) === '0' || !(await price.inputValue())) await price.fill('80');

  await page.getByRole('button', { name: /Salvar rascunho/i }).click();
  // Expected: toast success, stay on /novo (no navigation required)
  let toastOk = false;
  try {
    await page.getByText(/Rascunho criado|Rascunho salvo|Orçamento salvo/i).first().waitFor({ timeout: 15000 });
    toastOk = true;
  } catch (_) {}
  await page.waitForTimeout(1500);
  const afterSaveUrl = page.url();
  const afterSaveBody = await page.locator('body').innerText();
  const createApi = (evidence.api || []).filter((a) => a.method === 'POST' && /\/quotes$/.test(a.url) && a.status === 201);
  evidence.saveDraft = {
    toastOk,
    stayedOnNovo: /\/hub\/orcamentos\/novo/.test(afterSaveUrl),
    create201: createApi.length > 0,
    url: afterSaveUrl,
    snippet: afterSaveBody.slice(0, 1200),
  };
  log('SAVE', evidence.saveDraft);
  await page.screenshot({ path: '/tmp/qa_pendencias_save.png', fullPage: true });

  fs.writeFileSync('/tmp/qa_pendencias_evidence.json', JSON.stringify(evidence, null, 2));
  log(JSON.stringify(evidence, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FAIL', e);
  fs.writeFileSync('/tmp/qa_pendencias_evidence.json', JSON.stringify({ ...evidence, fatal: String(e) }, null, 2));
  process.exit(1);
});
