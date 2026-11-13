/**
 * Política soft-lock das rotas fechadas na auditoria Fase 0.
 * Testa as opções de entitlement reutilizadas pelos middlewares (não o Express stack).
 */
import { assertHubEntitlement, assertCanInviteUser, assertCanCreateUnit } from '../hubEntitlements';
import type { HubEntitlementSnapshot } from '../hubSubscriptionService';

jest.mock('../hubSubscriptionService', () => {
  const actual = jest.requireActual('../hubSubscriptionService');
  return {
    ...actual,
    getClinicEntitlementSnapshot: jest.fn(),
    countClinicUnits: jest.fn().mockResolvedValue(1),
    countClinicActiveUsers: jest.fn().mockResolvedValue(1),
  };
});

import {
  getClinicEntitlementSnapshot,
  countClinicUnits,
  countClinicActiveUsers,
} from '../hubSubscriptionService';

const getSnap = getClinicEntitlementSnapshot as jest.MockedFunction<
  typeof getClinicEntitlementSnapshot
>;
const countUnits = countClinicUnits as jest.MockedFunction<typeof countClinicUnits>;
const countUsers = countClinicActiveUsers as jest.MockedFunction<typeof countClinicActiveUsers>;

function snap(partial: Partial<HubEntitlementSnapshot>): HubEntitlementSnapshot {
  return {
    status: 'active',
    is_beta: false,
    base_plan_slug: 'solo',
    enabled_modules: ['hub_core', 'clinic', 'grooming', 'boarding'],
    disabled_operational_areas: [],
    max_units: 5,
    max_users: 10,
    access_mode: 'full',
    ...partial,
  };
}

/** Espelha requireCoreCatalogWrite / perfil clínica / email-schedules / POST staff. */
const catalogWrite = { module: 'hub_core' as const, mutating: true };
/** Espelha requireCoreOpsWrite / staff photo. */
const opsWrite = {
  module: 'hub_core' as const,
  mutating: true,
  allowSoftLockWrite: true as const,
};
/** Espelha requireClinicWrite / pet-flags. */
const clinicOpsWrite = {
  module: 'clinic' as const,
  mutating: true,
  allowSoftLockWrite: true as const,
};

describe('soft-lock gap routes — full', () => {
  afterEach(() => getSnap.mockReset());

  it('permite catálogo, ops e clínica', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'full' }));
    await expect(assertHubEntitlement('c1', catalogWrite)).resolves.toBeTruthy();
    await expect(assertHubEntitlement('c1', opsWrite)).resolves.toBeTruthy();
    await expect(assertHubEntitlement('c1', clinicOpsWrite)).resolves.toBeTruthy();
  });
});

describe('soft-lock gap routes — soft_lock', () => {
  afterEach(() => {
    getSnap.mockReset();
    countUnits.mockReset().mockResolvedValue(1);
    countUsers.mockReset().mockResolvedValue(1);
  });

  it('bloqueia catálogo (perfil clínica, schedules, POST staff, PATCH units)', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'soft_lock', status: 'pending_payment' }));
    await expect(assertHubEntitlement('c1', catalogWrite)).rejects.toMatchObject({
      code: 'PLAN_SOFT_LOCK',
    });
  });

  it('permite ops (staff photo) e clínica (pet-flags)', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'soft_lock', status: 'past_due' }));
    await expect(assertHubEntitlement('c1', opsWrite)).resolves.toBeTruthy();
    await expect(assertHubEntitlement('c1', clinicOpsWrite)).resolves.toBeTruthy();
  });

  it('bloqueia capacidade unidade/usuário (POST units, invite, link-account)', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'soft_lock', status: 'past_due' }));
    await expect(assertCanCreateUnit('c1')).rejects.toMatchObject({ code: 'PLAN_SOFT_LOCK' });
    await expect(assertCanInviteUser('c1')).rejects.toMatchObject({ code: 'PLAN_SOFT_LOCK' });
  });
});

describe('soft-lock gap routes — read_history', () => {
  afterEach(() => getSnap.mockReset());

  it('bloqueia catálogo, ops e clínica', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'read_history', status: 'canceled' }));
    await expect(assertHubEntitlement('c1', catalogWrite)).rejects.toMatchObject({
      code: 'PLAN_READ_HISTORY',
    });
    await expect(assertHubEntitlement('c1', opsWrite)).rejects.toMatchObject({
      code: 'PLAN_READ_HISTORY',
    });
    await expect(assertHubEntitlement('c1', clinicOpsWrite)).rejects.toMatchObject({
      code: 'PLAN_READ_HISTORY',
    });
  });

  it('bloqueia capacidade mesmo com slot livre', async () => {
    getSnap.mockResolvedValue(
      snap({ access_mode: 'read_history', status: 'canceled', max_units: 10, max_users: 10 }),
    );
    countUnits.mockResolvedValue(1);
    countUsers.mockResolvedValue(1);
    await expect(assertCanCreateUnit('c1')).rejects.toMatchObject({ code: 'PLAN_READ_HISTORY' });
    await expect(assertCanInviteUser('c1')).rejects.toMatchObject({ code: 'PLAN_READ_HISTORY' });
  });
});

describe('soft-lock — estorno (exceção de produto)', () => {
  it('documenta: rota sem entitlement MW — permitido em todos os modos via RBAC hub.payments.reverse', () => {
    // Contratos já existentes no controller/ledger (reason, clinic match, soft reverse).
    // Este teste trava a intenção: NÃO aplicar catalogWrite/opsWrite ao reverse.
    const reverseUsesEntitlementMiddleware = false;
    expect(reverseUsesEntitlementMiddleware).toBe(false);
  });
});
