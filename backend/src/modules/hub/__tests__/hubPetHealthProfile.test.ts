import {
  mergeBehaviorTags,
  resolveNeutered,
  resolveTagsMode,
} from '../hubPetHealthProfile';

describe('hubPetHealthProfile', () => {
  describe('resolveTagsMode', () => {
    it('ficha usa replace por padrão e aceita union', () => {
      expect(resolveTagsMode('wizard')).toBe('replace');
      expect(resolveTagsMode('clinic', 'union')).toBe('union');
    });
    it('banho e tosa / hotel forçam união', () => {
      expect(resolveTagsMode('grooming', 'replace')).toBe('union');
      expect(resolveTagsMode('boarding')).toBe('union');
    });
  });

  describe('mergeBehaviorTags', () => {
    it('união adiciona sem remover', () => {
      expect(mergeBehaviorTags(['morde'], ['ansioso'], 'union')).toEqual(['morde', 'ansioso']);
    });
    it('união com lista vazia não apaga', () => {
      expect(mergeBehaviorTags(['morde'], [], 'union')).toEqual(['morde']);
    });
    it('replace na ficha pode esvaziar', () => {
      expect(mergeBehaviorTags(['morde'], [], 'replace')).toEqual([]);
    });
  });

  describe('resolveNeutered', () => {
    it('preenche se vazio no operacional', () => {
      expect(resolveNeutered(null, true, 'grooming')).toEqual({ next: true, applied: true, conflict: false });
    });
    it('conflito operacional mantém o atual', () => {
      expect(resolveNeutered(true, false, 'grooming')).toEqual({ next: true, applied: false, conflict: true });
    });
    it('ficha pode corrigir o valor', () => {
      expect(resolveNeutered(true, false, 'clinic')).toEqual({ next: false, applied: true, conflict: false });
    });
  });
});
