import {
  applyPlanEdit,
  buildBoardingTimeline,
  buildHandoffSnapshot,
  buildPlanFromProfile,
  buildTutorReportText,
  canJoinGroupRecreation,
  computeAttention,
  computePlanPendencies,
  diffPlanTasks,
  generatePlanTasks,
  isTaskOverdue,
  isValidOutcome,
  normalizeFeeding,
  normalizeMedications,
  type CarePlanBlocks,
  type CareProfileBlocks,
} from '../boardingCare';

const profile: CareProfileBlocks = {
  feeding: {
    food_source: 'own',
    food_name: 'Ração Premium',
    meals: [
      { time: '08:00', amount: '1 xícara', notes: null },
      { time: '18:00', amount: '1 xícara', notes: null },
    ],
    restrictions: null,
  },
  medications: [{ name: 'Apoquel', dose: '1/2 comprimido', times: ['09:00'], instructions: 'Com comida' }],
  walks: { times: ['10:00'], notes: null },
  handling: { sociability: 'sociable', group_play_allowed: true, contact_restrictions: null, special_care: null },
};

describe('boardingCare', () => {
  describe('normalização', () => {
    it('descarta refeições sem horário válido e ordena por horário', () => {
      const f = normalizeFeeding({ meals: [{ time: '18:00' }, { time: '25:00' }, { time: '07:30:00' }] });
      expect(f?.meals?.map((m) => m.time)).toEqual(['07:30', '18:00']);
    });

    it('medicação: null = não informado, [] = sem medicação', () => {
      expect(normalizeMedications(null)).toBeNull();
      expect(normalizeMedications([])).toEqual([]);
      expect(normalizeMedications([{ name: '' }, { name: 'Dipirona', times: ['08:00', '08:00'] }])).toEqual([
        { name: 'Dipirona', dose: null, times: ['08:00'], instructions: null },
      ]);
    });
  });

  describe('herança ficha → plano', () => {
    it('blocos preenchidos vêm herdados; vazios ficam pendentes', () => {
      const { blocks, block_status } = buildPlanFromProfile({ ...profile, walks: null });
      expect(block_status).toEqual({
        feeding: 'inherited',
        medications: 'inherited',
        walks: 'pending',
        handling: 'inherited',
        recreation: 'inherited',
      });
      expect(blocks.recreation).toEqual({ allowed: true, times: [] });
    });

    it('sem ficha, tudo pendente', () => {
      const { block_status } = buildPlanFromProfile(null);
      expect(Object.values(block_status).every((s) => s === 'pending')).toBe(true);
    });

    it('herdar não é confirmar: pendências listam os essenciais herdados', () => {
      const { block_status } = buildPlanFromProfile(profile);
      const p = computePlanPendencies({ block_status });
      expect(p.map((x) => x.label)).toEqual([
        'Alimentação não confirmada',
        'Medicação não confirmada',
        'Manejo não confirmado',
      ]);
    });

    it('sem plano, todos os essenciais ficam pendentes', () => {
      expect(computePlanPendencies(null).map((p) => p.kind)).toEqual(['missing', 'missing', 'missing']);
    });
  });

  describe('applyPlanEdit', () => {
    const base = buildPlanFromProfile(profile);

    it('confirmar sem alterar marca confirmado', () => {
      const r = applyPlanEdit({
        current: base.blocks,
        currentStatus: base.block_status,
        patch: { feeding: profile.feeding },
        profile,
        confirmBlocks: ['feeding'],
      });
      expect(r.block_status.feeding).toBe('confirmed');
      expect(r.block_status.medications).toBe('inherited');
    });

    it('alterar só nesta estadia marca alterado', () => {
      const r = applyPlanEdit({
        current: base.blocks,
        currentStatus: base.block_status,
        patch: { medications: [] },
        profile,
        confirmBlocks: [],
      });
      expect(r.block_status.medications).toBe('overridden');
      expect(r.blocks.medications).toEqual([]);
    });

    it('esvaziar um bloco volta para pendente', () => {
      const r = applyPlanEdit({
        current: base.blocks,
        currentStatus: base.block_status,
        patch: { medications: null },
        profile,
        confirmBlocks: ['medications'],
      });
      expect(r.block_status.medications).toBe('pending');
    });

    it('ficha vazia: preencher na reserva já conta como confirmado', () => {
      const empty = buildPlanFromProfile(null);
      const r = applyPlanEdit({
        current: empty.blocks,
        currentStatus: empty.block_status,
        patch: { feeding: profile.feeding },
        profile: null,
        confirmBlocks: [],
      });
      expect(r.block_status.feeding).toBe('confirmed');
    });

    it('voltar ao valor da ficha sem confirmar retorna a herdado', () => {
      const changed = applyPlanEdit({
        current: base.blocks,
        currentStatus: base.block_status,
        patch: { walks: { times: ['15:00'] } },
        profile,
        confirmBlocks: [],
      });
      const back = applyPlanEdit({
        current: changed.blocks,
        currentStatus: changed.block_status,
        patch: { walks: profile.walks },
        profile,
        confirmBlocks: [],
      });
      expect(changed.block_status.walks).toBe('overridden');
      expect(back.block_status.walks).toBe('inherited');
    });
  });

  describe('generatePlanTasks', () => {
    const plan: CarePlanBlocks = { ...profile, recreation: { allowed: true, times: [] } };

    it('gera tarefas por dia dentro da estadia (entrada 14h, saída 2 dias depois às 12h)', () => {
      const specs = generatePlanTasks({
        plan,
        start: '2026-06-01T17:00:00.000Z', // 14:00 SP
        end: '2026-06-03T15:00:00.000Z', // 12:00 SP
        recreationWindows: [{ start: '16:00', label: 'Tarde' }],
      });
      const byDay = (d: string) => specs.filter((s) => s.task_date === d).map((s) => s.plan_key);
      expect(byDay('2026-06-01')).toEqual(['recreation:16:00', 'feeding:1:18:00']);
      expect(byDay('2026-06-02')).toEqual([
        'feeding:0:08:00',
        'medication:0:09:00',
        'walk:10:00',
        'recreation:16:00',
        'feeding:1:18:00',
      ]);
      expect(byDay('2026-06-03')).toEqual(['feeding:0:08:00', 'medication:0:09:00', 'walk:10:00']);
    });

    it('recreação proibida no manejo não gera tarefa', () => {
      const specs = generatePlanTasks({
        plan: { ...plan, recreation: { allowed: false, times: ['16:00'] } },
        start: '2026-06-01T11:00:00.000Z',
        end: '2026-06-01T22:00:00.000Z',
        recreationWindows: [{ start: '16:00' }],
      });
      expect(specs.some((s) => s.kind === 'recreation')).toBe(false);
    });

    it('título da medicação inclui a dose', () => {
      const specs = generatePlanTasks({
        plan,
        start: '2026-06-01T11:00:00.000Z',
        end: '2026-06-01T13:00:00.000Z',
      });
      expect(specs.find((s) => s.kind === 'medication')?.title).toBe('Apoquel — 1/2 comprimido');
    });
  });

  describe('diffPlanTasks', () => {
    const spec = (k: string, d = '2026-06-02', title = 'Refeição das 08:00') => ({
      kind: 'feeding' as const,
      title,
      details: {},
      scheduled_for: '2026-06-02T11:00:00.000Z',
      task_date: d,
      plan_key: k,
    });

    it('insere novas, atualiza pendentes alteradas e remove pendentes que saíram do plano', () => {
      const existing = [
        { id: 'a', plan_key: 'feeding:0:08:00', task_date: '2026-06-02', status: 'pending', source: 'plan', title: 'Antigo', scheduled_for: '2026-06-02T11:00:00.000Z', details: {} },
        { id: 'b', plan_key: 'walk:10:00', task_date: '2026-06-02', status: 'pending', source: 'plan', title: 'Passeio', scheduled_for: null, details: {} },
        { id: 'c', plan_key: 'walk:15:00', task_date: '2026-06-02', status: 'done', source: 'plan', title: 'Passeio', scheduled_for: null, details: {} },
        { id: 'd', plan_key: null, task_date: '2026-06-02', status: 'pending', source: 'manual', title: 'Escovar', scheduled_for: null, details: {} },
      ];
      const r = diffPlanTasks(existing, [spec('feeding:0:08:00'), spec('feeding:1:18:00')]);
      expect(r.toInsert.map((s) => s.plan_key)).toEqual(['feeding:1:18:00']);
      expect(r.toUpdate.map((u) => u.id)).toEqual(['a']);
      expect(r.toDelete).toEqual(['b']);
    });
  });

  describe('execução', () => {
    it('valida resultado por tipo de tarefa', () => {
      expect(isValidOutcome('feeding', 'ate_partial')).toBe(true);
      expect(isValidOutcome('medication', 'ate_all')).toBe(false);
    });

    it('tarefa atrasada só depois da tolerância', () => {
      const now = new Date('2026-06-02T12:00:00.000Z').getTime();
      expect(isTaskOverdue({ status: 'pending', scheduled_for: '2026-06-02T11:45:00.000Z' }, now)).toBe(false);
      expect(isTaskOverdue({ status: 'pending', scheduled_for: '2026-06-02T11:00:00.000Z' }, now)).toBe(true);
      expect(isTaskOverdue({ status: 'done', scheduled_for: '2026-06-02T08:00:00.000Z' }, now)).toBe(false);
    });

    it('recreação coletiva respeita o manejo', () => {
      expect(canJoinGroupRecreation({ group_play_allowed: false })).toBe(false);
      expect(canJoinGroupRecreation({ sociability: 'isolated' })).toBe(false);
      expect(canJoinGroupRecreation(null)).toBe(true);
    });
  });

  describe('computeAttention', () => {
    const now = new Date('2026-06-02T15:00:00.000Z').getTime();

    it('hospedado com medicação atrasada, recusa e pendência: ordena por gravidade', () => {
      const reasons = computeAttention({
        stage: 'checked_in',
        pendencies: [{ block: 'handling', kind: 'unconfirmed', label: 'Manejo não confirmado' }],
        openIncidents: [],
        tasks: [
          { kind: 'medication', status: 'pending', scheduled_for: '2026-06-02T12:00:00.000Z' },
          { kind: 'feeding', status: 'done', scheduled_for: '2026-06-02T11:00:00.000Z', outcome: 'refused' },
        ],
        nowMs: now,
      });
      expect(reasons.map((r) => r.key)).toEqual(['medication_overdue', 'feeding_refused', 'plan_pending']);
    });

    it('reserva futura com pendência entra em atenção leve', () => {
      const reasons = computeAttention({
        stage: 'reserved',
        pendencies: computePlanPendencies(null),
        openIncidents: [],
        tasks: [],
        nowMs: now,
      });
      expect(reasons).toEqual([{ key: 'plan_pending', label: '3 cuidados sem confirmação', severity: 'low' }]);
    });

    it('intercorrência grave aparece primeiro', () => {
      const reasons = computeAttention({
        stage: 'checked_in',
        pendencies: [],
        openIncidents: [{ severity: 'high' }],
        tasks: [],
        isLate: true,
        nowMs: now,
      });
      expect(reasons[0]).toEqual({ key: 'incident', label: 'Intercorrência aberta', severity: 'high' });
    });
  });

  describe('buildTutorReportText', () => {
    it('resume o dia a partir das tarefas e intercorrências', () => {
      const text = buildTutorReportText({
        kind: 'daily',
        petName: 'Thor',
        guardianFirstName: 'Ana',
        clinicName: 'PetMi Centro',
        reportDate: '2026-06-02',
        tasks: [
          { kind: 'feeding', title: 'Refeição', status: 'done', outcome: 'ate_all', task_date: '2026-06-02', scheduled_for: '2026-06-02T11:00:00.000Z' },
          { kind: 'feeding', title: 'Refeição', status: 'done', outcome: 'ate_all', task_date: '2026-06-02', scheduled_for: '2026-06-02T21:00:00.000Z' },
          { kind: 'medication', title: 'Apoquel', status: 'done', outcome: 'given', task_date: '2026-06-02', scheduled_for: '2026-06-02T12:00:00.000Z' },
          { kind: 'walk', title: 'Passeio', status: 'pending', outcome: null, task_date: '2026-06-02', scheduled_for: null },
          { kind: 'feeding', title: 'Outro dia', status: 'done', outcome: 'refused', task_date: '2026-06-01', scheduled_for: null },
        ],
        incidents: [],
      });
      expect(text).toBe(
        [
          'Olá, Ana! Como foi o dia de 02/06/2026 do(a) Thor:',
          'Alimentação: comeu tudo nas 2 refeições.',
          'Medicação: dada às 09:00.',
          '— PetMi Centro',
        ].join('\n'),
      );
    });

    it('sem registros, avisa que foi tranquilo', () => {
      const text = buildTutorReportText({ kind: 'daily', petName: 'Mel', tasks: [], incidents: [] });
      expect(text).toContain('Tudo tranquilo por aqui.');
    });
  });

  describe('passagem de turno e linha do tempo', () => {
    it('snapshot lista pendentes no horizonte e intercorrências abertas', () => {
      const snap = buildHandoffSnapshot({
        nowIso: '2026-06-02T15:00:00.000Z',
        stays: [{ pet_name: 'Thor', stage: 'checked_in', attention: [{ key: 'x', label: 'Medicação atrasada', severity: 'high' }] }],
        tasks: [
          { pet_name: 'Thor', title: 'Apoquel', scheduled_for: '2026-06-02T12:00:00.000Z', status: 'pending' },
          { pet_name: 'Thor', title: 'Amanhã', scheduled_for: '2026-06-03T12:00:00.000Z', status: 'pending' },
          { pet_name: 'Thor', title: 'Feita', scheduled_for: '2026-06-02T14:00:00.000Z', status: 'done' },
        ],
        incidents: [{ pet_name: 'Thor', description: 'Vômito', severity: 'medium', status: 'open' }],
      });
      expect(snap.present_count).toBe(1);
      expect(snap.pending_tasks).toEqual([
        { pet_name: 'Thor', title: 'Apoquel', scheduled_for: '2026-06-02T12:00:00.000Z', overdue: true },
      ]);
      expect(snap.open_incidents).toHaveLength(1);
    });

    it('linha do tempo junta fontes em ordem decrescente', () => {
      const tl = buildBoardingTimeline({
        reservation: { id: 'r', mode: 'hotel', created_at: '2026-06-01T10:00:00.000Z', checked_in_at: '2026-06-01T17:00:00.000Z' },
        executions: [{ id: 'e', executed_at: '2026-06-02T11:05:00.000Z', outcome: 'ate_all', task_title: 'Refeição das 08:00' }],
        incidents: [{ id: 'i', occurred_at: '2026-06-02T13:00:00.000Z', description: 'Vômito', severity: 'low', resolved_at: '2026-06-02T14:00:00.000Z' }],
        media: [],
        tutorReports: [],
      });
      expect(tl.map((e) => e.type)).toEqual(['incident_resolved', 'incident', 'task', 'reservation', 'reservation']);
      expect(tl[2].title).toBe('Refeição das 08:00: Comeu tudo');
    });
  });
});
