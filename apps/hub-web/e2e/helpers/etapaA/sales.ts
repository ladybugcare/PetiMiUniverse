import { randomUUID } from 'node:crypto';
import {
  QA_CLINIC_ID,
  QA_UNIT_ID,
  MATRIX_LINE_A_AMOUNT,
  MATRIX_LINE_B_AMOUNT,
  PRODUCT_NAMES,
} from './constants';
import type { QaProductCatalog } from './products';
import type { QaGuardian } from './guardian';
import { hubApi, newFixtureMarker, todayYmd } from './apiHub';

export type SaleFixture = {
  marker: string;
  comandaId: string;
  receivableId: string;
  lineAntipulgasId: string;
  lineShampooId: string;
  guardianId: string | null;
};

type ComandaDetail = {
  comanda: { id?: string };
  items: Array<{ id: string; description: string; hub_inventory_item_id?: string | null }>;
  active_receivable_ids?: string[];
};

export async function createMatrixProductSale(
  token: string,
  products: QaProductCatalog,
  opts: {
    paidAmount: number;
    guardian?: QaGuardian | null;
    twoLines?: boolean;
    marker?: string;
    cashSessionId?: string | null;
    paymentMethod?: 'pix' | 'cash';
    /** Desconto global na comanda (R$), aplicado antes do checkout. */
    discountAmount?: number;
  },
): Promise<SaleFixture> {
  const marker = opts.marker ?? newFixtureMarker('QA_ETAPA_A_SALE');
  const guardianId = opts.guardian?.id ?? null;
  const twoLines = opts.twoLines !== false;

  const opened = await hubApi<ComandaDetail>(token, '/api/hub/comandas/open', {
    method: 'POST',
    body: {
      clinic_id: QA_CLINIC_ID,
      unit_id: QA_UNIT_ID,
      origin_type: 'manual',
      origin_id: randomUUID(),
      guardian_id: guardianId,
    },
  });
  const comandaId = String(opened.comanda?.id ?? '');
  if (!comandaId) throw new Error('Comanda aberta sem id');

  const items = [
    {
      item_kind: 'product' as const,
      hub_inventory_item_id: products.antipulgas.itemId,
      hub_inventory_lot_id: products.antipulgas.lotId,
      description: PRODUCT_NAMES.antipulgas,
      quantity: 1,
      unit_amount: MATRIX_LINE_A_AMOUNT,
    },
  ];
  if (twoLines) {
    items.push({
      item_kind: 'product' as const,
      hub_inventory_item_id: products.shampoo.itemId,
      hub_inventory_lot_id: products.shampoo.lotId,
      description: PRODUCT_NAMES.shampoo,
      quantity: 1,
      unit_amount: MATRIX_LINE_B_AMOUNT,
    });
  }

  await hubApi(token, `/api/hub/comandas/${encodeURIComponent(comandaId)}/items`, {
    method: 'POST',
    body: {
      clinic_id: QA_CLINIC_ID,
      edit_context: 'financeiro',
      items,
    },
  });

  if (opts.discountAmount != null && opts.discountAmount > 0) {
    await hubApi(token, `/api/hub/comandas/${encodeURIComponent(comandaId)}`, {
      method: 'PATCH',
      body: {
        clinic_id: QA_CLINIC_ID,
        edit_context: 'financeiro',
        discount_amount: opts.discountAmount,
      },
    });
  }

  const paid = Math.max(0, Math.round(opts.paidAmount * 100) / 100);
  const method = opts.paymentMethod ?? 'pix';
  const checkoutBody: Record<string, unknown> = {
    clinic_id: QA_CLINIC_ID,
    grouping: 'all',
    action: paid > 0 ? 'receive_now' : 'leave_pending',
    payment_timing: 'on_checkout',
    due_date: paid > 0 ? undefined : todayYmd(),
  };
  if (paid > 0) {
    checkoutBody.payments = [
      {
        group_index: 0,
        amount: paid,
        payment_method: method,
        cash_session_id: method === 'cash' ? opts.cashSessionId ?? null : null,
        idempotency_key: randomUUID(),
      },
    ];
  }

  const checkout = await hubApi<{
    receivable_ids: string[];
    detail: ComandaDetail;
  }>(token, `/api/hub/comandas/${encodeURIComponent(comandaId)}/checkout`, {
    method: 'POST',
    body: checkoutBody,
  });

  const receivableId = checkout.receivable_ids?.[0];
  if (!receivableId) throw new Error('Checkout não gerou recebível');

  const rec = await hubApi<{ receivable: { lines: Array<{ id: string; description: string }> } }>(
    token,
    `/api/hub/finance/receivables/${encodeURIComponent(receivableId)}?clinic_id=${QA_CLINIC_ID}`,
  );
  const lines = rec.receivable?.lines ?? [];
  const lineAntipulgasId =
    lines.find((l) => l.description.includes(PRODUCT_NAMES.antipulgas))?.id ?? lines[0]?.id;
  const lineShampooId = lines.find((l) => l.description.includes(PRODUCT_NAMES.shampoo))?.id ?? lines[1]?.id;
  if (!lineAntipulgasId) throw new Error('Linha Antipulgas não encontrada no recebível');

  return {
    marker,
    comandaId,
    receivableId,
    lineAntipulgasId,
    lineShampooId: lineShampooId ?? lineAntipulgasId,
    guardianId,
  };
}

