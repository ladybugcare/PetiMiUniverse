import { expect, test } from '@playwright/test';
import {
  e2eSupabaseUrl,
  installSupabaseAuthMocks,
  seedMockAuthSession,
} from './helpers/supabaseAuthMock';

/**
 * Testes com mocks do Supabase Auth — não dependem de e-mail real nem do PetMi Vet.
 * Bloco opcional de Auth real: HUB_E2E_REAL_AUTH=1 + credenciais QA (fora do CI padrão).
 */
test.describe('recuperação de senha (mocks)', () => {
  test('forgot envia recover com redirectTo do Hub /reset-password e mensagem neutra', async ({
    page,
  }) => {
    const mocks = await installSupabaseAuthMocks(page, { recover: 'ok' });

    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /esqueceu a senha/i })).toBeVisible();

    await page.getByLabel('Email', { exact: true }).fill('qa.reset.mock@petmi.test');
    await page.getByRole('button', { name: /enviar link de recuperação/i }).click();

    await expect(page.getByRole('heading', { name: /e-mail enviado/i })).toBeVisible();
    await expect(
      page.getByText(/se existir uma conta com esse e-mail/i),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /voltar ao login/i })).toBeVisible();

    await expect.poll(() => mocks.recoverCalls.length).toBeGreaterThan(0);
    const last = mocks.lastRecover();
    expect(last?.email).toBe('qa.reset.mock@petmi.test');
    expect(last?.redirectTo).toMatch(/\/reset-password$/);
    expect(last?.redirectTo).not.toMatch(/vet|shift|petivet/i);
    expect(page.url()).toMatch(/\/forgot-password/);
    expect(page.url()).not.toMatch(/vet|shift|petivet/i);
  });

  test('forgot com erro do Auth mostra mensagem de falha', async ({ page }) => {
    await installSupabaseAuthMocks(page, { recover: 'error' });

    await page.goto('/forgot-password');
    await page.getByLabel('Email', { exact: true }).fill('qa.reset.mock@petmi.test');
    await page.getByRole('button', { name: /enviar link de recuperação/i }).click();

    await expect(page.locator('.hub-login-page-msg--error')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /esqueceu a senha/i })).toBeVisible();
  });

  test('reset sem sessão mostra link inválido e CTAs', async ({ page }) => {
    await installSupabaseAuthMocks(page);

    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: /link inválido/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: /pedir novo link/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /voltar ao login/i })).toBeVisible();
    expect(page.url()).not.toMatch(/vet|shift|petivet/i);
  });

  test('HubAuthListener redireciona hash recovery de /login para /reset-password', async ({
    page,
  }) => {
    await installSupabaseAuthMocks(page);

    await page.goto(
      '/login#access_token=e2e-mock-access&refresh_token=e2e-mock-refresh&type=recovery',
    );

    await expect(page).toHaveURL(/\/reset-password/, { timeout: 15_000 });
    expect(page.url()).toContain('type=recovery');
    expect(page.url()).not.toMatch(/vet|shift|petivet/i);
  });

  test('reset com sessão mockada valida senha e conclui no login do Hub', async ({ page }) => {
    await seedMockAuthSession(page, e2eSupabaseUrl() || undefined);
    await installSupabaseAuthMocks(page);

    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: /nova senha/i })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.locator('#hub-reset-password')).toHaveAttribute('minlength', '8');
    await expect(page.locator('#hub-reset-confirm')).toHaveAttribute('minlength', '8');

    await page.locator('#hub-reset-password').fill('senhaok12');
    await page.locator('#hub-reset-confirm').fill('senhaok99');
    await page.getByRole('button', { name: /salvar nova senha/i }).click();
    await expect(page.getByText(/não coincidem/i)).toBeVisible();

    await page.locator('#hub-reset-password').fill('SenhaNova!1');
    await page.locator('#hub-reset-confirm').fill('SenhaNova!1');
    await page.getByRole('button', { name: /salvar nova senha/i }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByText(/senha atualizada|redefinida|atualizada/i)).toBeVisible();
    expect(page.url()).not.toMatch(/vet|shift|petivet/i);
  });
});

test.describe('recuperação de senha (Auth real — opcional)', () => {
  test('solicita recover real quando HUB_E2E_REAL_AUTH=1', async ({ page }) => {
    const enabled = process.env.HUB_E2E_REAL_AUTH === '1';
    const email = (process.env.E2E_HUB_RESET_EMAIL || process.env.E2E_HUB_EMAIL || '').trim();
    test.skip(!enabled || !email, 'Defina HUB_E2E_REAL_AUTH=1 e E2E_HUB_RESET_EMAIL para Auth real');
    if (!enabled || !email) return;

    await page.goto('/forgot-password');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: /enviar link de recuperação/i }).click();
    await expect(page.getByRole('heading', { name: /e-mail enviado/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});
