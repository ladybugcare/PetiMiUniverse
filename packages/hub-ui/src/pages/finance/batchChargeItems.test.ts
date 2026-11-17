import { describe, expect, it } from 'vitest';
import type { HubFinanceDayBoardItem, HubFinanceReceivable } from '../../api/hubFinancialApi';
import {
  applyVisitKeysToBatchItems,
  assertSameGuardian,
  buildBatchChargeItems,
  resolveVisitKey,
  sumBatchChargeAmount,
  type BatchChargeItem,
} from './batchChargeItems';

function rv(
  partial: Partial<HubFinanceReceivable> & Pick<HubFinanceReceivable, 'id' | 'status' | 'final_amount'>,
): HubFinanceReceivable {
  return {
    clinic_id: 'c',
    unit_id: null,
    guardian_id: 'g1',
    source_type: 'manual',
    source_id: partial.id,
    original_amount: partial.final_amount,
    currency: 'BRL',
    created_at: '2026-09-01T00:00:00Z',
    due_date: null,
    ...partial,
  };
}

describe('buildBatchChargeItems', () => {
  const asOf = new Date('2026-09-03T12:00:00');

  it('inclui recebíveis pagáveis e ordena vencidos primeiro', () => {
    const items = buildBatchChargeItems(
      [
        rv({ id: 'r-ok', status: 'pending', final_amount: 50, due_date: '2026-09-20' }),
        rv({ id: 'r-over', status: 'pending', final_amount: 80, due_date: '2026-09-01' }),
        rv({ id: 'r-paid', status: 'paid', final_amount: 10, due_date: '2026-08-01' }),
      ],
      [],
      { asOf },
    );
    expect(items.map((i) => i.id)).toEqual(['r-over', 'r-ok']);
    expect(items[0].tone).toBe('overdue');
    expect(items[1].tone).toBe('ok');
  });

  it('exclui comanda aberta se já tem recebível pagável', () => {
    const items = buildBatchChargeItems(
      [rv({ id: 'r1', status: 'pending', final_amount: 100, comanda_id: 'c1', due_date: '2026-09-10' })],
      [{ id: 'c1', status: 'aberta', total_amount: 100, guardian_id: 'g1', item_labels: ['Banho'] }],
      { asOf },
    );
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('receivable');
  });

  it('inclui comanda aberta sem recebível', () => {
    const items = buildBatchChargeItems(
      [],
      [{ id: 'c2', status: 'aberta', total_amount: 145, guardian_id: 'g1', item_labels: ['Tosa'] }],
      { asOf },
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'comanda', title: 'Tosa', amount: 145 });
  });

  it('não reinsere comanda aberta já quitada (balance_due 0)', () => {
    const items = buildBatchChargeItems(
      [rv({ id: 'r-paid', status: 'paid', final_amount: 100, comanda_id: 'c1' })],
      [{ id: 'c1', status: 'aberta', total_amount: 100, balance_due: 0, guardian_id: 'g1', item_labels: ['Banho'] }],
      { asOf },
    );
    expect(items).toHaveLength(0);
  });

  it('usa balance_due da comanda aberta quando enrich trouxe o saldo', () => {
    const items = buildBatchChargeItems(
      [],
      [{ id: 'c3', status: 'aberta', total_amount: 200, balance_due: 40, guardian_id: 'g1', item_labels: ['Hotel'] }],
      { asOf },
    );
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(40);
  });

  it('soma valores selecionados', () => {
    const items = buildBatchChargeItems(
      [
        rv({ id: 'a', status: 'pending', final_amount: 100, due_date: '2026-09-10' }),
        rv({ id: 'b', status: 'partially_paid', final_amount: 50, due_date: '2026-09-10' }),
      ],
      [],
      { asOf },
    );
    expect(sumBatchChargeAmount(items)).toBe(150);
  });
});

describe('assertSameGuardian', () => {
  it('bloqueia tutores diferentes', () => {
    expect(() =>
      assertSameGuardian([
        {
          kind: 'receivable',
          id: '1',
          comandaId: null,
          receivableId: '1',
          title: 'A',
          amount: 10,
          dueDate: null,
          tone: 'none',
          petLabel: 'P',
          guardianId: 'g1',
        },
        {
          kind: 'receivable',
          id: '2',
          comandaId: null,
          receivableId: '2',
          title: 'B',
          amount: 20,
          dueDate: null,
          tone: 'none',
          petLabel: 'P',
          guardianId: 'g2',
        },
      ]),
    ).toThrow(/mesmo tutor/);
  });
});

