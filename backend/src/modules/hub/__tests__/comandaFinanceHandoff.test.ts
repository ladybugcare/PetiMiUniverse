import {
  canHandoffExistingReceivables,
  computeBalanceDueFromParts,
  formatHandoffResultForNotes,
  isSkippableLeavePendingHandoffCode,
  isSkippableLeavePendingHandoffError,
  openLinesHeaderDiscount,
} from '../comandaFinanceHandoff';

describe('openLinesHeaderDiscount / computeBalanceDueFromParts', () => {
  it('Banho 80 + Hidratação 25 − desconto fixo 10 → saldo 95', () => {
    expect(
      computeBalanceDueFromParts({
        openLinesTotal: 105,
        allLinesTotal: 105,
        headerDiscount: 10,
        openItemsCount: 2,
        allItemsCount: 2,
        receivableResidual: 0,
      }),
    ).toBe(95);
  });

  it('orçamento sem desconto mantém saldo = soma das linhas', () => {
    expect(
      computeBalanceDueFromParts({
        openLinesTotal: 105,
        allLinesTotal: 105,
        headerDiscount: 0,
        openItemsCount: 2,
        allItemsCount: 2,
        receivableResidual: 0,
      }),
    ).toBe(105);
  });

  it('pagamento parcial: residual do recebível parte do líquido 95', () => {
    expect(
      computeBalanceDueFromParts({
        openLinesTotal: 0,
        allLinesTotal: 105,
        headerDiscount: 10,
        openItemsCount: 0,
        allItemsCount: 2,
        receivableResidual: 45,
      }),
    ).toBe(45);
  });

  it('rateia desconto quando só parte das linhas permanece aberta', () => {
    expect(
      openLinesHeaderDiscount({
        openLinesTotal: 25,
        allLinesTotal: 105,
        headerDiscount: 10,
        openItemsCount: 1,
        allItemsCount: 2,
      }),
    ).toBe(2.38);
    expect(
      computeBalanceDueFromParts({
        openLinesTotal: 25,
        allLinesTotal: 105,
        headerDiscount: 10,
        openItemsCount: 1,
        allItemsCount: 2,
        receivableResidual: 70,
      }),
    ).toBe(92.62);
  });
});

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
    expect(isSkippableLeavePendingHandoffError('Operação ainda não concluída — sincronize')).toBe(true);
  });

  it('não ignora falhas reais', () => {
    expect(isSkippableLeavePendingHandoffError('Comanda não está aberta')).toBe(false);
  });
});

describe('isSkippableLeavePendingHandoffCode / formatHandoffResultForNotes', () => {
  it('classifica códigos de conferência como skippáveis', () => {
    expect(isSkippableLeavePendingHandoffCode('OPERATIONAL_NOT_READY')).toBe(true);
    expect(isSkippableLeavePendingHandoffCode('SYNC_NOT_READY')).toBe(true);
    expect(isSkippableLeavePendingHandoffCode('NO_OPEN_ITEMS')).toBe(true);
    expect(isSkippableLeavePendingHandoffCode('COMMISSION_EXECUTOR_REQUIRED')).toBe(false);
  });

  it('formata notes com id curto + código', () => {
    expect(
      formatHandoffResultForNotes({
        comandaId: 'abcdef12-3456-7890',
        code: 'OPERATIONAL_NOT_READY',
        error: 'Operação ainda não concluída',
      }),
    ).toBe('abcdef12:OPERATIONAL_NOT_READY:Operação ainda não concluída');
  });
});
