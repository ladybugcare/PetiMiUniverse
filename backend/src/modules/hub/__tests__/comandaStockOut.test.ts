import { comandaProductOriginAlreadyStockedOut } from '../comandaStockOut';

describe('comandaProductOriginAlreadyStockedOut', () => {
  it('pula vacina e medication_product (já baixados no atendimento)', () => {
    expect(comandaProductOriginAlreadyStockedOut('vaccination')).toBe(true);
    expect(comandaProductOriginAlreadyStockedOut('medication_product')).toBe(true);
  });

  it('não pula venda de balcão / manual / sem origem', () => {
    expect(comandaProductOriginAlreadyStockedOut('manual')).toBe(false);
    expect(comandaProductOriginAlreadyStockedOut('manual_line')).toBe(false);
    expect(comandaProductOriginAlreadyStockedOut(null)).toBe(false);
    expect(comandaProductOriginAlreadyStockedOut(undefined)).toBe(false);
    expect(comandaProductOriginAlreadyStockedOut('medication_service')).toBe(false);
  });
});
