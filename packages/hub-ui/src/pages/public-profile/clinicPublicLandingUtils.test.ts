import { describe, expect, it } from 'vitest';
import {
  buildServiceInquiryMessage,
  formatAddressDisplay,
  mapsSearchUrl,
  splitFeaturedOffers,
} from './clinicPublicLandingUtils';

describe('clinicPublicLandingUtils', () => {
  it('monta mensagem de interesse no serviço', () => {
    expect(buildServiceInquiryMessage('Família Matilha', 'Hotel')).toBe(
      'Oi! Vi a página da Família Matilha e quero saber mais sobre Hotel.',
    );
  });

  it('formata endereço curto', () => {
    expect(
      formatAddressDisplay({ line: 'Rua A, 1', city: 'Cotia', state: 'SP' }),
    ).toBe('Rua A, 1 · Cotia · SP');
    expect(formatAddressDisplay(null)).toBeNull();
  });

  it('monta URL do Maps', () => {
    expect(mapsSearchUrl('Rua A, Cotia')).toContain('maps/search');
    expect(mapsSearchUrl('Rua A, Cotia')).toContain(encodeURIComponent('Rua A, Cotia'));
  });

  it('separa destaques e mais serviços', () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(splitFeaturedOffers(items, 4)).toEqual({
      featured: [1, 2, 3, 4],
      more: [5, 6],
    });
    expect(splitFeaturedOffers([1, 2], 4)).toEqual({ featured: [1, 2], more: [] });
  });
});
