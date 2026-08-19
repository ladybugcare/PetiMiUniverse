import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { e2eOpsNames, hubCadminCredentials } from './helpers/env';

test.describe('clientes', () => {
  test('CADMIN vê o tutor e2e na lista', async ({ page }) => {
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    const { guardianName } = e2eOpsNames();
    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/clientes');

    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
    await expect(page.getByText(guardianName).first()).toBeVisible({ timeout: 20_000 });
  });

  test('CADMIN cadastra um tutor pelo drawer', async ({ page }) => {
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    const stamp = Date.now().toString().slice(-8);
    const name = `[E2E] Tutor UI ${stamp}`;
    const taxId = stamp.padStart(11, '3');
    const phone = `119${stamp}`;

    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/clientes');
    await expect(page.getByRole('button', { name: 'Novo tutor' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Novo tutor' }).click();

    await expect(page.getByRole('heading', { name: 'Cadastrar novo tutor' })).toBeVisible();
    await page.getByPlaceholder('Nome completo').fill(name);
    await page.getByPlaceholder('(00) 00000-0000').fill(phone);
    await page.getByPlaceholder('Obrigatório').fill(taxId);
    await page.getByRole('button', { name: 'Salvar tutor' }).click();

    await expect(page.getByRole('button', { name: name }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
  });
});
