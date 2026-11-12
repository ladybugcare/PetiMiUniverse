import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canHandoffOpenComandaInBatch,
  enviarComandasAbertasAoFinanceiro,
  enviarPendentesAoFinanceiro,
  isSkippableFinanceHandoffError,
} from './caixaHandoffUtils';

vi.mock('../../api/hubFinancialApi', () => ({
  hubFinancialApi: {
    handoffPending: vi.fn(),
  },
}));

import { hubFinancialApi } from '../../api/hubFinancialApi';

const handoffPending = vi.mocked(hubFinancialApi.handoffPending);

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

describe('enviarPendentesAoFinanceiro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handoffPending.mockResolvedValue({
      handoff_count: 2,
      skipped_count: 0,
      results: [],
      errors: [],
      partial_errors: false,
    });
  });

  it('chama o endpoint único de handoff da unidade', async () => {
    const result = await enviarPendentesAoFinanceiro('clinic-1', 'unit-1');
    expect(handoffPending).toHaveBeenCalledTimes(1);
    expect(handoffPending).toHaveBeenCalledWith(
      expect.objectContaining({ clinic_id: 'clinic-1', unit_id: 'unit-1' }),
    );
    expect(result.success).toBe(true);
    expect(result.handoffCount).toBe(2);
  });

  it('ignora erros skippable retornados pelo backend', async () => {
    handoffPending.mockResolvedValueOnce({
      handoff_count: 0,
      skipped_count: 1,
      results: [],
      errors: ['47a6db27: Nenhum recebível gerado (valores zerados)'],
      partial_errors: true,
    });
    const result = await enviarPendentesAoFinanceiro('clinic-1', 'unit-1');
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reporta falhas reais', async () => {
    handoffPending.mockResolvedValueOnce({
      handoff_count: 0,
      skipped_count: 0,
      results: [],
      errors: ['f29b572f: Comanda não está aberta'],
      partial_errors: true,
    });
    const result = await enviarPendentesAoFinanceiro('clinic-1', 'unit-1');
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Comanda não está aberta');
  });
});

describe('enviarComandasAbertasAoFinanceiro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handoffPending.mockResolvedValue({
      handoff_count: 1,
      skipped_count: 0,
      results: [],
      errors: [],
      partial_errors: false,
    });
  });

  it('com unitId usa o endpoint único', async () => {
    const result = await enviarComandasAbertasAoFinanceiro(
      [openComandaRow('aaaa1111-aaaa-bbbb-cccc-dddddddddddd')],
      'clinic-1',
      'unit-1',
    );
    expect(handoffPending).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.handoffCount).toBe(1);
  });

  it('sem unitId e sem comandas elegíveis retorna sucesso vazio', async () => {
    const result = await enviarComandasAbertasAoFinanceiro(
      [openComandaRow('31a6ac51-aaaa-bbbb-cccc-dddddddddddd', { balance_due: 0, total_amount: 0 })],
      'clinic-1',
    );
    expect(result.success).toBe(true);
    expect(result.handoffCount).toBe(0);
    expect(handoffPending).not.toHaveBeenCalled();
  });

  it('sem unitId e com comandas elegíveis exige unit_id', async () => {
    const result = await enviarComandasAbertasAoFinanceiro(
      [openComandaRow('aaaa1111-aaaa-bbbb-cccc-dddddddddddd')],
      'clinic-1',
    );
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/unit_id/i);
  });
});
