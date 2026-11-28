import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { hubCadminCredentials, hubCstaffReceptionCredentials } from './helpers/env';

/**
 * Smoke do redesign do Balcão: shell, KPIs, board/lista e CTA walk-in.
 * Não muta operação (só leitura + troca de filtro/vista).
 */
test.describe('Balcão smoke', () => {
  test('carrega central operacional com KPIs e board', async ({ page }) => {
    test.setTimeout(60_000);
    const creds = hubCstaffReceptionCredentials() ?? hubCadminCredentials();
    test.skip(!creds, 'Credenciais de recepção/CADMIN e2e não provisionadas.');
    if (!creds) return;

    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/recepcao');
    await expect(page).toHaveURL(/\/hub\/recepcao(?:\?|$)/, { timeout: 20_000 });

    await expect(page.getByRole('toolbar', { name: 'Indicadores do balcão' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: /Chegadas/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Saídas/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Atenção/i })).toBeVisible();

    await expect(page.getByRole('searchbox', { name: 'Buscar pet ou tutor' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Colunas/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Lista/i })).toBeVisible();

    // KPI filtra e volta para tudo
    await page.getByRole('button', { name: /Chegadas/i }).click();
    await expect(page.getByTestId('hub-balcao-chegadas')).toBeVisible();
    await page.getByRole('button', { name: /Chegadas/i }).click();

    // Vista lista
    await page.getByRole('button', { name: /Lista/i }).click();
    await expect(page.getByTestId('hub-balcao-list')).toBeVisible();

    // Vista colunas de novo
    await page.getByRole('button', { name: /Colunas/i }).click();
    await expect(page.getByTestId('hub-balcao-board')).toBeVisible();

    const walkIn = page.getByRole('button', { name: /Chegada sem agenda/i });
    if (await walkIn.isVisible().catch(() => false)) {
      await walkIn.click();
      await expect(page).toHaveURL(/\/hub\/appointments/, { timeout: 15_000 });
      await expect(page.url()).toMatch(/openWalkIn=1/);
    }
  });
});
