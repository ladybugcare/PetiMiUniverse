import { describe, expect, it } from 'vitest';
import {
  formatComandaListPets,
  formatComandaListTitle,
  formatComandaOriginLabel,
  formatReceivableListTitle,
  isReceivablePayable,
  resolveComandaProfileChargeAction,
  resolveComandaProfileHref,
  resolveReceivableProfileHref,
} from './comandaListPreview';

describe('formatComandaListTitle', () => {
  it('usa descrições dos itens', () => {
    expect(formatComandaListTitle({ item_labels: ['Banho'] })).toBe('Banho');
    expect(formatComandaListTitle({ item_labels: ['Banho', 'Tosa'] })).toBe('Banho, Tosa');
    expect(formatComandaListTitle({ item_labels: ['A', 'B', 'C'] })).toBe('A, B +1');
  });

  it('sem itens mostra Sem itens', () => {
    expect(formatComandaListTitle({ origin_type: 'manual', item_labels: [] })).toBe('Sem itens');
  });
});

describe('formatComandaListPets', () => {
  it('lista pets da API', () => {
    expect(
      formatComandaListPets({
        pets: [
          { id: '1', name: 'Bruce' },
          { id: '2', name: 'Luna' },
        ],
      }),
    ).toBe('Bruce, Luna');
  });

  it('cai no pet de contexto ou Tutor', () => {
    expect(formatComandaListPets({ pet: { name: 'Pururuca' } })).toBe('Pururuca');
    expect(formatComandaListPets({})).toBe('Tutor');
  });
});

describe('formatComandaOriginLabel', () => {
  it('traduz origem', () => {
    expect(formatComandaOriginLabel('manual')).toBe('Manual');
    expect(formatComandaOriginLabel('appointment')).toBe('Agenda');
  });
});

describe('formatReceivableListTitle', () => {
  it('usa descrições das linhas como no caixa', () => {
    expect(
      formatReceivableListTitle({
        source_type: 'manual',
        lines: [
          { id: '1', line_kind: 'service', description: 'Banho', quantity: 1, unit_sale_amount: 50, line_total: 50 },
          { id: '2', line_kind: 'service', description: 'Tosa', quantity: 1, unit_sale_amount: 80, line_total: 80 },
        ],
      }),
    ).toBe('Banho, Tosa');
  });

  it('prefere nome do serviço do catálogo', () => {
    expect(
      formatReceivableListTitle({
        source_type: 'appointment',
        lines: [
          {
            id: '1',
            line_kind: 'service',
            description: 'Linha antiga',
            quantity: 1,
            unit_sale_amount: 50,
            line_total: 50,
            service_type: { id: 's1', name: 'Consulta' },
          },
        ],
      }),
    ).toBe('Consulta');
  });

  it('sem linhas usa item_labels da comanda vinculada', () => {
    expect(
      formatReceivableListTitle(
        { source_type: 'manual', lines: [], comanda_id: 'c1' },
        { item_labels: ['Banho', 'Tosa'] },
      ),
    ).toBe('Banho, Tosa');
  });

  it('sem linhas cai no rótulo da origem', () => {
    expect(formatReceivableListTitle({ source_type: 'manual', lines: [] })).toBe('Manual');
    expect(formatReceivableListTitle({ source_type: 'appointment' })).toBe('Agenda');
  });
});

describe('resolveComandaProfileHref', () => {
  it('vai ao caixa quando editável', () => {
    expect(
      resolveComandaProfileHref(
        { id: 'c1', finance_handoff_at: null, edit_scopes: { caixa: true, financeiro: true, locked_reason: null } },
        { canFinancialRead: true },
      ),
    ).toBe('/hub/caixa/comanda/c1');
  });

  it('vai ao financeiro após handoff se tiver acesso', () => {
    expect(
      resolveComandaProfileHref(
        {
          id: 'c1',
          finance_handoff_at: '2026-09-02T12:00:00Z',
          edit_scopes: { caixa: false, financeiro: true, locked_reason: 'finance_handoff' },
        },
        { canFinancialRead: true },
      ),
    ).toBe('/hub/financeiro/comanda/c1');
  });

  it('cai no caixa se não puder ler financeiro', () => {
    expect(
      resolveComandaProfileHref(
        { id: 'c1', finance_handoff_at: '2026-09-02T12:00:00Z' },
        { canFinancialRead: false },
      ),
    ).toBe('/hub/caixa/comanda/c1');
  });
});

describe('resolveReceivableProfileHref', () => {
  it('abre comanda no financeiro com receivable_id', () => {
    expect(
      resolveReceivableProfileHref({ id: 'r1', comanda_id: 'c1' }, { canFinancialRead: true }),
    ).toBe('/hub/financeiro/comanda/c1?receivable_id=r1');
  });

  it('sem acesso retorna null', () => {
    expect(resolveReceivableProfileHref({ id: 'r1', comanda_id: 'c1' }, { canFinancialRead: false })).toBeNull();
  });
});

describe('resolveComandaProfileChargeAction', () => {
  it('abre checkout quando caixa edita', () => {
    expect(
      resolveComandaProfileChargeAction(
        { id: 'c1', status: 'aberta', edit_scopes: { caixa: true, financeiro: true, locked_reason: null } },
        [],
        { canCreateReceivable: true, canFinancialRead: true },
      ),
    ).toEqual({ kind: 'checkout_drawer', comandaId: 'c1' });
  });

  it('abre drawer de recebível pendente após handoff', () => {
    expect(
      resolveComandaProfileChargeAction(
        {
          id: 'c1',
          status: 'aberta',
          finance_handoff_at: '2026-09-02T12:00:00Z',
          edit_scopes: { caixa: false, financeiro: true, locked_reason: 'finance_handoff' },
        },
        [{ id: 'r1', comanda_id: 'c1', status: 'pending' }],
        { canCreateReceivable: true, canFinancialRead: true },
      ),
    ).toEqual({ kind: 'receivable_drawer', comandaId: 'c1', receivableId: 'r1' });
  });
});

describe('isReceivablePayable', () => {
  it('pending e parcial', () => {
    expect(isReceivablePayable('pending')).toBe(true);
    expect(isReceivablePayable('partially_paid')).toBe(true);
    expect(isReceivablePayable('paid')).toBe(false);
  });
});
