import { describe, expect, it } from 'vitest';
import {
  clinicalCaseDisplayTitle,
  clinicalCaseTitleFallbacks,
  isGenericClinicalCaseTitle,
} from './clinicalCaseTitle';

describe('isGenericClinicalCaseTitle', () => {
  it('reconhece fallbacks automáticos', () => {
    expect(isGenericClinicalCaseTitle('Atendimento avulso')).toBe(true);
    expect(isGenericClinicalCaseTitle('Consulta — 01/07/2026')).toBe(true);
    expect(isGenericClinicalCaseTitle('Dermatite alérgica')).toBe(false);
  });
});

describe('clinicalCaseDisplayTitle', () => {
  it('mantém título específico', () => {
    expect(clinicalCaseDisplayTitle('Otite em Atum', ['Prurido'])).toBe('Otite em Atum');
  });

  it('usa a queixa quando o título é genérico', () => {
    expect(clinicalCaseDisplayTitle('Atendimento avulso', ['Prurido intenso'])).toBe('Prurido intenso');
  });
});

describe('clinicalCaseTitleFallbacks', () => {
  it('filtra por caso e ignora vazios na ordem', () => {
    const fallbacks = clinicalCaseTitleFallbacks(
      [
        { hub_case_id: 'a', chief_complaint: 'Tosse', summary_notes: 'Melhora' },
        { hub_case_id: 'b', chief_complaint: 'Outro caso', summary_notes: null },
      ],
      'a',
    );
    expect(fallbacks).toEqual(['Tosse', 'Melhora']);
  });
});
