import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { hubCadminCredentials } from './helpers/env';

const VEHICLE_NAME = '[E2E] Kombi';

test.describe('frota leva e traz', () => {
  test('CADMIN vê a frota e cadastra um veículo e2e', async ({ page }) => {
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/configuracoes-sistema/leva-e-traz');

    await expect(page.getByRole('heading', { name: 'Configurações do Sistema' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('heading', { name: 'Frota — Leva e Traz' })).toBeVisible();
    await expect(page.getByText('Carregando veículos…')).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);

    const existing = page.getByText(VEHICLE_NAME);
    if (await existing.isVisible()) {
      await expect(existing.first()).toBeVisible();
      return;
    }

    const novo = page.getByRole('button', { name: 'Novo veículo' });
    const cadastrar = page.getByRole('button', { name: 'Cadastrar veículo' });
    await expect(novo.or(cadastrar)).toBeVisible();
    await (await novo.isVisible() ? novo : cadastrar).click();

    await expect(page.getByRole('heading', { name: 'Novo veículo' })).toBeVisible();
    await page.getByLabel('Nome *').fill(VEHICLE_NAME);
    await page.getByLabel('Placa').fill('E2E1A23');
    await page.getByLabel('Quantos pets cabem?').fill('4');
    await page.getByRole('button', { name: 'Salvar veículo' }).click();

    await expect(page.getByRole('heading', { name: 'Novo veículo' })).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(VEHICLE_NAME).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
  });
});
