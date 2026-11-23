import { computeStockReturnStatus, isProductStockLine } from '../hubProductReturnStatus';

describe('hubProductReturnStatus', () => {
  it('isProductStockLine exige produto com item, lote e qty', () => {
    expect(
      isProductStockLine({
        line_kind: 'product',
        hub_inventory_item_id: 'i',
        hub_inventory_lot_id: 'l',
        quantity: 1,
      }),
    ).toBe(true);
    expect(isProductStockLine({ line_kind: 'manual', quantity: 1 })).toBe(false);
  });

  it('venda aberta sem eventos → null', () => {
    expect(
      computeStockReturnStatus({
        productLineIds: ['a'],
        returns: [],
        receivableStatus: 'paid',
      }),
    ).toBeNull();
  });

  it('cancelado/estornado sem eventos → pending', () => {
    expect(
      computeStockReturnStatus({
        productLineIds: ['a'],
        returns: [],
        receivableStatus: 'refunded',
      }),
    ).toBe('pending');
    expect(
      computeStockReturnStatus({
        productLineIds: ['a'],
        returns: [],
        receivableStatus: 'cancelled',
      }),
    ).toBe('pending');
  });

  it('todos sellable → returned; todos unsellable → unsellable; misto → mixed', () => {
    expect(
      computeStockReturnStatus({
        productLineIds: ['a', 'b'],
        returns: [
          { receivable_line_id: 'a', condition: 'sellable' },
          { receivable_line_id: 'b', condition: 'sellable' },
        ],
      }),
    ).toBe('returned');
    expect(
      computeStockReturnStatus({
        productLineIds: ['a'],
        returns: [{ receivable_line_id: 'a', condition: 'unsellable' }],
      }),
    ).toBe('unsellable');
    expect(
      computeStockReturnStatus({
        productLineIds: ['a', 'b'],
        returns: [
          { receivable_line_id: 'a', condition: 'sellable' },
          { receivable_line_id: 'b', condition: 'unsellable' },
        ],
      }),
    ).toBe('mixed');
  });

  it('cobertura incompleta → partial', () => {
    expect(
      computeStockReturnStatus({
        productLineIds: ['a', 'b'],
        returns: [{ receivable_line_id: 'a', condition: 'sellable' }],
        receivableStatus: 'refunded',
      }),
    ).toBe('partial');
  });
});
