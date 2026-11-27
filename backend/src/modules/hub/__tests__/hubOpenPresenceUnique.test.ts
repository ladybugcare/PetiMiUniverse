import { describe, expect, it } from 'vitest';
import { isOpenPresenceUniqueViolation } from '../hubOpenPresenceUnique';

describe('isOpenPresenceUniqueViolation', () => {
  it('reconhece 23505 e nomes dos índices P1-05', () => {
    expect(isOpenPresenceUniqueViolation({ code: '23505', message: '' })).toBe(true);
    expect(
      isOpenPresenceUniqueViolation({
        code: '23505',
        message: 'duplicate key value violates unique constraint "uniq_hub_grooming_sessions_pet_open"',
      }),
    ).toBe(true);
    expect(
      isOpenPresenceUniqueViolation({
        message: 'uniq_hub_appointments_pet_clinical_walk_in_open',
      }),
    ).toBe(true);
    expect(isOpenPresenceUniqueViolation({ code: '23503', message: 'fk' })).toBe(false);
    expect(isOpenPresenceUniqueViolation(null)).toBe(false);
  });
});
