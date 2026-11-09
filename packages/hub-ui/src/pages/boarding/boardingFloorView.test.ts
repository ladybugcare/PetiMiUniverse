import { describe, expect, it } from 'vitest';
import type { BoardingTask } from '../../api/hubBoardingApi';
import { pickFeaturedTask, pickFloorSpotlight, resolveBoardingFloorAction, type FloorMoveStay } from './BoardingFloorView';

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

describe('pickFeaturedTask', () => {
  it('prioriza a atrasada mais antiga', () => {
    const featured = pickFeaturedTask(
      [
        task({ id: 'soon', scheduled_for: '2026-09-08T12:20:00' }),
        task({ id: 'late2', scheduled_for: '2026-09-08T11:00:00' }),
        task({ id: 'late1', scheduled_for: '2026-09-08T09:00:00' }),
      ],
      NOW,
    );
    expect(featured?.id).toBe('late1');
  });

  it('sem atraso, pega a próxima dentro da janela de agora', () => {
    const featured = pickFeaturedTask(
      [
        task({ id: 'later', scheduled_for: '2026-09-08T18:00:00' }),
        task({ id: 'now', scheduled_for: '2026-09-08T12:30:00' }),
      ],
      NOW,
    );
    expect(featured?.id).toBe('now');
  });

  it('sem nada próximo, mostra a próxima do dia', () => {
    const featured = pickFeaturedTask([task({ id: 'evening', scheduled_for: '2026-09-08T19:00:00' })], NOW);
    expect(featured?.id).toBe('evening');
  });

  it('ignora feitas e retorna null sem pendentes', () => {
    expect(
      pickFeaturedTask([task({ id: 'done', status: 'done', scheduled_for: '2026-09-08T08:00:00' })], NOW),
    ).toBeNull();
  });
});

function stay(partial: Partial<FloorMoveStay> & { key: string }): FloorMoveStay {
  return {
    stage: 'checked_in',
    is_late: false,
    is_departure: false,
    starts_at: '2026-09-08T11:00:00.000Z',
    ends_at: '2026-09-08T21:00:00.000Z',
    plan_pendencies: [],
    open_incidents: [],
    attention: [],
    ...partial,
  };
}

describe('pickFloorSpotlight', () => {
  it('tarefa atrasada ganha de uma saída prevista', () => {
    const spotlight = pickFloorSpotlight(
      [task({ id: 'late', scheduled_for: '2026-09-08T09:00:00' })],
      [stay({ key: 'out', is_departure: true, ends_at: '2026-09-08T13:00:00.000Z' })],
      NOW,
    );
    expect(spotlight?.kind).toBe('task');
  });

  it('sem tarefa da hora, mostra a saída mais cedo', () => {
    const spotlight = pickFloorSpotlight(
      [task({ id: 'evening', scheduled_for: '2026-09-08T19:00:00' })],
      [
        stay({ key: 'later', is_departure: true, ends_at: '2026-09-08T22:00:00.000Z' }),
        stay({ key: 'soon', is_departure: true, ends_at: '2026-09-08T15:00:00.000Z' }),
      ],
      NOW,
    );
    expect(spotlight?.kind).toBe('departure');
    if (spotlight?.kind === 'departure') expect(spotlight.stay.key).toBe('soon');
  });

  it('saída atrasada vem antes de chegada', () => {
    const spotlight = pickFloorSpotlight(
      [],
      [
        stay({ key: 'in', stage: 'reserved', starts_at: '2026-09-08T12:10:00.000Z' }),
        stay({ key: 'late', is_late: true, is_departure: true, ends_at: '2026-09-08T10:00:00.000Z' }),
      ],
      NOW,
    );
    expect(spotlight?.kind).toBe('late_checkout');
  });

  it('sem movimento, mostra o plano incompleto do pet presente', () => {
    const spotlight = pickFloorSpotlight(
      [],
      [stay({ key: 'p', plan_pendencies: [{ label: 'Alimentação não informada' }] })],
      NOW,
    );
    expect(spotlight).toMatchObject({ kind: 'plan', label: 'Alimentação não informada' });
  });

  it('dia quieto continua em branco para a mensagem de rotina em dia', () => {
    expect(pickFloorSpotlight([], [stay({ key: 'ok' })], NOW)).toBeNull();
  });
});

describe('resolveBoardingFloorAction', () => {
  it('oferece check-in no previsto e check-out no hospedado', () => {
    expect(resolveBoardingFloorAction({ stage: 'reserved', reservation_id: null, appointment_id: 'a1' }, true)).toBe(
      'check_in',
    );
    expect(resolveBoardingFloorAction({ stage: 'checked_in', reservation_id: 'r1' }, true)).toBe('check_out');
    expect(resolveBoardingFloorAction({ stage: 'checked_out', reservation_id: 'r1' }, true)).toBeNull();
    expect(resolveBoardingFloorAction({ stage: 'reserved', reservation_id: 'r1' }, false)).toBeNull();
  });
});
