import { describe, expect, it } from 'vitest';
import {
  isPetOpenClinicalPresenceError,
  PET_OPEN_CLINICAL_CODE,
  petOpenClinicalPresenceMessage,
} from './petOpenClinicalPresence';

describe('petOpenClinicalPresence', () => {
  it('detecta code no body', () => {
    expect(
      isPetOpenClinicalPresenceError({
        message: 'Conflict',
        body: { code: PET_OPEN_CLINICAL_CODE, error: 'Este pet já possui um atendimento ou encaixe clínico em aberto.' },
      }),
    ).toBe(true);
  });

  it('detecta mensagem sem code', () => {
    expect(
      isPetOpenClinicalPresenceError({
        message: 'Este pet já possui um atendimento ou encaixe clínico em aberto. Finalize ou cancele o atual antes de registrar outro.',
      }),
    ).toBe(true);
  });

  it('ignora outros erros', () => {
    expect(isPetOpenClinicalPresenceError({ message: 'Pet inválido' })).toBe(false);
    expect(isPetOpenClinicalPresenceError(null)).toBe(false);
  });

  it('extrai mensagem do body', () => {
    expect(
      petOpenClinicalPresenceMessage({
        message: 'Conflict',
        body: { error: 'Mensagem da API' },
      }),
    ).toBe('Mensagem da API');
  });
});
