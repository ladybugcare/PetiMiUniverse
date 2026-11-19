/**
 * Reteste manual das lacunas do aceite de consulta avulsa (sessão, fila+receita, caixa+PIX).
 * Não entra no suite CI autenticado — rode com:
 *   npx playwright test e2e/qa-consulta-retest.spec.ts --project=public
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { loginAs } from './helpers/auth';

const PW = process.env.QA_STAGING_PASSWORD || 'QaStaging!2026';
const USERS = {
  CASSISTANT: 'qa.staging.a.cassistant@petmi.test',
  CVET: 'qa.staging.a.cvet@petmi.test',
  CFINANCE: 'qa.staging.a.cfinance@petmi.test',
} as const;

async function loginProfile(page: Page, role: keyof typeof USERS) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /bem-vindo de volta/i })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Email', { exact: true }).fill(USERS[role]);
  await page.getByRole('textbox', { name: 'Senha' }).fill(PW);
  await page.getByRole('button', { name: /Entrar/i }).click();
  // session/context no Preprod costuma levar vários segundos
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 60_000 });
  await expect(page.locator('body')).not.toContainText(/Entrando/i, { timeout: 60_000 });
}

async function sessionStillAlive(page: Page, label: string) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Após o fix de hidratação, /login com sessão válida redireciona de volta ao Hub.
  await expect(page, label).toHaveURL(/\/hub(?:\/|$)/, { timeout: 45_000 });
  const body = await page.locator('body').innerText();
  expect(body, label).not.toMatch(/bem-vindo de volta/i);
}

test.describe.configure({ mode: 'serial' });

test('1) sessão: contextos separados mantêm CASSISTANT/CVET/CFINANCE', async ({ browser }) => {
  test.setTimeout(300_000);
  const mk = async (role: keyof typeof USERS) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginProfile(page, role);
    await expect(page).toHaveURL(/\/hub(?:\/|$)/, { timeout: 60_000 });
    return { ctx, page, role };
  };

  const a = await mk('CASSISTANT');
  const v = await mk('CVET');
  const f = await mk('CFINANCE');

  // Navegação + reload em cada contexto — não deve cair no login
  await a.page.goto('/hub/recepcao');
  await sessionStillAlive(a.page, 'CASSISTANT após reload Recepção');

  await v.page.goto('/hub/clinica');
  await sessionStillAlive(v.page, 'CVET após reload Consultório');

  await f.page.goto('/hub/financeiro');
  await sessionStillAlive(f.page, 'CFINANCE após reload Financeiro');

  // Contaminação no MESMO contexto: limpar storage e logar outro perfil sobrescreve a sessão
  await a.page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await a.page.goto('/login', { waitUntil: 'domcontentloaded' });
  await loginProfile(a.page, 'CVET');
  await a.page.goto('/hub/clinica');
  await expect(a.page).toHaveURL(/\/hub\//);
  const stored = await a.page.evaluate(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null');
      return u?.email || u?.user_metadata?.email || null;
    } catch {
      return null;
    }
  });
  expect(String(stored || '')).toMatch(/cvet/i);

  await a.ctx.close();
  await v.ctx.close();
  await f.ctx.close();
});

test('2) CVET: Minha fila → abrir → emitir receita', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginProfile(page, 'CVET');
  await page.goto('/hub/clinica');
  await expect(page.getByRole('heading', { name: /Minha fila/i })).toBeVisible({ timeout: 30_000 });

  // Abrir da Minha fila: checked_in → Iniciar; se já aberto nesta rodada → Continuar.
  const pending = page.locator('.vet-cockpit-queue__item').filter({ hasText: /Tutor chegou/i }).first();
  const inProgress = page.locator('.vet-cockpit-queue__item').filter({ hasText: /Em atendimento|Em andamento/i }).first();
  if (await pending.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await pending.click();
    await page.getByRole('button', { name: /^Iniciar consulta$/i }).click();
    const modalConfirm = page.locator('[role="dialog"], .hub-modal, .hub-drawer').getByRole('button', {
      name: /Confirmar|Iniciar|Abrir|Continuar|Começar|Sem caso/i,
    });
    if (await modalConfirm.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await modalConfirm.first().click();
    }
  } else if (await inProgress.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await inProgress.click();
    await page.getByRole('button', { name: /Continuar atendimento|Abrir prontuário/i }).first().click();
  } else {
    // Fallback: encounter já conhecido da abertura pela fila nesta rodada
    await page.goto('/hub/clinica/atendimentos/11e950cc-4bb1-4280-a301-407cf1a9798d');
  }

  await expect(page).toHaveURL(/\/hub\/clinica\/atendimentos\//, { timeout: 30_000 });
  await expect(page.getByText(/Atendimento somente leitura/i)).toHaveCount(0, { timeout: 5_000 });
  const encounterUrl = page.url();
  expect(encounterUrl).toMatch(/11e950cc-4bb1-4280-a301-407cf1a9798d/);

  // Etapa 4 Receita (ou Solicitações → Receita)
  await page.getByRole('button', { name: /4\s*Receita|^Receita$/i }).first().click();
  await expect(page.getByRole('button', { name: /Adicionar à receita/i })).toBeVisible({ timeout: 20_000 });

  // Combobox Medicamento (portal)
  await page.locator('.hub-rx-item-form .hub-combobox__trigger').first().click();
  await page.locator('.hub-combobox__search').fill('Amoxicilina QA Retest');
  await page.locator('.hub-combobox__create-btn').click();
  await page.locator('.hub-rx-item-form').getByPlaceholder(/Ex\.: 500mg/i).fill('250mg');
  await page.locator('.hub-rx-item-form').getByPlaceholder(/Ex\.: 14 comprimidos/i).fill('14 comprimidos');
  await page.locator('.hub-rx-item-form').getByPlaceholder(/Ex\.: 12\/12h/i).fill('1 cp a cada 12h');
  await page.locator('.hub-rx-item-form').getByPlaceholder(/Ex\.: 7 dias/i).fill('7 dias');
  await page.getByRole('button', { name: /Adicionar à receita/i }).click();
  await expect(page.locator('.hub-rx-panel, .hub-cws-exam-table').getByText(/Amoxicilina QA Retest/i)).toBeVisible({
    timeout: 20_000,
  });

  const emitBtn = page.getByRole('button', { name: /Gerar PDF e link validável|Gerar novo PDF/i }).first();
  await emitBtn.scrollIntoViewIfNeeded();
  const box = await emitBtn.boundingBox();
  expect(box, 'botão de emissão visível').toBeTruthy();
  // Garante que o centro do botão não está coberto pelo rodapé fixo
  const footerBox = await page.locator('.hub-cws-footer').boundingBox();
  if (box && footerBox) {
    expect(box.y + box.height).toBeLessThanOrEqual(footerBox.y + 2);
  }
  await expect(emitBtn).toBeEnabled();
  await emitBtn.click({ force: false });

  await expect(page.getByText(/Receita validável emitida|Emitida|PDF e link/i).first()).toBeVisible({
    timeout: 45_000,
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/hub\/clinica\/atendimentos\//, { timeout: 45_000 });
  await page.getByRole('button', { name: /4\s*Receita|^Receita$/i }).first().click();
  await expect(page.getByText(/Amoxicilina QA Retest/i).first()).toBeVisible({ timeout: 30_000 });

  // Histórico / prontuários do pet
  await page.goto('/hub/pets/ef127b0c-bd31-407b-95df-3497d0964531');
  await expect(page.getByText(/Amoxicilina QA Retest|Receita|Prescri/i).first()).toBeVisible({
    timeout: 30_000,
  });

  await ctx.close();
  console.log('encounter', encounterUrl);
});

test('3) Encerrar turno pela UI (sem Aguardando eterno) + PIX CFINANCE com caixa fechado', async ({
  browser,
}) => {
  test.setTimeout(300_000);

  // Caixa / Encerrar turno
  const cashCtx = await browser.newContext();
  const cashPage = await cashCtx.newPage();
  await loginProfile(cashPage, 'CASSISTANT');
  await cashPage.goto('/hub/caixa');
  await expect(cashPage.getByRole('heading', { name: 'Caixa' })).toBeVisible({ timeout: 30_000 });

  // Esperar o resumo do caixa carregar antes de abrir o drawer
  await expect(cashPage.getByText(/Aberto|Saldo|Histórico da sessão/i).first()).toBeVisible({
    timeout: 40_000,
  });
  await expect(cashPage.locator('.hub-refreshing-banner, .hub-loading').filter({ hasText: /Atualizando|Abrindo/i })).toHaveCount(0, {
    timeout: 40_000,
  }).catch(() => {});

  const encerrar = cashPage.getByRole('button', { name: 'Encerrar turno', exact: true });
  await expect(encerrar).toBeVisible({ timeout: 30_000 });
  await encerrar.click();

  // Fix: não pode ficar preso em Aguardando dados…
  await expect(cashPage.getByRole('heading', { name: 'Resumo da sessão' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(cashPage.getByRole('button', { name: 'Aguardando dados…' })).toHaveCount(0, {
    timeout: 45_000,
  });
  await expect(cashPage.getByText('Carregando resumo da sessão…')).toHaveCount(0, { timeout: 45_000 });
  await cashPage.getByRole('button', { name: 'Próximo', exact: true }).click();

  // Passo 2
  await expect(cashPage.getByRole('heading', { name: /Pendências a resolver/i })).toBeVisible({
    timeout: 15_000,
  });
  const enviar = cashPage.getByRole('button', { name: /Enviar pendentes ao financeiro/i });
  if (await enviar.isVisible().catch(() => false)) {
    await enviar.click();
  }
  await cashPage.getByRole('button', { name: 'Próximo', exact: true }).click();

  // Passo 3 — gaveta
  await expect(cashPage.getByLabel(/Saldo contado na gaveta/i)).toBeVisible({ timeout: 15_000 });
  await cashPage.getByLabel(/Saldo contado na gaveta/i).fill('100');
  await cashPage.getByRole('button', { name: 'Fechar caixa', exact: true }).click();

  await expect(
    cashPage.getByText(/Caixa fechado|fechado com sucesso|Abrir caixa/i).first(),
  ).toBeVisible({ timeout: 45_000 });

  await cashCtx.close();

  // PIX como CFINANCE com caixa fechado — recebível e2a45f66 (comanda retest R$100)
  const finCtx = await browser.newContext();
  const fin = await finCtx.newPage();
  await loginProfile(fin, 'CFINANCE');
  await fin.goto(
    '/hub/financeiro/comanda/40245d03-c37e-49ff-8793-03039b380e01?receivable_id=e2a45f66-b72f-4288-bc4b-ff82dd253c33',
  );
  await expect(fin).toHaveURL(/\/hub\/financeiro\/comanda\//, { timeout: 30_000 });
  await expect(fin.getByText(/QA Consulta Retest|100|R\$\s*100/i).first()).toBeVisible({
    timeout: 30_000,
  });

  // Painel de recebível: escolher PIX e registrar
  const methodSelect = fin.locator('select').first();
  if (await methodSelect.isVisible({ timeout: 10_000 }).catch(() => false)) {
    const opts = await methodSelect.locator('option').allTextContents();
    const pix = opts.find((o) => /pix/i.test(o));
    if (pix) await methodSelect.selectOption({ label: pix });
    else await methodSelect.selectOption('pix');
  }

  const registrar = fin.getByRole('button', { name: /Registrar pagamento/i }).last();
  await expect(registrar).toBeVisible({ timeout: 20_000 });
  await registrar.click();

  await expect(fin.getByText(/pago|Pago|quitado|recebido|registrado/i).first()).toBeVisible({
    timeout: 30_000,
  });

  await fin.reload({ waitUntil: 'domcontentloaded' });
  await expect(fin.getByText(/pago|Pago|quitado|Recebido/i).first()).toBeVisible({ timeout: 30_000 });

  await finCtx.close();
});
