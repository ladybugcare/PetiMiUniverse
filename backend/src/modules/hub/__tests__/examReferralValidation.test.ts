import {
  buildExamOrderSnapshot,
  computeExamOrderContentHash,
  normalizeExamOrderValidationCode,
} from '../examOrderValidation';
import {
  buildSpecialistReferralSnapshot,
  computeSpecialistReferralContentHash,
  normalizeSpecialistReferralValidationCode,
} from '../specialistReferralValidation';
import { computeDocumentStatus } from '../clinicalDocumentValidation';

describe('examOrderValidation', () => {
  it('normaliza código EX válido', () => {
    expect(normalizeExamOrderValidationCode('ex-abcd-efgh')).toBe('EX-ABCD-EFGH');
    expect(normalizeExamOrderValidationCode('RX-ABCD-EFGH')).toBeNull();
  });

  it('gera hash estável do snapshot', () => {
    const snapshot = buildExamOrderSnapshot({
      encounterId: 'enc-1',
      documentVersion: 1,
      scope: 'encounter_bundle',
      issuedAt: '2026-01-01T12:00:00.000Z',
      parties: {
        clinic: { id: 'c1', name: 'Clínica' },
        pet: { id: 'p1', name: 'Rex', species: 'Cão', breed: null },
        guardian: { id: 'g1', full_name: 'Maria' },
        veterinarian: { id: 'v1', full_name: 'Dr. João', crmv: '123', crmv_uf: 'SP' },
      },
      exams: [
        {
          exam_id: 'e1',
          exam_type: 'Hemograma',
          lab_kind: 'external',
          lab_name: null,
          external_lab_name: 'Lab X',
          clinical_indication: 'Anemia',
          fasting_required: true,
          collection_instructions: null,
          urgency: 'routine',
          notes: null,
        },
      ],
    });
    const h1 = computeExamOrderContentHash(snapshot);
    const h2 = computeExamOrderContentHash(snapshot);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });
});

describe('specialistReferralValidation', () => {
  it('normaliza código RF válido', () => {
    expect(normalizeSpecialistReferralValidationCode('rf-wxyz-1234')).toBe('RF-WXYZ-1234');
  });

  it('computa status expirado', () => {
    const status = computeDocumentStatus({
      revoked_at: null,
      expires_at: '2020-01-01T00:00:00.000Z',
    });
    expect(status).toBe('expired');
  });

  it('gera snapshot de encaminhamento', () => {
    const snapshot = buildSpecialistReferralSnapshot({
      encounterId: 'enc-1',
      documentVersion: 1,
      scope: 'single',
      issuedAt: '2026-01-01T12:00:00.000Z',
      parties: {
        clinic: { id: 'c1', name: 'Clínica' },
        pet: { id: 'p1', name: 'Rex', species: 'Cão', breed: null },
        guardian: { id: 'g1', full_name: 'Maria' },
        veterinarian: { id: 'v1', full_name: 'Dr. João', crmv: '123', crmv_uf: 'SP' },
      },
      referrals: [
        {
          referral_id: 'r1',
          specialty: 'Cardiologia',
          specialist_name: 'Dr. Especialista',
          specialist_contact: null,
          referral_reason: 'Sopro cardíaco',
          clinical_summary: 'Suspeita de cardiomiopatia',
          priority: 'urgent',
          notes: null,
        },
      ],
    });
    expect(snapshot.referrals).toHaveLength(1);
    expect(computeSpecialistReferralContentHash(snapshot)).toHaveLength(64);
  });
});
