import { describe, expect, it } from 'vitest';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import {
  buildAgendaPricingPreview,
  resolveEffectiveSale,
} from './agendaPortePricingPreview';

function stubService(partial: Pick<HubServiceType, 'id' | 'name'> & Partial<HubServiceType>): HubServiceType {
  return {
    clinic_id: 'c1',
    code: partial.id,
    service_group: 'banho_tosa',
    default_duration_minutes: 60,
    active: true,
    agenda_color: null,
    description: null,
    internal_notes: null,
    created_at: '',
    updated_at: '',
    cost_amount: 40,
    sale_amount: 100,
    ...partial,
  };
}

const previewBase = {
  extraServices: [],
  petSizeTier: 'grande',
  petBirthDate: null,
  petCoatType: 'medio',
  appointmentDateYmd: '2026-09-05',
  puppyMaxMonths: 6,
  appointmentOverrideTier: null,
  appointmentOverrideCoatType: null,
};

describe('resolveEffectiveSale', () => {
  it('mantém o catálogo quando não há override', () => {
    expect(resolveEffectiveSale(100, null)).toEqual({
      effectiveSale: 100,
      hasSpecialOverride: false,
    });
  });

  it('usa o valor especial quando ele difere do catálogo', () => {
    expect(resolveEffectiveSale(100, 70)).toEqual({
      effectiveSale: 70,
      hasSpecialOverride: true,
    });
  });

  it('não marca especial se o override é o próprio catálogo', () => {
    expect(resolveEffectiveSale(100, 100)).toEqual({
      effectiveSale: 100,
      hasSpecialOverride: false,
    });
  });
});

describe('buildAgendaPricingPreview', () => {
  it('soma o valor especial no total, sem perder o catálogo da linha', () => {
    const banho = stubService({ id: 'banho', name: 'Banho', sale_amount: 100 });
    const extra = stubService({
      id: 'dentes',
      name: 'Escovar Dentes',
      sale_amount: 10,
      is_addon: true,
    });

    const preview = buildAgendaPricingPreview({
      ...previewBase,
      serviceTypes: [banho, extra],
      mainServices: [
        {
          hub_service_type_id: 'banho',
          name: 'Banho',
          sale_amount_override: 70,
          isAddon: false,
        },
        {
          hub_service_type_id: 'dentes',
          name: 'Escovar Dentes',
          isAddon: true,
        },
      ],
    });

    expect(preview.lines[0]).toMatchObject({
      name: 'Banho',
      sale: 100,
      effectiveSale: 70,
      hasSpecialOverride: true,
    });
    expect(preview.lines[1]).toMatchObject({
      name: 'Escovar Dentes',
      sale: 10,
      effectiveSale: 10,
      hasSpecialOverride: false,
    });
    expect(preview.totalSale).toBe(80);
  });
});
