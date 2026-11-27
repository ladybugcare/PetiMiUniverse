import { describe, expect, it } from 'vitest';
import type { HubFinanceDayBoardItem } from '../../api/hubFinancialApi';
import {
  buildCaixaSessionHistoryItems,
  buildHistoryChips,
  resolveComposition,
  resolveSaleChannel,
  sumDayBoardPendingAmount,
  sumOpenComandasPendingAmount,
} from './hubCaixaSessionHistory';

function dayBoardItem(
  partial: Partial<HubFinanceDayBoardItem['billing']> & {
    estimated_amount?: number;
    origin_id?: string;
    has_receivable?: boolean;
    coverage_kind?: HubFinanceDayBoardItem['coverage_kind'];
  } = {},
): HubFinanceDayBoardItem {
  const { estimated_amount, origin_id, has_receivable, coverage_kind, ...billing } = partial;
  return {
    origin_type: 'appointment',
    origin_id: origin_id ?? 'appt-1',
    origin_label: 'Consulta',
    starts_at: '2026-09-04T10:00:00.000Z',
    guardian_id: null,
    guardian: { id: 'g1', full_name: 'Ana' },
    pet_id: null,
    pet: { id: 'p1', name: 'Luna' },
    operational_status: 'done',
    estimated_amount: estimated_amount ?? 100,
    services: [],
    coverage_kind,
    billing: {
      comanda_id: 'c1',
      comanda_status: 'aberta',
      has_receivable: has_receivable ?? true,
      receivable_status: 'pending',
      finance_handoff_at: null,
      ...billing,
    },
  };
}

describe('sumDayBoardPendingAmount', () => {
  it('ignora item enviado ao financeiro', () => {
    expect(
      sumDayBoardPendingAmount([
        dayBoardItem({ finance_handoff_at: '2026-09-04T20:00:00.000Z', estimated_amount: 90 }),
        dayBoardItem({ finance_handoff_at: null, estimated_amount: 40 }),
      ]),
    ).toBe(40);
  });

  it('ignora ocorrência com fatura mensal pendente (series_pending)', () => {
    expect(
      sumDayBoardPendingAmount([
        dayBoardItem({
          coverage_kind: 'series_pending',
          estimated_amount: 0,
          finance_handoff_at: null,
          has_receivable: false,
          comanda_id: null,
          receivable_status: null,
        }),
        dayBoardItem({ finance_handoff_at: null, estimated_amount: 40 }),
      ]),
    ).toBe(40);
  });

  it('pagamento parcial usa saldo restante (receivable_amount), não o bruto estimado', () => {
    expect(
      sumDayBoardPendingAmount([
        dayBoardItem({
          estimated_amount: 80,
          receivable_status: 'partially_paid',
          receivable_amount: 40,
        }),
      ]),
    ).toBe(40);
  });

  it('pending com receivable_amount usa o saldo do título', () => {
    expect(
      sumDayBoardPendingAmount([
        dayBoardItem({
          estimated_amount: 80,
          receivable_status: 'pending',
          receivable_amount: 80,
        }),
      ]),
    ).toBe(80);
  });

  it('sem recebível continua no estimated_amount', () => {
    expect(
      sumDayBoardPendingAmount([
        dayBoardItem({
          estimated_amount: 55,
          has_receivable: false,
          receivable_status: null,
          receivable_amount: null,
        }),
      ]),
    ).toBe(55);
  });
});

describe('sumOpenComandasPendingAmount', () => {
  it('ignora comanda já enviada ao financeiro', () => {
    expect(
      sumOpenComandasPendingAmount(
        [
          { id: 'c-old', status: 'aberta', finance_handoff_at: '2026-09-04T20:00:00.000Z', total_amount: 70 },
          { id: 'c-open', status: 'aberta', finance_handoff_at: null, total_amount: 30 },
        ],
        new Set(),
      ),
    ).toBe(30);
  });

  it('prefere balance_due ao total_amount (pagamento parcial)', () => {
    expect(
      sumOpenComandasPendingAmount(
        [{ id: 'c1', status: 'aberta', finance_handoff_at: null, total_amount: 80, balance_due: 40 }],
        new Set(),
      ),
    ).toBe(40);
  });
});

