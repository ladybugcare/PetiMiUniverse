import { describe, expect, it } from 'vitest';

/** Espelha a condição de alerta da Visão geral para comandas abertas sem handoff. */
function shouldAlertOpenComandas(finance: {
  open_comandas_count?: number;
} | null | undefined): boolean {
  return (finance?.open_comandas_count ?? 0) > 0;
}

describe('alerta de comandas abertas (visão geral)', () => {
  it('não alerta quando contagem é zero ou ausente', () => {
    expect(shouldAlertOpenComandas(undefined)).toBe(false);
    expect(shouldAlertOpenComandas({})).toBe(false);
    expect(shouldAlertOpenComandas({ open_comandas_count: 0 })).toBe(false);
  });

  it('alerta quando há comandas sem handoff', () => {
    expect(shouldAlertOpenComandas({ open_comandas_count: 15 })).toBe(true);
  });
});
