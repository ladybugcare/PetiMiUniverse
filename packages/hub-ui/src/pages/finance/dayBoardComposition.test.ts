import { describe, expect, it } from 'vitest';
import type { HubFinanceDayBoardItem } from '../../api/hubFinancialApi';
import { dayBoardCompositionLabel, resolveDayBoardComposition } from './dayBoardComposition';

function baseItem(overrides: Partial<HubFinanceDayBoardItem>): HubFinanceDayBoardItem {
  return {
    origin_type: 'appointment',
    origin_id: 'a1',
    origin_label: 'Agenda',
    starts_at: null,
    guardian_id: null,
    guardian: null,
    pet_id: null,
    pet: null,
    operational_status: 'confirmed',
    estimated_amount: 0,
    services: [],
    billing: {
      comanda_id: null,
      comanda_status: null,
      has_receivable: false,
      receivable_status: null,
      finance_handoff_at: null,
      active_receivable_id: null,
      due_date: null,
    },
    ...overrides,
  };
}

describe('resolveDayBoardComposition', () => {
  it('marca misto quando há serviço e produto', () => {
    expect(
      resolveDayBoardComposition(
        baseItem({
          origin_type: 'manual',
          services: [
            { name: 'Banho', amount: 40, kind: 'service' },
            { name: 'Shampoo', amount: 20, kind: 'product' },
          ],
        }),
      ),
    ).toBe('mixed');
  });

  it('marca produto só com linhas de produto', () => {
    expect(
      resolveDayBoardComposition(
        baseItem({
          origin_type: 'manual',
          services: [{ name: 'Ração', amount: 50, kind: 'product' }],
        }),
      ),
    ).toBe('product');
  });

  it('assume serviço em origem de agenda sem kind', () => {
    expect(
      resolveDayBoardComposition(
        baseItem({
          services: [{ name: 'Consulta', amount: 100 }],
        }),
      ),
    ).toBe('service');
  });

  it('rótulos em pt-BR', () => {
    expect(dayBoardCompositionLabel('service')).toBe('Serviço');
    expect(dayBoardCompositionLabel('product')).toBe('Produto');
    expect(dayBoardCompositionLabel('mixed')).toBe('Serviço e produto');
  });
});
