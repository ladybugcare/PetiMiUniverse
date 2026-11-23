import { resolveStaffIdForUser } from '../hubStaffResolve.js';

const mockFrom = jest.fn();

jest.mock('../../../config/supabase.js', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  c.select = jest.fn().mockReturnValue(c);
  c.eq = jest.fn().mockReturnValue(c);
  c.is = jest.fn().mockReturnValue(c);
  c.maybeSingle = jest.fn().mockResolvedValue(result);
  return c;
}

describe('resolveStaffIdForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna null sem userId', async () => {
    expect(await resolveStaffIdForUser('clinic-1', undefined)).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('retorna null quando não há clinic_user ativo', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: null }));
    expect(await resolveStaffIdForUser('clinic-1', 'user-1')).toBeNull();
  });

  it('retorna o staff vinculado ao clinic_user', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: { id: 'cu-1' }, error: null }))
      .mockReturnValueOnce(chain({ data: { id: 'staff-1' }, error: null }));
    expect(await resolveStaffIdForUser('clinic-1', 'user-1')).toBe('staff-1');
  });
});
