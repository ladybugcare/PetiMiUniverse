import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { hubCadminCredentials } from './helpers/env';

test.describe('login e cadastro', () => {
  test('credenciais inválidas permanecem no login com erro', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill('e2e-invalido@example.com');
    await page.getByRole('textbox', { name: 'Senha' }).fill('senha-errada-123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.locator('.hub-login-page-msg--error')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.hub-login-page-msg--error')).not.toHaveText('');
  });

  test('CADMIN válido chega no dashboard', async ({ page }) => {
    const creds = hubCadminCredentials();
    test.skip(
      !creds,
      'CADMIN e2e não provisionado. O projeto setup precisa da API no ar (npm run dev:backend).',
    );
    if (!creds) return;

    await loginAs(page, creds.email, creds.password);
    await expect(page).toHaveURL(/\/hub\/dashboard(?:\?|$)/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('signup bloqueia campos vazios e senha curta', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: 'Criar conta da clínica' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();

    await page.getByLabel('Nome completo').fill('A');
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();

    await page.getByLabel('Nome completo').fill('Ana Teste');
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar conta' })).toBeDisabled();

    await page.getByLabel('E-mail').fill('ana.e2e@example.com');
    await page.getByLabel('Senha', { exact: true }).fill('curta');
    await page.getByLabel('Confirmar senha').fill('curta');
    await expect(page.getByRole('button', { name: 'Criar conta' })).toBeDisabled();

    await page.getByLabel('Senha', { exact: true }).fill('senhaok1');
    await page.getByLabel('Confirmar senha').fill('senhaok2');
    await expect(page.getByText('As senhas não coincidem.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar conta' })).toBeDisabled();
  });
});
