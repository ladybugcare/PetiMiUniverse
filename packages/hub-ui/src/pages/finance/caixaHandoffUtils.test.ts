import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canHandoffOpenComandaInBatch,
  enviarComandasAbertasAoFinanceiro,
  enviarPendentesAoFinanceiro,
  isSkippableFinanceHandoffError,
} from './caixaHandoffUtils';

vi.mock('../../api/hubComandaApi', () => ({
  hubComandaApi: {
    checkoutBulk: vi.fn(),
    listComandas: vi.fn(),
  },
}));

import { hubComandaApi } from '../../api/hubComandaApi';

const checkoutBulk = vi.mocked(hubComandaApi.checkoutBulk);
const listComandas = vi.mocked(hubComandaApi.listComandas);

function openComandaRow(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    status: 'aberta',
    finance_handoff_at: null,
    origin_type: 'appointment',
    total_amount: 80,
    paid_total: 0,
    balance_due: 80,
    ...extra,
  };
}

describe('isSkippableFinanceHandoffError', () => {
  it('reconhece comanda sem itens ou com valor zerado', () => {
    expect(isSkippableFinanceHandoffError('Não há itens em aberto para faturar')).toBe(true);
    expect(isSkippableFinanceHandoffError('Não há itens em aberto para enviar ao financeiro')).toBe(true);
    expect(isSkippableFinanceHandoffError('Nenhum recebível gerado (valores zerados)')).toBe(true);
  });

  it('não ignora outros erros', () => {
    expect(isSkippableFinanceHandoffError('Comanda não está aberta')).toBe(false);
  });
});

describe('canHandoffOpenComandaInBatch', () => {
  it('envia comanda com saldo em aberto', () => {
    expect(canHandoffOpenComandaInBatch(openComandaRow('c1'))).toBe(true);
  });

  it('ignora comanda zerada', () => {
    expect(
      canHandoffOpenComandaInBatch(
        openComandaRow('c1', { total_amount: 0, paid_total: 0, balance_due: 0 }),
      ),
    ).toBe(false);
  });

  it('ignora comanda já enviada ao financeiro', () => {
    expect(
      canHandoffOpenComandaInBatch(
        openComandaRow('c1', {
          finance_handoff_at: '2026-09-05T12:00:00.000Z',
          edit_scopes: { caixa: false, financeiro: true, locked_reason: 'finance_handoff' },
        }),
      ),
    ).toBe(false);
  });
});

describe('enviarComandasAbertasAoFinanceiro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkoutBulk.mockResolvedValue({
      results: [{ comanda_id: 'c1', receivable_ids: ['r1'] }],
      partial_errors: false,
    });
  });

  it('não chama checkout para comandas sem valor a faturar', async () => {
    const result = await enviarComandasAbertasAoFinanceiro(
      [openComandaRow('31a6ac51-aaaa-bbbb-cccc-dddddddddddd', { balance_due: 0, total_amount: 0 })],
      'clinic-1',
    );
    expect(result.success).toBe(true);
    expect(result.handoffCount).toBe(0);
    expect(checkoutBulk).not.toHaveBeenCalled();
  });

  it('envia em um único checkout-bulk', async () => {
    checkoutBulk.mockResolvedValueOnce({
      results: [
        { comanda_id: 'aaaa1111-aaaa-bbbb-cccc-dddddddddddd', receivable_ids: ['r1'] },
        { comanda_id: 'bbbb2222-aaaa-bbbb-cccc-dddddddddddd', receivable_ids: ['r2'] },
      ],
      partial_errors: false,
    });
    const result = await enviarComandasAbertasAoFinanceiro(
      [
        openComandaRow('aaaa1111-aaaa-bbbb-cccc-dddddddddddd'),
        openComandaRow('bbbb2222-aaaa-bbbb-cccc-dddddddddddd', { balance_due: 50, total_amount: 50 }),
      ],
      'clinic-1',
    );
    expect(checkoutBulk).toHaveBeenCalledTimes(1);
    expect(checkoutBulk.mock.calls[0][0].comanda_ids).toHaveLength(2);
    expect(result.success).toBe(true);
    expect(result.handoffCount).toBe(2);
  });

  it('ignora valores zerados retornados pelo backend', async () => {
    checkoutBulk.mockResolvedValueOnce({
      results: [
        { comanda_id: '47a6db27-aaaa-bbbb-cccc-dddddddddddd', receivable_ids: [], error: 'Nenhum recebível gerado (valores zerados)' },
      ],
      partial_errors: true,
    });
    const result = await enviarComandasAbertasAoFinanceiro(
      [openComandaRow('47a6db27-aaaa-bbbb-cccc-dddddddddddd')],
      'clinic-1',
    );
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reporta falhas reais', async () => {
    checkoutBulk.mockResolvedValueOnce({
      results: [
        { comanda_id: 'f29b572f-aaaa-bbbb-cccc-dddddddddddd', receivable_ids: [], error: 'Comanda não está aberta' },
      ],
      partial_errors: true,
    });
    const result = await enviarComandasAbertasAoFinanceiro(
      [openComandaRow('f29b572f-aaaa-bbbb-cccc-dddddddddddd')],
      'clinic-1',
    );
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Comanda não está aberta');
  });
});

describe('enviarPendentesAoFinanceiro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listComandas.mockResolvedValue({ comandas: [openComandaRow('cccc3333-aaaa-bbbb-cccc-dddddddddddd')] });
    checkoutBulk.mockResolvedValue({
      results: [{ comanda_id: 'cccc3333-aaaa-bbbb-cccc-dddddddddddd', receivable_ids: ['r1'] }],
      partial_errors: false,
    });
  });

  it('lista comandas abertas e envia em lote, sem fila de sem cobrança', async () => {
    const result = await enviarPendentesAoFinanceiro('clinic-1', 'unit-1');
    expect(listComandas).toHaveBeenCalledWith(
      expect.objectContaining({ clinic_id: 'clinic-1', unit_id: 'unit-1', status: 'aberta' }),
    );
    expect(checkoutBulk).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.handoffCount).toBe(1);
  });
});
