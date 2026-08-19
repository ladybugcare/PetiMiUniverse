import { expect, test } from '@playwright/test';

test.describe('páginas públicas', () => {
  test('landing mostra o herói do Hub', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /a operação do seu negócio pet/i }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Acesso' }).getByRole('link', { name: 'Entrar' })).toBeVisible();
  });

  test('login mostra o formulário', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /bem-vindo de volta/i })).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Senha' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('signup mostra o formulário de cadastro da clínica', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: 'Criar conta da clínica' })).toBeVisible();
    await expect(page.getByLabel('Nome completo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible();
  });

  test('rota protegida sem sessão redireciona para login', async ({ page }) => {
    await page.goto('/hub/dashboard');
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByRole('heading', { name: /bem-vindo de volta/i })).toBeVisible();
  });

  test('convite sem token mostra link inválido', async ({ page }) => {
    await page.goto('/accept-invitation');
    await expect(page.getByRole('heading', { name: 'Convite indisponível' })).toBeVisible();
    await expect(page.getByText('Link de convite inválido.')).toBeVisible();
  });

  test('convite com token inválido mostra erro (não tela em branco)', async ({ page }) => {
    await page.goto('/accept-invitation?token=token-invalido');
    await expect(page.getByRole('heading', { name: 'Convite indisponível' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('.hub-login-page-msg--error')).toBeVisible();
    await expect(page.locator('.hub-login-page-msg--error')).toHaveText(
      /convite inválido ou expirado|não foi possível|não está disponível/i,
    );
    await expect(page.getByRole('link', { name: /ir para o login/i }).first()).toBeVisible();
  });
});
