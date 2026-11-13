import {
  buildDoseSpecsForVersion,
  diffMedDoses,
  formatDoseLabel,
  isDoseOverdue,
  localDateTimeToIsoSp,
  normalizeTimes,
  todayYmdSp,
} from '../hospitalizationMedPlan';

describe('hospitalizationMedPlan', () => {
  const orderId = '11111111-1111-1111-1111-111111111111';
  const versionId = '22222222-2222-2222-2222-222222222222';

  describe('normalizeTimes', () => {
    it('ordena e remove duplicatas inválidas', () => {
      expect(normalizeTimes(['15:00', '09:00', '09:00', '25:00', ''])).toEqual(['09:00', '15:00']);
    });
  });

  describe('localDateTimeToIsoSp', () => {
    it('ancora HH:MM no fuso de São Paulo', () => {
      expect(localDateTimeToIsoSp('2026-11-12', '09:00')).toBe('2026-11-12T12:00:00.000Z');
    });
  });

  describe('buildDoseSpecsForVersion fixed_times', () => {
    it('gera doses nos horários dentro do horizonte hoje+amanhã', () => {
      const now = new Date('2026-11-12T15:00:00.000Z'); // 12:00 SP
      const specs = buildDoseSpecsForVersion(
        {
          id: versionId,
          order_id: orderId,
          schedule_kind: 'fixed_times',
          times: ['09:00', '15:00'],
          interval_hours: null,
          starts_at: '2026-11-12T00:00:00.000Z',
          ends_at: null,
        },
        { now },
      );
      expect(specs.length).toBeGreaterThanOrEqual(2);
      expect(specs.every((s) => s.order_id === orderId)).toBe(true);
      expect(specs.some((s) => s.plan_key === `${orderId}:09:00`)).toBe(true);
      expect(specs.some((s) => s.plan_key === `${orderId}:15:00`)).toBe(true);
    });

    it('respeita starts_at e ends_at', () => {
      const now = new Date('2026-11-12T15:00:00.000Z');
      const specs = buildDoseSpecsForVersion(
        {
          id: versionId,
          order_id: orderId,
          schedule_kind: 'fixed_times',
          times: ['09:00', '21:00'],
          interval_hours: null,
          starts_at: '2026-11-12T18:00:00.000Z', // 15:00 SP — 09:00 do dia já passou do start
          ends_at: '2026-11-12T22:00:00.000Z', // 19:00 SP — 21:00 fora
        },
        { now },
      );
      // Nenhum horário do dia 12 cabe; amanhã 09:00 pode entrar se starts permite... starts is Nov12 15:00 SP
      // amanhã 09:00 is after starts — should include tomorrow 09:00 only among these times before ends? ends is same day so tomorrow excluded
      expect(specs.every((s) => s.task_date === '2026-11-12' || s.task_date === '2026-11-13')).toBe(true);
      expect(specs.filter((s) => s.plan_key.endsWith(':21:00'))).toHaveLength(0);
    });
  });

  describe('buildDoseSpecsForVersion interval', () => {
    it('gera slots a cada N horas a partir de starts_at', () => {
      const now = new Date('2026-11-12T12:00:00.000Z');
      const starts = '2026-11-12T12:00:00.000Z'; // 09:00 SP
      const specs = buildDoseSpecsForVersion(
        {
          id: versionId,
          order_id: orderId,
          schedule_kind: 'interval',
          times: [],
          interval_hours: 8,
          starts_at: starts,
          ends_at: null,
        },
        { now },
      );
      expect(specs.length).toBeGreaterThanOrEqual(2);
      expect(specs[0].scheduled_for).toBe(starts);
      const gaps = specs.slice(1).map((s, i) => new Date(s.scheduled_for).getTime() - new Date(specs[i].scheduled_for).getTime());
      expect(gaps.every((g) => g === 8 * 3600_000)).toBe(true);
    });
  });

  describe('diffMedDoses', () => {
    it('insere novas, cancela pendentes fora do plano e preserva executadas', () => {
      const desired = [
        {
          order_id: orderId,
          order_version_id: versionId,
          task_date: '2026-11-12',
          scheduled_for: '2026-11-12T12:00:00.000Z',
          plan_key: `${orderId}:09:00`,
        },
        {
          order_id: orderId,
          order_version_id: versionId,
          task_date: '2026-11-12',
          scheduled_for: '2026-11-12T18:00:00.000Z',
          plan_key: `${orderId}:15:00`,
        },
      ];
      const existing = [
        {
          id: 'd1',
          order_id: orderId,
          order_version_id: 'old',
          plan_key: `${orderId}:09:00`,
          task_date: '2026-11-12',
          scheduled_for: '2026-11-12T12:00:00.000Z',
          status: 'pending' as const,
        },
        {
          id: 'd2',
          order_id: orderId,
          order_version_id: versionId,
          plan_key: `${orderId}:21:00`,
          task_date: '2026-11-12',
          scheduled_for: '2026-11-13T00:00:00.000Z',
          status: 'pending' as const,
        },
        {
          id: 'd3',
          order_id: orderId,
          order_version_id: 'old',
          plan_key: `${orderId}:07:00`,
          task_date: '2026-11-12',
          scheduled_for: '2026-11-12T10:00:00.000Z',
          status: 'administered' as const,
        },
      ];
      const plan = diffMedDoses({ desired, existing });
      expect(plan.toInsert.map((s) => s.plan_key)).toEqual([`${orderId}:15:00`]);
      expect(plan.toCancel).toEqual([{ id: 'd2', reason: 'superseded_schedule' }]);
      expect(plan.toTouchVersion).toEqual([{ id: 'd1', order_version_id: versionId }]);
      expect(plan.toCancel.some((c) => c.id === 'd3')).toBe(false);
    });

    it('suspendAllPending cancela só pending', () => {
      const plan = diffMedDoses({
        desired: [],
        existing: [
          {
            id: 'a',
            order_id: orderId,
            order_version_id: versionId,
            plan_key: 'x',
            task_date: '2026-11-12',
            scheduled_for: '2026-11-12T12:00:00.000Z',
            status: 'pending',
          },
          {
            id: 'b',
            order_id: orderId,
            order_version_id: versionId,
            plan_key: 'y',
            task_date: '2026-11-12',
            scheduled_for: '2026-11-12T13:00:00.000Z',
            status: 'administered',
          },
        ],
        suspendAllPending: true,
      });
      expect(plan.toCancel).toEqual([{ id: 'a', reason: 'order_suspended' }]);
      expect(plan.toInsert).toEqual([]);
    });

    it('reativa cancelada quando o horário volta ao plano', () => {
      const desired = [
        {
          order_id: orderId,
          order_version_id: versionId,
          task_date: '2026-11-12',
          scheduled_for: '2026-11-12T12:00:00.000Z',
          plan_key: `${orderId}:09:00`,
        },
      ];
      const plan = diffMedDoses({
        desired,
        existing: [
          {
            id: 'c1',
            order_id: orderId,
            order_version_id: 'old',
            plan_key: `${orderId}:09:00`,
            task_date: '2026-11-12',
            scheduled_for: '2026-11-12T12:00:00.000Z',
            status: 'cancelled',
          },
        ],
      });
      expect(plan.toReactivate).toEqual([
        { id: 'c1', order_version_id: versionId, scheduled_for: '2026-11-12T12:00:00.000Z' },
      ]);
      expect(plan.toInsert).toEqual([]);
    });
  });

  describe('helpers', () => {
    it('formatDoseLabel e overdue', () => {
      expect(formatDoseLabel(10, 'mg')).toBe('10 mg');
      expect(isDoseOverdue('pending', '2000-01-01T00:00:00.000Z', new Date('2026-01-01'))).toBe(true);
      expect(isDoseOverdue('administered', '2000-01-01T00:00:00.000Z', new Date('2026-01-01'))).toBe(false);
      expect(typeof todayYmdSp()).toBe('string');
    });
  });
});
