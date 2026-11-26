import { describe, expect, it } from 'vitest';
import { unitOperationalLabel, unitShortLabel } from './unitDisplayLabel';

describe('unitShortLabel', () => {
  it('prefere nickname distinto do name', () => {
    expect(
      unitShortLabel(
        { name: 'Unidade Principal', nickname: 'Principal', is_main: true },
        'Clínica Ladybug',
      ),
    ).toBe('Principal');
  });

  it('usa Matriz quando is_main e sem nickname útil', () => {
    expect(unitShortLabel({ name: 'Unidade Principal', is_main: true }, 'Clínica Ladybug')).toBe(
      'Matriz',
    );
  });
});

describe('unitOperationalLabel', () => {
  it('com uma unidade espelha o nome da clínica (como o header)', () => {
    expect(
      unitOperationalLabel(
        { name: 'Unidade Principal', nickname: 'Principal', is_main: true },
        'Clínica Ladybug',
        1,
      ),
    ).toBe('Clínica Ladybug');
  });

  it('com várias unidades usa o rótulo curto', () => {
    expect(
      unitOperationalLabel(
        { name: 'Unidade Principal', nickname: 'Principal', is_main: true },
        'Clínica Ladybug',
        2,
      ),
    ).toBe('Principal');
  });

  it('sem clinicName cai no short label', () => {
    expect(
      unitOperationalLabel({ name: 'Unidade Principal', is_main: true }, undefined, 1),
    ).toBe('Matriz');
  });
});
