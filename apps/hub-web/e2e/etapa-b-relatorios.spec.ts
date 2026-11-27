/**
 * Etapa B — smoke UI dos relatórios prioritários (labels + totalizadores).
 * Pressupõe Hub autenticável e unidade selecionável (mesmo env da Etapa A).
 */
import { expect, test } from '@playwright/test';
import { ensureEtapaAEnv, qaStagingPassword } from './helpers/etapaA/config';
import { loginQaFinance } from './helpers/etapaA/returnUi';
import { attachVercelProtectionBypass } from './helpers/etapaA/vercelProtection';

ensureEtapaAEnv();

const REPORTS = [
  { id: 'product-sales', expectText: /Receita líquida|Data da cobrança/i },
  { id: 'movement-by-sector', expectText: /Receita líquida|Data da cobrança/i },
  { id: 'commissions', expectText: /Comissão estimada/i },
  { id: 'sales-adjustments', expectText: /Cobranças geradas|Acertos financeiros/i },
  { id: 'finance-overview', expectText: /Recebido bruto|Ticket histórico/i },
] as const;

test.describe('Etapa B — relatórios (smoke UI)', () => {
  test.beforeEach(async ({ page, context }) => {
    const pw = qaStagingPassword();
    test.skip(!pw, 'QA_STAGING_PASSWORD ausente');
    await attachVercelProtectionBypass(context);
    await loginQaFinance(page, pw);
  });

  for (const report of REPORTS) {
    test(`abre ${report.id} com labels Etapa B`, async ({ page }) => {
      await page.goto(`/hub/relatorios?relatorio=${report.id}`);
      await expect(page.getByText(report.expectText).first()).toBeVisible({ timeout: 45_000 });
    });
  }
});
