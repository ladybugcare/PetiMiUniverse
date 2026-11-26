import { describe, expect, it } from 'vitest';
import { generateOccurrenceDates } from './recurrenceDates';

describe('generateOccurrenceDates', () => {
  it('gera semanal ×4 a partir da segunda', () => {
    expect(
      generateOccurrenceDates('2027-03-08', {
        kind: 'weekly',
        interval_value: 1,
        occurrences: 4,
      }),
    ).toEqual(['2027-03-08', '2027-03-15', '2027-03-22', '2027-03-29']);
  });

  it('quinzenal vira weekly interval 2', () => {
    expect(
      generateOccurrenceDates('2027-03-08', {
        kind: 'biweekly',
        interval_value: 1,
        occurrences: 3,
      }),
    ).toEqual(['2027-03-08', '2027-03-22', '2027-04-05']);
  });
});
