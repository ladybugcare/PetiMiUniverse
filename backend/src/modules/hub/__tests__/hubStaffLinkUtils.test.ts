import {
  findConflictingStaffForClinicUser,
  syncStaffHubAccessLink,
} from '../hubStaffLinkUtils.js';

const mockFrom = jest.fn();
const mockListUsers = jest.fn();

jest.mock('../../../config/supabase.js', () => ({
  supabaseAdmin: {
    auth: { admin: { listUsers: (...args: unknown[]) => mockListUsers(...args) } },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

jest.mock('../hubInvitationUtils.js', () => ({
  linkStaffMemberToClinicUser: jest.fn().mockResolvedValue(undefined),
}));

function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  c.select = jest.fn().mockReturnValue(c);
  c.eq = jest.fn().mockReturnValue(c);
  c.is = jest.fn().mockReturnValue(c);
  c.maybeSingle = jest.fn().mockResolvedValue(result);
  c.update = jest.fn().mockReturnValue(c);
  c.single = jest.fn().mockResolvedValue(result);
  return c;
}

describe('syncStaffHubAccessLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('limpa vínculo quando sem acesso ao Hub', async () => {
    const upd = chain({ data: null, error: null });
    mockFrom.mockReturnValue(upd);

    const res = await syncStaffHubAccessLink({
      staffId: 'staff-1',
      clinicId: 'clinic-1',
      hasHubAccess: false,
      hubAccessEmail: 'a@b.com',
      hubAccessRole: 'CADMIN',
    });

    expect(res.linked).toBe(false);
    expect(upd.update).toHaveBeenCalledWith(
      expect.objectContaining({ clinic_user_id: null }),
    );
  });

  it('vincula quando e-mail corresponde a clinic_users ativo', async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [{ id: 'user-1', email: 'vet@clinic.com' }] },
    });

    let call = 0;
    mockFrom.mockImplementation((table: string) => {
      call += 1;
      if (table === 'clinic_users' && call === 1) {
        return chain({
          data: { id: 'cu-1', role: 'CASSISTANT', user_id: 'user-1', status: 'active' },
          error: null,
        });
      }
      if (table === 'hub_staff_members' && call === 2) {
        return chain({ data: null, error: null });
      }
      if (table === 'clinic_users' && call === 3) {
        return chain({ data: null, error: null });
      }
      return chain({ data: null, error: null });
    });

    const res = await syncStaffHubAccessLink({
      staffId: 'staff-1',
      clinicId: 'clinic-1',
      hasHubAccess: true,
      hubAccessEmail: 'vet@clinic.com',
      hubAccessRole: 'CVET_INTERNAL',
    });

    expect(res.linked).toBe(true);
    expect(res.role_synced).toBe(true);
    expect(res.clinic_user_id).toBe('cu-1');
  });
});

describe('findConflictingStaffForClinicUser', () => {
  it('ignora o próprio staff', async () => {
    mockFrom.mockReturnValue(
      chain({ data: { id: 'staff-1' }, error: null }),
    );
    const conflict = await findConflictingStaffForClinicUser('clinic-1', 'cu-1', 'staff-1');
    expect(conflict).toBeNull();
  });
});
