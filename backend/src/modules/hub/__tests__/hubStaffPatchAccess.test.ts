import {
  assertStaffPatchAllowedByAccessMode,
  classifyStaffPatchBody,
  classifyStaffPatchField,
} from '../hubStaffPatchAccess';
import { PlanEntitlementError, ValidationError } from '../../../utils/errors';
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
    max_units: 5,
    max_users: 10,
    access_mode: 'full',
    ...partial,
  };
}

describe('classifyStaffPatchField', () => {
  it('classifica ops, catálogo e meta', () => {
    expect(classifyStaffPatchField('full_name')).toBe('ops');
    expect(classifyStaffPatchField('email')).toBe('ops');
    expect(classifyStaffPatchField('service_type_ids')).toBe('ops');
    expect(classifyStaffPatchField('has_hub_access')).toBe('catalog');
    expect(classifyStaffPatchField('default_unit_id')).toBe('catalog');
    expect(classifyStaffPatchField('clinic_id')).toBe('meta');
    expect(classifyStaffPatchField('secret_admin')).toBe('unknown');
  });
});

describe('classifyStaffPatchBody', () => {
  it('mistura: requiresFullAccess true', () => {
    const c = classifyStaffPatchBody({
      clinic_id: 'c1',
      full_name: 'Ana',
      hub_access_role: 'CVET',
    });
    expect(c.opsFields).toEqual(['full_name']);
    expect(c.catalogFields).toEqual(['hub_access_role']);
    expect(c.requiresFullAccess).toBe(true);
  });

  it('somente ops: requiresFullAccess false', () => {
    const c = classifyStaffPatchBody({ clinic_id: 'c1', phone: '1199', agenda_color: '#fff' });
    expect(c.requiresFullAccess).toBe(false);
    expect(c.catalogFields).toEqual([]);
  });
});

describe('assertStaffPatchAllowedByAccessMode — ops', () => {
  afterEach(() => getSnap.mockReset());

  it('full permite', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'full' }));
    await expect(
      assertStaffPatchAllowedByAccessMode('c1', { clinic_id: 'c1', full_name: 'Ana' }),
    ).resolves.toMatchObject({ requiresFullAccess: false });
  });

  it('soft_lock permite', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'soft_lock', status: 'past_due' }));
    await expect(
      assertStaffPatchAllowedByAccessMode('c1', { clinic_id: 'c1', job_title: 'Tosador' }),
    ).resolves.toBeTruthy();
  });

  it('read_history bloqueia', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'read_history', status: 'canceled' }));
    await expect(
      assertStaffPatchAllowedByAccessMode('c1', { clinic_id: 'c1', phone: '11' }),
    ).rejects.toMatchObject({ code: 'PLAN_READ_HISTORY' });
  });
});

describe('assertStaffPatchAllowedByAccessMode — catálogo/capacidade', () => {
  afterEach(() => getSnap.mockReset());

  it('full permite hub_access_role e default_unit_id', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'full' }));
    await expect(
      assertStaffPatchAllowedByAccessMode('c1', {
        clinic_id: 'c1',
        hub_access_role: 'CVET',
        default_unit_id: 'u1',
      }),
    ).resolves.toMatchObject({ requiresFullAccess: true });
  });

  it('soft_lock bloqueia', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'soft_lock', status: 'pending_payment' }));
    await expect(
      assertStaffPatchAllowedByAccessMode('c1', { clinic_id: 'c1', has_hub_access: true }),
    ).rejects.toMatchObject({ code: 'PLAN_SOFT_LOCK' });
  });

  it('read_history bloqueia', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'read_history', status: 'canceled' }));
    await expect(
      assertStaffPatchAllowedByAccessMode('c1', { clinic_id: 'c1', active: false }),
    ).rejects.toMatchObject({ code: 'PLAN_READ_HISTORY' });
  });
});

describe('assertStaffPatchAllowedByAccessMode — misto e desconhecidos', () => {
  afterEach(() => getSnap.mockReset());

  it('misto em soft_lock aplica regra mais restritiva (full)', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'soft_lock', status: 'past_due' }));
    await expect(
      assertStaffPatchAllowedByAccessMode('c1', {
        clinic_id: 'c1',
        full_name: 'Ana',
        operational_areas: ['banho'],
      }),
    ).rejects.toMatchObject({ code: 'PLAN_SOFT_LOCK' });
  });

  it('misto em full permite', async () => {
    getSnap.mockResolvedValue(snap({ access_mode: 'full' }));
    await expect(
      assertStaffPatchAllowedByAccessMode('c1', {
        clinic_id: 'c1',
        full_name: 'Ana',
        affiliation: 'internal',
      }),
    ).resolves.toMatchObject({ requiresFullAccess: true });
  });

  it('campo desconhecido rejeita com ValidationError', async () => {
    await expect(
      assertStaffPatchAllowedByAccessMode('c1', {
        clinic_id: 'c1',
        rogue_field: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('PlanEntitlementError tipagem', () => {
  it('soft_lock sem flag é PlanEntitlementError', () => {
    expect(() => {
      throw new PlanEntitlementError('bloqueado', 'PLAN_SOFT_LOCK');
    }).toThrow(PlanEntitlementError);
  });
});
