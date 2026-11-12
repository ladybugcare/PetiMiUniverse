import {
  canHandoffExistingReceivables,
  isSkippableLeavePendingHandoffError,
} from '../comandaFinanceHandoff';

describe('canHandoffExistingReceivables', () => {
  it('true quando itens já faturados e há saldo em recebível', () => {
    expect(
      canHandoffExistingReceivables({
        open_item_ids: [],
        active_receivable_ids: ['recv-1'],
        balance_due: 100,
      }),
    ).toBe(true);
  });

  it('false quando ainda há itens em aberto', () => {
    expect(
      canHandoffExistingReceivables({
        open_item_ids: ['item-a'],
        active_receivable_ids: [],
        balance_due: 190,
      }),
    ).toBe(false);
  });

  it('false quando saldo quitado', () => {
    expect(
      canHandoffExistingReceivables({
        open_item_ids: [],
        active_receivable_ids: ['recv-1'],
        balance_due: 0,
      }),
    ).toBe(false);
  });
});

describe('isSkippableLeavePendingHandoffError', () => {
  it('reconhece erros sem valor a faturar', () => {
    expect(isSkippableLeavePendingHandoffError('Não há itens em aberto para faturar')).toBe(true);
    expect(isSkippableLeavePendingHandoffError('Não há itens em aberto para enviar ao financeiro')).toBe(true);
    expect(isSkippableLeavePendingHandoffError('Nenhum recebível gerado (valores zerados)')).toBe(true);
  });

  it('não ignora falhas reais', () => {
    expect(isSkippableLeavePendingHandoffError('Comanda não está aberta')).toBe(false);
  });
});
