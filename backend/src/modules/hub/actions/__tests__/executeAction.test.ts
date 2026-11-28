jest.mock('../../../../config/supabase', () => ({
  supabaseAdmin: { from: jest.fn() },
  supabase: { from: jest.fn() },
}));

jest.mock('../../../../middleware/authMiddleware', () => ({
  checkPermission: jest.fn(),
}));

import { checkPermission } from '../../../../middleware/authMiddleware';
import { executeAction } from '../executeAction';
import { resetActionsRegistrationForTests } from '../registerAll';
import { clearConfirmationsForTests } from '../confirmationStore';

const checkPermissionMock = checkPermission as jest.Mock;

describe('executeAction', () => {
  beforeEach(() => {
    resetActionsRegistrationForTests();
    clearConfirmationsForTests();
    checkPermissionMock.mockReset();
    checkPermissionMock.mockResolvedValue(true);
    process.env.PETMI_ACTION_CONFIRMATIONS_DB = 'false';
  });

  it('rejeita ação desconhecida', async () => {
    const result = await executeAction({
      actionId: 'nope.unknown',
      params: {},
      context: {
        userId: 'u',
        clinicId: 'c',
        unitId: 'un',
        provider: 'chatgpt',
      },
    });
    expect(result.status).toBe('forbidden');
  });

  it('lista pending via action canônica sem RBAC bypass', async () => {
    // force empty day board via supabase mock returning empty chains
    const { supabaseAdmin } = require('../../../../config/supabase');
    const thenable = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    (supabaseAdmin.from as jest.Mock).mockReturnValue(thenable);

    const result = await executeAction({
      actionId: 'grooming.list_active_appointments',
      params: {},
      context: {
        userId: 'u',
        clinicId: 'c',
        unitId: 'un',
        provider: 'chatgpt',
        enforceRbac: true,
      },
    });
    expect(checkPermissionMock).toHaveBeenCalledWith('u', 'c', 'grooming.queue.read');
    expect(result.status).toBe('executed');
    expect(result.message).toMatch(/Nenhum pet/i);
  });

  it('bloqueia sem permissão', async () => {
    checkPermissionMock.mockResolvedValue(false);
    const result = await executeAction({
      actionId: 'grooming.start_bath',
      params: { pet_name: 'Thor' },
      context: {
        userId: 'u',
        clinicId: 'c',
        unitId: 'un',
        provider: 'chatgpt',
        enforceRbac: true,
      },
    });
    expect(result.status).toBe('forbidden');
  });
});
