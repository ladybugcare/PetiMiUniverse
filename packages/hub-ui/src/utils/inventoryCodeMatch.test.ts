import { describe, expect, it } from 'vitest';
import { matchInventoryByCode } from './inventoryCodeMatch';
import type { HubInventoryItem } from '../api/hubInventoryApi';

function item(partial: Partial<HubInventoryItem> & Pick<HubInventoryItem, 'id' | 'name'>): HubInventoryItem {
  return {
    clinic_id: 'c1',
    item_kind: 'product',
    ean: null,
    store_sku: null,
    sale_amount: 10,
    active: true,
    deleted_at: null,
    ...partial,
  } as HubInventoryItem;
}

describe('matchInventoryByCode', () => {
  const catalog = [
    item({ id: '1', name: 'Ração', ean: '7891234567890', store_sku: 'RAC-01' }),
    item({ id: '2', name: 'Shampoo', ean: null, store_sku: 'SHP-99' }),
  ];

  it('casa por EAN (dígitos)', () => {
    expect(matchInventoryByCode(catalog, '7891234567890')?.id).toBe('1');
  });

  it('casa por store_sku sem diferenciar maiúsculas', () => {
    expect(matchInventoryByCode(catalog, 'shp-99')?.id).toBe('2');
  });

  it('retorna null quando não encontra', () => {
    expect(matchInventoryByCode(catalog, 'XYZ')).toBeNull();
  });
});
