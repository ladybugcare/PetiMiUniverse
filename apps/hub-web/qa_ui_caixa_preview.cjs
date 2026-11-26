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

const COMANDA_ID = '2335522c-8dd8-4748-8b40-4258cbf1db31';
const QUOTE_ID = '679d15a6-3486-4999-81f4-f9813787af31';
const evidence = { steps: [], clicks_failed: [] };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  const log = (...a) => console.log(...a);

  await page.goto('http://localhost:3002/login');
  await page.getByLabel('Email', { exact: true }).fill('qa.staging.a.cadmin@petmi.test');
  await page.getByRole('textbox', { name: 'Senha' }).fill(PW);
  await page.getByRole('button', { name: /Entrar/i }).click();
  await page.waitForURL(/\/hub/, { timeout: 60000 });
  await page.evaluate(() =>
    localStorage.setItem('selected_unit_id', 'ac9e17b6-d19c-4aad-a098-5fbd3e7fe4af'),
  );
  evidence.steps.push('login');

  // Via orçamento → Cobrar (reabre drawer da comanda existente)
  await page.goto(`http://localhost:3002/hub/orcamentos/${QUOTE_ID}`);
  await page.waitForTimeout(2500);
  const cobrar = page.getByRole('button', { name: /^Cobrar$/ }).first();
  const gerar = page.getByRole('button', { name: /Gerar venda/i }).first();
  if (await cobrar.isVisible().catch(() => false) && !(await cobrar.isDisabled().catch(() => true))) {
    await cobrar.click();
    evidence.steps.push('cobrar_clicked');
  } else if (await gerar.isVisible().catch(() => false)) {
    await gerar.click();
    evidence.steps.push('gerar_clicked');
  } else {
    evidence.clicks_failed.push({ label: 'Cobrar/Gerar', error: 'not available' });
  }
  await page.waitForTimeout(3500);
  let body = await page.locator('body').innerText();
  let norm = body.replace(/\u00a0/g, ' ');
  evidence.drawer1 = body.slice(0, 3000);
  evidence.drawer1_has95 = /Saldo a cobrar[\s\S]{0,60}R\$\s*95|R\$\s*95,00[\s\S]{0,40}Saldo|Saldo[\s\S]{0,40}95/i.test(norm);
  evidence.drawer1_has105_saldo = /Saldo a cobrar[\s\S]{0,60}R\$\s*105/i.test(norm);
  evidence.drawer1_discount10 = /Desconto[\s\S]{0,40}10|−\s*R\$\s*10|-\s*R\$\s*10/i.test(norm);
  evidence.drawer1_banho = /Banho/i.test(norm);
  evidence.drawer1_hidra = /Hidrata|Serviço/i.test(norm);
  log('DRAWER1', evidence.drawer1_has95, evidence.drawer1_discount10);
  log(body.slice(0, 1800));
  await page.screenshot({ path: '/tmp/qa_ui_caixa_drawer1.png', fullPage: true });

  const fechar = page.getByRole('button', { name: /^Fechar$/ });
  if (await fechar.count()) await fechar.first().click();
  await page.waitForTimeout(800);

  // Caixa: filtrar comanda aberta e abrir
  await page.goto('http://localhost:3002/hub/caixa');
  await page.waitForTimeout(4000);
  const filtro = page.getByRole('button', { name: /Comanda aberta/i });
  if (await filtro.isVisible().catch(() => false)) await filtro.click();
  await page.waitForTimeout(2000);
  // Atualizar
  const atualizar = page.getByRole('button', { name: /Atualizar/i });
  if (await atualizar.isVisible().catch(() => false)) await atualizar.click();
  await page.waitForTimeout(3000);

  body = await page.locator('body').innerText();
  evidence.caixaList = body.slice(0, 3500);
  evidence.caixaHasTutor = /Tutor Aceite UI Orçamento/i.test(body);
  evidence.caixaHas95 = /R\$\s*95/.test(body.replace(/\u00a0/g, ' '));
  log('CAIXA list tutor?', evidence.caixaHasTutor, '95?', evidence.caixaHas95);
  log(body.slice(0, 2000));
  await page.screenshot({ path: '/tmp/qa_ui_caixa_list.png', fullPage: true });

  const tutor = page.getByText(/Tutor Aceite UI Orçamento/i).first();
  if (await tutor.isVisible().catch(() => false)) {
    await tutor.click();
    await page.waitForTimeout(3000);
    body = await page.locator('body').innerText();
    norm = body.replace(/\u00a0/g, ' ');
    evidence.caixaOpen = body.slice(0, 3000);
    evidence.caixaOpen95 = /R\$\s*95/.test(norm);
    evidence.caixaOpenSaldo95 = /Saldo a cobrar[\s\S]{0,60}R\$\s*95/i.test(norm);
    evidence.caixaOpenDiscount = /Desconto[\s\S]{0,40}10|−\s*R\$\s*10/i.test(norm);
    const banho = (body.match(/QA Banho Completo|Banho Completo/gi) || []).length;
    const hidra = (body.match(/QA Hidratação|Hidratação/gi) || []).length;
    evidence.banhoMentions = banho;
    evidence.hidraMentions = hidra;
    log('CAIXA OPEN', evidence.caixaOpenSaldo95, banho, hidra);
    log(body.slice(0, 1800));
    await page.screenshot({ path: '/tmp/qa_ui_caixa_open.png', fullPage: true });

    // Reabrir
    if (await fechar.count()) await fechar.first().click();
    await page.waitForTimeout(1000);
    if (await tutor.isVisible().catch(() => false)) {
      await tutor.click();
      await page.waitForTimeout(2500);
      const again = await page.locator('body').innerText();
      evidence.reopen = again.slice(0, 2000);
      evidence.reopenBanho = (again.match(/QA Banho Completo|Banho Completo/gi) || []).length;
      evidence.reopenHidra = (again.match(/QA Hidratação|Hidratação/gi) || []).length;
      evidence.reopen95 = /R\$\s*95/.test(again.replace(/\u00a0/g, ' '));
      log('REOPEN', evidence.reopenBanho, evidence.reopenHidra, evidence.reopen95);
    }
    if (await fechar.count()) await fechar.first().click();
    evidence.steps.push('closed_without_pay');
  } else {
    // tentar link direto financeiro/comanda
    await page.goto(`http://localhost:3002/hub/financeiro/comanda/${COMANDA_ID}`);
    await page.waitForTimeout(3500);
    body = await page.locator('body').innerText();
    evidence.directComanda = body.slice(0, 3000);
    evidence.direct95 = /R\$\s*95/.test(body.replace(/\u00a0/g, ' '));
    evidence.clicks_failed.push({ label: 'tutor no Caixa', error: 'not listed; tried direct URL' });
    log('DIRECT', page.url(), body.slice(0, 1500));
    await page.screenshot({ path: '/tmp/qa_ui_caixa_direct.png', fullPage: true });
  }

  fs.writeFileSync('/tmp/qa_ui_caixa_evidence.json', JSON.stringify(evidence, null, 2));
  log(JSON.stringify(evidence, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FAIL', e);
  fs.writeFileSync('/tmp/qa_ui_caixa_evidence.json', JSON.stringify({ ...evidence, fatal: String(e) }, null, 2));
  process.exit(1);
});
