import { expect, type Page } from '@playwright/test';
import type { SaleFixture } from './sales';
import { QA_UNIT_ID } from './constants';

async function ensureUnitSelected(page: Page) {
  await page.evaluate((unitId) => {
    localStorage.setItem('selected_unit_id', unitId);
  }, QA_UNIT_ID);
}

export async function loginQaFinance(
  page: Page,
  password: string,
  email: string = 'qa.staging.a.cfinance@petmi.test',
) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /bem-vindo de volta/i })).toBeVisible({
    timeout: 45_000,
  });
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('textbox', { name: 'Senha' }).fill(password);
  await page.getByRole('button', { name: /Entrar/i }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 90_000 });
  await ensureUnitSelected(page);
  await page.goto('/hub/financeiro');
  await expect(page.locator('body')).not.toContainText(/Selecione a unidade/i, {
    timeout: 45_000,
  });
}

export function receivableDrawer(page: Page) {
  return page
    .locator('[role="dialog"], .hub-drawer, .hub-modal, .hub-side-panel')
    .filter({ hasText: /Cobrança|Devolução de mercadorias/i })
    .last();
}

export async function openFinanceComandaReceivable(
  page: Page,
  fixture: SaleFixture,
  opts: { requireRegisterReturn?: boolean } = {},
) {
  await ensureUnitSelected(page);
  const url = `/hub/financeiro/comanda/${fixture.comandaId}?receivable_id=${fixture.receivableId}`;
  await page.goto(url);
  await expect(page).toHaveURL(new RegExp(fixture.comandaId), { timeout: 60_000 });
  await expect(page.locator('body')).not.toContainText(/Selecione a unidade/i, { timeout: 45_000 });
  await expect(page.locator('body')).not.toContainText(/Entrando/i, { timeout: 60_000 }).catch(() => {});
  await expect(page.locator('.hub-refreshing-banner')).toHaveCount(0, { timeout: 60_000 }).catch(() => {});

  const shortId = fixture.comandaId.slice(0, 8).toUpperCase();
  await expect(page.getByRole('heading', { name: new RegExp(shortId, 'i') })).toBeVisible({
    timeout: 60_000,
  });

  const drawer = receivableDrawer(page);
  if (!(await drawer.isVisible({ timeout: 8_000 }).catch(() => false))) {
    const cta = page.getByRole('button', { name: /^(Registrar pagamento|Ver cobrança)$/i }).last();
    await expect(cta).toBeVisible({ timeout: 45_000 });
    await cta.click();
  }
  await expect(drawer.getByRole('heading', { name: /Cobrança/i }).first()).toBeVisible({
    timeout: 45_000,
  });
  if (opts.requireRegisterReturn !== false) {
    await expect(drawer.getByRole('button', { name: 'Registrar devolução' })).toBeVisible({
      timeout: 45_000,
    });
  }
}

export type UiReturnOptions = {
  reason: string;
  productNames?: Array<string | RegExp>;
  onlyProducts?: Array<string | RegExp>;
  condition: 'sellable' | 'unsellable';
  expectFinancialRefund?: boolean;
  /** Forma do reembolso no combobox (padrão pix). */
  refundMethod?: 'pix' | 'cash' | 'customer_credit';
  screenshotLabel?: string;
};

