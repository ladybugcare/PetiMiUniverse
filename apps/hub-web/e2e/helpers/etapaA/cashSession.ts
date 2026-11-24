import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { QA_CLINIC_ID, QA_UNIT_ID } from './constants';
import { hubApi } from './apiHub';
import { QA_USERS } from './constants';
import { loginAs } from '../auth';
import { qaStagingPassword } from './config';

type CashSession = { id: string; status: string };

export async function ensureOpenCashSessionApi(token: string): Promise<string | null> {
  const st = await hubApi<{ cash_session: CashSession | null }>(
    token,
    `/api/hub/finance/cash-sessions/status?clinic_id=${QA_CLINIC_ID}&unit_id=${QA_UNIT_ID}`,
  );
  if (st.cash_session?.status === 'open' && st.cash_session.id) return st.cash_session.id;

  try {
    const opened = await hubApi<{ cash_session: CashSession }>(token, '/api/hub/finance/cash-sessions/open', {
      method: 'POST',
      body: {
        clinic_id: QA_CLINIC_ID,
        unit_id: QA_UNIT_ID,
        opening_balance: 100,
      },
    });
    return opened.cash_session?.id ?? null;
  } catch (e) {
    const msg = String((e as Error).message || e);
    if (/Já existe caixa aberto/i.test(msg)) {
      const again = await hubApi<{ cash_session: CashSession | null }>(
        token,
        `/api/hub/finance/cash-sessions/status?clinic_id=${QA_CLINIC_ID}&unit_id=${QA_UNIT_ID}`,
      );
      return again.cash_session?.id ?? null;
    }
    throw e;
  }
}

/** Abre caixa pela UI (CASSISTANT) quando o fluxo precisa de sessão visível no balcão. */
export async function ensureOpenCashSessionUi(page: Page): Promise<void> {
  const pw = qaStagingPassword();
  await loginAs(page, QA_USERS.CASSISTANT, pw);
  await page.goto('/hub/caixa');
  await expect(page.getByRole('heading', { name: 'Caixa' })).toBeVisible({ timeout: 45_000 });
  const encerrar = page.getByRole('button', { name: 'Encerrar turno' });
  const abrir = page.getByRole('button', { name: 'Abrir caixa' });
  if (await encerrar.isVisible({ timeout: 10_000 }).catch(() => false)) return;
  if (await abrir.isVisible().catch(() => false)) {
    const saldo = page.getByLabel(/Saldo inicial/i);
    if (await saldo.isVisible().catch(() => false)) await saldo.fill('100');
    await abrir.click();
    await expect(encerrar.or(page.getByText(/Já existe caixa aberto/i))).toBeVisible({ timeout: 45_000 });
  }
}

export async function closeCashSessionApi(
  token: string,
  sessionId: string,
  closingBalance: number,
): Promise<void> {
  await hubApi(token, `/api/hub/finance/cash-sessions/${encodeURIComponent(sessionId)}/close`, {
    method: 'POST',
    body: {
      clinic_id: QA_CLINIC_ID,
      closing_balance: closingBalance,
      notes: 'QA Etapa A — fechamento Playwright',
    },
  });
}

export async function fetchCashSessionDetail(
  token: string,
  sessionId: string,
): Promise<Record<string, unknown>> {
  return hubApi(
    token,
    `/api/hub/finance/cash-sessions/${encodeURIComponent(sessionId)}?clinic_id=${QA_CLINIC_ID}`,
  );
}