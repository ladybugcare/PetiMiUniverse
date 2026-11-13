import {
  assertAccessAllowsMutation,
  assertHubEntitlement,
} from '../hubEntitlements';
import { PlanEntitlementError } from '../../../utils/errors';
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

import { getClinicEntitlementSnapshot } from '../hubSubscriptionService';

const getSnap = getClinicEntitlementSnapshot as jest.MockedFunction<
  typeof getClinicEntitlementSnapshot
>;

function snap(partial: Partial<HubEntitlementSnapshot>): HubEntitlementSnapshot {
  return {
    status: 'active',
    is_beta: false,
    base_plan_slug: 'solo',
    enabled_modules: ['hub_core', 'clinic', 'grooming', 'boarding'],
    disabled_operational_areas: [],
    max_units: 1,
    max_users: 5,
    access_mode: 'full',
    ...partial,
  };
}

describe('assertAccessAllowsMutation', () => {
  it('full permite mutação', () => {
    expect(() => assertAccessAllowsMutation(snap({ access_mode: 'full' }), {})).not.toThrow();
  });

  it('soft_lock sem flag bloqueia', () => {
    expect(() =>
      assertAccessAllowsMutation(snap({ access_mode: 'soft_lock', status: 'past_due' }), {}),
    ).toThrow(PlanEntitlementError);
  });

  it('soft_lock com allowSoftLockWrite permite', () => {
    expect(() =>
      assertAccessAllowsMutation(snap({ access_mode: 'soft_lock', status: 'past_due' }), {
        allowSoftLockWrite: true,
      }),
    ).not.toThrow();
  });

  it('read_history bloqueia mesmo com allowSoftLockWrite', () => {
    expect(() =>
      assertAccessAllowsMutation(snap({ access_mode: 'read_history', status: 'canceled' }), {
        allowSoftLockWrite: true,
      }),
    ).toThrow(PlanEntitlementError);
  });
});

describe('assertHubEntitlement mutating + module', () => {
  afterEach(() => {
    getSnap.mockReset();
  });

  it('hub_core mutating sem flag NÃO libera soft_lock (sem bypass por módulo)', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'soft_lock', status: 'pending_payment' }));
    await expect(
      assertHubEntitlement('clinic-1', { module: 'hub_core', mutating: true }),
    ).rejects.toMatchObject({ code: 'PLAN_SOFT_LOCK' });
  });

  it('hub_core mutating com allowSoftLockWrite libera soft_lock', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'soft_lock', status: 'pending_payment' }));
    await expect(
      assertHubEntitlement('clinic-1', {
        module: 'hub_core',
        mutating: true,
        allowSoftLockWrite: true,
      }),
    ).resolves.toBeTruthy();
  });

  it('catálogo hub_core bloqueia em read_history', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'read_history', status: 'canceled' }));
    await expect(
      assertHubEntitlement('clinic-1', { module: 'hub_core', mutating: true }),
    ).rejects.toMatchObject({ code: 'PLAN_READ_HISTORY' });
  });

  it('clinic mutating com allowSoftLockWrite libera soft_lock', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'soft_lock', status: 'past_due' }));
    await expect(
      assertHubEntitlement('clinic-1', {
        module: 'clinic',
        mutating: true,
        allowSoftLockWrite: true,
      }),
    ).resolves.toBeTruthy();
  });
});
