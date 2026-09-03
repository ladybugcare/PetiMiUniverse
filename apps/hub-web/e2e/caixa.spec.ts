import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { e2eOpsNames, hubCadminCredentials } from './helpers/env';

async function ensureCaixaAberto(page: import('@playwright/test').Page) {
  await page.goto('/hub/caixa');
  await expect(page.getByRole('heading', { name: 'Caixa' })).toBeVisible({ timeout: 20_000 });

  const abrir = page.getByRole('button', { name: 'Abrir caixa' });
  const encerrar = page.getByRole('button', { name: 'Encerrar turno' });
  await expect(abrir.or(encerrar).first()).toBeVisible({ timeout: 20_000 });

  const alreadyOpenCopy = page.getByText('Já existe caixa aberto nesta unidade');
  try {
    await encerrar.waitFor({ state: 'visible', timeout: 8_000 });
  } catch {
    const saldo = page.getByLabel(/Saldo inicial/i);
    if (await saldo.isVisible().catch(() => false)) {
      await saldo.fill('50');
    }
    await abrir.click();
    await expect(encerrar.or(alreadyOpenCopy)).toBeVisible({ timeout: 20_000 });
    if (await alreadyOpenCopy.isVisible()) {
      await page.getByRole('button', { name: 'OK' }).click();
      await expect(alreadyOpenCopy).toBeHidden();
    }
  }
}

test.describe('caixa — cobrança multi-serviço', () => {
  test('day board mostra banho e clínica; Abrir comanda → Cobrar → Confirmar', async ({ page }) => {
    test.setTimeout(90_000);
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    const { petName } = e2eOpsNames();
    await loginAs(page, creds.email, creds.password);
    await ensureCaixaAberto(page);

    await expect(page.getByRole('heading', { name: 'Ações pendentes do caixa' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(petName).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.hub-dayboard__group-pill', { hasText: 'Banho & Tosa' }).first()).toBeVisible();
    await expect(page.locator('.hub-dayboard__group-pill', { hasText: 'Clínica' }).first()).toBeVisible();

    const row = page.locator('tr').filter({ hasText: petName }).filter({ hasText: 'Clínica' }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    const abrirComanda = row.getByRole('button', { name: 'Abrir comanda' });
    const receber = row.getByRole('button', { name: 'Receber' });
    const editar = row.getByRole('button', { name: 'Editar comanda' });

    if (await abrirComanda.isVisible().catch(() => false)) {
      await abrirComanda.click();
      await expect(page).toHaveURL(/\/hub\/caixa\/comanda\//, { timeout: 20_000 });
    } else if (await receber.isVisible().catch(() => false)) {
      await receber.click();
    } else {
      await editar.click();
      await expect(page).toHaveURL(/\/hub\/caixa\/comanda\//, { timeout: 20_000 });
    }

    const drawerHeading = page.getByRole('heading', { name: /Cobrar — Comanda/i });
    if (!(await drawerHeading.isVisible().catch(() => false))) {
      const cobrar = page.getByRole('button', { name: /^(Cobrar|Faturar itens)$/ });
      await expect(cobrar).toBeVisible({ timeout: 20_000 });
      await cobrar.click();
    }

    await expect(drawerHeading).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('tab', { name: 'Receber agora' })).toBeVisible();

    const method = page.locator('#checkout-payment-method');
    if (await method.isVisible().catch(() => false)) {
      await method.selectOption('cash');
    }

    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText(/Pagamento registrado/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