export async function createSingleProductSale(
  token: string,
  product: QaProductCatalog['antipulgas'] | QaProductCatalog['shampoo'],
  opts: {
    paidAmount: number;
    amount?: number;
    guardian?: QaGuardian | null;
    cashSessionId?: string | null;
    paymentMethod?: 'pix' | 'cash';
  },
): Promise<SaleFixture> {
  const amount = opts.amount ?? product.saleAmount;
  const marker = newFixtureMarker('QA_ETAPA_A_SINGLE');
  const opened = await hubApi<ComandaDetail>(token, '/api/hub/comandas/open', {
    method: 'POST',
    body: {
      clinic_id: QA_CLINIC_ID,
      unit_id: QA_UNIT_ID,
      origin_type: 'manual',
      origin_id: randomUUID(),
      guardian_id: opts.guardian?.id ?? null,
    },
  });
  const comandaId = String(opened.comanda?.id ?? '');
  await hubApi(token, `/api/hub/comandas/${encodeURIComponent(comandaId)}/items`, {
    method: 'POST',
    body: {
      clinic_id: QA_CLINIC_ID,
      edit_context: 'financeiro',
      items: [
        {
          item_kind: 'product' as const,
          hub_inventory_item_id: product.itemId,
          hub_inventory_lot_id: product.lotId,
          description: product.name,
          quantity: 1,
          unit_amount: amount,
        },
      ],
    },
  });
  const paid = Math.max(0, opts.paidAmount);
  const method = opts.paymentMethod ?? 'pix';
  const checkout = await hubApi<{ receivable_ids: string[] }>(
    token,
    `/api/hub/comandas/${encodeURIComponent(comandaId)}/checkout`,
    {
      method: 'POST',
      body: {
        clinic_id: QA_CLINIC_ID,
        grouping: 'all',
        action: paid > 0 ? 'receive_now' : 'leave_pending',
        due_date: paid > 0 ? undefined : todayYmd(),
        payments:
          paid > 0
            ? [
                {
                  group_index: 0,
                  amount: paid,
                  payment_method: method,
                  cash_session_id: method === 'cash' ? opts.cashSessionId ?? null : null,
                  idempotency_key: randomUUID(),
                },
              ]
            : undefined,
      },
    },
  );
  const receivableId = checkout.receivable_ids?.[0];
  if (!receivableId) throw new Error('Recebível ausente');
  const rec = await hubApi<{ receivable: { lines: Array<{ id: string }> } }>(
    token,
    `/api/hub/finance/receivables/${encodeURIComponent(receivableId)}?clinic_id=${QA_CLINIC_ID}`,
  );
  const lineId = rec.receivable?.lines?.[0]?.id;
  if (!lineId) throw new Error('Linha do produto ausente');
  return {
    marker,
    comandaId,
    receivableId,
    lineAntipulgasId: lineId,
    lineShampooId: lineId,
    guardianId: opts.guardian?.id ?? null,
  };
}