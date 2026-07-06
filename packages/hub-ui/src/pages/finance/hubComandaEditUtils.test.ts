import { describe, expect, it } from 'vitest';
import type { HubComandaDetailResponse } from '../../api/hubComandaApi';
import type { HubFinanceDayBoardItem } from '../../api/hubFinancialApi';
import {
  canSendToFinanceiroHandoff,
  resolveComandaCheckoutCTA,
  resolveDayBoardCheckoutLabel,
  resolveSendToFinanceiroConfirmMessage,
} from './hubComandaEditUtils';

function comandaInput(
  partial: Partial<Pick<HubComandaDetailResponse, 'open_item_ids' | 'active_receivable_ids' | 'balance_due' | 'edit_scopes'>>,
): Pick<HubComandaDetailResponse, 'open_item_ids' | 'active_receivable_ids' | 'balance_due' | 'edit_scopes'> {
  return {
    open_item_ids: [],
    active_receivable_ids: [],
    balance_due: 0,
    edit_scopes: { caixa: true, financeiro: true, locked_reason: null },
    ...partial,
  };
}

function dayBoardItem(partial: Partial<HubFinanceDayBoardItem['billing']>): HubFinanceDayBoardItem {
  return {
    origin_type: 'appointment',
    origin_id: 'appt-1',
    origin_label: 'Consulta',
    starts_at: null,
    guardian_id: null,
    guardian: null,
    pet_id: null,
    pet: null,
    operational_status: 'done',
    estimated_amount: 100,
    services: [],
    billing: {
      comanda_id: 'cmd-1',
      comanda_status: 'aberta',
      has_receivable: false,
      receivable_status: null,
      ...partial,
    },
  };
}

describe('resolveComandaCheckoutCTA', () => {
  it('financeiro com itens em aberto abre drawer de faturamento', () => {
    expect(
      resolveComandaCheckoutCTA(
        'financeiro',
        comandaInput({ open_item_ids: ['item-a'], balance_due: 50 }),
      ),
    ).toEqual({ kind: 'checkout_drawer', label: 'Faturar itens' });
  });

  it('financeiro só com recebível pendente abre drawer de cobrança', () => {
    expect(
      resolveComandaCheckoutCTA(
        'financeiro',
        comandaInput({
          open_item_ids: [],
          active_receivable_ids: ['recv-1'],
          balance_due: 80,
        }),
      ),
    ).toEqual({ kind: 'receivable_drawer', label: 'Registrar pagamento' });
  });

  it('financeiro com recebível quitado abre drawer Ver cobrança', () => {
    expect(
      resolveComandaCheckoutCTA(
        'financeiro',
        comandaInput({
          open_item_ids: [],
          active_receivable_ids: ['recv-1'],
          balance_due: 0,
        }),
      ),
    ).toEqual({ kind: 'receivable_drawer', label: 'Ver cobrança' });
  });

  it('caixa com saldo abre drawer Cobrar', () => {
    expect(
      resolveComandaCheckoutCTA('caixa', comandaInput({ balance_due: 120 })),
    ).toEqual({ kind: 'checkout_drawer', label: 'Cobrar' });
  });

  it('financeiro quitada não exibe CTA', () => {
    expect(
      resolveComandaCheckoutCTA(
        'financeiro',
        comandaInput({ balance_due: 0, open_item_ids: [], active_receivable_ids: [] }),
      ),
    ).toEqual({ kind: 'none' });
  });

  it('respeita edit_scopes.financeiro', () => {
    expect(
      resolveComandaCheckoutCTA(
        'financeiro',
        comandaInput({
          open_item_ids: ['item-a'],
          balance_due: 50,
          edit_scopes: { caixa: false, financeiro: false, locked_reason: 'paid_and_complete' },
        }),
      ),
    ).toEqual({ kind: 'none' });
  });
});

describe('resolveDayBoardCheckoutLabel', () => {
  it('financeiro com recebível pendente usa Registrar pagamento', () => {
    expect(
      resolveDayBoardCheckoutLabel(
        'financeiro',
        dayBoardItem({
          has_receivable: true,
          receivable_status: 'pending',
          active_receivable_id: 'recv-1',
        }),
      ),
    ).toBe('Registrar pagamento');
  });

  it('financeiro sem recebível usa Faturar itens', () => {
    expect(resolveDayBoardCheckoutLabel('financeiro', dayBoardItem({ has_receivable: false }))).toBe(
      'Faturar itens',
    );
  });

  it('caixa usa Receber', () => {
    expect(resolveDayBoardCheckoutLabel('caixa', dayBoardItem({ has_receivable: false }))).toBe('Receber');
  });
});

describe('canSendToFinanceiroHandoff', () => {
  it('permite handoff com saldo em recebível parcial', () => {
    expect(
      canSendToFinanceiroHandoff({
        open_item_ids: [],
        active_receivable_ids: ['recv-1'],
        balance_due: 100,
        finance_handoff_at: null,
      }),
    ).toBe(true);
  });

  it('bloqueia após finance_handoff_at', () => {
    expect(
      canSendToFinanceiroHandoff({
        open_item_ids: [],
        active_receivable_ids: ['recv-1'],
        balance_due: 100,
        finance_handoff_at: '2026-07-06T12:00:00.000Z',
      }),
    ).toBe(false);
  });
});

describe('resolveSendToFinanceiroConfirmMessage', () => {
  it('mensagem específica para saldo restante após parcial', () => {
    expect(
      resolveSendToFinanceiroConfirmMessage({
        open_item_ids: [],
        active_receivable_ids: ['recv-1'],
        balance_due: 100,
      }),
    ).toContain('saldo restante');
  });

  it('mensagem padrão com itens em aberto', () => {
    expect(
      resolveSendToFinanceiroConfirmMessage({
        open_item_ids: ['item-a'],
        active_receivable_ids: [],
        balance_due: 190,
      }),
    ).toContain('recebíveis pendentes');
  });
});
