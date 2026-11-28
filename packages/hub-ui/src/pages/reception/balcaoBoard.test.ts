import { describe, expect, it } from 'vitest';
import type { ReceptionBoardItem } from '../../api/hubReceptionApi';
import type { HubFinanceDayBoardItem, HubFinanceUnbilledItem } from '../../api/hubFinancialApi';
import {
  buildBalcaoChargeQueue,
  buildBalcaoCustodySections,
  buildBalcaoDeskColumns,
  chargeCtaLabel,
  filterBalcaoCustodyByChip,
  findOpenExitHandoffForPet,
  groupBalcaoChargesByTutor,
  matchesBalcaoSearch,
  type BalcaoChargeItem,
} from './balcaoBoard';

function handoff(
  partial: Partial<ReceptionBoardItem> & Pick<ReceptionBoardItem, 'id' | 'kind' | 'status'>,
): ReceptionBoardItem {
  return {
    source_type: 'appointment',
    source_id: partial.id,
    context: {},
    opened_at: '2026-11-28T12:00:00.000Z',
    resolved_at: null,
    resolution: null,
    pet: { id: `pet-${partial.id}`, name: `Pet ${partial.id}` },
    guardian: { id: `g-${partial.id}`, full_name: `Tutor ${partial.id}`, phone: null },
    charge_pending: null,
    ...partial,
  };
}

function dayBoard(partial: Partial<HubFinanceDayBoardItem> & Pick<HubFinanceDayBoardItem, 'origin_id'>): HubFinanceDayBoardItem {
  return {
    origin_type: 'grooming_session',
    origin_label: 'Banho',
    starts_at: '2026-11-28T10:00:00.000Z',
    guardian_id: 'g1',
    guardian: { id: 'g1', full_name: 'Ana' },
    pet_id: 'p1',
    pet: { id: 'p1', name: 'Thor' },
    operational_status: 'closed',
    estimated_amount: 80,
    services: [],
    billing: {
      comanda_id: null,
      comanda_status: null,
      has_receivable: false,
      receivable_status: null,
      finance_handoff_at: null,
    },
    ...partial,
  };
}

describe('buildBalcaoCustodySections', () => {
  it('ordena seções por urgência do balcão', () => {
    const sections = buildBalcaoCustodySections([
      handoff({ id: '1', kind: 'chegada', status: 'open' }),
      handoff({ id: '2', kind: 'lt_falha', status: 'open' }),
      handoff({ id: '3', kind: 'autorizar_extra', status: 'open' }),
      handoff({ id: '4', kind: 'retirada_balcao', status: 'open', charge_pending: true }),
      handoff({ id: '5', kind: 'saida_prevista', status: 'open' }),
      handoff({ id: '6', kind: 'no_consultorio', status: 'open' }),
      handoff({
        id: '7',
        kind: 'chegada',
        status: 'done',
        resolved_at: '2026-11-28T13:00:00.000Z',
      }),
    ]);

    expect(sections.atencao.map((i) => i.id)).toEqual(['2', '3']);
    expect(sections.saidas.map((i) => i.id)).toEqual(['4']);
    expect(sections.chegadas.map((i) => i.id)).toEqual(['1']);
    expect(sections.acompanhar.map((i) => i.id)).toEqual(['5', '6']);
    expect(sections.feitos.map((i) => i.id)).toEqual(['7']);
  });
});

describe('buildBalcaoDeskColumns', () => {
  it('separa subgrupos de chegadas e saídas', () => {
    const sections = buildBalcaoCustodySections([
      handoff({ id: '1', kind: 'chegada', status: 'open' }),
      handoff({ id: '2', kind: 'no_consultorio', status: 'open' }),
      handoff({ id: '3', kind: 'retirada_balcao', status: 'open' }),
      handoff({ id: '4', kind: 'saida_prevista', status: 'open' }),
      handoff({ id: '5', kind: 'lt_falha', status: 'open' }),
    ]);
    const cols = buildBalcaoDeskColumns(sections);
    expect(cols.chegadasPending.map((i) => i.id)).toEqual(['1']);
    expect(cols.chegadasInSector.map((i) => i.id)).toEqual(['2']);
    expect(cols.saidasReady.map((i) => i.id)).toEqual(['3']);
    expect(cols.saidasPreparing.map((i) => i.id)).toEqual(['4']);
    expect(cols.atencao.map((i) => i.id)).toEqual(['5']);
  });
});

