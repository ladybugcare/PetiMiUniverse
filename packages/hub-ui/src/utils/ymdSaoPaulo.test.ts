import { describe, expect, it } from 'vitest';
import { isPreviousDaySaoPaulo, ymdSaoPaulo } from './ymdSaoPaulo';

describe('ymdSaoPaulo', () => {
  it('formata dia civil em America/Sao_Paulo', () => {
    // 2026-03-15 02:30 UTC = 2026-03-14 23:30 em SP (UTC-3)
    const lateUtc = new Date('2026-03-15T02:30:00.000Z');
    expect(ymdSaoPaulo(lateUtc)).toBe('2026-03-14');

    // 2026-03-15 03:00 UTC = 2026-03-15 00:00 em SP
    const midnightSp = new Date('2026-03-15T03:00:00.000Z');
    expect(ymdSaoPaulo(midnightSp)).toBe('2026-03-15');
  });
});

describe('isPreviousDaySaoPaulo', () => {
  it('detecta sessão aberta no dia civil anterior em SP', () => {
    const today = new Date('2026-03-15T15:00:00.000Z'); // 12:00 SP
    expect(isPreviousDaySaoPaulo('2026-03-14T18:00:00.000Z', today)).toBe(true);
    expect(isPreviousDaySaoPaulo('2026-03-15T12:00:00.000Z', today)).toBe(false);
  });

  it('trata opened_at perto da meia-noite UTC vs SP', () => {
    // “Hoje” em SP: 15/03 após 00:00 SP (= 03:00 UTC)
    const today = new Date('2026-03-15T04:00:00.000Z');
    // Aberto em 14/03 23:30 SP (= 15/03 02:30 UTC) → dia anterior em SP
    expect(isPreviousDaySaoPaulo('2026-03-15T02:30:00.000Z', today)).toBe(true);
  });
});
