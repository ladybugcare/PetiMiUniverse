import { describe, expect, it } from 'vitest';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import { addonMetaLabel } from './appointmentAddonsUtils';

function stubAddon(partial: Partial<HubServiceType> & Pick<HubServiceType, 'id' | 'name'>): HubServiceType {
  return {
    clinic_id: 'c1',
    code: partial.id,
    service_group: 'banho_tosa',
    default_duration_minutes: 20,
    active: true,
    agenda_color: null,
    description: null,
    internal_notes: null,
    created_at: '',
    updated_at: '',
    cost_amount: 0,
    sale_amount: 30.9,
    is_addon: true,
    ...partial,
  };
}

describe('addonMetaLabel', () => {
  const desembolo = stubAddon({
    id: 'desembolo',
    name: 'Desembolo Leve',
    pricing_matrix: {
      kind: 'porte',
      tiers: [
        { porte: 'mini', cost_amount: 0, sale_amount: 30.9 },
        { porte: 'pequeno', cost_amount: 0, sale_amount: 30.9 },
        { porte: 'medio', cost_amount: 0, sale_amount: 38.9 },
        { porte: 'grande', cost_amount: 0, sale_amount: 38.9 },
        { porte: 'gigante', cost_amount: 0, sale_amount: 46.9 },
      ],
    },
  });

  const ctxBase = {
    petBirthDate: null as string | null,
    petCoatType: null as string | null,
    appointmentDateYmd: '2026-11-24',
    puppyMaxMonths: 8,
    appointmentOverrideCoatType: null as string | null,
  };

  it('mostra o preço do porte automático do pet', () => {
    expect(
      addonMetaLabel(desembolo, {
        ...ctxBase,
        petSizeTier: 'medio',
        appointmentOverrideTier: null,
      }),
    ).toBe('20 min · R$\u00a038,90');
  });

  it('respeita override manual de porte', () => {
    expect(
      addonMetaLabel(desembolo, {
        ...ctxBase,
        petSizeTier: 'medio',
        appointmentOverrideTier: 'gigante',
      }),
    ).toBe('20 min · R$\u00a046,90');
  });
});
