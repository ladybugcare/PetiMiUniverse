import { describe, expect, it } from 'vitest';
import { DATE_PICKER_YEAR_MIN, datePickerYearMax, MONTH_LABELS_PT, MONTH_LABELS_SHORT_PT } from './hubCalendar';

describe('hubCalendar date picker helpers', () => {
  it('expõe 12 meses em português', () => {
    expect(MONTH_LABELS_PT).toHaveLength(12);
    expect(MONTH_LABELS_SHORT_PT).toHaveLength(12);
    expect(MONTH_LABELS_PT[0]).toBe('Janeiro');
    expect(MONTH_LABELS_SHORT_PT[8]).toBe('Set');
  });

  it('define faixa de anos útil para nascimento e agenda', () => {
    expect(DATE_PICKER_YEAR_MIN).toBe(1900);
    const fixed = new Date(2026, 8, 3);
    expect(datePickerYearMax(fixed)).toBe(2041);
  });
});
