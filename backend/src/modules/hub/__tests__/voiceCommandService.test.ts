jest.mock('../../../config/supabase', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock('../groomingSessionService', () => ({
  transitionGroomingSessionStage: jest.fn(),
}));

import { supabaseAdmin } from '../../../config/supabase';
import { transitionGroomingSessionStage } from '../groomingSessionService';
import { normalizePetName } from '../voice/normalizePetName';
import {
  executeVoiceCommand,
  resolveGroomingTargets,
} from '../voice/voiceCommandService';

const fromMock = supabaseAdmin.from as jest.Mock;
const transitionMock = transitionGroomingSessionStage as jest.Mock;

const scope = {
  clinicId: 'clinic-1',
  unitId: 'unit-1',
  actorUserId: 'user-voice',
};

function sessionsChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.is = jest.fn(self);
  chain.in = jest.fn(self);
  chain.limit = jest.fn().mockResolvedValue({ data: rows, error: null });
  return chain;
}

describe('normalizePetName', () => {
  it('remove acentos e normaliza caixa', () => {
    expect(normalizePetName('  Melânia  ')).toBe('melania');
    expect(normalizePetName('THOR')).toBe('thor');
  });
});

describe('resolveGroomingTargets', () => {
  const sessions = [
    {
      sessionId: 's1',
      petId: 'p1',
      petName: 'Thor',
      stage: 'queued' as const,
      hubAppointmentId: null,
      unitId: 'unit-1',
    },
    {
      sessionId: 's2',
      petId: 'p2',
      petName: 'thor',
      stage: 'in_service' as const,
      hubAppointmentId: null,
      unitId: 'unit-1',
    },
    {
      sessionId: 's3',
      petId: 'p3',
      petName: 'Mel',
      stage: 'queued' as const,
      hubAppointmentId: null,
      unitId: 'unit-1',
    },
  ];

  it('encontra pet ignorando acento/caixa', () => {
    const { matches } = resolveGroomingTargets(sessions, 'MEL');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.petName).toBe('Mel');
  });

  it('detecta homônimos', () => {
    const { matches } = resolveGroomingTargets(sessions, 'Thor');
    expect(matches).toHaveLength(2);
  });
});

describe('executeVoiceCommand', () => {
  beforeEach(() => {
    fromMock.mockReset();
    transitionMock.mockReset();
  });

  it('FinishBath não altera dados e orienta a marcar pronto', async () => {
    const result = await executeVoiceCommand({
      intent: 'grooming.finish_bath',
      petName: 'Thor',
      scope,
    });
    expect(result.status).toBe('executed');
    expect(result.message).toMatch(/está pronto/i);
    expect(transitionMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('list_pending lista nomes da fila', async () => {
    fromMock.mockReturnValue(
      sessionsChain([
        {
          id: 's1',
          pet_id: 'p1',
          unit_id: 'unit-1',
          hub_appointment_id: null,
          grooming_stage: 'queued',
          hub_pets: { id: 'p1', name: 'Thor' },
        },
        {
          id: 's2',
          pet_id: 'p2',
          unit_id: 'unit-1',
          hub_appointment_id: null,
          grooming_stage: 'in_service',
          hub_pets: { id: 'p2', name: 'Mel' },
        },
        {
          id: 's3',
          pet_id: 'p3',
          unit_id: 'unit-1',
          hub_appointment_id: null,
          grooming_stage: 'ready',
          hub_pets: { id: 'p3', name: 'Bob' },
        },
      ]),
    );

    const result = await executeVoiceCommand({
      intent: 'grooming.list_pending',
      scope,
    });
    expect(result.status).toBe('executed');
    expect(result.message).toContain('Thor');
    expect(result.message).toContain('Mel');
    expect(result.message).not.toContain('Bob');
  });

  it('start_service retorna not_found se pet ausente', async () => {
    fromMock.mockReturnValue(sessionsChain([]));
    const result = await executeVoiceCommand({
      intent: 'grooming.start_service',
      petName: 'Rex',
      scope,
    });
    expect(result.status).toBe('not_found');
    expect(transitionMock).not.toHaveBeenCalled();
  });

  it('start_service pede Hub quando há homônimos', async () => {
    fromMock.mockReturnValue(
      sessionsChain([
        {
          id: 's1',
          pet_id: 'p1',
          unit_id: 'unit-1',
          hub_appointment_id: null,
          grooming_stage: 'queued',
          hub_pets: { id: 'p1', name: 'Thor' },
        },
        {
          id: 's2',
          pet_id: 'p2',
          unit_id: 'unit-1',
          hub_appointment_id: null,
          grooming_stage: 'queued',
          hub_pets: { id: 'p2', name: 'Thor' },
        },
      ]),
    );
    const result = await executeVoiceCommand({
      intent: 'grooming.start_service',
      petName: 'Thor',
      scope,
    });
    expect(result.status).toBe('needs_disambiguation');
    expect(transitionMock).not.toHaveBeenCalled();
  });

  it('ignora pets de outra unidade (filtro no query)', async () => {
    fromMock.mockReturnValue(sessionsChain([]));
    const result = await executeVoiceCommand({
      intent: 'grooming.start_service',
      petName: 'Mel',
      scope,
    });
    expect(result.status).toBe('not_found');
    expect(fromMock).toHaveBeenCalledWith('hub_grooming_sessions');
    const chain = fromMock.mock.results[0]?.value;
    expect(chain.eq).toHaveBeenCalledWith('unit_id', 'unit-1');
  });

  it('mark_ready sem confirmação pede confirmação', async () => {
    fromMock.mockReturnValue(
      sessionsChain([
        {
          id: 's1',
          pet_id: 'p1',
          unit_id: 'unit-1',
          hub_appointment_id: null,
          grooming_stage: 'in_service',
          hub_pets: { id: 'p1', name: 'Mel' },
        },
      ]),
    );
    const result = await executeVoiceCommand({
      intent: 'grooming.mark_ready',
      petName: 'Mel',
      confirmed: false,
      scope,
    });
    expect(result.status).toBe('needs_confirmation');
    expect(transitionMock).not.toHaveBeenCalled();
  });

  it('mark_ready confirmado chama transição para ready', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'hub_grooming_sessions') {
        return sessionsChain([
          {
            id: 's1',
            pet_id: 'p1',
            unit_id: 'unit-1',
            hub_appointment_id: null,
            grooming_stage: 'in_service',
            hub_pets: { id: 'p1', name: 'Mel' },
          },
        ]);
      }
      // boarding lookup
      const chain: Record<string, jest.Mock> = {};
      const self = () => chain;
      chain.select = jest.fn(self);
      chain.eq = jest.fn(self);
      chain.is = jest.fn(self);
      chain.in = jest.fn(self);
      chain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
      return chain;
    });
    transitionMock.mockResolvedValue({
      status: 'executed',
      session: {},
      from: 'in_service',
      to: 'ready',
    });

    const result = await executeVoiceCommand({
      intent: 'grooming.mark_ready',
      petName: 'Mel',
      confirmed: true,
      scope,
    });
    expect(result.status).toBe('executed');
    expect(transitionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ready',
        source: 'voice_alexa',
        sessionId: 's1',
      }),
    );
    expect(result.message).toMatch(/aguardando retirada/i);
  });
});