describe('buildCaixaSessionHistoryItems', () => {
  it('não lista handoff como pendência do caixa', () => {
    const items = buildCaixaSessionHistoryItems(
      null,
      [dayBoardItem({ finance_handoff_at: '2026-09-04T20:00:00.000Z' })],
      [
        {
          id: 'c-old',
          status: 'aberta',
          finance_handoff_at: '2026-09-04T20:00:00.000Z',
          opened_at: '2026-09-03T10:00:00.000Z',
          total_amount: 70,
        },
      ],
    );
    expect(items).toEqual([]);
  });

  it('exibe troco estruturado no subtítulo do pagamento cash', () => {
    const items = buildCaixaSessionHistoryItems(
      {
        id: 'sess-1',
        clinic_id: 'c1',
        unit_id: 'u1',
        status: 'open',
        opened_at: '2026-09-04T08:00:00.000Z',
        opening_balance: 0,
        all_payments: [
          {
            id: 'pay-1',
            amount: 70,
            payment_method: 'cash',
            payment_date: '2026-09-04T09:00:00.000Z',
            tendered_amount: 100,
            change_amount: 30,
            notes: null,
            receivable: { id: 'rec-1', comanda_id: 'com-1' },
          },
        ],
        payments: [],
        movements: [],
      } as never,
      [],
      [],
    );
    const pay = items.find((i) => i.row_kind === 'payment');
    expect(pay?.subtitle).toMatch(/Troco R\$ 30\.00/);
    expect(pay?.subtitle).toMatch(/recebido R\$ 100\.00/);
    expect(pay?.payment_id).toBe('pay-1');
    expect(pay?.receivable_id).toBe('rec-1');
    expect(pay?.comanda_id).toBe('com-1');
  });

  it('propaga refs de comanda e recebível nos itens de billing', () => {
    const items = buildCaixaSessionHistoryItems(
      null,
      [
        dayBoardItem({
          origin_id: 'appt-open',
          comanda_id: 'c-open',
          comanda_status: 'aberta',
          active_receivable_id: null,
          has_receivable: false,
          receivable_status: null as never,
        }),
        dayBoardItem({
          origin_id: 'appt-bill',
          comanda_id: 'c-bill',
          active_receivable_id: 'rec-9',
          receivable_status: 'pending',
        }),
      ],
      [{ id: 'c-extra', status: 'aberta', opened_at: '2026-09-04T11:00:00.000Z', total_amount: 55 }],
    );

    const openRow = items.find((i) => i.comanda_id === 'c-open');
    const billingRow = items.find((i) => i.receivable_id === 'rec-9');
    const extra = items.find((i) => i.comanda_id === 'c-extra');

    expect(openRow?.comanda_id).toBe('c-open');
    expect(openRow?.receivable_id).toBeNull();
    expect(billingRow?.comanda_id).toBe('c-bill');
    expect(billingRow?.receivable_id).toBe('rec-9');
    expect(extra?.comanda_id).toBe('c-extra');
  });

  it('rotula atendimento sem comanda como Sem comanda', () => {
    const items = buildCaixaSessionHistoryItems(
      null,
      [
        {
          ...dayBoardItem({
            origin_id: 'appt-sem',
            comanda_id: null,
            comanda_status: null,
            has_receivable: false,
            receivable_status: null as never,
            active_receivable_id: null,
          }),
          services: [{ name: 'Consulta', amount: 90 }],
        },
      ],
      [],
    );
    const row = items.find((i) => i.origin_id === 'appt-sem');
    expect(row?.title).toBe('Sem comanda');
    expect(row?.subtitle).toBe('Consulta');
    expect(row?.comanda_id).toBeNull();
    expect(row?.origin_type).toBe('appointment');
  });

  it('fallback de subtítulo com comanda quando não há chips', () => {
    const items = buildCaixaSessionHistoryItems(
      {
        id: 'sess-2',
        clinic_id: 'c1',
        unit_id: 'u1',
        status: 'open',
        opened_at: '2026-09-04T08:00:00.000Z',
        opening_balance: 0,
        all_payments: [
          {
            id: 'pay-2',
            amount: 200,
            payment_method: 'debit_card',
            payment_date: '2026-09-04T09:00:00.000Z',
            notes: null,
            receivable: { id: 'rec-2', comanda_id: 'com-abc' },
          },
        ],
        payments: [],
        movements: [],
      } as never,
      [],
      [],
    );
    const pay = items.find((i) => i.row_kind === 'payment');
    expect(pay?.subtitle).toMatch(/Comanda #com-abc/);
    expect(pay?.comanda_id).toBe('com-abc');
  });

  it('marca venda rápida de produto com chips e canal', () => {
    const items = buildCaixaSessionHistoryItems(
      {
        id: 'sess-3',
        clinic_id: 'c1',
        unit_id: 'u1',
        status: 'open',
        opened_at: '2026-09-04T08:00:00.000Z',
        opening_balance: 0,
        all_payments: [
          {
            id: 'pay-3',
            amount: 89.9,
            payment_method: 'pix',
            payment_date: '2026-09-04T09:30:00.000Z',
            notes: null,
            receivable: {
              id: 'rec-3',
              comanda_id: 'com-quick',
              comanda_origin_type: 'manual',
              has_product: true,
              has_service: false,
            },
          },
        ],
        payments: [],
        movements: [],
      } as never,
      [],
      [],
    );
    const pay = items.find((i) => i.row_kind === 'payment');
    expect(pay?.sale_channel).toBe('quick_sale');
    expect(pay?.composition).toBe('product');
    expect(pay?.chips?.map((c) => c.label)).toEqual(['Venda rápida', 'Produto']);
    expect(pay?.subtitle).toBe('');
  });

  it('marca pagamento de agenda como serviço', () => {
    const items = buildCaixaSessionHistoryItems(
      {
        id: 'sess-4',
        clinic_id: 'c1',
        unit_id: 'u1',
        status: 'open',
        opened_at: '2026-09-04T08:00:00.000Z',
        opening_balance: 0,
        all_payments: [
          {
            id: 'pay-4',
            amount: 200,
            payment_method: 'debit_card',
            payment_date: '2026-09-04T10:00:00.000Z',
            notes: null,
            receivable: {
              id: 'rec-4',
              comanda_id: 'com-agenda',
              comanda_origin_type: 'appointment',
              has_product: false,
              has_service: true,
            },
          },
        ],
        payments: [],
        movements: [],
      } as never,
      [],
      [],
    );
    const pay = items.find((i) => i.row_kind === 'payment');
    expect(pay?.sale_channel).toBe('agenda');
    expect(pay?.composition).toBe('service');
    expect(pay?.chips?.map((c) => c.label)).toEqual(['Agenda', 'Serviço']);
  });

  it('comanda manual aberta vira Venda rápida', () => {
    const items = buildCaixaSessionHistoryItems(
      null,
      [],
      [
        {
          id: 'c-manual',
          status: 'aberta',
          origin_type: 'manual',
          opened_at: '2026-09-04T11:00:00.000Z',
          total_amount: 40,
          items: [{ item_kind: 'product' }],
          guardian: { full_name: 'Beatriz' },
        },
      ],
    );
    const row = items.find((i) => i.comanda_id === 'c-manual');
    expect(row?.title).toBe('Venda rápida');
    expect(row?.sale_channel).toBe('quick_sale');
    expect(row?.composition).toBe('product');
    expect(row?.chips?.map((c) => c.label)).toEqual(['Venda rápida', 'Produto']);
  });

  it('trata item com hub_inventory_item_id como produto mesmo se item_kind vier errado', () => {
    const items = buildCaixaSessionHistoryItems(
      null,
      [],
      [
        {
          id: 'c-inv',
          status: 'aberta',
          origin_type: 'manual',
          opened_at: '2026-09-04T11:00:00.000Z',
          total_amount: 50,
          items: [{ item_kind: 'service', hub_inventory_item_id: 'inv-1' }],
          guardian: { full_name: 'Beatriz' },
        },
      ],
    );
    const row = items.find((i) => i.comanda_id === 'c-inv');
    expect(row?.composition).toBe('product');
    expect(row?.chips?.map((c) => c.label)).toEqual(['Venda rápida', 'Produto']);
  });

  it('dayboard sem serviços não força chip Serviço', () => {
    const items = buildCaixaSessionHistoryItems(
      null,
      [
        {
          origin_type: 'appointment',
          origin_id: 'ap-1',
          origin_label: 'Consulta',
          estimated_amount: 100,
          services: [],
          billing: {
            comanda_id: 'com-db',
            receivable_status: 'pending',
            finance_handoff_at: null,
            active_receivable_id: null,
          },
          guardian: { full_name: 'Ana' },
          pet: { name: 'Rex' },
        } as never,
      ],
      [],
    );
    const row = items.find((i) => i.id.startsWith('billing:dayboard:'));
    expect(row?.chips?.map((c) => c.label)).toEqual(['Agenda']);
    expect(row?.composition).toBeNull();
  });
});

describe('resolveSaleChannel / composition / chips', () => {
  it('resolve canais e composição', () => {
    expect(resolveSaleChannel('manual')).toBe('quick_sale');
    expect(resolveSaleChannel('appointment')).toBe('agenda');
    expect(resolveComposition(true, false)).toBe('product');
    expect(resolveComposition(false, true)).toBe('service');
    expect(resolveComposition(true, true)).toBe('mixed');
    expect(
      buildHistoryChips({
        saleChannel: 'quick_sale',
        composition: 'mixed',
      }).map((c) => c.label),
    ).toEqual(['Venda rápida', 'Misto']);
  });
});
