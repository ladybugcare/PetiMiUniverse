import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { hubCadminCredentials } from './helpers/env';

test.describe('módulos autenticados', () => {
  test('CADMIN vê o dashboard sem erro', async ({ page }) => {
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/dashboard');

    await expect(page.getByRole('heading', { name: 'Dashboard' }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Receita = pagamentos no período/i).or(page.getByText('Visão da unidade'))).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
  });

  test('CADMIN abre o caixa se estiver fechado', async ({ page }) => {
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/caixa');

    await expect(page.getByRole('heading', { name: 'Caixa' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /Unexpected Application Error/i })).toHaveCount(0);

    const abrir = page.getByRole('button', { name: 'Abrir caixa' });
    const encerrar = page.getByRole('button', { name: 'Encerrar turno' });
    await expect(abrir.or(encerrar).first()).toBeVisible({ timeout: 20_000 });

    const alreadyOpenCopy = page.getByText('Já existe caixa aberto nesta unidade');
    try {
      await encerrar.waitFor({ state: 'visible', timeout: 8_000 });
    } catch {
      await abrir.click();
      await expect(encerrar.or(alreadyOpenCopy)).toBeVisible({ timeout: 20_000 });
      if (await alreadyOpenCopy.isVisible()) {
        await page.getByRole('button', { name: 'OK' }).click();
        await expect(alreadyOpenCopy).toBeHidden();
      }
    }

    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
  });

  test('CADMIN vê o financeiro e troca de aba', async ({ page }) => {
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/financeiro');

    await expect(page.getByRole('heading', { name: 'Financeiro' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('navigation', { name: 'Seções financeiras' })).toBeVisible();
    await expect(page.getByText('Pendentes de cobrança')).toBeVisible();

    await page.getByRole('button', { name: 'Despesas' }).click();
    await expect(page.getByRole('heading', { name: 'Despesas' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
  });

  test('CADMIN vê o catálogo de serviços', async ({ page }) => {
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/servicos/servicos');

    await expect(page.getByRole('heading', { name: 'Serviços' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Buscar serviço por nome ou código')).toBeVisible();
    await expect(page.getByText('Carregando serviços…')).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(/Banho/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
  });

  test('CADMIN abre a fila de Banho & Tosa', async ({ page }) => {
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/banho-tosa');

    await expect(page.getByRole('heading', { name: 'Banho & Tosa' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder('Buscar pet ou tutor… (/)')).toBeVisible();
    await expect(page.getByText('Carregando fila…')).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
  });

  test('CADMIN abre o painel de Hotel & Creche', async ({ page }) => {
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/hotel-creche');

    await expect(page.getByRole('heading', { name: 'Hotel & Creche' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder('Buscar pet ou tutor… (/)')).toBeVisible();
    await expect(page.getByText('Carregando painel…')).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole('tab', { name: 'Hotel' }).or(page.getByRole('button', { name: 'Hotel' }))).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
  });

  test('CADMIN vê o perfil da clínica', async ({ page }) => {
    const creds = hubCadminCredentials();
    test.skip(!creds, 'CADMIN e2e não provisionado.');
    if (!creds) return;

    await loginAs(page, creds.email, creds.password);
    await page.goto('/hub/perfil-clinica');

    await expect(page.getByRole('heading', { name: 'Perfil da Clínica' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('A carregar perfil da clínica…')).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Dados da organização' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar clínica' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
  });
});
