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

  test('forgot-password mostra o formulário', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /esqueceu a senha/i })).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /enviar link de recuperação/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /voltar ao login/i })).toBeVisible();
  });

  test('reset-password sem sessão mostra link inválido (não tela em branco)', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: /link inválido/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: /pedir novo link/i })).toBeVisible();
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

  test('perfil público inexistente mostra 404 (não tela em branco)', async ({ page }) => {
    await page.route('**/api/public/clinics/**', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Página não encontrada' }),
      });
    });
    await page.goto('/c/clinica-que-nao-existe-xyz');
    await expect(page.getByText('Página não encontrada')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/ainda não publicou|não encontrada/i)).toBeVisible();
  });

  test('perfil público habilitado renderiza landing sem dados sensíveis', async ({ page }) => {
    await page.route('**/api/public/clinics/demo-clinica**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profile: {
            slug: 'demo-clinica',
            headline: 'Cuidado completo para o seu pet',
            about: 'Clínica parceira PetMi.',
            cover_image_url: null,
            logo_url: null,
            accent_color: '#c86a4d',
            theme_preset: 'warm',
            whatsapp_phone: '11999990000',
            phone: '1133334444',
            show_phone: true,
            show_address: true,
            show_map: false,
            address: { line: 'Rua das Flores, 100', city: 'São Paulo', state: 'SP' },
            cta_label: null,
            cta_url: null,
            social_links: { instagram: 'democlinica' },
            business_hours: {
              '1': { closed: false, open: '09:00', close: '18:00' },
            },
            seo_title: 'Demo Clínica',
            seo_description: 'Landing demo',
            clinic_name: 'Demo Clínica',
          },
          services: [
            {
              id: 'svc-1',
              name: 'Consulta',
              service_group: 'clinica',
              default_duration_minutes: 30,
              blurb: 'Avaliação geral',
              price: 120,
            },
          ],
          staff: [
            {
              id: 'st-1',
              name: 'Dra. Ana',
              photo_url: null,
              job_title: 'Veterinária',
              professional_kind: 'vet',
              specialties: ['Clínica geral'],
              bio: 'Atende cães e gatos.',
            },
          ],
          units: [],
        }),
      });
    });

    await page.goto('/c/demo-clinica');
    await expect(page.getByRole('heading', { name: 'Demo Clínica' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Cuidado completo para o seu pet')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Serviços' })).toBeVisible();
    await expect(page.getByText('Consulta')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Equipe' })).toBeVisible();
    await expect(page.getByText('Dra. Ana')).toBeVisible();
    await expect(page.getByText(/CNPJ|cost_amount|crmv/i)).toHaveCount(0);
  });
});
