import {
  VALIDATION_CODE_REGEX,
  buildPrescriptionSnapshot,
  canonicalizeSnapshot,
  computeContentHash,
  computeDocumentStatus,
  generateValidationCode,
  maskPublicToken,
  normalizeMedicationItem,
} from '../prescriptionValidation';

describe('prescriptionValidation', () => {
  it('generateValidationCode segue formato RX-XXXX-XXXX', () => {
    const code = generateValidationCode();
    expect(code).toMatch(VALIDATION_CODE_REGEX);
  });

  it('computeContentHash é estável para o mesmo snapshot', () => {
    const snapshot = buildPrescriptionSnapshot({
      prescriptionId: '11111111-1111-4111-8111-111111111111',
      documentVersion: 1,
      issuedAt: '2026-07-01T12:00:00.000Z',
      notes: null,
      clinic: { id: '22222222-2222-4222-8222-222222222222', name: 'Clínica Teste' },
      pet: { id: '33333333-3333-4333-8333-333333333333', name: 'Rex', species: 'Canino', breed: 'SRD' },
      guardian: { id: '44444444-4444-4444-8444-444444444444', full_name: 'Maria' },
      veterinarian: { id: '55555555-5555-4555-8555-555555555555', full_name: 'Dr. João', crmv: '12345', crmv_uf: 'SP' },
      items: [
        {
          medication_name: 'Dipirona',
          concentration: '500mg',
          posology: '1x ao dia',
          order_index: 0,
        },
      ],
    });

    const hash1 = computeContentHash(snapshot);
    const hash2 = computeContentHash(JSON.parse(canonicalizeSnapshot(snapshot)) as typeof snapshot);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('normalizeMedicationItem faz fallback de dosage/frequency legados', () => {
    const med = normalizeMedicationItem({
      medication_name: 'Amoxicilina',
      dosage: '250mg',
      frequency: '12/12h',
    });
    expect(med.concentration).toBe('250mg');
    expect(med.posology).toBe('12/12h');
  });

  it('computeDocumentStatus considera revogação e expiração', () => {
    expect(computeDocumentStatus({ revoked_at: '2026-07-01T00:00:00Z', expires_at: null })).toBe('revoked');
    expect(
      computeDocumentStatus({
        revoked_at: null,
        expires_at: '2020-01-01T00:00:00Z',
      }),
    ).toBe('expired');
    expect(
      computeDocumentStatus({
        revoked_at: null,
        expires_at: '2099-01-01T00:00:00Z',
      }),
    ).toBe('valid');
  });

  it('maskPublicToken oculta token completo', () => {
    expect(maskPublicToken('abcdefghijklmnopqrstuvwxyz')).toMatch(/^abcd…wxyz$/);
  });
});
