import { describe, expect, it } from 'vitest';
import {
  CARD_FEE_PARTIAL_COVERAGE_HINT,
  cardFeeTotalCentsPositive,
} from './hubCardMachineFees';
import { buildWhatsAppMessagePaymentReceipt } from '../pages/finance/hubComandaShareUtils';

describe('cardFee UI helpers', () => {
  it('bloco oculto com taxa zero ou só PIX (centavos)', () => {
    expect(cardFeeTotalCentsPositive(0)).toBe(false);
    expect(cardFeeTotalCentsPositive(0.004)).toBe(false);
  });

  it('bloco visível com taxa positiva', () => {
    expect(cardFeeTotalCentsPositive(0.01)).toBe(true);
    expect(cardFeeTotalCentsPositive(3)).toBe(true);
  });

  it('aviso de cobertura parcial tem o texto aprovado', () => {
    expect(CARD_FEE_PARTIAL_COVERAGE_HINT).toBe(
      'Valores calculados apenas para cartões com taxa registrada.',
    );
  });
});

describe('WhatsApp recibo (canal tutor)', () => {
  it('mensagem de recebimento não menciona taxa nem líquido', () => {
    const msg = buildWhatsAppMessagePaymentReceipt('Ana', 'R$ 100,00', 'Cartão de crédito');
    expect(msg.toLowerCase()).not.toMatch(/taxa/);
    expect(msg.toLowerCase()).not.toMatch(/l[ií]quido/);
    expect(msg.toLowerCase()).not.toMatch(/maquininha/);
    expect(msg).toContain('R$ 100,00');
    expect(msg).toContain('Cartão de crédito');
  });
});
