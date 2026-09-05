import { describe, expect, it } from 'vitest';
import { HYDRATION_OPTIONS, MUCOSA_OPTIONS, resolveExamChoice, vitalReferenceHint } from './physicalExamOptions';
import { painRelatedVisitBehaviors } from './anamnesisOptions';

describe('physicalExamOptions', () => {
  it('reconhece chave ou rótulo antigo da avaliação', () => {
    expect(resolveExamChoice('moderada', HYDRATION_OPTIONS)).toBe('moderada');
    expect(resolveExamChoice('Desidratação leve', HYDRATION_OPTIONS)).toBe('leve');
    expect(resolveExamChoice('Pálida', MUCOSA_OPTIONS)).toBe('palida');
    expect(resolveExamChoice('texto livre', MUCOSA_OPTIONS)).toBe('texto livre');
    expect(resolveExamChoice('', HYDRATION_OPTIONS)).toBe('');
  });

  it('ajusta referência de vital por espécie', () => {
    expect(vitalReferenceHint('heart_rate', 'Gato')).toContain('140–220');
    expect(vitalReferenceHint('temperature_c', 'Cão')).toContain('37,5');
  });

  it('filtra sinais de dor do comportamento da consulta', () => {
    expect(painRelatedVisitBehaviors(['coxeia', 'sociavel', 'protege_regiao'])).toEqual([
      'coxeia',
      'protege_regiao',
    ]);
  });
});
