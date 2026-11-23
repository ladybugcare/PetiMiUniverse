import { describe, expect, it } from 'vitest';
import {
  buildManualDayBoardItem,
  buildManualDayBoardServices,
  buildManualServicesFromReceivableLines,
} from '../hubFinanceDayBoardManual';

describe('hubFinanceDayBoardManual', () => {
  it('lista serviços e produtos com quantidade', () => {
    const services = buildManualDayBoardServices([
      {
        comanda_id: 'c1',
        description: 'Banho',
        line_total: 40,
        quantity: 1,
        item_kind: 'service',
        pet_id: null,
        status: 'open',
      },
      {
        comanda_id: 'c1',
        description: 'Ração 2kg',
        line_total: 60,
        quantity: 2,
        item_kind: 'product',
        pet_id: null,
        status: 'open',
      },
    ]);
    expect(services).toEqual([
      { name: 'Banho', amount: 40, kind: 'service' },
      { name: 'Ração 2kg ×2', amount: 60, kind: 'product' },
    ]);
  });

  it('monta item de venda rápida com tutor/pet e total', () => {
    const item = buildManualDayBoardItem(
      {
        id: 'c1',
        origin_id: 'orig-1',
        status: 'aberta',
        opened_at: '2026-11-23T12:00:00.000Z',
        total_amount: 100,
        finance_handoff_at: null,
        guardian_id: 'g1',
        pet_id: 'p1',
        guardian: { id: 'g1', full_name: 'Ana' },
        pet: { id: 'p1', name: 'Lola' },
      },
      [
        {
          comanda_id: 'c1',
          description: 'Consulta',
          line_total: 100,
          quantity: 1,
          item_kind: 'service',
          pet_id: 'p1',
          status: 'open',
        },
      ],
    );
    expect(item.origin_label).toBe('Venda rápida');
    expect(item.guardian?.full_name).toBe('Ana');
    expect(item.pet?.name).toBe('Lola');
    expect(item.estimated_amount).toBe(100);
    expect(item.services).toHaveLength(1);
  });

  it('monta serviços a partir de linhas de recebível avulso', () => {
    const services = buildManualServicesFromReceivableLines([
      { description: 'Shampoo', line_total: 25, quantity: 1, line_kind: 'product' },
      { description: 'Tosa', line_total: 50, quantity: 1, line_kind: 'manual' },
    ]);
    expect(services.map((s) => s.name)).toEqual(['Shampoo', 'Tosa']);
  });
});
