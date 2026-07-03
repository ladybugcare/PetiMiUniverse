import {
  buildPublicPrescriptionPayload,
  isPlausiblePublicToken,
  normalizeValidationCode,
} from '../publicPrescriptionResponse';
import type { PrescriptionSnapshot } from '../prescriptionValidation';

const snapshot: PrescriptionSnapshot = {
  version: 1,
  prescription_id: '11111111-1111-4111-8111-111111111111',
  document_version: 1,
  clinic: { id: '22222222-2222-4222-8222-222222222222', name: 'Clínica Pet' },
  pet: { id: '33333333-3333-4333-8333-333333333333', name: 'Mel', species: 'Canino', breed: 'SRD' },
  guardian: { id: '44444444-4444-4444-8444-444444444444', full_name: 'Ana Silva' },
  veterinarian: { id: '55555555-5555-4555-8555-555555555555', full_name: 'Dr. Pedro', crmv: '12345', crmv_uf: 'SP' },
  medications: [
    {
      medication_name: 'Dipirona',
      presentation: 'Comprimido',
      concentration: '500mg',
      quantity: '10',
      posology: '1x ao dia',
      duration: '5 dias',
      instructions: null,
      administration: 'home_use',
    },
  ],
  notes: null,
  issued_at: '2026-07-01T12:00:00.000Z',
  disclaimers: ['Aviso legal.'],
};

describe('publicPrescriptionResponse', () => {
  it('normalizeValidationCode aceita RX-XXXX-XXXX em minúsculas', () => {
    expect(normalizeValidationCode('rx-ab12-cd34')).toBe('RX-AB12-CD34');
    expect(normalizeValidationCode('invalid')).toBeNull();
  });

  it('isPlausiblePublicToken rejeita tokens curtos ou inválidos', () => {
    expect(isPlausiblePublicToken('abc')).toBe(false);
    expect(isPlausiblePublicToken('a'.repeat(24))).toBe(true);
    expect(isPlausiblePublicToken('token com espaço')).toBe(false);
  });

  it('buildPublicPrescriptionPayload monta resposta sanitizada', () => {
    const payload = buildPublicPrescriptionPayload({
      id: 'doc-1',
      clinic_id: snapshot.clinic.id,
      version_no: 1,
      validation_code: 'RX-AB12-CD34',
      content_hash: 'a'.repeat(64),
      issued_at: snapshot.issued_at,
      expires_at: '2099-01-01T00:00:00.000Z',
      revoked_at: null,
      snapshot,
    });

    expect(payload).toMatchObject({
      status: 'valid',
      validation_code: 'RX-AB12-CD34',
      clinic: { name: 'Clínica Pet' },
      guardian: { full_name: 'Ana Silva' },
      medications: [{ medication_name: 'Dipirona' }],
    });
    expect(payload?.content_hash_short).toContain('…');
  });

  it('buildPublicPrescriptionPayload retorna null sem snapshot', () => {
    expect(buildPublicPrescriptionPayload({ snapshot: {} })).toBeNull();
  });

  it('buildPublicPrescriptionPayload marca expirada', () => {
    const payload = buildPublicPrescriptionPayload({
      id: 'doc-2',
      clinic_id: snapshot.clinic.id,
      version_no: 1,
      validation_code: 'RX-AB12-CD34',
      content_hash: 'b'.repeat(64),
      issued_at: snapshot.issued_at,
      expires_at: '2020-01-01T00:00:00.000Z',
      revoked_at: null,
      snapshot,
    });
    expect(payload?.status).toBe('expired');
  });

  it('buildPublicPrescriptionPayload prioriza revogada sobre expirada', () => {
    const payload = buildPublicPrescriptionPayload({
      id: 'doc-3',
      clinic_id: snapshot.clinic.id,
      version_no: 1,
      validation_code: 'RX-AB12-CD34',
      content_hash: 'c'.repeat(64),
      issued_at: snapshot.issued_at,
      expires_at: '2020-01-01T00:00:00.000Z',
      revoked_at: '2026-07-01T00:00:00.000Z',
      snapshot,
    });
    expect(payload?.status).toBe('revoked');
  });
});
