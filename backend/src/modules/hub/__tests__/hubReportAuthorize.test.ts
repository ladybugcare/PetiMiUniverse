import { authorizeHubReport } from '../hubReportAuthorize';

jest.mock('../hubReportUnitScope', () => ({
  loadClinicUserMembership: jest.fn(),
  resolveReportUnitScope: jest.fn(),
}));

jest.mock('../hubStaffResolve', () => ({
  resolveStaffIdForUser: jest.fn(),
}));

import { loadClinicUserMembership, resolveReportUnitScope } from '../hubReportUnitScope';
import { resolveStaffIdForUser } from '../hubStaffResolve';

const loadMembership = loadClinicUserMembership as jest.MockedFunction<typeof loadClinicUserMembership>;
const resolveUnit = resolveReportUnitScope as jest.MockedFunction<typeof resolveReportUnitScope>;
const resolveStaff = resolveStaffIdForUser as jest.MockedFunction<typeof resolveStaffIdForUser>;

describe('authorizeHubReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveUnit.mockResolvedValue({
      ok: true,
      unitId: 'unit-a',
      canViewAllUnits: false,
      membershipUnitId: 'unit-a',
      role: 'CASSISTANT',
      operationalAreas: [],
    });
  });

  it('rejeita report_id desconhecido', async () => {
    const res = await authorizeHubReport({
      userId: 'u1',
      clinicId: 'c1',
      reportId: 'not-a-real-report',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it('hub.reports.read sozinho não autoriza financeiro', async () => {
    loadMembership.mockResolvedValue({
      role: 'CSTAFF',
      operational_areas: [],
      unit_id: 'unit-a',
      status: 'active',
    });
    // CSTAFF base: só unit.view — sem financial
    const res = await authorizeHubReport({
      userId: 'u1',
      clinicId: 'c1',
      reportId: 'finance-overview',
      requestedUnitId: 'unit-a',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it('self sem vínculo staff → 403', async () => {
    loadMembership.mockResolvedValue({
      role: 'CVET_INTERNAL',
      operational_areas: [],
      unit_id: 'unit-a',
      status: 'active',
    });
    resolveStaff.mockResolvedValue(null);
    const res = await authorizeHubReport({
      userId: 'u1',
      clinicId: 'c1',
      reportId: 'my-commissions',
      requestedUnitId: 'unit-a',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toMatch(/vinculado a um profissional/i);
    }
  });

  it('CASSISTANT com financial autoriza cash-flow', async () => {
    loadMembership.mockResolvedValue({
      role: 'CASSISTANT',
      operational_areas: [],
      unit_id: 'unit-a',
      status: 'active',
    });
    const res = await authorizeHubReport({
      userId: 'u1',
      clinicId: 'c1',
      reportId: 'cash-flow',
      requestedUnitId: 'unit-a',
      requireSchedule: true,
    });
    expect(res.ok).toBe(true);
  });
});
