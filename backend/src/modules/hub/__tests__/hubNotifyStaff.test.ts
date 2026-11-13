import {
  filterTargetsByPrefOptOut,
  hubNotificationCategoryForType,
} from '../hubNotificationPrefs';
import { resolveNotificationTargets, type HubNotifyCandidate } from '../hubNotifyStaff';

const recepcao: HubNotifyCandidate = {
  user_id: 'u-recepcao',
  role: 'CSTAFF',
  operational_areas: ['recepcao'],
};
const caixa: HubNotifyCandidate = {
  user_id: 'u-caixa',
  role: 'CSTAFF',
  operational_areas: ['caixa'],
};
const groomer: HubNotifyCandidate = {
  user_id: 'u-groomer',
  role: 'CSTAFF',
  operational_areas: ['banho_tosa'],
};
const estoque: HubNotifyCandidate = {
  user_id: 'u-estoque',
  role: 'CSTAFF',
  operational_areas: ['estoque'],
};
const admin: HubNotifyCandidate = { user_id: 'u-admin', role: 'CADMIN', operational_areas: [] };
const finance: HubNotifyCandidate = { user_id: 'u-finance', role: 'CFINANCE', operational_areas: [] };

const equipe = [recepcao, caixa, groomer, estoque, admin, finance];

describe('resolveNotificationTargets', () => {
  it('notifica só as áreas pedidas (banho & tosa não recebe estoque)', () => {
    const targets = resolveNotificationTargets(equipe, {
      areas: ['estoque'],
      includeManagers: false,
    });

    expect(targets).toEqual(['u-estoque']);
    expect(targets).not.toContain('u-groomer');
  });

  it('pet pronto vai para recepção e caixa, não para o groomer que concluiu', () => {
    const targets = resolveNotificationTargets(equipe, {
      areas: ['recepcao', 'caixa'],
      includeManagers: false,
      excludeUserIds: ['u-groomer'],
    });

    // CFINANCE entra porque equivale ao caixa.
    expect(targets.sort()).toEqual(['u-caixa', 'u-finance', 'u-recepcao']);
    expect(targets).not.toContain('u-groomer');
  });

  it('CFINANCE recebe como financeiro e caixa mesmo sem áreas marcadas', () => {
    const financeiro = resolveNotificationTargets(equipe, {
      areas: ['financeiro'],
      includeManagers: false,
    });
    const doCaixa = resolveNotificationTargets(equipe, {
      areas: ['caixa'],
      includeManagers: false,
    });

    expect(financeiro).toEqual(['u-finance']);
    expect(doCaixa.sort()).toEqual(['u-caixa', 'u-finance']);
  });

  it('inclui gestores por padrão e os dispensa quando includeManagers=false', () => {
    const comGestor = resolveNotificationTargets(equipe, { areas: ['banho_tosa'] });
    const semGestor = resolveNotificationTargets(equipe, {
      areas: ['banho_tosa'],
      includeManagers: false,
    });

    expect(comGestor).toContain('u-admin');
    expect(semGestor).toEqual(['u-groomer']);
  });

  it('aceita filtro por papel além das áreas', () => {
    const targets = resolveNotificationTargets(equipe, {
      roles: ['CFINANCE'],
      includeManagers: false,
    });

    expect(targets).toEqual(['u-finance']);
  });

  it('remove duplicados, exclusões e linhas sem user_id', () => {
    const targets = resolveNotificationTargets(
      [
        recepcao,
        { ...recepcao },
        caixa,
        { user_id: null, role: 'CADMIN', operational_areas: [] },
        { user_id: '  ', role: 'CSTAFF', operational_areas: ['recepcao'] },
      ],
      {
        areas: ['recepcao', 'caixa'],
        excludeUserIds: ['u-caixa'],
      },
    );

    expect(targets).toEqual(['u-recepcao']);
  });

  it('ignora áreas inválidas vindas do banco', () => {
    const targets = resolveNotificationTargets(
      [{ user_id: 'u-x', role: 'CSTAFF', operational_areas: ['area_inexistente'] }],
      { areas: ['recepcao'], includeManagers: false },
    );

    expect(targets).toEqual([]);
  });

  it('sem áreas nem papéis e sem gestores, ninguém recebe', () => {
    expect(resolveNotificationTargets(equipe, { includeManagers: false })).toEqual([]);
  });
});

describe('hubNotificationPrefs', () => {
  it('mapeia tipos operacionais para as categorias do Meu perfil', () => {
    expect(hubNotificationCategoryForType('hub_grooming_extra_request')).toBe('acoes');
    expect(hubNotificationCategoryForType('hub_payment_due')).toBe('acoes');
    expect(hubNotificationCategoryForType('hub_cancellation_pending')).toBe('acoes');
    expect(hubNotificationCategoryForType('hub_pet_ready')).toBe('operacao');
    expect(hubNotificationCategoryForType('hub_pet_arrived')).toBe('operacao');
    expect(hubNotificationCategoryForType('hub_boarding_checkout')).toBe('operacao');
    expect(hubNotificationCategoryForType('hub_stock_alert')).toBe('alertas');
  });

  it('remove destinatários com a categoria desligada (opt-out)', () => {
    const resolved = resolveNotificationTargets(equipe, {
      areas: ['recepcao', 'caixa'],
      includeManagers: false,
    });
    const filtered = filterTargetsByPrefOptOut(
      resolved,
      'acoes',
      new Set(['u-recepcao']),
    );

    expect(resolved.sort()).toEqual(['u-caixa', 'u-finance', 'u-recepcao']);
    expect(filtered.sort()).toEqual(['u-caixa', 'u-finance']);
  });

  it('sem prefs desligadas, mantém todos os targets', () => {
    expect(
      filterTargetsByPrefOptOut(['u-a', 'u-b'], 'alertas', new Set()),
    ).toEqual(['u-a', 'u-b']);
  });
});
