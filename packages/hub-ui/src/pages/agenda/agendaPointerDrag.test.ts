import { describe, expect, it } from 'vitest';
import { minutesFromLanePointer } from './agendaPointerDrag';

describe('minutesFromLanePointer', () => {
  it('converte Y do pointer em minutos com snap de 15', () => {
    const el = {
      getBoundingClientRect: () => ({ top: 100, left: 0, right: 100, bottom: 500, width: 100, height: 400 }),
    } as HTMLElement;
    // 30px abaixo do topo, 2px/min → 15 min → snap 15
    expect(minutesFromLanePointer(130, el, 2, 13 * 60)).toBe(15);
  });

  it('limita ao fim da lane', () => {
    const el = {
      getBoundingClientRect: () => ({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 }),
    } as HTMLElement;
    expect(minutesFromLanePointer(9999, el, 1, 60)).toBe(45);
  });
});
