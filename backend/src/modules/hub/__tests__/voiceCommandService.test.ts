jest.mock('../../../config/supabase', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock('../groomingSessionService', () => ({
  transitionGroomingSessionStage: jest.fn(),
  logGroomingEvent: jest.fn().mockResolvedValue(undefined),
  syncAppointmentStatusForStage: jest.fn().mockResolvedValue(undefined),
}));

import { supabaseAdmin } from '../../../config/supabase';
import { normalizePetName } from '../voice/normalizePetName';
import {
  abandonStaleOpenSessionsForPet,
  dayBoundsSaoPaulo,
  executeVoiceCommand,
  isSessionOnGroomingDay,
  pickVoiceTarget,
  resolveGroomingTargets,
} from '../voice/voiceCommandService';

const fromMock = supabaseAdmin.from as jest.Mock;

const { from: dayFrom, to: dayTo } = dayBoundsSaoPaulo();
const todayIso = new Date(new Date(dayFrom).getTime() + 12 * 3600_000).toISOString();
const yesterdayIso = new Date(new Date(dayFrom).getTime() - 12 * 3600_000).toISOString();

function thenableChain(rows: unknown[]) {
  const result = { data: rows, error: null as null };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'is', 'in', 'neq', 'lt', 'gt', 'limit', 'update']) {
    chain[m] = jest.fn(self);
  }
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: rows[0] ?? null, error: null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (chain as any).then = (onfulfilled: any, onrejected: any) =>
    Promise.resolve(result).then(onfulfilled, onrejected);
  return chain;
}

describe('normalizePetName', () => {
  it('remove acentos e normaliza caixa', () => {
    expect(normalizePetName('  Melânia  ')).toBe('melania');
    expect(normalizePetName('THOR')).toBe('thor');
  });
});

describe('resolveGroomingTargets', () => {
  it('detecta homônimos e ignora caixa', () => {
    const sessions = [{ petName: 'Thor' }, { petName: 'thor' }, { petName: 'Mel' }];
    expect(resolveGroomingTargets(sessions, 'MEL').matches).toHaveLength(1);
    expect(resolveGroomingTargets(sessions, 'Thor').matches).toHaveLength(2);
  });
});

describe('pickVoiceTarget', () => {
  const base = {
    sessionId: null as string | null,
    unitId: 'u',
    petName: 'Frete',
  };

  it('escolhe o próximo agendamento do mesmo pet (não trata como homônimo)', () => {
    const picked = pickVoiceTarget([
      {
        ...base,
        appointmentId: 'later',
        petId: 'frete',
        stage: 'scheduled' as const,
        startsAt: '2026-11-28T20:00:00.000Z',
      },
      {
        ...base,
        appointmentId: 'earlier',
        petId: 'frete',
        stage: 'scheduled' as const,
        startsAt: '2026-11-28T16:00:00.000Z',
      },
    ]);
    expect(picked.kind).toBe('one');
    if (picked.kind === 'one') expect(picked.target.appointmentId).toBe('earlier');
  });

  it('desambigua só quando são pets distintos com o mesmo nome', () => {
    const picked = pickVoiceTarget([
      {
        ...base,
        appointmentId: 'a',
        petId: 'jade-1',
        petName: 'Jade',
        stage: 'scheduled' as const,
        startsAt: '2026-11-28T11:00:00.000Z',
      },
      {
        ...base,
        appointmentId: 'b',
        petId: 'jade-2',
        petName: 'Jade',
        stage: 'scheduled' as const,
        startsAt: '2026-11-28T12:00:00.000Z',
      },
    ]);
    expect(picked.kind).toBe('homonyms');
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

  it('inclui sessão cujo agendamento está no dia mesmo com check-in antigo', () => {
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

  it('exclui sessão presa em outro dia (caso Spike)', () => {
    expect(
      isSessionOnGroomingDay(
        {
          hubAppointmentId: 'appt-old',
          checkedInAt: yesterdayIso,
          createdAt: yesterdayIso,
        },
        new Set(['appt-today']),
        dayFrom,
        dayTo,
      ),
    ).toBe(false);
  });
});

describe('abandonStaleOpenSessionsForPet', () => {
  beforeEach(() => fromMock.mockReset());

  it('encerra sessão aberta que não é a do agendamento de hoje', async () => {
    let sessCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'hub_grooming_sessions') {
        sessCall += 1;
        if (sessCall === 1) {
          return thenableChain([
            {
              id: 'stale-1',
              hub_appointment_id: 'old-appt',
              grooming_stage: 'in_service',
            },
          ]);
        }
        const chain = thenableChain([]);
        chain.update = jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        }));
        return chain;
      }
      return thenableChain([]);
    });

    const n = await abandonStaleOpenSessionsForPet({
      clinicId: 'clinic-1',
      petId: 'pet-1',
      keepAppointmentId: 'today-appt',
    });
    expect(n).toBe(1);
  });
});

describe('executeVoiceCommand', () => {
  it('FinishBath não altera dados', async () => {
    fromMock.mockReset();
    const result = await executeVoiceCommand({
      intent: 'grooming.finish_bath',
      petName: 'Thor',
      scope: { clinicId: 'c', unitId: 'u', actorUserId: 'a' },
    });
    expect(result.status).toBe('executed');
    expect(result.message).toMatch(/está pronto/i);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
