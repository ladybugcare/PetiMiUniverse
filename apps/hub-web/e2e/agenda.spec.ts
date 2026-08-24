import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { e2eOpsNames, hubCadminCredentials } from './helpers/env';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function openAgendaAsCadmin(page: Page) {
  const creds = hubCadminCredentials();
  test.skip(!creds, 'CADMIN e2e não provisionado.');
  if (!creds) return null;

  await loginAs(page, creds.email, creds.password);
  await page.goto('/hub/appointments');
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Carregando agenda…')).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Dia' })).toBeVisible();
  return creds;
}

test.describe('agenda', () => {
  test('CADMIN vê o pet e2e no dia', async ({ page }) => {
    if (!(await openAgendaAsCadmin(page))) return;

    const { petName, guardianName } = e2eOpsNames();
    const pet = page.getByText(petName);
    const guardian = page.getByText(guardianName);
    await expect(pet.or(guardian).first()).toBeVisible({ timeout: 20_000 });
  });

  test('CADMIN vê leva-e-traz no banho avulso das 14h', async ({ page }) => {
    if (!(await openAgendaAsCadmin(page))) return;

    const { petName } = e2eOpsNames();
    const card = page.getByRole('button', { name: new RegExp(`14:00.*${escapeRegExp(petName)}`) });
    await expect(card.first()).toBeVisible({ timeout: 20_000 });
    await expect(card.first().getByTitle('Leva e traz: busca')).toBeVisible();
    await expect(card.first().getByTitle('Leva e traz: retorno')).toBeVisible();
    await expect(card.first().getByTitle('Parte de série recorrente')).toHaveCount(0);
  });

  test('CADMIN vê multi-serviço Banho + Tosa no card e no detalhe', async ({ page }) => {
    if (!(await openAgendaAsCadmin(page))) return;

    const card = page.getByRole('button', { name: /Banho \+ Tosa/ });
    await expect(card.first()).toBeVisible({ timeout: 20_000 });
    await card.first().click();

    await expect(page.getByRole('heading', { name: /Banho \+ Tosa/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Banho E2E').first()).toBeVisible();
    await expect(page.getByText('Tosa E2E').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
  });

  test('CADMIN vê a série semanal no dia e na semana', async ({ page }) => {
    test.setTimeout(60_000);
    if (!(await openAgendaAsCadmin(page))) return;

    await expect(page.getByTitle('Parte de série recorrente').first()).toBeVisible({ timeout: 20_000 });
    const seriesCard = page.getByRole('button', { name: /Série semanal/ });
    await seriesCard.first().scrollIntoViewIfNeeded();
    await expect(seriesCard.first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole('tab', { name: 'Semana' }).click();
    await expect(page.getByText('Carregando agenda…')).toBeHidden({ timeout: 20_000 });

    const weekCards = page.getByRole('button', { name: /Série semanal/ });
    if ((await weekCards.count()) < 2) {
      await page.getByRole('button', { name: 'Próxima semana' }).click();
      await expect(page.getByText('Carregando agenda…')).toBeHidden({ timeout: 20_000 });
      await expect(weekCards.first()).toBeVisible({ timeout: 20_000 });
    } else {
      await expect(weekCards.nth(1)).toBeVisible();
    }

    await page.getByRole('tab', { name: 'Dia' }).click();
    await expect(page.getByText('Carregando agenda…')).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /Série semanal/ }).first()).toBeVisible();
  });

  test('CADMIN vê série com leva-e-traz e pernas ocultas na grade', async ({ page }) => {
    if (!(await openAgendaAsCadmin(page))) return;

    const card = page.getByRole('button', { name: /Série L&T/ });
    await expect(card.first()).toBeVisible({ timeout: 20_000 });
    await expect(card.first().getByTitle('Parte de série recorrente')).toBeVisible();
    await expect(card.first().getByTitle('Leva e traz: busca')).toBeVisible();
    await expect(card.first().getByTitle('Leva e traz: retorno')).toBeVisible();

    await expect(page.getByRole('button', { name: /Leva e Traz E2E/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Erro' })).toHaveCount(0);
  });

  test('CADMIN vê bloco extra só no card principal', async ({ page }) => {
    if (!(await openAgendaAsCadmin(page))) return;

    const cards = page.getByRole('button', { name: /bloco extra/i });
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
    await expect(cards).toHaveCount(1);
  });

  test('modal + Novo mostra repetir e leva-e-traz, sem salvar', async ({ page }) => {
    if (!(await openAgendaAsCadmin(page))) return;

    await page.getByRole('button', { name: '+ Novo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo agendamento' });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole('checkbox', { name: 'Repetir agendamento' })).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Incluir Leva e Traz' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Criar agendamento' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Buscar e adicionar serviço…' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });

  test('encaixe não oferece série nem leva-e-traz', async ({ page }) => {
    if (!(await openAgendaAsCadmin(page))) return;

    await page.getByRole('button', { name: 'Mais opções de agendamento' }).click();
    await page.getByRole('menuitem', { name: /Encaixe/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Encaixe / walk-in' });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole('checkbox', { name: 'Repetir agendamento' })).toHaveCount(0);
    await expect(dialog.getByRole('checkbox', { name: 'Incluir Leva e Traz' })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });
});
