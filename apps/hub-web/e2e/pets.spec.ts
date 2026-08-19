import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { e2eOpsNames, hubCadminCredentials } from './helpers/env';

test.describe('pets', () => {
  test('CADMIN vê o pet e2e na lista', async ({ page }) => {
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    const { petName } = e2eOpsNames();
    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/pets');

    await expect(page.getByRole('heading', { name: 'Pets' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
    await expect(page.getByText(petName).first()).toBeVisible({ timeout: 20_000 });
  });
});
