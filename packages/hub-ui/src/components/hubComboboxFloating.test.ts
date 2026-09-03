import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeComboboxFloating } from './hubComboboxFloating';

function rect(partial: Partial<DOMRect>): DOMRect {
  const width = partial.width ?? 280;
  const height = partial.height ?? 38;
  const top = partial.top ?? 0;
  const left = partial.left ?? 16;
  return {
    x: left,
    y: top,
    top,
    left,
    bottom: top + height,
    right: left + width,
    width,
    height,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

function stubViewport(innerHeight: number, innerWidth: number) {
  vi.stubGlobal('window', {
    innerHeight,
    innerWidth,
    visualViewport: undefined,
  });
}

describe('computeComboboxFloating', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('abre para baixo quando há espaço suficiente abaixo', () => {
    stubViewport(800, 1200);
    const pos = computeComboboxFloating(rect({ top: 100 }));
    expect(pos.top).toBe(100 + 38 + 4);
    expect(pos.bottom).toBeUndefined();
    expect(pos.maxHeight).toBeGreaterThan(180);
  });

  it('abre para cima quando o campo está no rodapé da viewport', () => {
    stubViewport(800, 1200);
    const pos = computeComboboxFloating(rect({ top: 740 }));
    expect(pos.top).toBeUndefined();
    expect(pos.bottom).toBe(800 - 740 + 4);
    expect(pos.maxHeight).toBeLessThanOrEqual(740 - 8);
    expect(pos.maxHeight).toBeGreaterThan(100);
  });

  it('não força altura maior que o espaço abaixo', () => {
    stubViewport(800, 1200);
    const pos = computeComboboxFloating(rect({ top: 200, height: 38 }));
    const spaceBelow = 800 - (200 + 38) - 8;
    expect(pos.maxHeight).toBeLessThanOrEqual(spaceBelow);
  });
});
