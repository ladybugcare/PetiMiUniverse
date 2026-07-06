import { describe, expect, it } from '@jest/globals';
import { isStaffSpecialtyUuid, sanitizeStaffSpecialtiesInput } from '../hubStaffSpecialties';

describe('hubStaffSpecialties', () => {
  it('identifica UUID de especialidade', () => {
    expect(isStaffSpecialtyUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isStaffSpecialtyUuid('Cardiologia')).toBe(false);
  });

  it('sanitiza lista com dedupe case-insensitive', () => {
    expect(sanitizeStaffSpecialtiesInput([' Cardiologia ', 'cardiologia', 'Dermatologia'])).toEqual([
      'Cardiologia',
      'Dermatologia',
    ]);
  });

  it('ignora entradas inválidas', () => {
    expect(sanitizeStaffSpecialtiesInput(['', '  ', 42, null])).toEqual([]);
  });
});
