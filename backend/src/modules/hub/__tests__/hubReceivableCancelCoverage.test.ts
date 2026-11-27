import {
  isFinancialCancelWithoutReturn,
  isReissueCancel,
  isVoidSaleCancel,
  receivableBillsComandaItem,
  receivableKeepsComandaChargeable,
  receivableListableOnComanda,
  receivableResidualCountsTowardBalance,
} from '../hubReceivableCancelCoverage';

describe('hubReceivableCancelCoverage', () => {
  it('reissue (legado null) reabre itens e sai da lista ativa', () => {
    const row = { status: 'cancelled', returned_amount: 0, cancel_rebill: null };
    expect(isFinancialCancelWithoutReturn(row)).toBe(true);
    expect(isReissueCancel(row)).toBe(true);
    expect(isVoidSaleCancel(row)).toBe(false);
    expect(receivableBillsComandaItem(row)).toBe(false);
    expect(receivableListableOnComanda(row)).toBe(false);
  });

  it('void_sale mantém itens cobertos e fora da lista ativa', () => {
    const row = { status: 'cancelled', returned_amount: 0, cancel_rebill: false };
    expect(isReissueCancel(row)).toBe(false);
    expect(isVoidSaleCancel(row)).toBe(true);
    expect(receivableBillsComandaItem(row)).toBe(true);
    expect(receivableListableOnComanda(row)).toBe(false);
  });

  it('reissue explícito reabre itens', () => {
    const row = { status: 'cancelled', returned_amount: 0, cancel_rebill: true };
    expect(isReissueCancel(row)).toBe(true);
    expect(receivableBillsComandaItem(row)).toBe(false);
  });

  it('refunded não reabre itens e não gera residual', () => {
    const row = { status: 'refunded', returned_amount: 0 };
    expect(receivableBillsComandaItem(row)).toBe(true);
    expect(receivableListableOnComanda(row)).toBe(true);
    expect(receivableResidualCountsTowardBalance(row)).toBe(false);
    expect(receivableKeepsComandaChargeable(row)).toBe(false);
  });

  it('só pending/partially_paid/paid mantêm a comanda cobrável', () => {
    expect(receivableKeepsComandaChargeable({ status: 'pending' })).toBe(true);
    expect(receivableKeepsComandaChargeable({ status: 'partially_paid' })).toBe(true);
    expect(receivableKeepsComandaChargeable({ status: 'paid' })).toBe(true);
    expect(receivableKeepsComandaChargeable({ status: 'cancelled' })).toBe(false);
    expect(receivableKeepsComandaChargeable({ status: 'refunded' })).toBe(false);
  });

  it('cancelled com devolução comercial permanece cobrindo itens', () => {
    const row = { status: 'cancelled', returned_amount: 50, cancel_rebill: false };
    expect(isFinancialCancelWithoutReturn(row)).toBe(false);
    expect(receivableBillsComandaItem(row)).toBe(true);
    expect(receivableListableOnComanda(row)).toBe(true);
  });

  it('pending/paid geram residual', () => {
    expect(receivableResidualCountsTowardBalance({ status: 'pending' })).toBe(true);
    expect(receivableResidualCountsTowardBalance({ status: 'paid' })).toBe(true);
    expect(
      receivableResidualCountsTowardBalance({ status: 'cancelled', returned_amount: 0, cancel_rebill: false }),
    ).toBe(false);
  });
});
