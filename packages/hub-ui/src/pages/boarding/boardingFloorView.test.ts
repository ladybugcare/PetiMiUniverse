import { describe, expect, it } from 'vitest';
import type { BoardingTask } from '../../api/hubBoardingApi';
import { pickFeaturedTask, resolveBoardingFloorAction } from './BoardingFloorView';

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