describe('filterBalcaoCustodyByChip', () => {
  it('isola chegadas e mantém no_consultorio no acompanhar', () => {
    const base = buildBalcaoCustodySections([
      handoff({ id: '1', kind: 'chegada', status: 'open' }),
      handoff({ id: '2', kind: 'lt_falha', status: 'open' }),
      handoff({ id: '3', kind: 'no_consultorio', status: 'open' }),
      handoff({ id: '4', kind: 'saida_prevista', status: 'open' }),
    ]);
    const filtered = filterBalcaoCustodyByChip(base, 'chegadas');
    expect(filtered.chegadas).toHaveLength(1);
    expect(filtered.atencao).toHaveLength(0);
    expect(filtered.acompanhar.map((i) => i.id)).toEqual(['3']);
  });

  it('isola saídas e mantém saida_prevista no acompanhar', () => {
    const base = buildBalcaoCustodySections([
      handoff({ id: '1', kind: 'retirada_balcao', status: 'open' }),
      handoff({ id: '2', kind: 'saida_prevista', status: 'open' }),
      handoff({ id: '3', kind: 'no_consultorio', status: 'open' }),
    ]);
    const filtered = filterBalcaoCustodyByChip(base, 'saidas');
    expect(filtered.saidas).toHaveLength(1);
    expect(filtered.acompanhar.map((i) => i.id)).toEqual(['2']);
  });
});

describe('buildBalcaoChargeQueue', () => {
  it('une day-board, carryover e unbilled sem duplicar origem', () => {
    const dayBoardItems = [
      dayBoard({
        origin_id: 'gs1',
        billing: {
          comanda_id: null,
          comanda_status: null,
          has_receivable: false,
          receivable_status: null,
        },
      }),
      dayBoard({
        origin_id: 'gs2',
        pet: { id: 'p2', name: 'Luna' },
        billing: {
          comanda_id: 'c-open',
          comanda_status: 'aberta',
          has_receivable: false,
          receivable_status: null,
          finance_handoff_at: null,
        },
      }),
    ];

    const openComandas = [
      {
        id: 'c-carry',
        status: 'aberta',
        opened_at: '2026-11-27T10:00:00.000Z',
        total_amount: 50,
        paid_total: 0,
        balance_due: 50,
        origin_type: 'encounter',
        origin_id: 'enc1',
        pet: { name: 'Bob' },
        guardian: { full_name: 'Bia' },
        origin_label: 'Consulta',
      },
    ];

    const unbilledItems: HubFinanceUnbilledItem[] = [
      {
        source_type: 'grooming_session',
        source_id: 'gs1',
        origin_label: 'Banho duplicado',
        completed_at: '2026-11-28T11:00:00.000Z',
        unit_id: 'u1',
        guardian: { id: 'g1', full_name: 'Ana' },
        pet: { id: 'p1', name: 'Thor' },
        staff: null,
        estimated_amount: 80,
        operational_status: 'closed',
      },
      {
        source_type: 'encounter',
        source_id: 'enc-new',
        origin_label: 'Consulta sem cobrança',
        completed_at: '2026-11-28T09:00:00.000Z',
        unit_id: 'u1',
        guardian: { id: 'g3', full_name: 'Carlos' },
        pet: { id: 'p3', name: 'Mel' },
        staff: null,
        estimated_amount: 120,
        operational_status: 'completed',
      },
    ];

    const queue = buildBalcaoChargeQueue({
      dayBoardItems,
      openComandas,
      unbilledItems,
      todayYmd: '2026-11-28',
    });

    expect(queue.map((i) => i.key)).toEqual([
      'grooming_session:gs1',
      'grooming_session:gs2',
      'comanda:c-carry',
      'encounter:enc-new',
    ]);
    expect(queue[0].kind).toBe('sem_comanda');
    expect(queue[1].kind).toBe('comanda_aberta');
    expect(queue[2].kind).toBe('comanda_aberta');
    expect(queue[3].kind).toBe('sem_comanda');
  });

  it('ignora day-board já enviado ao financeiro', () => {
    const queue = buildBalcaoChargeQueue({
      dayBoardItems: [
        dayBoard({
          origin_id: 'gs1',
          billing: {
            comanda_id: 'c1',
            comanda_status: 'aberta',
            has_receivable: false,
            receivable_status: null,
            finance_handoff_at: '2026-11-28T15:00:00.000Z',
          },
        }),
      ],
      openComandas: [],
      unbilledItems: [],
      todayYmd: '2026-11-28',
    });
    expect(queue).toEqual([]);
  });

  it('exclui a_receber da fila operacional do balcão', () => {
    const queue = buildBalcaoChargeQueue({
      dayBoardItems: [
        dayBoard({
          origin_id: 'gs-recv',
          billing: {
            comanda_id: 'c-recv',
            comanda_status: 'fechada',
            has_receivable: true,
            receivable_status: 'pending',
            finance_handoff_at: null,
          },
        }),
        dayBoard({
          origin_id: 'gs-ok',
          pet_id: 'p2',
          pet: { id: 'p2', name: 'Luna' },
          billing: {
            comanda_id: null,
            comanda_status: null,
            has_receivable: false,
            receivable_status: null,
          },
        }),
      ],
      openComandas: [],
      unbilledItems: [],
      todayYmd: '2026-11-28',
    });
    expect(queue.map((i) => i.key)).toEqual(['grooming_session:gs-ok']);
    expect(queue.every((i) => i.kind !== 'a_receber')).toBe(true);
  });
});

