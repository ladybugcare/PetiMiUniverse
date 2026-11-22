import { describe, expect, it } from 'vitest';
import { validateProductSalePricing } from '../productSalePriceRules';

const baseItem = {
  id: 'item-1',
  name: 'Ração Premium',
  sale_amount: 100,
  max_sale_discount_pct: 10,
  allow_price_override_on_sale: false,
};

describe('validateProductSalePricing', () => {
  it('aceita preço de catálogo sem desconto', () => {
    const r = validateProductSalePricing({
      item: baseItem,
      quantity: 2,
      unit_amount: 100,
      discount_amount: 0,
    });
    expect(r).toEqual({ ok: true });
  });

  it('bloqueia alteração de preço quando override está desligado', () => {
    const r = validateProductSalePricing({
      item: baseItem,
      quantity: 1,
      unit_amount: 90,
      discount_amount: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/não pode ser alterado/i);
  });

  it('permite preço diferente quando override está ligado', () => {
    const r = validateProductSalePricing({
      item: { ...baseItem, allow_price_override_on_sale: true },
      quantity: 1,
      unit_amount: 85,
      discount_amount: 0,
    });
    expect(r).toEqual({ ok: true });
  });

  it('bloqueia desconto acima do máximo percentual', () => {
    const r = validateProductSalePricing({
      item: baseItem,
      quantity: 1,
      unit_amount: 100,
      discount_amount: 15,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/excede o máximo/i);
  });

  it('aceita desconto no limite', () => {
    const r = validateProductSalePricing({
      item: baseItem,
      quantity: 1,
      unit_amount: 100,
      discount_amount: 10,
    });
    expect(r).toEqual({ ok: true });
  });
});
