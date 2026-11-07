import { describe, expect, it } from 'vitest';
import type { BoardingOpsStay, BoardingTask } from '../../api/hubBoardingApi';
import {
  groupTasksByTime,
  handlingNeedsAttention,
  isBatchEligible,
  isCapacityBlockedError,
  isCapacityWarningError,
  parseBRLToCents,
  sortStays,
  stayMatchesFilter,
  stayMatchesSearch,
  summarizeFeeding,
  summarizeHandling,
  summarizeMedications,
} from './boardingCareUi';

const NOW = new Date('2026-09-08T12:00:00').getTime();

function task(partial: Partial<BoardingTask> & { id: string }): BoardingTask {
  return {
    hub_boarding_reservation_id: 'r1',
    kind: 'feeding',
    title: 'Almoço',
    scheduled_for: null,
    task_date: '2026-09-08',
    status: 'pending',
    ...partial,
  };
}

function stay(partial: Partial<BoardingOpsStay> & { key: string }): BoardingOpsStay {
  return {
    reservation_id: partial.key,
    kind: 'reservation',
    stage: 'checked_in',
    mode: 'hotel',
    is_walk_in: false,
    pet: { id: `p-${partial.key}`, name: partial.key },
    guardian: null,
    clinical_tags: [],
    starts_at: '2026-09-07T10:00:00',
    ends_at: '2026-09-10T10:00:00',
    checked_in_at: null,
    checked_out_at: null,
    nights_count: 3,
    is_late: false,
    is_arrival: false,
    is_departure: false,
    handling: null,
    can_group_play: true,
    plan_pendencies: [],
    attention: [],
    tasks_summary: { total: 0, done: 0, pending: 0, overdue: 0 },
    next_task: null,
    open_incidents: [],
    belongings_count: 0,
    space: null,
    daycare_shift: null,
    daycare_period: null,
    daily_rate_cents: null,
    notes: null,
    ...partial,
  };
}

describe('groupTasksByTime', () => {
  it('separa atrasadas, agora, próximas e feitas', () => {
    const g = groupTasksByTime(
      [
        task({ id: 'late', scheduled_for: '2026-09-08T10:00:00' }),
        task({ id: 'grace', scheduled_for: '2026-09-08T11:45:00' }),
        task({ id: 'soon', scheduled_for: '2026-09-08T12:40:00' }),
        task({ id: 'later', scheduled_for: '2026-09-08T18:00:00' }),
        task({ id: 'nohour' }),
        task({ id: 'done', status: 'done', executed_at: '2026-09-08T09:00:00' }),
        task({ id: 'skip', status: 'skipped', executed_at: '2026-09-08T09:30:00' }),
      ],
      NOW,
    );
    expect(g.overdue.map((t) => t.id)).toEqual(['late']);
    expect(g.now.map((t) => t.id).sort()).toEqual(['grace', 'nohour', 'soon']);
    expect(g.upcoming.map((t) => t.id)).toEqual(['later']);
    expect(g.done.map((t) => t.id)).toEqual(['skip', 'done']);
  });
});

describe('isBatchEligible', () => {
  it('só recreação, passeio e avulsas pendentes', () => {
    expect(isBatchEligible({ kind: 'recreation', status: 'pending' })).toBe(true);
    expect(isBatchEligible({ kind: 'walk', status: 'pending' })).toBe(true);
    expect(isBatchEligible({ kind: 'feeding', status: 'pending' })).toBe(false);
    expect(isBatchEligible({ kind: 'medication', status: 'pending' })).toBe(false);
    expect(isBatchEligible({ kind: 'recreation', status: 'done' })).toBe(false);
  });
});

