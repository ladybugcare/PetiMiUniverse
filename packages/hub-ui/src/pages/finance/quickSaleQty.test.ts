import { describe, expect, it } from 'vitest';
import { normalizeProductQtyInput } from './quickSaleQty';

describe('normalizeProductQtyInput', () => {
  it('rejeita texto não numérico', () => {
    expect(normalizeProductQtyInput('abc', 15, false).invalid).toBe(true);
  });

  it('rejeita fração quando o item não é fracionável', () => {
    expect(normalizeProductQtyInput('2,5', 15, false).invalid).toBe(true);
  });

  it('aceita fração quando allowFractional', () => {
    expect(normalizeProductQtyInput('2,5', 15, true)).toEqual({
      quantity: '2.5',
      capped: false,
      invalid: false,
    });
  });

  it('capa no estoque do lote', () => {
    expect(normalizeProductQtyInput('999', 15, false)).toEqual({
      quantity: '15',
      capped: true,
      invalid: false,
    });
  });
});
