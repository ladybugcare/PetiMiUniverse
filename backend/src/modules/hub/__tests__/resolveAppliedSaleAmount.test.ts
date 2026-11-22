import { resolveAppliedSaleAmount } from '../hubPricingResolve';

describe('resolveAppliedSaleAmount', () => {
  it('usa o snapshot quando está preenchido', () => {
    expect(resolveAppliedSaleAmount(75, 60)).toBe(75);
  });

  it('mantém zero explícito (cobertura/cortesia)', () => {
    expect(resolveAppliedSaleAmount(0, 60)).toBe(0);
  });

  it('cai no catálogo quando o snapshot é null', () => {
    expect(resolveAppliedSaleAmount(null, 60)).toBe(60);
  });

  it('cai no catálogo quando o snapshot é undefined', () => {
    expect(resolveAppliedSaleAmount(undefined, 45.5)).toBe(45.5);
  });

  it('retorna 0 se snapshot e catálogo estão ausentes', () => {
    expect(resolveAppliedSaleAmount(null, null)).toBe(0);
    expect(resolveAppliedSaleAmount(undefined, undefined)).toBe(0);
  });
});
