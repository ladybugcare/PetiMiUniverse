import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { hubCadminCredentials } from './helpers/env';

test.describe('relatórios', () => {
  test('CADMIN abre o catálogo e a visão financeira', async ({ page }) => {
    test.setTimeout(60_000);
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/relatorios');

    await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Financeiro' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Visão financeira/i })).toBeVisible();

    await page.getByRole('button', { name: /Visão financeira/i }).click();
    await expect(page).toHaveURL(/relatorio=finance-overview/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Visão financeira' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('Período')).toBeVisible();
    await expect(page.getByRole('button', { name: /Exportar CSV/i }).or(page.getByText(/Selecione uma unidade/i))).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: /Voltar ao catálogo/i }).click();
    await expect(page.getByRole('heading', { name: 'Envio semanal por e-mail' })).toBeVisible({
      timeout: 10_000,
    });
  });
});