describe('filtros do painel', () => {
  const stays = [
    stay({ key: 'Thor', attention: [{ key: 'med', label: 'Medicação atrasada', severity: 'high' }] }),
    stay({ key: 'Luna', mode: 'daycare', is_arrival: true, stage: 'reserved' }),
    stay({ key: 'Bob', is_departure: true }),
    stay({ key: 'Mia', stage: 'checked_out' }),
    stay({ key: 'Zeca', stage: 'cancelled' }),
  ];

  it('aplica cada filtro', () => {
    const names = (f: Parameters<typeof stayMatchesFilter>[1]) =>
      stays.filter((s) => stayMatchesFilter(s, f)).map((s) => s.key);
    expect(names('all')).toEqual(['Thor', 'Luna', 'Bob', 'Mia']);
    expect(names('attention')).toEqual(['Thor']);
    expect(names('hotel')).toEqual(['Thor', 'Bob']);
    expect(names('daycare')).toEqual(['Luna']);
    expect(names('arrivals')).toEqual(['Luna']);
    expect(names('departures')).toEqual(['Bob']);
  });

  it('busca por pet, tutor e acomodação sem diferenciar maiúsculas', () => {
    const s = stay({ key: 'Thor', guardian: { id: 'g', full_name: 'Ana Souza' }, space: { id: 's', name: 'Baia 3' } });
    expect(stayMatchesSearch(s, 'thor')).toBe(true);
    expect(stayMatchesSearch(s, 'SOUZA')).toBe(true);
    expect(stayMatchesSearch(s, 'baia')).toBe(true);
    expect(stayMatchesSearch(s, 'luna')).toBe(false);
    expect(stayMatchesSearch(s, '  ')).toBe(true);
  });

  it('ordena presentes primeiro e, dentro deles, por gravidade da atenção', () => {
    const sorted = sortStays([
      stay({ key: 'Previsto', stage: 'reserved' }),
      stay({ key: 'Tranquilo' }),
      stay({ key: 'Medio', attention: [{ key: 'a', label: 'x', severity: 'medium' }] }),
      stay({ key: 'Grave', attention: [{ key: 'b', label: 'y', severity: 'high' }] }),
      stay({ key: 'Saiu', stage: 'checked_out' }),
    ]).map((s) => s.key);
    expect(sorted).toEqual(['Grave', 'Medio', 'Tranquilo', 'Previsto', 'Saiu']);
  });
});

describe('parseBRLToCents', () => {
  it('aceita formatos brasileiros', () => {
    expect(parseBRLToCents('120')).toBe(12000);
    expect(parseBRLToCents('120,50')).toBe(12050);
    expect(parseBRLToCents('R$ 1.234,56')).toBe(123456);
    expect(parseBRLToCents('')).toBeNull();
    expect(parseBRLToCents('abc')).toBeNull();
  });
});

describe('resumos da ficha', () => {
  it('resume alimentação', () => {
    expect(
      summarizeFeeding({ food_source: 'own', meals: [{ time: '08:00', amount: '1 xícara' }, { time: '18:00' }] }),
    ).toBe('Ração do tutor · 08:00 (1 xícara), 18:00');
    expect(summarizeFeeding(null)).toBeNull();
  });

  it('diferencia "sem medicação" de "não informado"', () => {
    expect(summarizeMedications([])).toBe('Sem medicação');
    expect(summarizeMedications(null)).toBeNull();
    expect(summarizeMedications([{ name: 'Apoquel', dose: '1 comp.', times: ['08:00'] }])).toBe('Apoquel · 1 comp. · 08:00');
  });

  it('resume manejo e sinaliza atenção', () => {
    const h = { sociability: 'isolated' as const, group_play_allowed: false, contact_restrictions: null, special_care: null };
    expect(summarizeHandling(h)).toContain('Sem recreação em grupo');
    expect(handlingNeedsAttention(h)).toBe(true);
    expect(handlingNeedsAttention({ sociability: 'sociable', group_play_allowed: true })).toBe(false);
  });
});

describe('isCapacityWarningError', () => {
  it('reconhece o aviso de capacidade e ignora o bloqueio', () => {
    expect(isCapacityWarningError(new Error('Atenção: hotel lotado (10/10). Confirme para continuar.'))).toBe(true);
    expect(isCapacityWarningError(new Error('Check-in bloqueado: hotel lotado'))).toBe(false);
  });
});

describe('isCapacityBlockedError', () => {
  it('reconhece bloqueio duro de lotação', () => {
    expect(isCapacityBlockedError(new Error('Check-in bloqueado: Baia 1 está com 2 de 2 lugares ocupados.'))).toBe(true);
    expect(isCapacityBlockedError(new Error('Atenção: capacidade atingida. Confirme para continuar.'))).toBe(false);
  });
});