describe('groupBalcaoChargesByTutor', () => {
  it('agrupa por guardian_id preservando itens', () => {
    const items: BalcaoChargeItem[] = [
      {
        key: 'a',
        pet_id: 'p1',
        pet_name: 'Thor',
        guardian_id: 'g1',
        guardian_name: 'Ana',
        label: 'Banho',
        amount: 80,
        kind: 'sem_comanda',
        comanda_id: null,
        origin_type: 'grooming_session',
        origin_id: '1',
        open_origin_type: 'grooming_session',
        open_origin_id: '1',
      },
      {
        key: 'b',
        pet_id: 'p2',
        pet_name: 'Luna',
        guardian_id: 'g1',
        guardian_name: 'Ana',
        label: 'Consulta',
        amount: 120,
        kind: 'comanda_aberta',
        comanda_id: 'c1',
        origin_type: 'encounter',
        origin_id: '2',
        open_origin_type: 'encounter',
        open_origin_id: '2',
      },
      {
        key: 'c',
        pet_id: 'p3',
        pet_name: 'Mel',
        guardian_id: 'g2',
        guardian_name: 'Bia',
        label: 'Banho',
        amount: 50,
        kind: 'sem_comanda',
        comanda_id: null,
        origin_type: 'grooming_session',
        origin_id: '3',
        open_origin_type: 'grooming_session',
        open_origin_id: '3',
      },
    ];
    const groups = groupBalcaoChargesByTutor(items);
    expect(groups).toHaveLength(2);
    const ana = groups.find((g) => g.guardian_id === 'g1');
    expect(ana?.items).toHaveLength(2);
    expect(ana?.total).toBe(200);
  });
});

describe('findOpenExitHandoffForPet', () => {
  it('encontra saída aberta do pet', () => {
    const items = [
      handoff({ id: '1', kind: 'retirada_balcao', status: 'open', pet: { id: 'p1', name: 'Thor' } }),
      handoff({ id: '2', kind: 'chegada', status: 'open', pet: { id: 'p1', name: 'Thor' } }),
    ];
    expect(findOpenExitHandoffForPet(items, 'p1')?.id).toBe('1');
    expect(findOpenExitHandoffForPet(items, 'p9')).toBeNull();
  });
});

describe('chargeCtaLabel / matchesBalcaoSearch', () => {
  it('rótulos de CTA', () => {
    expect(chargeCtaLabel('sem_comanda')).toBe('Abrir cobrança');
    expect(chargeCtaLabel('comanda_aberta')).toBe('Cobrar agora');
    expect(chargeCtaLabel('a_receber')).toBe('Cobrar saldo');
  });

  it('busca pet/tutor', () => {
    expect(matchesBalcaoSearch('Thor', 'Ana Silva', 'ana')).toBe(true);
    expect(matchesBalcaoSearch('Thor', 'Ana Silva', 'rex')).toBe(false);
  });
});
