import {
  generateOccurrenceDates,
  normalizeRecurrenceRule,
  seriesDaysOfWeek,
} from '../hubRecurrenceService';

describe('hubRecurrenceService', () => {
  describe('normalizeRecurrenceRule', () => {
    it('converte quinzenal em semanal a cada 2 semanas', () => {
      const rule = normalizeRecurrenceRule({ kind: 'biweekly', interval_value: 1 });
      expect(rule.kind).toBe('weekly');
      expect(rule.interval_value).toBe(2);
    });

    it('mantém as demais frequências e sanitiza o intervalo', () => {
      expect(normalizeRecurrenceRule({ kind: 'weekly', interval_value: 3 })).toMatchObject({
        kind: 'weekly',
        interval_value: 3,
      });
      expect(normalizeRecurrenceRule({ kind: 'monthly', interval_value: 0 })).toMatchObject({
        kind: 'monthly',
        interval_value: 1,
      });
    });
  });

  describe('generateOccurrenceDates', () => {
    it('quinzenal gera ocorrências de 14 em 14 dias', () => {
      // 2026-09-09 é uma quarta-feira.
      const dates = generateOccurrenceDates('2026-09-09', {
        kind: 'biweekly',
        interval_value: 1,
        occurrences: 4,
      });
      expect(dates).toEqual(['2026-09-09', '2026-09-23', '2026-10-07', '2026-10-21']);
    });

    it('quinzenal respeita o dia da semana do início mesmo no domingo', () => {
      // 2026-09-13 é domingo — caso em que a antiga varredura dia a dia caía para 7 dias.
      const dates = generateOccurrenceDates('2026-09-13', {
        kind: 'biweekly',
        interval_value: 1,
        occurrences: 3,
      });
      expect(dates).toEqual(['2026-09-13', '2026-09-27', '2026-10-11']);
    });

    it('quinzenal com dois dias marcados repete o par a cada 2 semanas', () => {
      // Início segunda (2026-09-07), dias marcados: segunda (1) e quinta (4).
      const dates = generateOccurrenceDates('2026-09-07', {
        kind: 'biweekly',
        interval_value: 1,
        days_of_week: [1, 4],
        occurrences: 4,
      });
      expect(dates).toEqual(['2026-09-07', '2026-09-10', '2026-09-21', '2026-09-24']);
    });

    it('quinzenal para na data limite', () => {
      const dates = generateOccurrenceDates('2026-09-09', {
        kind: 'biweekly',
        interval_value: 1,
        until_date: '2026-10-06',
      });
      expect(dates).toEqual(['2026-09-09', '2026-09-23']);
    });

    it('semanal sem dias marcados segue o dia da primeira ocorrência', () => {
      const dates = generateOccurrenceDates('2026-09-09', {
        kind: 'weekly',
        interval_value: 1,
        occurrences: 3,
      });
      expect(dates).toEqual(['2026-09-09', '2026-09-16', '2026-09-23']);
    });

    it('diária e mensal seguem o intervalo informado', () => {
      expect(
        generateOccurrenceDates('2026-09-09', { kind: 'daily', interval_value: 2, occurrences: 3 }),
      ).toEqual(['2026-09-09', '2026-09-11', '2026-09-13']);
      expect(
        generateOccurrenceDates('2026-01-31', {
          kind: 'monthly',
          interval_value: 1,
          day_of_month: 31,
          occurrences: 3,
        }),
      ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    });

    it('limita a 52 ocorrências', () => {
      const dates = generateOccurrenceDates('2026-09-09', { kind: 'biweekly', interval_value: 1 });
      expect(dates).toHaveLength(52);
    });
  });

  describe('seriesDaysOfWeek', () => {
    it('deriva o dia da semana do início quando nada é marcado', () => {
      expect(seriesDaysOfWeek('2026-09-09', { kind: 'biweekly', interval_value: 1 })).toEqual([3]);
    });

    it('ordena e deduplica os dias marcados', () => {
      expect(
        seriesDaysOfWeek('2026-09-09', { kind: 'weekly', interval_value: 1, days_of_week: [4, 1, 4] }),
      ).toEqual([1, 4]);
    });

    it('não define dias da semana em frequências não semanais', () => {
      expect(seriesDaysOfWeek('2026-09-09', { kind: 'monthly', interval_value: 1 })).toBeNull();
    });
  });
});
