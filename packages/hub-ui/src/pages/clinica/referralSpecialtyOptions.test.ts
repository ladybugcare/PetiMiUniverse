import { describe, expect, it } from 'vitest';
import { REFERRAL_PRIORITY_OPTIONS, REFERRAL_SPECIALTY_OPTIONS } from './referralSpecialtyOptions';

describe('referralSpecialtyOptions', () => {
  it('não repete especialidade', () => {
    const keys = REFERRAL_SPECIALTY_OPTIONS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(10);
  });

  it('tem prioridade de rotina e urgente', () => {
    expect(REFERRAL_PRIORITY_OPTIONS.map((o) => o.key)).toEqual(['routine', 'urgent']);
  });
});
