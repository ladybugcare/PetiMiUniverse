import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { e2eOpsNames, hubCadminCredentials, hubCstaffCredentials } from './helpers/env';

test.describe('leva e traz', () => {
  test('CADMIN abre o quadro do dia com o pet e2e', async ({ page }) => {
    const creds = hubCadminCredentials();
    test.skip(
      !creds,
      'CADMIN e2e não provisionado. O projeto setup precisa da API no ar (npm run dev:backend).',
    );
    if (!creds) return;

    const { petName } = e2eOpsNames();
    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/leva-e-traz');

    await expect(page.getByPlaceholder('Buscar pet ou tutor… (/)')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('link', { name: 'Minha rota' })).toBeVisible();
    await expect(page.getByText('Carregando paradas…')).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
    await expect(page.getByText(petName).first()).toBeVisible({ timeout: 20_000 });
  });

  test('CSTAFF leva_traz cai em minha-rota', async ({ page }) => {
    const creds = hubCstaffCredentials();
    test.skip(
      !creds,
      'CSTAFF e2e não provisionado. O projeto setup precisa da API no ar (npm run dev:backend).',
    );
    if (!creds) return;

    await loginAs(page, creds.email, creds.password);
    await expect(page).toHaveURL(/\/hub\/leva-e-traz\/minha-rota(?:\?|$)/, { timeout: 20_000 });

    const emptyTitle = page.getByText('Minhas rotas de hoje');
    const emptyCopy = page.getByText('Nenhuma rota atribuída a você hoje.');
    const driverTitle = page.locator('.hub-pickup-driver-view__title');
    const clinicPrompt = page.getByText(/selecione uma clínica/i);

    await expect(emptyTitle.or(emptyCopy).or(driverTitle).or(clinicPrompt).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('Carregando suas rotas…')).toBeHidden();
  });

  test('CADMIN monta rota e CSTAFF avança A caminho', async ({ page }) => {
    test.setTimeout(90_000);
    const admin = hubCadminCredentials();
    const staff = hubCstaffCredentials();
    test.skip(!admin || !staff, 'Contas e2e não provisionadas.');
    if (!admin || !staff) return;

    const { petName, driverName } = e2eOpsNames();
    await loginAs(page, admin.email, admin.password);
    await page.goto('/hub/leva-e-traz');
    await expect(page.getByText(petName).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Carregando paradas…')).toBeHidden();

    const noRouteYet = page.getByText('Nenhuma rota montada para este dia.');
    if (await noRouteYet.isVisible()) {
      await page.getByRole('button', { name: 'Nova rota' }).first().click();
      await expect(page.getByRole('heading', { name: 'Nova rota' })).toBeVisible();

      const legs = page.locator('.hub-pickup-builder__avail-item');
      await expect(legs.first()).toBeVisible({ timeout: 15_000 });
      for (let i = 0; i < 8 && (await legs.count()) > 0; i++) {
        await legs.first().click();
      }

      await page.locator('#hub-pb-driver').click();
      await page.getByRole('option', { name: driverName }).click();
      await page.getByRole('button', { name: 'Criar rota' }).click();
      await expect(page.getByRole('heading', { name: 'Nova rota' })).toBeHidden({ timeout: 20_000 });
    }

    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await loginAs(page, staff.email, staff.password);
    await expect(page).toHaveURL(/\/hub\/leva-e-traz\/minha-rota(?:\?|$)/, { timeout: 20_000 });
    await expect(page.getByText('Carregando suas rotas…')).toBeHidden({ timeout: 20_000 });

    const aCaminho = page.getByRole('button', { name: 'A caminho' });
    const noEndereco = page.getByRole('button', { name: 'No endereço' });
    const petABordo = page.getByRole('button', { name: 'Pet a bordo' });
    const naClinica = page.getByRole('button', { name: 'Na clínica' });
    const entregue = page.getByRole('button', { name: 'Entregue' });

    if (await aCaminho.isVisible()) {
      await aCaminho.click();
      await expect(noEndereco).toBeVisible({ timeout: 20_000 });
    }
    if (await noEndereco.isVisible()) {
      await noEndereco.click();
      await expect(petABordo.or(entregue)).toBeVisible({ timeout: 20_000 });
    }
    if (await petABordo.isVisible()) {
      await petABordo.click();
      await expect(naClinica).toBeVisible({ timeout: 20_000 });
    }

    await expect(
      noEndereco.or(petABordo).or(naClinica).or(entregue).or(page.getByText(petName)).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});

