import { payableHorizonBounds, payableScheduleDueDates } from '../hubPayablesService';

describe('payableScheduleDueDates', () => {
  it('limita o horizonte ao mês atual e ao próximo', () => {
    expect(payableHorizonBounds('2026-11-05')).toEqual({
      fromYmd: '2026-11-01',
      toYmd: '2026-12-31',
    });
    expect(payableHorizonBounds('2026-12-31')).toEqual({
      fromYmd: '2026-12-01',
      toYmd: '2027-01-31',
    });
  });

  it('mensal no dia 31 encurta fevereiro e não recria meses passados', () => {
    expect(
      payableScheduleDueDates({
        frequency: 'monthly',
        anchorDate: '2026-01-31',
        todayYmd: '2026-01-15',
      }),
    ).toEqual(['2026-01-31', '2026-02-28']);

    expect(
      payableScheduleDueDates({
        frequency: 'monthly',
        anchorDate: '2026-01-31',
        todayYmd: '2026-03-10',
      }),
    ).toEqual(['2026-03-31', '2026-04-30']);
  });

  it('quinzenal anda de 14 em 14 dias dentro do horizonte', () => {
    expect(
      payableScheduleDueDates({
        frequency: 'biweekly',
        anchorDate: '2026-11-05',
        todayYmd: '2026-11-05',
      }),
    ).toEqual(['2026-11-05', '2026-11-19', '2026-12-03', '2026-12-17', '2026-12-31']);
  });

  it('respeita until_date e não gera o mês anterior', () => {
    expect(
      payableScheduleDueDates({
        frequency: 'weekly',
        anchorDate: '2026-01-05',
        untilDate: '2026-03-20',
        todayYmd: '2026-03-10',
      }),
    ).toEqual(['2026-03-02', '2026-03-09', '2026-03-16']);

    expect(
      payableScheduleDueDates({
        frequency: 'monthly',
        anchorDate: '2026-01-05',
        untilDate: '2026-02-01',
        todayYmd: '2026-03-10',
      }),
    ).toEqual([]);
  });
});