describe('resolveVisitKey', () => {
  it('usa visit_group_id quando presente', () => {
    const key = resolveVisitKey(
      { origin_type: 'appointment', origin_id: 'a1', visit_group_id: 'vg1' },
      [],
    );
    expect(key).toBe('vg:vg1');
  });

  it('usa parent_appointment_id para pernas L&T e blocos filhos', () => {
    const key = resolveVisitKey(
      {
        origin_type: 'appointment',
        origin_id: 'pickup1',
        parent_appointment_id: 'main1',
        appointment_kind: 'pickup_route',
      },
      [],
    );
    expect(key).toBe('ap:main1');
  });

  it('herda visit_group do appointment pai quando a perna só tem parent', () => {
    const peers = [
      { origin_type: 'appointment', origin_id: 'main1', visit_group_id: 'vg9' },
      {
        origin_type: 'appointment',
        origin_id: 'pickup1',
        parent_appointment_id: 'main1',
        appointment_kind: 'pickup_route',
      },
    ];
    expect(resolveVisitKey(peers[1], peers)).toBe('vg:vg9');
    expect(resolveVisitKey(peers[0], peers)).toBe('vg:vg9');
  });

  it('ancora o principal quando peers apontam parent para ele', () => {
    const peers = [
      { origin_type: 'appointment', origin_id: 'main1' },
      { origin_type: 'appointment', origin_id: 'child1', parent_appointment_id: 'main1' },
    ];
    expect(resolveVisitKey(peers[0], peers)).toBe('ap:main1');
    expect(resolveVisitKey(peers[1], peers)).toBe('ap:main1');
  });
});

describe('applyVisitKeysToBatchItems', () => {
  const billing = {
    comanda_id: null as string | null,
    comanda_status: 'aberta' as const,
    has_receivable: false,
    receivable_status: null,
    finance_handoff_at: null,
    active_receivable_id: null,
    due_date: null,
  };

  function board(
    partial: Partial<HubFinanceDayBoardItem> & Pick<HubFinanceDayBoardItem, 'origin_id' | 'billing'>,
  ): HubFinanceDayBoardItem {
    return {
      origin_type: 'appointment',
      origin_label: 'Agenda',
      starts_at: null,
      guardian_id: 'g1',
      guardian: null,
      pet_id: null,
      pet: null,
      operational_status: 'confirmed',
      estimated_amount: 10,
      services: [],
      ...partial,
    };
  }

  it('marca Mesma visita só quando ≥2 itens compartilham a chave', () => {
    const sources = [
      board({
        origin_id: 'main',
        visit_group_id: 'vg',
        billing: { ...billing, comanda_id: 'c1' },
      }),
      board({
        origin_id: 'child',
        visit_group_id: 'vg',
        parent_appointment_id: 'main',
        billing: { ...billing, comanda_id: 'c2' },
      }),
      board({
        origin_id: 'indep',
        billing: { ...billing, comanda_id: 'c3' },
      }),
    ];
    const batch: BatchChargeItem[] = [
      {
        kind: 'comanda',
        id: 'c1',
        comandaId: 'c1',
        receivableId: null,
        title: 'Banho',
        amount: 80,
        dueDate: null,
        tone: 'none',
        petLabel: 'P',
        guardianId: 'g1',
      },
      {
        kind: 'comanda',
        id: 'c2',
        comandaId: 'c2',
        receivableId: null,
        title: 'Consulta',
        amount: 100,
        dueDate: null,
        tone: 'none',
        petLabel: 'P',
        guardianId: 'g1',
      },
      {
        kind: 'comanda',
        id: 'c3',
        comandaId: 'c3',
        receivableId: null,
        title: 'Indep',
        amount: 100,
        dueDate: null,
        tone: 'none',
        petLabel: 'P',
        guardianId: 'g1',
      },
    ];
    const out = applyVisitKeysToBatchItems(batch, sources);
    expect(out[0].visitKey).toBe('vg:vg');
    expect(out[1].visitKey).toBe('vg:vg');
    expect(out[2].visitKey).toBeNull();
  });
});
