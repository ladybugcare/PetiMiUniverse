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

const QUOTE_ID = process.env.QUOTE_ID || '679d15a6-3486-4999-81f4-f9813787af31';
const evidence = { steps: [], clicks_failed: [], quoteId: QUOTE_ID, api: [] };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  const log = (...a) => console.log(...a);

  page.on('response', async (res) => {
    try {
      const u = res.url();
      if (!/\/api\/hub\/(quotes|comandas|cash|receivables)/.test(u)) return;
      if (!['POST', 'PATCH', 'GET'].includes(res.request().method())) return;
      let bodyTxt = '';
      try { bodyTxt = (await res.text()).slice(0, 500); } catch (_) {}
      evidence.api.push({ method: res.request().method(), status: res.status(), url: u, body: bodyTxt });
      if (['POST', 'PATCH'].includes(res.request().method())) {
        log('API', res.request().method(), res.status(), u.split('?')[0], bodyTxt.slice(0, 180));
      }
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

  // Ficha interna (não pronto-para-envio)
  await page.goto(`http://localhost:3002/hub/orcamentos/${QUOTE_ID}`);
  await page.waitForTimeout(2500);
  let body = await page.locator('body').innerText();
  evidence.detailSnippet = body.slice(0, 2000);
  log('DETAIL', page.url());
  log(body.slice(0, 1200));
  await page.screenshot({ path: '/tmp/qa_ui_continue_detail.png', fullPage: true });

  // Aceite interno: Mais → Conversão rápida (marca accepted + cria tutor/pets)
  const more = page.getByRole('button', { name: /Mais ações/i }).or(page.locator('summary[aria-label="Mais ações"]'));
  if (await more.first().isVisible().catch(() => false)) {
    await more.first().click();
    await page.waitForTimeout(400);
    evidence.steps.push('more_opened');
  }
  const quick = page.getByRole('button', { name: /Conversão rápida/i });
  if (await quick.isVisible().catch(() => false)) {
    await quick.click();
    await page.waitForTimeout(600);
    const conf = page.getByRole('button', { name: /Continuar|Confirmar|Sim/i });
    if (await conf.isVisible().catch(() => false)) {
      await conf.click();
      evidence.steps.push('confirm_quick_convert');
    }
    await page.waitForTimeout(4500);
    evidence.steps.push('quick_convert_clicked');
  } else {
    // Fallback: tile Converter tutor (assistente)
    const convertTutor = page.getByRole('button', { name: /Converter tutor/i });
    if (await convertTutor.isVisible().catch(() => false)) {
      await convertTutor.click();
      evidence.steps.push('convert_tutor_fallback');
      await page.waitForTimeout(2000);
    } else {
      evidence.clicks_failed.push({ label: 'Conversão rápida / Converter tutor', error: 'not visible' });
    }
  }

  body = await page.locator('body').innerText();
  evidence.afterConvertSnippet = body.slice(0, 1800);
  evidence.afterConvertUrl = page.url();
  log('AFTER_CONVERT', page.url());
  log(body.slice(0, 1000));
  await page.screenshot({ path: '/tmp/qa_ui_continue_convert.png', fullPage: true });

  // Se wizard de clientes abriu, completar o mínimo ou voltar
  if (/\/hub\/clientes/.test(page.url())) {
    evidence.steps.push('guided_wizard_opened');
    // tentar concluir se houver botões óbvios; senão voltar à ficha
    const finish = page.getByRole('button', { name: /Concluir|Salvar|Finalizar|Criar cliente/i });
    if (await finish.isVisible().catch(() => false)) {
      await finish.click();
      await page.waitForTimeout(3000);
    } else {
      await page.goto(`http://localhost:3002/hub/orcamentos/${QUOTE_ID}`);
      await page.waitForTimeout(2500);
      evidence.clicks_failed.push({ label: 'guided wizard finish', error: 'no finish btn; returned to quote' });
    }
  }

  // Garantir ficha
  if (!page.url().includes(QUOTE_ID)) {
    await page.goto(`http://localhost:3002/hub/orcamentos/${QUOTE_ID}`);
    await page.waitForTimeout(2500);
  }
  body = await page.locator('body').innerText();
  evidence.beforeGerarSnippet = body.slice(0, 1500);
  log('BEFORE_GERAR', body.slice(0, 900));

  const gerar = page.getByRole('button', { name: /Gerar venda/i }).first();
  if (await gerar.isVisible().catch(() => false)) {
    const disabled = await gerar.isDisabled().catch(() => false);
    if (disabled) {
      evidence.clicks_failed.push({ label: 'Gerar venda', error: 'disabled' });
    } else {
      await gerar.click();
      evidence.steps.push('gerar_venda_clicked');
      await page.waitForTimeout(3500);
    }
  } else {
    evidence.clicks_failed.push({ label: 'Gerar venda', error: 'not visible' });
  }

  body = await page.locator('body').innerText();
  evidence.afterGerarSnippet = body.slice(0, 2500);
  evidence.afterGerarUrl = page.url();
  const norm = body.replace(/\u00a0/g, ' ');
  evidence.previewHas95 = /R\$\s*95/.test(norm) && (/Saldo|a cobrar|Total|Prévia|Cobrar/i.test(norm));
  evidence.previewHas105 = /R\$\s*105/.test(norm) && /Saldo a cobrar/i.test(norm);
  evidence.hasDiscount10 = /Desconto[\s\S]{0,40}10|−R\$\s*10|-\s*R\$\s*10/i.test(norm);
  evidence.lineBanho = /Banho/i.test(norm);
  evidence.lineHidra = /Hidrata/i.test(norm);
  log('AFTER_GERAR', page.url());
  log(body.slice(0, 1500));
  await page.screenshot({ path: '/tmp/qa_ui_continue_gerar.png', fullPage: true });

  // Se abriu drawer/checkout, capturar e fechar sem pagar
  const fechar = page.getByRole('button', { name: /^Fechar$|^Cancelar$/ });
  if (await fechar.count()) {
    await fechar.first().click();
    evidence.steps.push('closed_drawer');
  }

  // Ir ao Caixa e localizar a comanda
  await page.goto('http://localhost:3002/hub/caixa');
  await page.waitForTimeout(3000);
  body = await page.locator('body').innerText();
  evidence.caixaSnippet = body.slice(0, 2500);
  evidence.caixaHasTutor = /Tutor Aceite|Luna Aceite/i.test(body);
  evidence.caixaHas95 = /R\$\s*95/.test(body.replace(/\u00a0/g, ' '));
  log('CAIXA', body.slice(0, 1500));
  await page.screenshot({ path: '/tmp/qa_ui_continue_caixa.png', fullPage: true });

  // Abrir comanda se listada
  const row = page.getByText(/Tutor Aceite UI Orçamento|Luna Aceite/i).first();
  if (await row.isVisible().catch(() => false)) {
    await row.click();
    await page.waitForTimeout(2500);
    body = await page.locator('body').innerText();
    evidence.comandaSnippet = body.slice(0, 2500);
    const n = body.replace(/\u00a0/g, ' ');
    evidence.comandaPreview95 = /R\$\s*95/.test(n);
    evidence.comandaDiscount10 = /10/.test(n) && /[Dd]esconto/.test(n);
    evidence.comandaTwoLines = (/Banho/i.test(n) ? 1 : 0) + (/Hidrata/i.test(n) ? 1 : 0);
    log('COMANDA', body.slice(0, 1500));
    await page.screenshot({ path: '/tmp/qa_ui_continue_comanda.png', fullPage: true });

    // Reabrir para checar unicidade — fechar e abrir de novo
    const close2 = page.getByRole('button', { name: /^Fechar$/ });
    if (await close2.count()) await close2.first().click();
    await page.waitForTimeout(800);
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await page.waitForTimeout(2000);
      const again = await page.locator('body').innerText();
      evidence.reopenSnippet = again.slice(0, 1500);
      const banhoCount = (again.match(/QA Banho Completo|Banho Completo/gi) || []).length;
      const hidraCount = (again.match(/QA Hidratação|Hidratação/gi) || []).length;
      evidence.reopenBanhoCount = banhoCount;
      evidence.reopenHidraCount = hidraCount;
      evidence.itemsUnique = banhoCount <= 2 && hidraCount <= 2; // labels may appear twice (line + summary)
      log('REOPEN counts', banhoCount, hidraCount);
    }
    // Encerrar sem pagar
    const close3 = page.getByRole('button', { name: /^Fechar$/ });
    if (await close3.count()) await close3.first().click();
    evidence.steps.push('closed_without_pay');
  } else {
    evidence.clicks_failed.push({ label: 'comanda no Caixa', error: 'tutor/pet not listed' });
  }

  fs.writeFileSync('/tmp/qa_ui_continue_evidence.json', JSON.stringify(evidence, null, 2));
  log(JSON.stringify(evidence, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FAIL', e);
  fs.writeFileSync('/tmp/qa_ui_continue_evidence.json', JSON.stringify({ ...evidence, fatal: String(e) }, null, 2));
  process.exit(1);
});
