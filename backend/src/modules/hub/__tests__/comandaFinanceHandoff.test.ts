import { canHandoffExistingReceivables } from '../comandaFinanceHandoff';

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
