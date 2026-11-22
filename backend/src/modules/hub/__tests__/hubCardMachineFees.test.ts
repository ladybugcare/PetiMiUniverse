import {
  aggregateCardFeeTotals,
  cardFeeTotalCentsPositive,
  computeCardFeeSnapshot,
  lookupCardFeeRatePercent,
  normalizeCardMachineFees,
  parseCardMachineFeesInput,
} from '../hubCardMachineFees';

describe('hubCardMachineFees', () => {
  const fees = {
    debit_card: [{ min_installments: 1, max_installments: 1, rate_percent: 1.39 }],
    credit_card: [
      { min_installments: 1, max_installments: 1, rate_percent: 2.5 },
      { min_installments: 2, max_installments: 6, rate_percent: 3.5 },
      { min_installments: 7, max_installments: 12, rate_percent: 4.2 },
    ],
  };

  it('normaliza payload inválido para vazio', () => {
    expect(normalizeCardMachineFees(null)).toEqual({ debit_card: [], credit_card: [] });
    expect(normalizeCardMachineFees('x')).toEqual({ debit_card: [], credit_card: [] });
  });

  it('busca taxa por faixa de parcelas', () => {
    expect(lookupCardFeeRatePercent(fees, 'debit_card', 1)).toBe(1.39);
    expect(lookupCardFeeRatePercent(fees, 'credit_card', 1)).toBe(2.5);
    expect(lookupCardFeeRatePercent(fees, 'credit_card', 4)).toBe(3.5);
    expect(lookupCardFeeRatePercent(fees, 'credit_card', 12)).toBe(4.2);
    expect(lookupCardFeeRatePercent(fees, 'credit_card', 18)).toBeNull();
    expect(lookupCardFeeRatePercent(fees, 'pix', 1)).toBeNull();
  });

  it('calcula snapshot de taxa e líquido', () => {
    const snap = computeCardFeeSnapshot({
      fees,
      paymentMethod: 'credit_card',
      amount: 100,
      installments: 3,
    });
    expect(snap).toEqual({
      card_fee_rate_percent: 3.5,
      card_fee_amount: 3.5,
      net_amount: 96.5,
    });
  });

  it('rejeita faixas sobrepostas no parse', () => {
    expect(() =>
      parseCardMachineFeesInput({
        debit_card: [],
        credit_card: [
          { min_installments: 1, max_installments: 3, rate_percent: 2 },
          { min_installments: 3, max_installments: 6, rate_percent: 3 },
        ],
      }),
    ).toThrow(/sobrepostas/i);
  });

  describe('aggregateCardFeeTotals', () => {
    it('soma só cartões com snapshot; PIX e legado ficam de fora do bruto/taxa/líquido', () => {
      const totals = aggregateCardFeeTotals([
        { payment_method: 'pix', amount: 50, card_fee_amount: null, net_amount: null },
        {
          payment_method: 'credit_card',
          amount: 100,
          card_fee_amount: null,
          net_amount: null,
        },
        {
          payment_method: 'credit_card',
          amount: 100,
          card_fee_amount: 3,
          net_amount: 97,
        },
      ]);
      expect(totals).toEqual({
        card_gross_total: 100,
        card_fee_total: 3,
        card_net_total: 97,
        card_without_fee_gross_total: 100,
      });
    });

    it('só PIX → totais zero', () => {
      expect(
        aggregateCardFeeTotals([
          { payment_method: 'pix', amount: 80, card_fee_amount: null, net_amount: null },
        ]),
      ).toEqual({
        card_gross_total: 0,
        card_fee_total: 0,
        card_net_total: 0,
        card_without_fee_gross_total: 0,
      });
    });

    it('débito taxa 0 com net nulo + crédito com taxa usam o mesmo conjunto e fallback', () => {
      const totals = aggregateCardFeeTotals([
        {
          payment_method: 'debit_card',
          amount: 50,
          card_fee_amount: 0,
          net_amount: null,
        },
        {
          payment_method: 'credit_card',
          amount: 100,
          card_fee_amount: 3.5,
          net_amount: 96.5,
        },
      ]);
      expect(totals.card_gross_total).toBe(150);
      expect(totals.card_fee_total).toBe(3.5);
      expect(totals.card_net_total).toBe(146.5);
      expect(totals.card_without_fee_gross_total).toBe(0);
    });

    it('critério de UI em centavos', () => {
      expect(cardFeeTotalCentsPositive(0)).toBe(false);
      expect(cardFeeTotalCentsPositive(0.004)).toBe(false);
      expect(cardFeeTotalCentsPositive(0.01)).toBe(true);
      expect(cardFeeTotalCentsPositive(3)).toBe(true);
    });
  });
});
