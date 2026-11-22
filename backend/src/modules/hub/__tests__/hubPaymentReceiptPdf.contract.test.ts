import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Contrato dos canais do tutor: sem campos de taxa/líquido da maquininha.
 */
describe('canais tutor — sem taxa da maquininha', () => {
  const receiptSrc = readFileSync(
    resolve(__dirname, '../hubPaymentReceiptPdf.ts'),
    'utf8',
  );
  const publicSrc = readFileSync(
    resolve(__dirname, '../hubComandasController.ts'),
    'utf8',
  );
  const cupomSrc = readFileSync(
    resolve(__dirname, '../hubComandaCupomPdf.ts'),
    'utf8',
  );

  it('recibo PDF não referencia taxa/líquido da maquininha', () => {
    expect(receiptSrc).not.toMatch(/card_fee/);
    expect(receiptSrc).not.toMatch(/net_amount/);
    expect(receiptSrc).not.toMatch(/maquininha/i);
    expect(receiptSrc).not.toMatch(/L[ií]quido/);
    expect(receiptSrc).toMatch(/Valor aplicado/);
    expect(receiptSrc).toMatch(/Forma de pagamento/);
  });

  it('getPublicComanda não inclui card_* no JSON', () => {
    const fnStart = publicSrc.indexOf('export const getPublicComanda');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const slice = publicSrc.slice(fnStart, fnStart + 2500);
    expect(slice).toMatch(/paid_total:\s*detail\.paid_total/);
    expect(slice).toMatch(/balance_due:\s*detail\.balance_due/);
    expect(slice).not.toMatch(/card_fee_total/);
    expect(slice).not.toMatch(/card_net_total/);
    expect(slice).not.toMatch(/card_gross_total/);
    expect(slice).not.toMatch(/card_without_fee/);
  });

  it('cupom térmico não referencia taxa da maquininha', () => {
    expect(cupomSrc).not.toMatch(/card_fee/);
    expect(cupomSrc).not.toMatch(/card_net/);
    expect(cupomSrc).not.toMatch(/maquininha/i);
  });
});
