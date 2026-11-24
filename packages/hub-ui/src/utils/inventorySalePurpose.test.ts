import { describe, expect, it } from 'vitest';
import {
  filterItemsBySalePurpose,
  isClinicalSalePurpose,
  normalizeSalePurpose,
} from './inventorySalePurpose';

describe('inventorySalePurpose', () => {
  it('normaliza e reconhece CLINICAL', () => {
    expect(normalizeSalePurpose(' clinical ')).toBe('CLINICAL');
    expect(isClinicalSalePurpose('CLINICAL')).toBe(true);
    expect(isClinicalSalePurpose('SALE')).toBe(false);
    expect(isClinicalSalePurpose('INTERNAL')).toBe(false);
  });

  it('filtra itens por finalidade', () => {
    const items = [
      { id: '1', sale_purpose: 'SALE' },
      { id: '2', sale_purpose: 'CLINICAL' },
      { id: '3', sale_purpose: 'INTERNAL' },
      { id: '4', sale_purpose: null },
    ];
    expect(filterItemsBySalePurpose(items, 'CLINICAL').map((i) => i.id)).toEqual(['2']);
  });
});
