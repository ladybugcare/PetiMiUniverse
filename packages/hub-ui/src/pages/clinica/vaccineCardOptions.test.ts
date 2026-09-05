import { describe, expect, it } from 'vitest';
import { uniqueVaccineNames, VACCINE_CARD_NAMES, vaccineCardOptions } from './vaccineCardOptions';

describe('vaccineCardOptions', () => {
  it('inclui nomes comuns sem repetir', () => {
    expect(new Set(VACCINE_CARD_NAMES).size).toBe(VACCINE_CARD_NAMES.length);
    expect(VACCINE_CARD_NAMES).toContain('Antirrábica');
  });

  it('acrescenta valores atuais se não estiverem no catálogo', () => {
    const opts = vaccineCardOptions(['V10', 'Vacina custom']);
    expect(opts.some((o) => o.value === 'Vacina custom')).toBe(true);
  });

  it('normaliza lista sem duplicar', () => {
    expect(uniqueVaccineNames([' V10 ', '', 'V10', 'Antirrábica'])).toEqual(['V10', 'Antirrábica']);
  });
});
