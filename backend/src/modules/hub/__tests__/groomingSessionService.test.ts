jest.mock('../../../config/supabase', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock('../hubNotifyEvents', () => ({
  notifyHubPetReady: jest.fn(),
}));

jest.mock('../receptionSync', () => ({
  scheduleReceptionSync: jest.fn(),
}));

jest.mock('../groomingExecution', () => ({
  ensureGroomingAppointmentLinesExecuted: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../hubResourcesService', () => ({
  prepareResourceForGroomingStart: jest.fn().mockResolvedValue({ ok: true }),
  releaseAppointmentResource: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../hubComandasController', () => ({
  syncOpenComandasAfterGroomingClosed: jest.fn(),
  syncOpenComandasAfterAppointmentOperationalComplete: jest.fn(),
}));

import { supabaseAdmin } from '../../../config/supabase';
import { prepareResourceForGroomingStart } from '../hubResourcesService';
import { transitionGroomingSessionStage } from '../groomingSessionService';

const fromMock = supabaseAdmin.from as jest.Mock;
const prepareResourceMock = prepareResourceForGroomingStart as jest.Mock;

type Chain = {
  select: jest.Mock;
  eq: jest.Mock;
  is: jest.Mock;
  update: jest.Mock;
  maybeSingle: jest.Mock;
  insert: jest.Mock;
};

function makeChain(final: { data: unknown; error: unknown }): Chain {
  const chain: Chain = {
    select: jest.fn(),
    eq: jest.fn(),
    is: jest.fn(),
    update: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue(final),
    insert: jest.fn().mockResolvedValue({ error: null }),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

describe('transitionGroomingSessionStage', () => {
  beforeEach(() => {
    fromMock.mockReset();
    prepareResourceMock.mockReset();
    prepareResourceMock.mockResolvedValue({ ok: true });
  });

  it('executa transição queued → in_service e registra via', async () => {
    const current = {
      id: 'sess-1',
      clinic_id: 'clinic-1',
      unit_id: 'unit-1',
      pet_id: 'pet-1',
      hub_appointment_id: 'appt-1',
      hub_staff_member_id: null,
      grooming_stage: 'queued',
    };
    const updated = { ...current, grooming_stage: 'in_service' };

    const selectChain = makeChain({ data: current, error: null });
    const updateChain = makeChain({ data: updated, error: null });
    const eventsChain = makeChain({ data: null, error: null });
    const apptChain = makeChain({ data: { status: 'checked_in' }, error: null });

    let sessionCalls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'hub_grooming_sessions') {
        sessionCalls += 1;
        return sessionCalls === 1 ? selectChain : updateChain;
      }
      if (table === 'hub_grooming_events') return eventsChain;
      if (table === 'hub_appointments') return apptChain;
      return makeChain({ data: null, error: null });
    });

    const result = await transitionGroomingSessionStage({
      clinicId: 'clinic-1',
      sessionId: 'sess-1',
      to: 'in_service',
      source: 'voice_alexa',
      actorUserId: 'user-1',
    });

    expect(result.status).toBe('executed');
    if (result.status === 'executed') {
      expect(result.from).toBe('queued');
      expect(result.to).toBe('in_service');
    }
    expect(eventsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'stage_change',
        payload: expect.objectContaining({ from: 'queued', to: 'in_service', via: 'voice_alexa' }),
      }),
    );
  });

  it('retorna already_applied quando já está no estágio alvo', async () => {
    const current = {
      id: 'sess-1',
      grooming_stage: 'ready',
      hub_appointment_id: null,
      hub_staff_member_id: null,
      pet_id: 'pet-1',
      unit_id: 'unit-1',
    };
    const selectChain = makeChain({ data: current, error: null });
    fromMock.mockImplementation(() => selectChain);

    const result = await transitionGroomingSessionStage({
      clinicId: 'clinic-1',
      sessionId: 'sess-1',
      to: 'ready',
      source: 'hub_ui',
    });

    expect(result.status).toBe('already_applied');
  });

  it('retorna invalid_state para transição proibida', async () => {
    const current = {
      id: 'sess-1',
      grooming_stage: 'queued',
      hub_appointment_id: null,
      hub_staff_member_id: null,
      pet_id: 'pet-1',
      unit_id: 'unit-1',
    };
    const selectChain = makeChain({ data: current, error: null });
    fromMock.mockImplementation(() => selectChain);

    const result = await transitionGroomingSessionStage({
      clinicId: 'clinic-1',
      sessionId: 'sess-1',
      to: 'ready',
      source: 'hub_ui',
    });

    expect(result.status).toBe('invalid_state');
  });

  it('retorna not_found quando a sessão não existe', async () => {
    const selectChain = makeChain({ data: null, error: null });
    fromMock.mockImplementation(() => selectChain);

    const result = await transitionGroomingSessionStage({
      clinicId: 'clinic-1',
      sessionId: 'missing',
      to: 'in_service',
    });

    expect(result.status).toBe('not_found');
  });

  it('retorna already_applied quando update com estado esperado não afeta linhas (já no alvo)', async () => {
    const current = {
      id: 'sess-1',
      grooming_stage: 'queued',
      hub_appointment_id: null,
      hub_staff_member_id: null,
      pet_id: 'pet-1',
      unit_id: 'unit-1',
    };
    const refreshed = { ...current, grooming_stage: 'in_service' };
    const selectChain = makeChain({ data: current, error: null });
    const updateEmpty = makeChain({ data: null, error: null });
    const refreshChain = makeChain({ data: refreshed, error: null });

    let sessionCalls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'hub_grooming_sessions') {
        sessionCalls += 1;
        if (sessionCalls === 1) return selectChain;
        if (sessionCalls === 2) return updateEmpty;
        return refreshChain;
      }
      return makeChain({ data: null, error: null });
    });

    const result = await transitionGroomingSessionStage({
      clinicId: 'clinic-1',
      sessionId: 'sess-1',
      to: 'in_service',
      source: 'voice_alexa',
    });

    expect(result.status).toBe('already_applied');
  });

  it('retorna resource_conflict quando o recurso está ocupado', async () => {
    const current = {
      id: 'sess-1',
      grooming_stage: 'queued',
      hub_appointment_id: 'appt-1',
      hub_staff_member_id: null,
      pet_id: 'pet-1',
      unit_id: 'unit-1',
    };
    const selectChain = makeChain({ data: current, error: null });
    fromMock.mockImplementation(() => selectChain);
    prepareResourceMock.mockResolvedValue({
      ok: false,
      status: 409,
      body: { error: 'Mesa «1» ainda está em uso.', code: 'resource_busy' },
    });

    const result = await transitionGroomingSessionStage({
      clinicId: 'clinic-1',
      sessionId: 'sess-1',
      to: 'in_service',
      source: 'voice_alexa',
    });

    expect(result.status).toBe('resource_conflict');
    if (result.status === 'resource_conflict') {
      expect(result.message).toContain('Mesa');
    }
  });
});
