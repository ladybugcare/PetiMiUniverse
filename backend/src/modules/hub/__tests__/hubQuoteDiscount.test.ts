import { applyQuoteDiscount, quoteDiscountAmount } from '../hubQuoteDiscount';

describe('hubQuoteDiscount', () => {
  it('sem desconto devolve o subtotal', () => {
    expect(applyQuoteDiscount(90, null, 0)).toBe(90);
    expect(quoteDiscountAmount(90, null, 0)).toBe(0);
  });

  it('percentual reduz o total e informa o valor do desconto', () => {
    expect(applyQuoteDiscount(200, 'percent', 10)).toBe(180);
    expect(quoteDiscountAmount(200, 'percent', 10)).toBe(20);
  });

  it('valor fixo reduz o total sem passar de zero', () => {
    expect(applyQuoteDiscount(90, 'fixed', 15)).toBe(75);
    expect(quoteDiscountAmount(90, 'fixed', 15)).toBe(15);
    expect(applyQuoteDiscount(10, 'fixed', 40)).toBe(0);
  });
});
