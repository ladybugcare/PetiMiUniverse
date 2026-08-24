import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import {
  hubCadminCredentials,
  hubCstaffBathCredentials,
  hubCstaffCashCredentials,
  hubCstaffClinicCredentials,
  hubCstaffCredentials,
  hubCstaffHotelCredentials,
  hubCstaffReceptionCredentials,
} from './helpers/env';

type Creds = { email: string; password: string };

function skipIfMissing(creds: Creds | null, label: string): creds is Creds {
  test.skip(!creds, `${label} e2e não provisionado. O projeto setup precisa da API no ar.`);
  return Boolean(creds);
}

async function expectNav(
  page: Page,
  opts: { visiveis: Array<string | RegExp>; ocultos: Array<string | RegExp> },
) {
  const nav = page.getByLabel('Navegação principal');
  const first = opts.visiveis[0];
  await expect(nav.getByRole('link', { name: first })).toBeVisible({ timeout: 20_000 });
  for (const name of opts.visiveis) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  for (const name of opts.ocultos) {
    await expect(nav.getByRole('link', { name })).toHaveCount(0);
  }
}

test.describe('acessos Hub', () => {
  test('CADMIN cai no dashboard com o menu operacional completo', async ({ page }) => {
    const creds = hubCadminCredentials();
    if (!skipIfMissing(creds, 'CADMIN')) return;

    await loginAs(page, creds.email, creds.password);
    await expect(page).toHaveURL(/\/hub\/dashboard(?:\?|$)/, { timeout: 20_000 });

    await expectNav(page, {
      visiveis: [
        'Dashboard',
        'Agenda',
        'Equipe',
        /^Caixa/,
        'Leva e Traz',
        'Banho & Tosa',
        'Hotel & Creche',
        'Clínica',
      ],
      ocultos: [],
    });
  });

  test('CSTAFF leva_traz: só Leva e Traz, dashboard muted e sem Nova rota', async ({ page }) => {
    const creds = hubCstaffCredentials();
    if (!skipIfMissing(creds, 'CSTAFF leva_traz')) return;

    await loginAs(page, creds.email, creds.password);
    await expect(page).toHaveURL(/\/hub\/leva-e-traz\/minha-rota(?:\?|$)/, { timeout: 20_000 });

    await expectNav(page, {
      visiveis: ['Leva e Traz'],
      ocultos: ['Equipe', /^Caixa/, 'Agenda', 'Clínica', 'Banho & Tosa'],
    });

    await page.goto('/hub/dashboard');
    await expect(page).toHaveURL(/\/hub\/dashboard(?:\?|$)/);
    await expect(
      page.getByText('O dashboard financeiro requer a permissão de leitura financeira'),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto('/hub/leva-e-traz');
    await expect(page).toHaveURL(/\/hub\/leva-e-traz\/minha-rota(?:\?|$)/, { timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Nova rota' })).toHaveCount(0);
  });

  test('CSTAFF banho_tosa cai em Banho & Tosa com o menu da área', async ({ page }) => {
    const creds = hubCstaffBathCredentials();
    if (!skipIfMissing(creds, 'CSTAFF banho_tosa')) return;

    await loginAs(page, creds.email, creds.password);
    await expect(page).toHaveURL(/\/hub\/banho-tosa(?:\?|$)/, { timeout: 20_000 });

    await expectNav(page, {
      visiveis: ['Banho & Tosa', 'Agenda', 'Clientes', 'Pets'],
      ocultos: ['Leva e Traz', 'Financeiro', 'Equipe', 'Clínica'],
    });
  });

  test('CSTAFF clinica cai em Clínica com o menu da área', async ({ page }) => {
    const creds = hubCstaffClinicCredentials();
    if (!skipIfMissing(creds, 'CSTAFF clinica')) return;

    await loginAs(page, creds.email, creds.password);
    await expect(page).toHaveURL(/\/hub\/clinica(?:\?|$)/, { timeout: 20_000 });

    await expectNav(page, {
      visiveis: ['Clínica', 'Agenda', 'Clientes'],
      ocultos: ['Banho & Tosa', 'Leva e Traz', 'Financeiro'],
    });
  });

  test('CSTAFF hotel_creche cai em Hotel & Creche com o menu da área', async ({ page }) => {
    const creds = hubCstaffHotelCredentials();
    if (!skipIfMissing(creds, 'CSTAFF hotel_creche')) return;

    await loginAs(page, creds.email, creds.password);
    await expect(page).toHaveURL(/\/hub\/hotel-creche(?:\?|$)/, { timeout: 20_000 });

    await expectNav(page, {
      visiveis: ['Hotel & Creche', 'Agenda'],
      ocultos: ['Clínica', 'Banho & Tosa', 'Leva e Traz', 'Financeiro'],
    });
  });

  test('CSTAFF caixa cai no Financeiro com o menu financeiro', async ({ page }) => {
    const creds = hubCstaffCashCredentials();
    if (!skipIfMissing(creds, 'CSTAFF caixa')) return;

    await loginAs(page, creds.email, creds.password);
    await expect(page).toHaveURL(/\/hub\/financeiro(?:\?|$)/, { timeout: 20_000 });

    await expectNav(page, {
      visiveis: ['Dashboard', 'Financeiro', /^Caixa/],
      ocultos: ['Agenda', 'Clientes', 'Clínica', 'Banho & Tosa', 'Leva e Traz'],
    });
  });

  test('CSTAFF recepcao cai na Agenda com o menu de atendimento', async ({ page }) => {
    const creds = hubCstaffReceptionCredentials();
    if (!skipIfMissing(creds, 'CSTAFF recepcao')) return;

    await loginAs(page, creds.email, creds.password);
    await expect(page).toHaveURL(/\/hub\/appointments(?:\?|$)/, { timeout: 20_000 });

    await expectNav(page, {
      visiveis: ['Agenda', 'Orçamento', 'Clientes', 'Pets'],
      ocultos: ['Dashboard', 'Financeiro', /^Caixa/, 'Clínica', 'Banho & Tosa', 'Leva e Traz'],
    });
  });
});
