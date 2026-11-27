import { aggregateCashSessionShiftBreakdown } from '../cashSessionShiftBreakdown';

describe('aggregateCashSessionShiftBreakdown', () => {
  it('soma por método e rateia misto produto+serviço por setor', () => {
    const serviceMeta = new Map([['svc-banho', { service_group: 'banho_tosa' }]]);
    const result = aggregateCashSessionShiftBreakdown({
      payments: [
        { id: 'p1', amount: 100, payment_method: 'pix', receivable_id: 'r1' },
        { id: 'p2', amount: 50, payment_method: 'cash', receivable_id: 'r2' },
      ],
      lines: [
        {
          receivable_id: 'r1',
          line_kind: 'service',
          hub_service_type_id: 'svc-banho',
          hub_inventory_item_id: null,
          line_total: 70,
        },
        {
          receivable_id: 'r1',
          line_kind: 'product',
          hub_service_type_id: null,
          hub_inventory_item_id: 'item-1',
          line_total: 30,
        },
        {
          receivable_id: 'r2',
          line_kind: 'service',
          hub_service_type_id: 'svc-banho',
          hub_inventory_item_id: null,
          line_total: 50,
        },
      ],
      serviceMeta,
    });

    expect(result.received_total).toBe(150);
    expect(result.totals_by_method).toEqual({ pix: 100, cash: 50 });
    expect(result.by_sector).toEqual([
      { service_group: 'banho_tosa', total: 120, share_pct: 80 },
      { service_group: 'produtos', total: 30, share_pct: 20 },
    ]);
  });

  it('pagamento sem linhas cai em outros', () => {
    const result = aggregateCashSessionShiftBreakdown({
      payments: [{ id: 'p1', amount: 40, payment_method: 'credit_card', receivable_id: 'r-empty' }],
      lines: [],
      serviceMeta: new Map(),
    });
    expect(result.by_sector).toEqual([{ service_group: 'outros', total: 40, share_pct: 100 }]);
  });

  it('pagamento parcial rateia na proporção das linhas', () => {
    const serviceMeta = new Map([
      ['svc-cli', { service_group: 'clinica' }],
      ['svc-banho', { service_group: 'banho_tosa' }],
    ]);
    const result = aggregateCashSessionShiftBreakdown({
      payments: [{ id: 'p1', amount: 50, payment_method: 'pix', receivable_id: 'r1' }],
      lines: [
        {
          receivable_id: 'r1',
          line_kind: 'service',
          hub_service_type_id: 'svc-banho',
          hub_inventory_item_id: null,
          line_total: 60,
        },
        {
          receivable_id: 'r1',
          line_kind: 'service',
          hub_service_type_id: 'svc-cli',
          hub_inventory_item_id: null,
          line_total: 40,
        },
      ],
      serviceMeta,
    });
    expect(result.received_total).toBe(50);
    expect(result.by_sector.find((s) => s.service_group === 'banho_tosa')?.total).toBe(30);
    expect(result.by_sector.find((s) => s.service_group === 'clinica')?.total).toBe(20);
  });
});
