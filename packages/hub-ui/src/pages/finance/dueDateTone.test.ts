import { describe, expect, it } from 'vitest';
import { daysUntilDue, resolveDueDateTone } from './dueDateTone';

describe('daysUntilDue', () => {
  it('conta dias civis', () => {
    expect(daysUntilDue('2026-09-10', new Date('2026-09-03T15:00:00'))).toBe(7);
    expect(daysUntilDue('2026-09-03', new Date('2026-09-03T08:00:00'))).toBe(0);
    expect(daysUntilDue('2026-09-01', new Date('2026-09-03T08:00:00'))).toBe(-2);
  });

  it('sem data retorna null', () => {
    expect(daysUntilDue(null)).toBeNull();
  });
});

describe('resolveDueDateTone', () => {
  const asOf = new Date('2026-09-03T12:00:00');

  it('pago não usa tom de prazo', () => {
    expect(resolveDueDateTone('2026-09-01', { status: 'paid', asOf }).tone).toBe('none');
  });

  it('verde quando ainda há folga', () => {
    expect(resolveDueDateTone('2026-09-20', { asOf })).toMatchObject({ tone: 'ok' });
  });

  it('amarelo quando está próximo ou vence hoje', () => {
    expect(resolveDueDateTone('2026-09-05', { asOf })).toMatchObject({ tone: 'soon' });
    expect(resolveDueDateTone('2026-09-03', { asOf })).toMatchObject({ tone: 'soon', label: 'Vence hoje' });
  });

  it('vermelho quando já venceu', () => {
    expect(resolveDueDateTone('2026-09-01', { asOf })).toMatchObject({ tone: 'overdue' });
  });
});
