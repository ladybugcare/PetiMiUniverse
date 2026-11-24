import { expect, type Page } from '@playwright/test';
import { receivableDrawer } from './returnUi';

export type ReverseMode = 'payment_reversal' | 'refund';

/**
 * Abre o formulário "Estornar pagamento" do primeiro pagamento posted na cobrança.
 */
export async function openPaymentReverseForm(page: Page) {
  const drawer = receivableDrawer(page);
  const btn = drawer.getByRole('button', { name: /Estornar pagamento/i }).first();
  await expect(btn).toBeVisible({ timeout: 45_000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await expect(drawer.getByText(/Tipo de estorno|Estornar pagamento/i).first()).toBeVisible({
    timeout: 20_000,
  });
}

export async function uiReversePayment(
  page: Page,
  opts: {
    mode: ReverseMode;
    reason: string;
    /** Em modo refund: não marcar devolução física. */
    withoutPhysicalReturn?: boolean;
    refundMethod?: 'pix' | 'cash' | 'customer_credit';
    expectBlocked?: boolean;
    screenshotLabel?: string;
  },
) {
  const drawer = receivableDrawer(page);
  await openPaymentReverseForm(page);

  // Aguarda linhas de produto (o form pode pré-selecionar "reembolso").
  await page.waitForTimeout(800);
  const modeLabel =
    opts.mode === 'payment_reversal' ? /Anular lançamento/i : /Reembolso efetivo/i;
  const modeBtn = drawer.getByRole('button', { name: modeLabel }).first();
  await expect(modeBtn).toBeVisible({ timeout: 15_000 });
  await modeBtn.click();
  // Reafirma o modo (efeito async pode reverter para reembolso ao carregar mercadoria).
  await page.waitForTimeout(400);
  await modeBtn.click();

  if (opts.mode === 'refund') {
    const refundCombo = drawer.locator('#recv-rev-refund-method');
    if (await refundCombo.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await refundCombo.click();
      const method = opts.refundMethod ?? 'pix';
      const label =
        method === 'customer_credit'
          ? /Crédito do tutor/i
          : method === 'cash'
            ? /Dinheiro|cash/i
            : /pix/i;
      const opt = page.getByRole('option', { name: label });
      if (await opt.isVisible({ timeout: 3_000 }).catch(() => false)) await opt.click();
    }
    if (opts.withoutPhysicalReturn) {
      const merchCb = drawer.getByRole('checkbox', { name: /A mercadoria foi devolvida/i });
      if (await merchCb.isVisible({ timeout: 3_000 }).catch(() => false)) {
        if (await merchCb.isChecked()) {
          await drawer.locator('label.hub-checkbox').filter({ hasText: /A mercadoria foi devolvida/i }).click();
        }
      }
    }
  }

  await drawer.locator('#recv-rev-reason').fill(opts.reason);

  const confirmName =
    opts.mode === 'payment_reversal'
      ? /Confirmar anulação/i
      : /Confirmar reembolso/i;
  const confirm = drawer.getByRole('button', { name: confirmName });
  await expect(confirm).toBeVisible({ timeout: 15_000 });

  if (opts.expectBlocked) {
    // Tenta confirmar e espera erro/bloqueio (toast ou botão permanece).
    if (await confirm.isEnabled().catch(() => false)) {
      await confirm.click();
      const blocked = await page
        .getByText(/não é possível|bloquead|excede|teto|já devolvido|saldo insuficiente|erro/i)
        .first()
        .isVisible({ timeout: 20_000 })
        .catch(() => false);
      expect(blocked, 'esperava bloqueio do estorno integral').toBe(true);
    }
    if (opts.screenshotLabel) {
      await page.screenshot({ path: `/tmp/etapa_a_${opts.screenshotLabel}.png`, fullPage: true });
    }
    return;
  }

  await expect(confirm).toBeEnabled({ timeout: 15_000 });
  await confirm.click();
  const toastOk = await page
    .getByText(/Lançamento anulado|Reembolso registrado|Devolução registrada|Salvando/i)
    .first()
    .isVisible({ timeout: 15_000 })
    .catch(() => false);
  // Toast pode sumir no remount — formulário de estorno fechando também indica sucesso.
  await expect
    .poll(
      async () => {
        if (toastOk) return true;
        if (
          await page
            .getByText(/Lançamento anulado|Reembolso registrado|Devolução registrada/i)
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          return true;
        }
        // Form de estorno sumiu e drawer ainda mostra cobrança.
        const formGone = !(await drawer.locator('#recv-rev-reason').isVisible().catch(() => false));
        return formGone;
      },
      { timeout: 60_000 },
    )
    .toBe(true);

  if (opts.screenshotLabel) {
    await page.screenshot({ path: `/tmp/etapa_a_${opts.screenshotLabel}.png`, fullPage: true });
  }
}

/** Cancela o recebível pela aba Cancelar, sem marcar devolução física. */
export async function uiCancelReceivableWithoutPhysicalReturn(
  page: Page,
  reason: string,
  screenshotLabel?: string,
) {
  const drawer = receivableDrawer(page);
  const cancelTab = drawer.getByRole('tab', { name: /^Cancelar$/i });
  await expect(cancelTab).toBeVisible({ timeout: 20_000 });
  await cancelTab.click();

  const reasonField = drawer.getByRole('textbox', { name: /Motivo do cancelamento/i });
  await expect(reasonField).toBeVisible({ timeout: 15_000 });
  await reasonField.fill(reason);

  // Garantir que devolução física NÃO está marcada.
  const merchCb = drawer.getByRole('checkbox', { name: /A mercadoria foi devolvida/i });
  if (await merchCb.isVisible({ timeout: 3_000 }).catch(() => false)) {
    if (await merchCb.isChecked()) {
      await drawer.locator('label.hub-checkbox').filter({ hasText: /A mercadoria foi devolvida/i }).click();
    }
  }

  const confirm = drawer.getByRole('button', { name: /^Confirmar$/i }).last();
  await expect(confirm).toBeEnabled({ timeout: 15_000 });
  await confirm.click();
  await expect
    .poll(
      async () => {
        if (
          await page
            .getByText(/Recebível cancelado|cancelad/i)
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          return true;
        }
        // Status no drawer
        return drawer.getByText(/Cancelad/i).first().isVisible().catch(() => false);
      },
      { timeout: 60_000 },
    )
    .toBe(true);

  if (screenshotLabel) {
    await page.screenshot({ path: `/tmp/etapa_a_${screenshotLabel}.png`, fullPage: true });
  }
}

/** Registra pagamento no drawer (saldo > 0). */
export async function uiRegisterPaymentOnReceivable(page: Page, amountHint?: number) {
  const drawer = receivableDrawer(page);
  const receiveTab = drawer.getByRole('tab', { name: /Receber agora/i });
  if (await receiveTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await receiveTab.click();
  }
  if (amountHint != null) {
    const amountInput = drawer.locator('input[inputmode="decimal"]').first();
    if (await amountInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await amountInput.fill(String(amountHint).replace('.', ','));
    }
  }
  const confirm = drawer.getByRole('button', { name: /^Confirmar$/i }).last();
  await expect(confirm).toBeEnabled({ timeout: 15_000 });
  await confirm.click();
  await expect(page.getByText(/Pagamento registrado|quitad|Pago/i).first()).toBeVisible({
    timeout: 60_000,
  });
}
