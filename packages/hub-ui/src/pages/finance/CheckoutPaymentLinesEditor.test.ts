import { describe, expect, it } from 'vitest';
import {
  createDefaultPaymentLine,
  parseAmount,
  sumPaymentLines,
  totalChangeDue,
} from './CheckoutPaymentLinesEditor';

describe('CheckoutPaymentLinesEditor helpers', () => {
  it('soma linhas de pagamento', () => {
    const a = createDefaultPaymentLine('pix', 30);
    const b = createDefaultPaymentLine('credit_card', 20);
    expect(sumPaymentLines([a, b])).toBe(50);
  });

  it('calcula troco só em linhas cash com tendered', () => {
    const cash = createDefaultPaymentLine('cash', 70);
    cash.tenderedStr = '100';
    const pix = createDefaultPaymentLine('pix', 30);
    expect(totalChangeDue([cash, pix])).toBe(30);
  });

  it('parseAmount aceita vírgula BR', () => {
    expect(parseAmount('1.234,56')).toBeCloseTo(1234.56);
  });
});
