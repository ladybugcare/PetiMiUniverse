import { describe, expect, it } from 'vitest';
import {
  hasBillingIdentity,
  hasMinimumClinicalContent,
  NEEDS_CLINICAL_CONTENT_COMPLETE_HINT,
  NEEDS_IDENTIFICATION_COMPLETE_HINT,
  resolveEncounterCompleteBlockReason,
} from './clinicalCompleteBlockReason';

const identified = {
  guardian_id: 'g1',
  pet_id: 'p1',
  hub_case_id: null as string | null,
};

describe('hasBillingIdentity', () => {
  it('exige tutor+pet ou caso', () => {
    expect(hasBillingIdentity({ guardian_id: null, pet_id: 'p1' })).toBe(false);
    expect(hasBillingIdentity({ guardian_id: 'g1', pet_id: 'p1' })).toBe(true);
    expect(hasBillingIdentity({ hub_case_id: 'c1' })).toBe(true);
  });
});

describe('hasMinimumClinicalContent', () => {
  it('vazio (sem queixa/SOAP) não passa', () => {
    expect(
      hasMinimumClinicalContent({
        ...identified,
        chief_complaint: null,
        summary_notes: '   ',
        anamnesis: {},
        physical_exam: {},
        diagnosis: { suspicions: '', conclusion: null },
      }),
    ).toBe(false);
  });

  it('aceita queixa ou resumo', () => {
    expect(hasMinimumClinicalContent({ chief_complaint: 'Tosse' })).toBe(true);
    expect(hasMinimumClinicalContent({ summary_notes: 'Retorno' })).toBe(true);
  });

  it('aceita SOAP parcial (anamnese / exame / diagnóstico)', () => {
    expect(hasMinimumClinicalContent({ anamnesis: { history: 'Comeu menos' } })).toBe(true);
    expect(hasMinimumClinicalContent({ physical_exam: { weight_kg: 4.2 } })).toBe(true);
    expect(hasMinimumClinicalContent({ diagnosis: { suspicions: 'Otite' } })).toBe(true);
  });
});

describe('resolveEncounterCompleteBlockReason', () => {
  it('prioriza identificação (como needsIdentification)', () => {
    expect(
      resolveEncounterCompleteBlockReason({
        guardian_id: null,
        pet_id: 'p1',
        chief_complaint: 'Tosse',
      }),
    ).toBe(NEEDS_IDENTIFICATION_COMPLETE_HINT);
  });

  it('bloqueia atendimento identificado mas sem queixa/SOAP', () => {
    expect(
      resolveEncounterCompleteBlockReason({
        ...identified,
        chief_complaint: null,
        summary_notes: null,
        anamnesis: {},
        physical_exam: {},
        diagnosis: {},
      }),
    ).toBe(NEEDS_CLINICAL_CONTENT_COMPLETE_HINT);
  });

  it('libera quando há identidade e conteúdo mínimo', () => {
    expect(
      resolveEncounterCompleteBlockReason({
        ...identified,
        chief_complaint: 'Dermatite',
      }),
    ).toBeNull();
  });
});
