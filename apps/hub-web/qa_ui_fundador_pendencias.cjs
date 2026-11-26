/**
 * QA Fundador Banho e Tosa — pendências:
 * 1) Agenda recepção: localizar 09f651d9… + novo agendamento com R$ 80
 * 2) Convite salão com área Banho e Tosa + aceite + Minha fila
 * 3) Equipe assistido se área vier vazia
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');

const PW = 'QaStaging!2026';
const BASE = 'http://localhost:3002';
const UNIT = '5fe7b990-4c08-486c-a0b4-cf65ef82543b';
const CLINIC = '0b0843d6-5d52-42fb-8685-3cf240ad35ef';
const APPT_ID = '09f651d9-165d-4105-93d2-53d6c46664e9';
const DATE = '2026-11-22';
const RECEP = 'qa.fundador.banho.recepcao@petmi.test';
const OWNER = 'qa.fundador.banho.20261121@petmi.test';
const SALAO_EMAIL = `qa.fundador.banho.salao2.${Date.now().toString().slice(-6)}@petmi.test`;

const evidence = {
  env: { base: BASE, clinic: CLINIC, unit: UNIT, date: DATE },
  agenda: {},
  invite: {},
  equipe: {},
  failed_requests: [],
};

function snip(t, n = 1800) {
  return String(t || '')
    .replace(/\u00a0/g, ' ')
    .slice(0, n);
}

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('textbox', { name: 'Senha' }).fill(PW);
  await page.getByRole('button', { name: /Entrar/i }).click();
  await page.waitForURL(/\/hub/, { timeout: 60000 });
  await page.evaluate((unitId) => localStorage.setItem('selected_unit_id', unitId), UNIT);
}

async function attachNet(page, tag) {
  page.on('response', async (res) => {
    const u = res.url();
    if (!/localhost:3000\/api\//.test(u)) return;
    const st = res.status();
    if (st < 400 && !/Erro|error/i.test(res.statusText())) return;
    let body = '';
    try {
      body = (await res.text()).slice(0, 400);
    } catch (_) {}
    const entry = {
      tag,
      method: res.request().method(),
      status: st,
      url: u.replace('http://localhost:3000', ''),
      body,
    };
    evidence.failed_requests.push(entry);
    console.log('FAIL_REQ', JSON.stringify(entry));
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const log = (...a) => console.log(...a);

  // ========== 1) AGENDA RECEPÇÃO ==========
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    await attachNet(page, 'agenda');
    await login(page, RECEP);
    evidence.agenda.profile = RECEP;
    evidence.agenda.login_url = page.url();

    await page.goto(`${BASE}/hub/appointments?date=${DATE}`);
    await page.waitForTimeout(3500);

    let body = snip(await page.locator('body').innerText(), 3500);
    evidence.agenda.load_error = /Erro ao carregar/i.test(body);
    evidence.agenda.body_snippet = body;
    await page.screenshot({ path: '/tmp/qa_fundador_agenda1.png', fullPage: true });

    if (evidence.agenda.load_error) {
      // retry once after brief wait (AUTH_UPSTREAM transiente)
      await page.waitForTimeout(2000);
      await page.reload();
      await page.waitForTimeout(4000);
      body = snip(await page.locator('body').innerText(), 3500);
      evidence.agenda.load_error_after_retry = /Erro ao carregar/i.test(body);
      evidence.agenda.body_snippet_retry = body;
      await page.screenshot({ path: '/tmp/qa_fundador_agenda1_retry.png', fullPage: true });
    }

    // Locate existing appointment by pet name / time / open drawer
    const hasRex = /QA Rex Fundador/i.test(body);
    const hasBanho = /Banho/i.test(body);
    evidence.agenda.found_rex_in_list = hasRex;
    evidence.agenda.found_banho = hasBanho;

    // Try click card / event with Rex
    const rex = page.getByText(/QA Rex Fundador/i).first();
    if (await rex.isVisible().catch(() => false)) {
      await rex.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      const drawer = snip(await page.locator('body').innerText(), 4000);
      evidence.agenda.drawer_has_80 = /R\$\s*80/.test(drawer);
      evidence.agenda.drawer_has_id = drawer.includes(APPT_ID.slice(0, 8)) || drawer.includes(APPT_ID);
      evidence.agenda.drawer_snippet = drawer.slice(0, 2000);
      await page.screenshot({ path: '/tmp/qa_fundador_agenda_drawer.png', fullPage: true });
    }

    // Deep-link by appointment_id
    await page.goto(`${BASE}/hub/appointments?date=${DATE}&appointment_id=${APPT_ID}`);
    await page.waitForTimeout(3500);
    const deep = snip(await page.locator('body').innerText(), 4000);
    evidence.agenda.deeplink_error = /Erro ao carregar/i.test(deep);
    evidence.agenda.deeplink_rex = /QA Rex Fundador/i.test(deep);
    evidence.agenda.deeplink_80 = /R\$\s*80/.test(deep);
    evidence.agenda.deeplink_snippet = deep.slice(0, 2000);
    await page.screenshot({ path: '/tmp/qa_fundador_agenda_deeplink.png', fullPage: true });

    // New QA appointment on selected date
    const stamp = Date.now().toString().slice(-5);
    await page.goto(`${BASE}/hub/appointments?date=${DATE}`);
    await page.waitForTimeout(2500);

    // Open new appointment — try common CTAs
    const novoBtns = [
      page.getByRole('button', { name: /Novo agendamento|Novo|Agendar/i }).first(),
      page.getByRole('link', { name: /Novo agendamento|Novo/i }).first(),
      page.locator('button').filter({ hasText: /^Novo/i }).first(),
    ];
    let opened = false;
    for (const b of novoBtns) {
      if (await b.isVisible().catch(() => false)) {
        await b.click();
        opened = true;
        break;
      }
    }
    // click empty slot around 14:00 / 15:00 if no button
    if (!opened) {
      const slot = page.locator('[data-time], .hub-agenda__slot, .rbc-time-slot, .rbc-day-slot').first();
      if (await slot.isVisible().catch(() => false)) {
        await slot.click({ force: true });
        opened = true;
      }
    }
    evidence.agenda.new_opened = opened;
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/qa_fundador_agenda_novo.png', fullPage: true });

    // Fill form if drawer/modal present
    const formBody = snip(await page.locator('body').innerText(), 2500);
    evidence.agenda.new_form_snippet = formBody;

    // Search pet
    const petField = page.getByLabel(/Pet|Animal/i).first()
      .or(page.getByPlaceholder(/Pet|Buscar pet|animal/i).first())
      .or(page.getByRole('combobox', { name: /Pet/i }).first());
    if (await petField.isVisible().catch(() => false)) {
      await petField.click();
      await petField.fill('QA Rex');
      await page.waitForTimeout(800);
      const opt = page.getByRole('option', { name: /QA Rex/i }).first()
        .or(page.getByText(/QA Rex Fundador/i).first());
      if (await opt.isVisible().catch(() => false)) await opt.click();
    } else {
      // try any search box
      const search = page.getByPlaceholder(/Buscar|Pet|tutor/i).first();
      if (await search.isVisible().catch(() => false)) {
        await search.fill('QA Rex');
        await page.waitForTimeout(1000);
        const opt = page.getByText(/QA Rex Fundador/i).first();
        if (await opt.isVisible().catch(() => false)) await opt.click();
      }
    }

    // Service Banho
    const serv = page.getByLabel(/^Serviço/i).first()
      .or(page.getByRole('button', { name: /^Serviço/i }).first())
      .or(page.getByRole('combobox', { name: /Serviço/i }).first());
    if (await serv.isVisible().catch(() => false)) {
      await serv.click();
      await page.waitForTimeout(500);
      const banho = page.getByRole('option', { name: /^Banho$/i }).first()
        .or(page.getByText(/^Banho$/).first());
      if (await banho.isVisible().catch(() => false)) await banho.click();
    }

    // Time if needed — 15:00
    const timeInput = page.getByLabel(/Horário|Início|Hora/i).first();
    if (await timeInput.isVisible().catch(() => false)) {
      await timeInput.fill('15:00');
    }

    // Notes to identify
    const notes = page.getByLabel(/Observ|Notas|Nota/i).first();
    if (await notes.isVisible().catch(() => false)) {
      await notes.fill(`QA novo ${stamp}`);
    }

    // Check price shows 80 before save
    await page.waitForTimeout(1000);
    let preSave = snip(await page.locator('body').innerText(), 3000);
    evidence.agenda.presave_has_80 = /R\$\s*80/.test(preSave);

    // Save
    const save = page.getByRole('button', { name: /Salvar|Confirmar|Agendar|Criar/i }).first();
    evidence.agenda.save_visible = await save.isVisible().catch(() => false);
    if (evidence.agenda.save_visible) {
      const [createRes] = await Promise.all([
        page.waitForResponse(
          (r) => /\/api\/hub\/appointments/.test(r.url()) && r.request().method() === 'POST',
          { timeout: 30000 },
        ).catch(() => null),
        save.click(),
      ]);
      if (createRes) {
        let b = '';
        try { b = await createRes.text(); } catch (_) {}
        evidence.agenda.create_status = createRes.status();
        evidence.agenda.create_body = b.slice(0, 600);
        try {
          const j = JSON.parse(b);
          evidence.agenda.new_appt_id = j.appointment?.id || j.id || j.appointments?.[0]?.id;
        } catch (_) {}
      }
      await page.waitForTimeout(2500);
    }

    // Reload and verify visibility + price
    await page.goto(`${BASE}/hub/appointments?date=${DATE}`);
    await page.waitForTimeout(4000);
    const after = snip(await page.locator('body').innerText(), 4000);
    evidence.agenda.after_reload_error = /Erro ao carregar/i.test(after);
    evidence.agenda.after_reload_rex = /QA Rex Fundador/i.test(after);
    evidence.agenda.after_reload_80 = /R\$\s*80/.test(after);
    evidence.agenda.after_reload_snippet = after.slice(0, 2500);
    await page.screenshot({ path: '/tmp/qa_fundador_agenda_after.png', fullPage: true });

    // If we have new id, open it
    if (evidence.agenda.new_appt_id) {
      await page.goto(
        `${BASE}/hub/appointments?date=${DATE}&appointment_id=${evidence.agenda.new_appt_id}`,
      );
      await page.waitForTimeout(3000);
      const openNew = snip(await page.locator('body').innerText(), 3500);
      evidence.agenda.new_open_80 = /R\$\s*80/.test(openNew);
      evidence.agenda.new_open_snippet = openNew.slice(0, 2000);
      await page.screenshot({ path: '/tmp/qa_fundador_agenda_new_open.png', fullPage: true });
    }

    evidence.agenda.failed_reqs = evidence.failed_requests.filter((x) => x.tag === 'agenda');
    await ctx.close();
    log('AGENDA_DONE', JSON.stringify(evidence.agenda, null, 2));
  }

  // ========== 2) CONVITE SALÃO ==========
  {
    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    owner.setDefaultTimeout(60000);
    await attachNet(owner, 'invite_owner');
    await login(owner, OWNER);
    evidence.invite.owner = OWNER;
    evidence.invite.salao_email = SALAO_EMAIL;

    await owner.goto(`${BASE}/hub/equipe`);
    await owner.waitForTimeout(2500);
    // Novo profissional
    const novo = owner.getByRole('button', { name: /Novo|Adicionar|Convidar/i }).first();
    if (await novo.isVisible().catch(() => false)) {
      await novo.click();
    } else {
      await owner.goto(`${BASE}/hub/equipe/novo`).catch(() => {});
    }
    await owner.waitForTimeout(1500);
    await owner.screenshot({ path: '/tmp/qa_fundador_equipe_novo.png', fullPage: true });

    // Fill name / email
    const nameField = owner.getByLabel(/Nome/i).first();
    if (await nameField.isVisible().catch(() => false)) {
      await nameField.fill(`QA Salão Fundador ${SALAO_EMAIL.split('.')[3]}`);
    }
    const emailField = owner.getByLabel(/E-?mail/i).first();
    if (await emailField.isVisible().catch(() => false)) {
      await emailField.fill(SALAO_EMAIL);
    }

    // Role / perfil Funcionário / CSTAFF
    const perfil = owner.getByLabel(/Perfil|Papel|Função|Cargo/i).first()
      .or(owner.getByRole('button', { name: /Perfil|Papel|Função/i }).first());
    if (await perfil.isVisible().catch(() => false)) {
      await perfil.click();
      const opt = owner.getByRole('option', { name: /Funcionário|Colaborador|Staff|CSTAFF/i }).first()
        .or(owner.getByText(/Funcionário|Colaborador/i).first());
      if (await opt.isVisible().catch(() => false)) await opt.click();
    }

    // Mark Banho e Tosa area BEFORE send
    const area = owner.getByLabel(/Banho.?e.?Tosa|Banho & Tosa/i).first()
      .or(owner.getByText(/Banho.?e.?Tosa|Banho & Tosa/i).first())
      .or(owner.getByRole('checkbox', { name: /Banho/i }).first());
    evidence.invite.area_control_visible = await area.isVisible().catch(() => false);
    if (evidence.invite.area_control_visible) {
      const tag = await area.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
      if (tag === 'input') {
        const checked = await area.isChecked().catch(() => false);
        if (!checked) await area.check({ force: true });
      } else {
        await area.click({ force: true });
      }
      evidence.invite.area_marked = true;
    }

    // Accepts appointments / unit if present
    const unitChk = owner.getByLabel(/Matriz|Unidade|QA Fundador/i).first();
    if (await unitChk.isVisible().catch(() => false)) {
      await unitChk.click({ force: true }).catch(() => {});
    }

    await owner.screenshot({ path: '/tmp/qa_fundador_equipe_pre_send.png', fullPage: true });
    evidence.invite.pre_send_snippet = snip(await owner.locator('body').innerText(), 2500);

    const send = owner.getByRole('button', { name: /Enviar convite|Salvar e convidar|Convidar|Salvar/i }).first();
    evidence.invite.send_visible = await send.isVisible().catch(() => false);
    let inviteToken = null;
    let inviteId = null;
    let staffMemberId = null;
    if (evidence.invite.send_visible) {
      const [invRes] = await Promise.all([
        owner
          .waitForResponse(
            (r) =>
              /\/api\/hub\/.*(invite|staff)/i.test(r.url()) &&
              ['POST', 'PUT', 'PATCH'].includes(r.request().method()),
            { timeout: 45000 },
          )
          .catch(() => null),
        send.click(),
      ]);
      if (invRes) {
        let b = '';
        try { b = await invRes.text(); } catch (_) {}
        evidence.invite.create_status = invRes.status();
        evidence.invite.create_url = invRes.url().replace('http://localhost:3000', '');
        evidence.invite.create_body = b.slice(0, 800);
        try {
          const j = JSON.parse(b);
          inviteToken = j.invite?.token || j.token || j.invitation?.token;
          inviteId = j.invite?.id || j.id || j.invitation?.id;
          staffMemberId = j.staff_member?.id || j.staff_member_id || j.invite?.staff_member_id;
          evidence.invite.operational_areas_on_create =
            j.staff_member?.operational_areas ||
            j.invite?.operational_areas ||
            j.operational_areas ||
            null;
        } catch (_) {}
      }
      await owner.waitForTimeout(2000);
      evidence.invite.post_send_snippet = snip(await owner.locator('body').innerText(), 1500);
    }

    // If UI didn't return token, pull from DB via service later — store what we have
    evidence.invite.invite_token_present = !!inviteToken;
    evidence.invite.invite_id = inviteId;
    evidence.invite.staff_member_id = staffMemberId;

    // Accept in another browser context
    const salaoCtx = await browser.newContext();
    const salao = await salaoCtx.newPage();
    salao.setDefaultTimeout(60000);
    await attachNet(salao, 'invite_accept');

    if (inviteToken) {
      await salao.goto(`${BASE}/invite/${inviteToken}`);
    } else if (inviteId) {
      await salao.goto(`${BASE}/convite/${inviteId}`);
    } else {
      // try find invite link on owner toast / page
      const link = await owner.locator('a[href*="invite"], a[href*="convite"]').first().getAttribute('href').catch(() => null);
      evidence.invite.fallback_link = link;
      if (link) await salao.goto(link.startsWith('http') ? link : `${BASE}${link}`);
    }
    await salao.waitForTimeout(2500);
    evidence.invite.accept_url = salao.url();
    evidence.invite.accept_landing_snippet = snip(await salao.locator('body').innerText(), 2000);
    await salao.screenshot({ path: '/tmp/qa_fundador_invite_landing.png', fullPage: true });

    // Create account or login
    const needsSignup = /Criar conta|Cadastre|Senha/i.test(evidence.invite.accept_landing_snippet);
    if (await salao.getByLabel('Email', { exact: true }).isVisible().catch(() => false)) {
      await salao.getByLabel('Email', { exact: true }).fill(SALAO_EMAIL);
    }
    const pass = salao.getByLabel(/Senha/i).first();
    if (await pass.isVisible().catch(() => false)) {
      await pass.fill(PW);
    }
    const pass2 = salao.getByLabel(/Confirmar senha|Confirmação/i).first();
    if (await pass2.isVisible().catch(() => false)) {
      await pass2.fill(PW);
    }
    const name = salao.getByLabel(/Nome/i).first();
    if (await name.isVisible().catch(() => false)) {
      await name.fill('QA Salão Aceite 2');
    }
    const acceptBtn = salao.getByRole('button', { name: /Aceitar|Criar|Entrar|Continuar|Confirmar/i }).first();
    if (await acceptBtn.isVisible().catch(() => false)) {
      await acceptBtn.click();
      await salao.waitForTimeout(4000);
    }
    // maybe need second step login
    if (/\/login/.test(salao.url())) {
      await login(salao, SALAO_EMAIL);
    }
    await salao.waitForTimeout(3000);
    evidence.invite.after_accept_url = salao.url();
    evidence.invite.after_accept_snippet = snip(await salao.locator('body').innerText(), 2500);
    await salao.screenshot({ path: '/tmp/qa_fundador_invite_after.png', fullPage: true });

    // Check Minha fila / Banho e Tosa
    evidence.invite.landed_minha_fila = /banho-tosa\/minha-fila|Minha fila/i.test(
      evidence.invite.after_accept_url + ' ' + evidence.invite.after_accept_snippet,
    );
    await salao.goto(`${BASE}/hub/banho-tosa/minha-fila`);
    await salao.waitForTimeout(3000);
    const fila = snip(await salao.locator('body').innerText(), 2500);
    evidence.invite.minha_fila_url = salao.url();
    evidence.invite.minha_fila_ok = /Minha fila/i.test(fila) && !/sem permissão|não autorizado|403|Área não/i.test(fila);
    evidence.invite.minha_fila_snippet = fila;
    await salao.screenshot({ path: '/tmp/qa_fundador_minha_fila.png', fullPage: true });

    // Nav has Banho & Tosa?
    evidence.invite.nav_banho = /Banho/i.test(fila);

    await salaoCtx.close();
    await ownerCtx.close();
    log('INVITE_DONE', JSON.stringify(evidence.invite, null, 2));
  }

  fs.writeFileSync('/tmp/qa_fundador_pendencias_evidence.json', JSON.stringify(evidence, null, 2));
  log('EVIDENCE_SAVED');
  await browser.close();
})().catch((e) => {
  console.error('FATAL', e);
  evidence.fatal = String(e);
  fs.writeFileSync('/tmp/qa_fundador_pendencias_evidence.json', JSON.stringify(evidence, null, 2));
  process.exit(1);
});
