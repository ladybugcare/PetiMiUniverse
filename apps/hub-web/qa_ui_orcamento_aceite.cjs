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

const evidence = { steps: [], clicks_failed: [] };

async function safeClick(page, locator, label) {
  try {
    await locator.click({ timeout: 8000 });
    evidence.steps.push(`click_ok:${label}`);
    return true;
  } catch (e) {
    evidence.clicks_failed.push({ label, error: String(e.message || e).slice(0, 200) });
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  const log = (...a) => console.log(...a);
  page.on('response', async (res) => {
    try {
      const u = res.url();
      if (!u.includes('/api/hub/quotes')) return;
      if (!['POST', 'PATCH'].includes(res.request().method())) return;
      const status = res.status();
      let bodyTxt = '';
      try { bodyTxt = (await res.text()).slice(0, 400); } catch (_) {}
      evidence.api = evidence.api || [];
      evidence.api.push({ method: res.request().method(), status, url: u, body: bodyTxt });
      log('API', res.request().method(), status, bodyTxt.slice(0, 200));
    } catch (_) {}
  });

  await page.goto('http://localhost:3002/login');
  await page.getByLabel('Email', { exact: true }).fill('qa.staging.a.cadmin@petmi.test');
  await page.getByRole('textbox', { name: 'Senha' }).fill(PW);
  await page.getByRole('button', { name: /Entrar/i }).click();
  await page.waitForURL(/\/hub/, { timeout: 60000 });
  await page.evaluate(() =>
    localStorage.setItem('selected_unit_id', 'ac9e17b6-d19c-4aad-a098-5fbd3e7fe4af'),
  );
  evidence.steps.push('login_cadmin');

  await page.goto('http://localhost:3002/hub/orcamentos/novo');
  await page.getByLabel(/Nome \*/i).first().fill('Tutor Aceite UI Orçamento');
  await page.getByLabel(/Telefone/i).fill('11966554433');
  await page.getByLabel(/CPF/i).fill('11144477735');
  await page.getByPlaceholder('Pet 1').fill('Luna Aceite');

  if (await page.getByRole('button', { name: /^Espécie$/ }).isVisible()) {
    await page.getByRole('button', { name: /^Espécie$/ }).click();
    await page.getByRole('option', { name: 'Cão' }).click();
  }
  if (await page.getByRole('button', { name: /^Porte$/ }).isVisible()) {
    await page.getByRole('button', { name: /^Porte$/ }).click();
    await page.getByRole('option', { name: 'Médio' }).click();
  }
  evidence.steps.push('contact_pet_filled');

  async function pickService(query, optionName) {
    const empty = page.getByRole('button', { name: /^Serviço$/ });
    await empty.last().click();
    await page.waitForTimeout(400);
    const search = page.getByRole('textbox', { name: /Buscar na lista/i });
    await search.waitFor({ state: 'visible', timeout: 10000 });
    await search.fill(query);
    await page.waitForTimeout(400);
    const opt = page.getByRole('option', { name: optionName });
    await opt.first().click({ timeout: 15000 });
    await page.waitForTimeout(800);
  }

  // Banho
  await page.getByRole('button', { name: /\+ Adicionar serviço/ }).first().click();
  await page.waitForTimeout(300);
  await pickService('Banho Completo', /QA Banho Completo/);
  let price1 = page.getByLabel(/Valor para Luna Aceite/i).first();
  if ((await price1.inputValue()) === '0' || !(await price1.inputValue())) {
    await price1.fill('80');
  }
  evidence.steps.push(`banho_${await price1.inputValue()}`);

  // Hidratação
  await page.getByRole('button', { name: /\+ Adicionar serviço/ }).first().click();
  await page.waitForTimeout(400);
  await pickService('Hidrata', /QA Hidratação/);
  const prices = page.getByLabel(/Valor para Luna Aceite/i);
  const n = await prices.count();
  const price2 = prices.nth(Math.max(0, n - 1));
  if ((await price2.inputValue()) === '0' || !(await price2.inputValue())) {
    await price2.fill('25');
  }
  evidence.steps.push(`hidratacao_${await price2.inputValue()}_count_${n}`);

  // Discount
  await page.getByRole('button', { name: /Tipo de desconto/i }).click();
  const opts = page.locator('[role=option]');
  const optCount = await opts.count();
  let picked = false;
  for (let i = 0; i < optCount; i++) {
    const t = (await opts.nth(i).innerText()).toLowerCase();
    if (t.includes('fixo') || t.includes('valor') || t.includes('r$')) {
      await opts.nth(i).click();
      picked = true;
      evidence.steps.push(`discount_kind_${t}`);
      break;
    }
  }
  if (!picked && optCount > 1) {
    await opts.nth(1).click();
    evidence.steps.push('discount_kind_index1');
  }
  await page.waitForTimeout(300);
  const discInputs = page.getByRole('textbox', { name: /^Valor$/ });
  if (await discInputs.count()) {
    await discInputs.first().fill('10');
  } else {
    await page.locator('input').filter({ hasText: '' }).last().fill('10').catch(() => {});
    // try enabled value field near discount
    const enabled = page.locator('.hub-orcamento-novo input:not([disabled])').filter({ has: page.locator('xpath=..') });
  }
  // more reliable: find discount value by placeholder 0,00 enabled
  const discVal = page.locator('input[placeholder="0,00"]:not([disabled])');
  if (await discVal.count()) await discVal.first().fill('10');
  evidence.steps.push('discount_10');

  await page.getByLabel(/Observação para o cliente/i).fill('Aceite UI: banho+hidratação -10');

  await page.getByRole('button', { name: /Salvar rascunho/i }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/qa_ui_aceite_after_save_click.png', fullPage: true });
  let body = await page.locator('body').innerText();
  evidence.afterSaveClickSnippet = body.slice(0, 2000);
  evidence.afterSaveUrl = page.url();
  log('AFTER_SAVE_CLICK', page.url());
  log(body.slice(0, 1000));

  // Prefer navigation; else extract id from link / toast
  try {
    await page.waitForURL(/\/hub\/orcamentos\/[0-9a-f-]{36}/, { timeout: 15000 });
  } catch (_) {
    // maybe already saved in place or validation error — try Gerar e enviar
    const gerarEnviar = page.getByRole('button', { name: /Gerar e enviar/i });
    if (await gerarEnviar.isVisible().catch(() => false)) {
      await gerarEnviar.click();
      await page.waitForTimeout(2500);
      evidence.steps.push('gerar_e_enviar_after_save_fail');
      body = await page.locator('body').innerText();
      evidence.afterGerarEnviarSnippet = body.slice(0, 1500);
      log('AFTER_GERAR_ENVIAR', page.url(), body.slice(0, 800));
      try {
        await page.waitForURL(/\/hub\/orcamentos\/[0-9a-f-]{36}/, { timeout: 20000 });
      } catch (e2) {
        evidence.clicks_failed.push({ label: 'save_or_send_nav', error: String(e2.message || e2).slice(0, 180) });
      }
    }
  }
  const quoteId = page.url().match(/orcamentos\/([0-9a-f-]{36})/)?.[1];
  evidence.quoteId = quoteId || null;
  evidence.steps.push(`saved_${quoteId || 'NONE'}`);
  log('SAVED', page.url());
  await page.screenshot({ path: '/tmp/qa_ui_aceite_saved.png', fullPage: true });

  body = await page.locator('body').innerText();
  evidence.afterSaveSnippet = body.slice(0, 1200);

  if (!quoteId) {
    fs.writeFileSync('/tmp/qa_ui_aceite_evidence.json', JSON.stringify(evidence, null, 2));
    throw new Error('Não navegou para o detalhe do orçamento após salvar/enviar');
  }

  // Send orçamento
  const sendCandidates = [
    page.getByRole('button', { name: /^Enviar$/ }),
    page.getByRole('button', { name: /Enviar orçamento/i }),
    page.getByRole('button', { name: /Gerar e enviar/i }),
  ];
  for (const c of sendCandidates) {
    if (await c.isVisible().catch(() => false)) {
      await c.click();
      await page.waitForTimeout(1500);
      const conf = page.getByRole('button', { name: /Confirmar/i });
      if (await conf.isVisible().catch(() => false)) await conf.click();
      evidence.steps.push('sent');
      break;
    }
  }
  await page.waitForTimeout(1500);
  body = await page.locator('body').innerText();
  evidence.afterSendSnippet = body.slice(0, 1500);
  await page.screenshot({ path: '/tmp/qa_ui_aceite_sent.png', fullPage: true });

  // Converter — quick convert or guided
  const convertBtn = page.getByRole('button', { name: /Converter tutor|Converter/i }).first();
  if (await convertBtn.isVisible().catch(() => false)) {
    await convertBtn.click();
    await page.waitForTimeout(1000);
    // guided may navigate to clientes; if confirm dialog
    const conf = page.getByRole('button', { name: /Continuar|Confirmar|Criar/i });
    if (await conf.isVisible().catch(() => false)) await conf.click();
    evidence.steps.push('convert_clicked');
  } else {
    // Mais menu quick convert
    const more = page.getByRole('button', { name: /Mais|Opções/i });
    if (await more.isVisible().catch(() => false)) {
      await more.click();
      const quick = page.getByRole('menuitem', { name: /Convers/i }).or(page.getByText(/conversão rápida/i));
      if (await quick.isVisible().catch(() => false)) await quick.click();
    }
    evidence.clicks_failed.push({ label: 'Converter visible button', error: 'fallback path' });
  }

  // If navigated away to clientes wizard, try to complete or use API convert as last resort note
  await page.waitForTimeout(2000);
  evidence.afterConvertUrl = page.url();
  evidence.afterConvertSnippet = (await page.locator('body').innerText()).slice(0, 1200);
  await page.screenshot({ path: '/tmp/qa_ui_aceite_convert.png', fullPage: true });

  // Go back to quote if needed
  if (quoteId && !page.url().includes(quoteId)) {
    await page.goto(`http://localhost:3002/hub/orcamentos/${quoteId}`);
    await page.waitForTimeout(2000);
  }

  // If still not accepted, try quick convert from detail
  body = await page.locator('body').innerText();
  if (!/Aceito|accepted|Convertido/i.test(body)) {
    const quickBtn = page.getByRole('button', { name: /conversão rápida|Converter agora/i });
    if (await quickBtn.isVisible().catch(() => false)) {
      await quickBtn.click();
      const conf = page.getByRole('button', { name: /Continuar|Confirmar|Sim/i });
      if (await conf.isVisible().catch(() => false)) await conf.click();
      await page.waitForTimeout(3000);
      evidence.steps.push('quick_convert');
    }
  }

  body = await page.locator('body').innerText();
  evidence.afterConvert2Snippet = body.slice(0, 1500);
  await page.screenshot({ path: '/tmp/qa_ui_aceite_detail.png', fullPage: true });

  // Gerar venda
  const gerar = page.getByRole('button', { name: /Gerar venda/i });
  if (await gerar.isVisible().catch(() => false)) {
    await gerar.click();
    evidence.steps.push('gerar_venda_clicked');
    await page.waitForTimeout(2500);
  } else {
    evidence.clicks_failed.push({ label: 'Gerar venda', error: 'not visible' });
  }

  // Checkout drawer preview
  await page.waitForTimeout(1500);
  const drawerText = await page.locator('body').innerText();
  evidence.checkoutSnippet = drawerText.slice(0, 2000);
  evidence.previewHas95 = /Saldo a cobrar[\s\S]{0,40}R\$\s*95/.test(drawerText.replace(/\u00a0/g, ' '))
    || (/R\$\s*95,00/.test(drawerText) && /Saldo a cobrar/i.test(drawerText));
  evidence.previewHas105 = /Saldo a cobrar[\s\S]{0,40}R\$\s*105/.test(drawerText.replace(/\u00a0/g, ' '));
  await page.screenshot({ path: '/tmp/qa_ui_aceite_checkout.png', fullPage: true });

  // Close without paying
  const fechar = page.getByRole('button', { name: /^Fechar$/ });
  if (await fechar.count()) await fechar.first().click();
  evidence.steps.push('closed_without_pay');

  fs.writeFileSync('/tmp/qa_ui_aceite_evidence.json', JSON.stringify(evidence, null, 2));
  log(JSON.stringify(evidence, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FAIL', e);
  fs.writeFileSync('/tmp/qa_ui_aceite_evidence.json', JSON.stringify({ ...evidence, fatal: String(e) }, null, 2));
  process.exit(1);
});
