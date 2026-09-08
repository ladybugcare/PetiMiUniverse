import {
  crossedNearlyEmptyThreshold,
  isNearlyEmptyLotBalance,
  stockQtyFromConsumption,
} from '../hubInventoryContentUtils';

describe('hubInventoryContentUtils', () => {
  it('stockQtyFromConsumption converte ml para frasco', () => {
    expect(stockQtyFromConsumption(2, 10)).toBe(0.2);
    expect(stockQtyFromConsumption(1, null)).toBe(1);
  });

  it('isNearlyEmptyLotBalance só com conteúdo e resto < 20%', () => {
    expect(isNearlyEmptyLotBalance(0.15, true)).toBe(true);
    expect(isNearlyEmptyLotBalance(3.15, true)).toBe(false);
    expect(isNearlyEmptyLotBalance(0.15, false)).toBe(false);
    expect(isNearlyEmptyLotBalance(0, true)).toBe(false);
  });

  it('crossedNearlyEmptyThreshold só na travessia', () => {
    expect(crossedNearlyEmptyThreshold(0.25, 0.15, true)).toBe(true);
    expect(crossedNearlyEmptyThreshold(0.15, 0.1, true)).toBe(false);
    expect(crossedNearlyEmptyThreshold(1, 0.5, true)).toBe(false);
    expect(crossedNearlyEmptyThreshold(0.25, 0, true)).toBe(false);
  });
});
