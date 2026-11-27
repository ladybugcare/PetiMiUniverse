import {
  comandaProductOriginAlreadyStockedOut,
  vaccinationComandaLineMissingLot,
} from '../comandaStockOut';

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

describe('vaccinationComandaLineMissingLot', () => {
  it('bloqueia vacina com item e sem lote', () => {
    expect(
      vaccinationComandaLineMissingLot({
        item_kind: 'product',
        origin_type: 'vaccination',
        hub_inventory_item_id: 'item-1',
        hub_inventory_lot_id: null,
      }),
    ).toMatch(/lote/i);
  });

  it('permite vacina com lote ou linha sem item', () => {
    expect(
      vaccinationComandaLineMissingLot({
        item_kind: 'product',
        origin_type: 'vaccination',
        hub_inventory_item_id: 'item-1',
        hub_inventory_lot_id: 'lot-1',
      }),
    ).toBeNull();
    expect(
      vaccinationComandaLineMissingLot({
        item_kind: 'product',
        origin_type: 'manual',
        hub_inventory_item_id: 'item-1',
        hub_inventory_lot_id: null,
      }),
    ).toBeNull();
  });
});
