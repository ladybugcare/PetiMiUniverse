import { expect, type Page } from '@playwright/test';
import { QA_CLINIC_ID } from './constants';
import { hubApi } from './apiHub';
import type { SaleFixture } from './sales';
import { snapshotFromReceivable, type FinancialSnapshot } from './matrix';

export type ReceivableDetail = Record<string, unknown> & {
  lines?: Array<Record<string, unknown>>;
  product_returns?: Array<Record<string, unknown>>;
};

export async function fetchReceivableDetail(token: string, receivableId: string): Promise<ReceivableDetail> {
  const res = await hubApi<{ receivable: ReceivableDetail }>(
    token,
    `/api/hub/finance/receivables/${encodeURIComponent(receivableId)}?clinic_id=${QA_CLINIC_ID}`,
  );
  return res.receivable;
}

export async function fetchComandaBalance(
  token: string,
  comandaId: string,
): Promise<{ net_total?: number; balance_due?: number; paid_total?: number; returned_amount?: number }> {
  const res = await hubApi<{
    net_total?: number;
    balance_due?: number;
    paid_total?: number;
    returned_amount?: number;
  }>(token, `/api/hub/comandas/${encodeURIComponent(comandaId)}?clinic_id=${QA_CLINIC_ID}`);
  return res;
}

export function assertFinancialClose(
  snap: FinancialSnapshot,
  expected: {
    final?: number;
    paidLiq?: number;
    balance?: number;
    returned?: number;
    status?: string;
  },
) {
  if (expected.final != null) expect(snap.final_amount, 'final_amount').toBeCloseTo(expected.final, 2);
  if (expected.paidLiq != null) expect(snap.paid_amount, 'paid_amount líquido').toBeCloseTo(expected.paidLiq, 2);
  if (expected.balance != null) expect(snap.balance_amount, 'balance_amount').toBeCloseTo(expected.balance, 2);
  if (expected.returned != null) expect(snap.returned_amount, 'returned_amount').toBeCloseTo(expected.returned, 2);
  if (expected.status) expect(snap.status, 'status').toBe(expected.status);
}

export function pendingProductLines(detail: ReceivableDetail): string[] {
  const returns = new Set(
    (detail.product_returns ?? []).map((r) => String(r.receivable_line_id ?? r.receivable_line_id)),
  );
  return (detail.lines ?? [])
    .filter(
      (l) =>
        String(l.line_kind) === 'product' &&
        l.hub_inventory_item_id &&
        !returns.has(String(l.id)) &&
        Number(l.quantity ?? 0) > 0,
    )
    .map((l) => String(l.id));
}

export function returnedProductLines(detail: ReceivableDetail): string[] {
  return (detail.product_returns ?? []).map((r) => String(r.receivable_line_id));
}

export async function assertReceivableAndComanda(
  token: string,
  fixture: SaleFixture,
  expected: Parameters<typeof assertFinancialClose>[1],
): Promise<{ receivable: FinancialSnapshot; comandaOk: boolean }> {
  const raw = await fetchReceivableDetail(token, fixture.receivableId);
  const snap = snapshotFromReceivable(raw);
  assertFinancialClose(snap, expected);
  const comanda = await fetchComandaBalance(token, fixture.comandaId);
  const comandaOk =
    expected.final == null || comanda.net_total == null
      ? true
      : Math.abs(Number(comanda.net_total) - expected.final) <= 0.03;
  if (expected.balance != null && comanda.balance_due != null) {
    expect(comanda.balance_due, 'comanda balance_due').toBeCloseTo(expected.balance, 2);
  }
  return { receivable: snap, comandaOk };
}

/** Lê valores visíveis na ficha após reload (sanity UI). */
export async function readFinanceUiHints(page: Page): Promise<string> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  return page.locator('.hub-comanda-receivable-panel, .hub-quote-detail, main').innerText();
}