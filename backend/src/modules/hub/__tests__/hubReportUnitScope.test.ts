import { resolveReportUnitScope } from '../hubReportUnitScope';

jest.mock('../../../config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

jest.mock('../hubTenantAsserts', () => ({
  assertUnitInClinic: jest.fn(async (_clinicId: string, unitId: string | null | undefined) => {
    if (!unitId) return true;
    return unitId.startsWith('unit-');
  }),
}));

describe('resolveReportUnitScope', () => {
  const membershipRestricted = {
    role: 'CSTAFF',
    operational_areas: ['caixa'] as string[],
    unit_id: 'unit-a',
    status: 'active',
  };

  /** Só CADMIN tem unit.view.all na matriz atual. */
  const membershipViewAll = {
    role: 'CADMIN',
    operational_areas: [] as string[],
    unit_id: 'unit-a',
    status: 'active',
  };

  it('sem unit.view.all: unit_id de outra unidade → 403', async () => {
    const res = await resolveReportUnitScope({
      userId: 'u1',
      clinicId: 'c1',
      requestedUnitId: 'unit-b',
      unitMode: 'required',
      membership: membershipRestricted,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it('sem unit.view.all: omissão força unidade do vínculo', async () => {
    const res = await resolveReportUnitScope({
      userId: 'u1',
      clinicId: 'c1',
      requestedUnitId: null,
      unitMode: 'clinic_aggregate_if_allowed',
      membership: membershipRestricted,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.unitId).toBe('unit-a');
  });

  it('com unit.view.all + clinic_aggregate: omissão consolida (unitId null)', async () => {
    const res = await resolveReportUnitScope({
      userId: 'u1',
      clinicId: 'c1',
      requestedUnitId: null,
      unitMode: 'clinic_aggregate_if_allowed',
      membership: membershipViewAll,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.unitId).toBeNull();
      expect(res.canViewAllUnits).toBe(true);
    }
  });

  it('unitMode required + view.all sem unit_id → 400', async () => {
    const res = await resolveReportUnitScope({
      userId: 'u1',
      clinicId: 'c1',
      requestedUnitId: null,
      unitMode: 'required',
      membership: membershipViewAll,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it('unidade fora da clínica → 403', async () => {
    const res = await resolveReportUnitScope({
      userId: 'u1',
      clinicId: 'c1',
      requestedUnitId: 'other-clinic-unit',
      unitMode: 'required',
      membership: membershipViewAll,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });
});
