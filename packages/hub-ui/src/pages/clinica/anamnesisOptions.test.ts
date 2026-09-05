import { describe, expect, it } from 'vitest';
import {
  asStringList,
  isCatSpecies,
  isDogSpecies,
  mergeChipValues,
  painRelevantFichaTags,
  visitBehaviorOptions,
} from './anamnesisOptions';

describe('anamnesisOptions', () => {
  it('normaliza listas de chips e ignora vazios', () => {
    expect(asStringList([' Ansioso ', '', 'Ansioso', 1])).toEqual(['Ansioso']);
    expect(asStringList(null)).toEqual([]);
  });

  it('reconhece espécie de cão e gato', () => {
    expect(isDogSpecies('Cão')).toBe(true);
    expect(isCatSpecies('Gato')).toBe(true);
    expect(isDogSpecies('Gato')).toBe(false);
  });

  it('oferece sinais de dor e opções de cão por padrão', () => {
    const keys = visitBehaviorOptions('Cão').map((o) => o.key);
    expect(keys).toContain('coxeia');
    expect(keys).toContain('ansioso_consulta');
    expect(keys).not.toContain('esconde');
  });

  it('cruza tags da ficha com dor', () => {
    expect(painRelevantFichaTags(['ansioso', 'filhote', 'morde'])).toEqual(['ansioso', 'morde']);
  });

  it('une chips da ficha sem duplicar', () => {
    expect(mergeChipValues(['apatico'], ['ansioso', 'apatico'])).toEqual(['apatico', 'ansioso']);
  });
});
