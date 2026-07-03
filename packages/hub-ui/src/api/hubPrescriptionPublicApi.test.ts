import { describe, expect, it, vi } from 'vitest';

vi.mock('@petimi/web-core', () => ({
  getApiBaseUrl: () => 'http://localhost:4000',
}));

import {
  normalizeValidationCodeInput,
  publicPrescriptionPdfUrl,
  VALIDATION_CODE_REGEX,
} from './hubPrescriptionPublicApi';

describe('hubPrescriptionPublicApi', () => {
  it('normalizeValidationCodeInput aceita RX-XXXX-XXXX com espaços', () => {
    expect(normalizeValidationCodeInput('  rx-ab12-cd34  ')).toBe('RX-AB12-CD34');
    expect(normalizeValidationCodeInput('RX-AB12-CD34')).toMatch(VALIDATION_CODE_REGEX);
    expect(normalizeValidationCodeInput('invalido')).toBeNull();
    expect(normalizeValidationCodeInput('')).toBeNull();
  });

  it('publicPrescriptionPdfUrl monta URL da API pública', () => {
    expect(publicPrescriptionPdfUrl('token-seguro')).toBe(
      'http://localhost:4000/api/public/prescriptions/token-seguro/pdf',
    );
  });
});
