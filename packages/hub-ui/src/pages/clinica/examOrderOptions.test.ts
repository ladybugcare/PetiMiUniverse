import { describe, expect, it } from 'vitest';
import {
  EXAM_TYPE_GROUPS,
  EXAM_TYPE_OPTIONS,
  toggleExamType,
  uniqueExamTypes,
} from './examOrderOptions';

describe('examOrderOptions', () => {
  it('não repete chave entre grupos', () => {
    const keys = EXAM_TYPE_OPTIONS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(20);
  });

  it('agrupa laboratório, imagem, testes e outros', () => {
    expect(EXAM_TYPE_GROUPS.map((g) => g.id)).toEqual(['lab', 'imaging', 'rapid', 'other']);
  });

  it('marca e desmarca sem duplicar', () => {
    expect(toggleExamType([], 'Hemograma')).toEqual(['Hemograma']);
    expect(toggleExamType(['Hemograma'], 'Hemograma')).toEqual([]);
    expect(toggleExamType(['Hemograma'], 'Urinálise')).toEqual(['Hemograma', 'Urinálise']);
  });

  it('normaliza lista livre', () => {
    expect(uniqueExamTypes([' Hemograma ', '', 'Hemograma', 'T4 total'])).toEqual(['Hemograma', 'T4 total']);
  });
});
