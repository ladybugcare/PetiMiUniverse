import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { hubCadminCredentials } from './helpers/env';

test.describe('dashboard hoje na unidade', () => {
  test('CADMIN vê Operação agora e atalho para fila', async ({ page }) => {
    test.setTimeout(60_000);
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/dashboard');

    await expect(page.getByRole('heading', { name: 'Hoje na unidade' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('heading', { name: 'Operação agora' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);

    const opsLink = page
      .locator('a.hub-today-dash__ops-card')
      .filter({ hasText: /Agenda|Clínica|Banho|Hotel|Leva/i })
      .first();
    await expect(opsLink).toBeVisible({ timeout: 15_000 });
    await opsLink.click();
    await expect(page).toHaveURL(/\/hub\/(appointments|clinica|banho-tosa|hotel-creche|leva-e-traz)/, {
      timeout: 15_000,
    });
  });
});
