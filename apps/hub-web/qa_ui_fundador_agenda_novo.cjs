/** Novo agendamento QA + reload (recepção) */
const { chromium } = require('@playwright/test');
const fs = require('fs');

const PW = 'QaStaging!2026';
const BASE = 'http://localhost:3002';
const UNIT = '5fe7b990-4c08-486c-a0b4-cf65ef82543b';
const DATE = '2026-11-22';
const RECEP = 'qa.fundador.banho.recepcao@petmi.test';
const evidence = { failed: [], steps: [] };
const stamp = Date.now().toString().slice(-5);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  page.on('response', async (res) => {
    const u = res.url();
    if (!/localhost:3000\/api\/hub\/appointments/.test(u)) return;
    const st = res.status();
    let body = '';
    try { body = (await res.text()).slice(0, 500); } catch (_) {}
    const entry = { method: res.request().method(), status: st, url: u.split('?')[0].replace('http://localhost:3000', ''), body: body.slice(0, 400) };
    if (st >= 400 || res.request().method() === 'POST') {
      evidence.failed.push(entry);
      console.log('API', entry.method, entry.status, entry.url, entry.body.slice(0, 160));
    }
  });

  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email', { exact: true }).fill(RECEP);
  await page.getByRole('textbox', { name: 'Senha' }).fill(PW);
  await page.getByRole('button', { name: /Entrar/i }).click();
  await page.waitForURL(/\/hub/, { timeout: 60000 });
  await page.evaluate((u) => localStorage.setItem('selected_unit_id', u), UNIT);

  await page.goto(`${BASE}/hub/appointments?date=${DATE}`);
  // wait until loading finishes
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const t = await page.locator('body').innerText();
    if (!/Carregando agenda/i.test(t)) break;
  }
  let body = (await page.locator('body').innerText()).replace(/\u00a0/g, ' ');
  evidence.steps.push({
    step: 'list',
    error: /Erro ao carregar/i.test(body),
    hasRex: /QA Rex Fundador/i.test(body),
    count: (body.match(/atendimento\(s\)/i) && body.match(/(\d+) atendimento\(s\)/)?.[1]) || null,
    snippet: body.slice(0, 600),
  });
  console.log('LIST', evidence.steps.at(-1));

  // Close any open panel
  const close = page.getByRole('button', { name: /Fechar|Cancelar/i }).first();
  if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});

  // Open + Novo
  await page.getByRole('button', { name: /\+?\s*Novo/i }).first().click();
  await page.getByRole('dialog', { name: /Novo agendamento/i }).waitFor({ timeout: 15000 });
  evidence.steps.push('opened_novo');

  // Tutor search
  const tutor = page.getByPlaceholder(/Buscar por nome, CPF ou telefone/i);
  await tutor.fill('QA Tutor Fundador');
  await page.waitForTimeout(1200);
  const tutorOpt = page.getByText(/QA Tutor Fundador/i).first();
  await tutorOpt.waitFor({ state: 'visible', timeout: 15000 });
  await tutorOpt.click();
  await page.waitForTimeout(1000);
  evidence.steps.push('tutor_selected');

  // Pet
  const petBtn = page.getByPlaceholder(/Selecionar pet/i).first()
    .or(page.getByRole('button', { name: /Selecionar pet|Pet/i }).first());
  if (await petBtn.isVisible().catch(() => false)) {
    await petBtn.click();
    await page.waitForTimeout(500);
  }
  const petOpt = page.getByRole('option', { name: /QA Rex/i }).first()
    .or(page.getByText(/QA Rex Fundador/i).first());
  if (await petOpt.isVisible().catch(() => false)) {
    await petOpt.click();
    evidence.steps.push('pet_selected');
  } else {
    // maybe auto-selected single pet
    evidence.steps.push({ pet_auto: (await page.locator('body').innerText()).includes('QA Rex') });
  }

  // Service — Buscar e adicionar serviço
  const svc = page.getByPlaceholder(/Buscar e adicionar serviço|Selecionar serviço/i).first();
  await svc.waitFor({ state: 'visible', timeout: 10000 });
  await svc.click();
  await svc.fill('Banho');
  await page.waitForTimeout(800);
  const banho = page.getByRole('option', { name: /^Banho/i }).first()
    .or(page.locator('[role="option"]').filter({ hasText: /^Banho/ }).first())
    .or(page.getByText(/^Banho$/).first());
  await banho.click();
  await page.waitForTimeout(1200);
  evidence.steps.push('service_selected');

  // Time 15:00 if editable
  const timeInputs = page.locator('input[type="time"]');
  if (await timeInputs.count()) {
    await timeInputs.first().fill('15:00');
    evidence.steps.push('time_1500');
  }

  // Notes
  const desc = page.getByPlaceholder(/descri|motivo|Título/i).first();
  if (await desc.isVisible().catch(() => false)) {
    await desc.fill(`QA novo agenda ${stamp}`);
  }

  let pre = (await page.locator('body').innerText()).replace(/\u00a0/g, ' ');
  evidence.presave_80 = /R\$\s*80/.test(pre);
  evidence.presave_snip = pre.slice(pre.indexOf('Novo agendamento'), pre.indexOf('Novo agendamento') + 1500);
  console.log('PRESAVE80', evidence.presave_80);
  await page.screenshot({ path: '/tmp/qa_fundador_novo_presave.png', fullPage: true });

  const createBtn = page.getByRole('button', { name: /Criar agendamento/i });
  await createBtn.waitFor({ state: 'visible', timeout: 10000 });
  const [createRes] = await Promise.all([
    page.waitForResponse((r) => /\/api\/hub\/appointments/.test(r.url()) && r.request().method() === 'POST', { timeout: 45000 }).catch(() => null),
    createBtn.click(),
  ]);
  if (createRes) {
    const b = await createRes.text();
    evidence.create = { status: createRes.status(), body: b.slice(0, 700) };
    try {
      const j = JSON.parse(b);
      evidence.new_id = j.appointment?.id || j.id || j.appointments?.[0]?.id;
    } catch (_) {}
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/qa_fundador_novo_after_save.png', fullPage: true });
  console.log('CREATE', evidence.create, evidence.new_id);

  // Reload
  await page.goto(`${BASE}/hub/appointments?date=${DATE}`);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const t = await page.locator('body').innerText();
    if (!/Carregando agenda/i.test(t)) break;
  }
  body = (await page.locator('body').innerText()).replace(/\u00a0/g, ' ');
  evidence.reload = {
    error: /Erro ao carregar/i.test(body),
    hasRex: /QA Rex Fundador/i.test(body),
    has80: /R\$\s*80/.test(body),
    hasStamp: body.includes(`QA novo agenda ${stamp}`) || body.includes(stamp),
    twoPlus: /[2-9] atendimento\(s\)/.test(body) || /2 atend/.test(body),
    snippet: body.slice(0, 1200),
  };
  console.log('RELOAD', evidence.reload);
  await page.screenshot({ path: '/tmp/qa_fundador_novo_reload.png', fullPage: true });

  if (evidence.new_id) {
    await page.goto(`${BASE}/hub/appointments?date=${DATE}&appointment_id=${evidence.new_id}`);
    await page.waitForTimeout(3000);
    const open = (await page.locator('body').innerText()).replace(/\u00a0/g, ' ');
    evidence.open_new = {
      has80: /R\$\s*80/.test(open),
      confirmed: /CONFIRMADO/i.test(open),
      snippet: open.slice(0, 1500),
    };
    console.log('OPEN_NEW', evidence.open_new);
    await page.screenshot({ path: '/tmp/qa_fundador_novo_open.png', fullPage: true });
  }

  fs.writeFileSync('/tmp/qa_fundador_agenda_novo_evidence.json', JSON.stringify(evidence, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FATAL', e);
  evidence.fatal = String(e);
  fs.writeFileSync('/tmp/qa_fundador_agenda_novo_evidence.json', JSON.stringify(evidence, null, 2));
  process.exit(1);
});
