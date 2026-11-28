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
  dayBoundsSaoPaulo,
  executeVoiceCommand,
  isSessionOnGroomingDay,
  resolveGroomingTargets,
} from '../voice/voiceCommandService';

const fromMock = supabaseAdmin.from as jest.Mock;
const transitionMock = transitionGroomingSessionStage as jest.Mock;

const scope = {
  clinicId: 'clinic-1',
  unitId: 'unit-1',
  actorUserId: 'user-voice',
};

const { from: dayFrom, to: dayTo } = dayBoundsSaoPaulo();
const todayIso = new Date(new Date(dayFrom).getTime() + 12 * 3600_000).toISOString();
const yesterdayIso = new Date(new Date(dayFrom).getTime() - 12 * 3600_000).toISOString();

function chainResolving(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.is = jest.fn(self);
  chain.in = jest.fn(self);
  chain.neq = jest.fn(self);
  chain.lt = jest.fn(self);
  chain.gt = jest.fn(self);
  chain.limit = jest.fn().mockResolvedValue({ data: rows, error: null });
  return chain;
}

/** Mock: appointments do dia + sessões de grooming. */
function mockVoiceTables(opts: {
  appointmentIds?: string[];
  sessions?: unknown[];
  boarding?: unknown[];
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'hub_appointments') {
      return chainResolving((opts.appointmentIds ?? []).map((id) => ({ id })));
    }
    if (table === 'hub_grooming_sessions') {
      return chainResolving(opts.sessions ?? []);
    }
    if (table === 'hub_boarding_reservations') {
      return chainResolving(opts.boarding ?? []);
    }
    return chainResolving([]);
  });
}

function sessionRow(
  partial: Record<string, unknown> & { id: string; name: string; stage: string },
) {
  return {
    id: partial.id,
    pet_id: partial.pet_id ?? `pet-${partial.id}`,
    unit_id: 'unit-1',
    hub_appointment_id: partial.hub_appointment_id ?? null,
    grooming_stage: partial.stage,
    checked_in_at: partial.checked_in_at ?? null,
    created_at: partial.created_at ?? todayIso,
    hub_pets: { id: partial.pet_id ?? `pet-${partial.id}`, name: partial.name },
  };
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

  it('list_pending lista nomes da fila do dia e ignora prontos/antigos', async () => {
    mockVoiceTables({
      sessions: [
        sessionRow({ id: 's1', name: 'Thor', stage: 'queued', created_at: todayIso }),
        sessionRow({ id: 's2', name: 'Mel', stage: 'in_service', created_at: todayIso }),
        sessionRow({ id: 's3', name: 'Bob', stage: 'ready', created_at: todayIso }),
        sessionRow({
          id: 's-old',
          name: '[Demo Salão] Bolinha',
          stage: 'queued',
          created_at: yesterdayIso,
        }),
      ],
    });

    const result = await executeVoiceCommand({
      intent: 'grooming.list_pending',
      scope,
    });
    expect(result.status).toBe('executed');
    expect(result.message).toContain('Thor');
    expect(result.message).toContain('Mel');
    expect(result.message).not.toContain('Bob');
    expect(result.message).not.toContain('Bolinha');
  });

  it('start_service retorna not_found se pet ausente', async () => {
    mockVoiceTables({ sessions: [] });
    const result = await executeVoiceCommand({
      intent: 'grooming.start_service',
      petName: 'Rex',
      scope,
    });
    expect(result.status).toBe('not_found');
    expect(transitionMock).not.toHaveBeenCalled();
  });

  it('start_service pede Hub quando há homônimos', async () => {
    mockVoiceTables({
      sessions: [
        sessionRow({ id: 's1', name: 'Thor', stage: 'queued' }),
        sessionRow({ id: 's2', name: 'Thor', stage: 'queued', pet_id: 'p2' }),
      ],
    });
    const result = await executeVoiceCommand({
      intent: 'grooming.start_service',
      petName: 'Thor',
      scope,
    });
    expect(result.status).toBe('needs_disambiguation');
    expect(transitionMock).not.toHaveBeenCalled();
  });

  it('ignora pets de outra unidade (filtro no query)', async () => {
    mockVoiceTables({ sessions: [] });
    const result = await executeVoiceCommand({
      intent: 'grooming.start_service',
      petName: 'Mel',
      scope,
    });
    expect(result.status).toBe('not_found');
    expect(fromMock).toHaveBeenCalledWith('hub_grooming_sessions');
  });

  it('mark_ready sem confirmação pede confirmação', async () => {
    mockVoiceTables({
      sessions: [sessionRow({ id: 's1', name: 'Mel', stage: 'in_service' })],
    });
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
    mockVoiceTables({
      sessions: [sessionRow({ id: 's1', name: 'Mel', stage: 'in_service' })],
      boarding: [],
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

describe('isSessionOnGroomingDay', () => {
  it('inclui walk-in criado hoje e exclui ontem', () => {
    expect(
      isSessionOnGroomingDay(
        { hubAppointmentId: null, checkedInAt: null, createdAt: todayIso },
        new Set(),
        dayFrom,
        dayTo,
      ),
    ).toBe(true);
    expect(
      isSessionOnGroomingDay(
        { hubAppointmentId: null, checkedInAt: null, createdAt: yesterdayIso },
        new Set(),
        dayFrom,
        dayTo,
      ),
    ).toBe(false);
  });

  it('inclui sessão cujo agendamento está no dia', () => {
    expect(
      isSessionOnGroomingDay(
        {
          hubAppointmentId: 'appt-1',
          checkedInAt: yesterdayIso,
          createdAt: yesterdayIso,
        },
        new Set(['appt-1']),
        dayFrom,
        dayTo,
      ),
    ).toBe(true);
  });
});