export async function uiRegisterMerchandiseReturn(page: Page, opts: UiReturnOptions) {
  const drawer = receivableDrawer(page);
  const registrar = drawer.getByRole('button', { name: 'Registrar devolução' });
  await expect(registrar).toBeVisible({ timeout: 45_000 });
  await registrar.scrollIntoViewIfNeeded();
  await registrar.click();

  const reason = drawer.locator('#recv-standalone-return-reason');
  await expect(reason).toBeVisible({ timeout: 15_000 });
  await reason.fill(opts.reason);

  const clickHubCheckbox = async (name: RegExp) => {
    const label = drawer.locator('label.hub-checkbox').filter({ hasText: name });
    await expect(label).toBeVisible({ timeout: 10_000 });
    await label.click();
  };
  const hubCheckboxChecked = async (name: RegExp) => {
    const input = drawer.getByRole('checkbox', { name });
    return input.isChecked().catch(() => false);
  };

  if (opts.onlyProducts?.length) {
    if (
      await drawer
        .getByRole('checkbox', { name: /Todos os itens pendentes/i })
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      if (await hubCheckboxChecked(/Todos os itens pendentes/i)) {
        await clickHubCheckbox(/Todos os itens pendentes/i);
      }
    }
    for (const product of opts.onlyProducts) {
      const nameRe = typeof product === 'string' ? new RegExp(product, 'i') : product;
      if (!(await hubCheckboxChecked(nameRe))) await clickHubCheckbox(nameRe);
    }
    const rows = drawer.locator('.hub-merch-return__line--selectable');
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const text = (await row.innerText()).trim();
      const should = opts.onlyProducts.some((p) =>
        typeof p === 'string' ? text.includes(p) : p.test(text),
      );
      const cb = row.getByRole('checkbox');
      if (!should && (await cb.isChecked().catch(() => false))) {
        await row.locator('label.hub-checkbox').click();
      }
    }
  }

  const conditionName =
    opts.condition === 'sellable' ? /^Apta para revenda/i : /^Não apta para revenda/i;
  const conditionRadio = drawer.getByRole('radio', { name: conditionName });
  await expect(conditionRadio).toBeVisible({ timeout: 15_000 });
  await conditionRadio.scrollIntoViewIfNeeded();
  await conditionRadio.click();

  if (opts.expectFinancialRefund) {
    const refundCombo = drawer.locator('#recv-standalone-refund-method');
    if (await refundCombo.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await refundCombo.click();
      const method = opts.refundMethod ?? 'pix';
      const label =
        method === 'customer_credit'
          ? /Crédito do tutor/i
          : method === 'cash'
            ? /Dinheiro|cash/i
            : /pix/i;
      const opt = page.getByRole('option', { name: label });
      if (await opt.isVisible({ timeout: 3_000 }).catch(() => false)) await opt.click();
    }
  }

  const confirm = drawer.getByRole('button', {
    name: opts.expectFinancialRefund ? /Confirmar devolução e reembolso/i : /^Confirmar devolução$/i,
  });
  await expect(confirm).toBeEnabled({ timeout: 15_000 });
  await confirm.click();

  // Devolução total some o CTA — não exigir "Registrar devolução" de volta.
  await expect(drawer.getByText(/Salvando/i)).toHaveCount(0, { timeout: 90_000 }).catch(() => {});
  await expect
    .poll(
      async () => {
        if (
          await page
            .getByText(/Devolução registrada|Recebível cancelado/i)
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          return 'toast';
        }
        if (
          await drawer
            .getByText(/Devolução total|Devolução parcial|Cancelad|Estornad|Reembolsad/i)
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          return 'status';
        }
        const stillOpen = await reason.isVisible().catch(() => false);
        const stillConfirm = await confirm.isVisible().catch(() => false);
        if (!stillOpen && !stillConfirm) return 'form_closed';
        if (
          await drawer
            .getByRole('button', { name: 'Registrar devolução' })
            .isVisible()
            .catch(() => false)
        ) {
          return 'cta_back';
        }
        return null;
      },
      { timeout: 90_000 },
    )
    .not.toBeNull();

  if (opts.screenshotLabel) {
    await page.screenshot({
      path: `/tmp/etapa_a_${opts.screenshotLabel}.png`,
      fullPage: true,
    });
  }
}

export async function expectNoRegisterReturnButton(page: Page) {
  const drawer = receivableDrawer(page);
  await expect(drawer.getByRole('button', { name: 'Registrar devolução' })).toHaveCount(0, {
    timeout: 15_000,
  });
}

/** Abre o formulário de devolução e lista opções de reembolso (sem confirmar). */
export async function openReturnFormRefundOptions(page: Page): Promise<string[]> {
  const drawer = receivableDrawer(page);
  const registrar = drawer.getByRole('button', { name: 'Registrar devolução' });
  await expect(registrar).toBeVisible({ timeout: 45_000 });
  await registrar.click();
  await drawer.locator('#recv-standalone-return-reason').fill('QA EtapaA inspeção de métodos');
  const sellable = drawer.getByRole('radio', { name: /^Apta para revenda/i });
  if (await sellable.isVisible({ timeout: 5_000 }).catch(() => false)) await sellable.click();
  const refundCombo = drawer.locator('#recv-standalone-refund-method');
  if (!(await refundCombo.isVisible({ timeout: 8_000 }).catch(() => false))) return [];
  await refundCombo.click();
  const options = page.getByRole('option');
  const count = await options.count();
  const labels: string[] = [];
  for (let i = 0; i < count; i++) labels.push((await options.nth(i).innerText()).trim());
  await page.keyboard.press('Escape');
  return labels;
}
