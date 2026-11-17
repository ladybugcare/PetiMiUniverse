import { describe, expect, it } from 'vitest';
import type { HubComandaDetailResponse } from '../../api/hubComandaApi';
import type { BatchChargeItem } from './batchChargeItems';
import {
  API_TIMEOUT_MESSAGE,
  buildBulkReconcileResult,
  checkoutBulkTimeoutMs,
  classifyComandaSettlement,
  filterIdempotencyKeysForRetry,
  isApiTimeoutError,
} from './batchChargeReconcile';

function detail(
  partial: Partial<HubComandaDetailResponse> & {
    status?: string;
  },
): HubComandaDetailResponse {
  return {
    comanda: { status: partial.status ?? 'aberta' },
    items: [],
    open_item_ids: partial.open_item_ids ?? [],
    invoiced_item_ids: [],
    paid_total: partial.paid_total ?? 0,
    balance_due: partial.balance_due ?? 0,
    ...partial,
  };
}

function item(id: string, comandaId: string, title: string): BatchChargeItem {
  return {
    kind: 'comanda',
    id,
    comandaId,
    receivableId: null,
    title,
    amount: 50,
    dueDate: null,
    tone: 'ok',
    petLabel: '',
    guardianId: 'g1',
  };
}

describe('isApiTimeoutError', () => {
  it('reconhece a mensagem padrão do web-core', () => {
    expect(isApiTimeoutError(new Error(API_TIMEOUT_MESSAGE))).toBe(true);
  });

  it('reconhece AbortError', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(isApiTimeoutError(err)).toBe(true);
  });

  it('não marca erro de negócio', () => {
    expect(isApiTimeoutError(new Error('Comanda fechada (já quitada ou encerrada)'))).toBe(false);
  });
});

describe('checkoutBulkTimeoutMs', () => {
  it('cresce com o tamanho do lote e respeita o teto', () => {
    expect(checkoutBulkTimeoutMs(1)).toBe(70_000);
    expect(checkoutBulkTimeoutMs(4)).toBe(160_000);
    expect(checkoutBulkTimeoutMs(20)).toBe(180_000);
  });
});

describe('classifyComandaSettlement', () => {
  it('exige evidência de pagamento para settled', () => {
    expect(classifyComandaSettlement(detail({ status: 'fechada', paid_total: 80, balance_due: 0 })).settlement).toBe(
      'settled',
    );
    expect(classifyComandaSettlement(detail({ status: 'fechada', paid_total: 0, balance_due: 0 })).settlement).toBe(
      'blocked',
    );
  });

  it('comanda aberta com saldo permanece retryable', () => {
    expect(
      classifyComandaSettlement(detail({ status: 'aberta', paid_total: 0, balance_due: 100, open_item_ids: ['i1'] }))
        .settlement,
    ).toBe('retryable');
  });
});

describe('buildBulkReconcileResult', () => {
  it('separa quitadas, elegíveis e bloqueadas', () => {
    const items = [item('a', 'c1', 'Banho'), item('b', 'c2', 'Consulta'), item('c', 'c3', 'L&T')];
    const result = buildBulkReconcileResult(items, {
      c1: detail({ status: 'fechada', paid_total: 80, balance_due: 0 }),
      c2: detail({ status: 'aberta', paid_total: 0, balance_due: 100, open_item_ids: ['x'] }),
      c3: detail({ status: 'fechada', paid_total: 0, balance_due: 0 }),
    });
    expect(result.settledIds).toEqual(['a']);
    expect(result.retryableComandaIds).toEqual(['c2']);
    expect(result.blocked.map((r) => r.comandaId)).toEqual(['c3']);
  });
});

describe('filterIdempotencyKeysForRetry', () => {
  it('mantém só chaves das comandas ainda elegíveis', () => {
    expect(
      filterIdempotencyKeysForRetry(
        { c1: 'k1', c2: 'k2', c3: 'k3' },
        ['c2', 'c3'],
      ),
    ).toEqual({ c2: 'k2', c3: 'k3' });
  });
});
