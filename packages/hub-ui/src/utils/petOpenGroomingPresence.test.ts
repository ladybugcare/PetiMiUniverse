import { describe, expect, it } from 'vitest';
import {
  isPetOpenGroomingPresenceError,
  PET_OPEN_GROOMING_CODE,
} from './petOpenGroomingPresence';

describe('petOpenGroomingPresence', () => {
  it('reconhece código e mensagem', () => {
    expect(
      isPetOpenGroomingPresenceError({
        message: 'conflito',
        body: { code: PET_OPEN_GROOMING_CODE, error: 'Este pet já possui uma sessão ou encaixe de Banho & Tosa em aberto.' },
      }),
    ).toBe(true);

    expect(
      isPetOpenGroomingPresenceError({
        message: 'Este pet já possui uma sessão ou encaixe de Banho & Tosa em aberto.',
      }),
    ).toBe(true);

    expect(isPetOpenGroomingPresenceError({ message: 'Pet inválido' })).toBe(false);
    expect(isPetOpenGroomingPresenceError(null)).toBe(false);
  });
});
