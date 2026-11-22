import { describe, expect, it } from 'vitest';
import {
  createDefaultPaymentLine,
  parseAmount,
  sumPaymentLines,
  totalCardFeeEstimate,
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

  it('estima taxa da maquininha por método e parcelas', () => {
    const credit = createDefaultPaymentLine('credit_card', 100);
    credit.installments = 3;
    const debit = createDefaultPaymentLine('debit_card', 50);
    const fees = {
      debit_card: [{ min_installments: 1, max_installments: 1, rate_percent: 1.4 }],
      credit_card: [{ min_installments: 2, max_installments: 6, rate_percent: 3.5 }],
    };
    expect(totalCardFeeEstimate([credit, debit], fees)).toBe(4.2);
  });
});
