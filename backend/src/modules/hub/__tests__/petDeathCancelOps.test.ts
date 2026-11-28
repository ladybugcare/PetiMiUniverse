import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyCancelMock = vi.fn();
const syncSurgeryMock = vi.fn();
const fromMock = vi.fn();

vi.mock('../../../config/supabase', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: vi.fn(),
  },
}));

vi.mock('../hubAppointmentOperationalCancel', () => ({
  applyOperationalCancelToAppointments: (...args: unknown[]) => applyCancelMock(...args),
  PET_DEATH_CANCEL_WAIVE: 'Cancelamento automático por óbito do pet',
}));

vi.mock('../hubSurgeryFromAppointment', () => ({
  syncSurgeryForAppointmentSafe: (...args: unknown[]) => syncSurgeryMock(...args),
}));

import { cancelFutureOpsAfterPetDeath } from '../petDeathService';

const CLINIC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const PET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001';
const APPT_FUTURE = 'cccccccc-cccc-4ccc-8ccc-cccccccc0001';
const APPT_PROGRESS = 'dddddddd-dddd-4ddd-8ddd-dddddddd0001';
const BOARDING = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001';
const BOARDING_PREP = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002';
const GROOMING = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001';
const SURGERY = 'bbbbbbbb-cccc-4ddd-8eee-ffffffff0001';
const ST_BANHO = 'ffffffff-ffff-4fff-8fff-ffffffffffff0001';

function makeSelectChain(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of [
    'select',
    'eq',
    'is',
    'gt',
    'not',
    'in',
    'order',
    'limit',
    'maybeSingle',
    'update',
  ]) {
    chain[m] = vi.fn(self);
  }
  Object.assign(chain, {
    then: (resolve: (v: unknown) => unknown) =>
      resolve({
        data: result.data ?? null,
        error: result.error ?? null,
        count: result.count ?? null,
      }),
  });
  chain.maybeSingle = vi.fn(async () => ({
    data: Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null,
    error: result.error ?? null,
  }));
  return chain;
}

type Fixture = {
  futureAppts?: unknown[];
  inProgressAppts?: unknown[];
  boarding?: unknown[];
  grooming?: unknown[];
  surgeries?: unknown[];
  remainingCount?: number;
};

function mockTables(fx: Fixture) {
  let apptCall = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === 'hub_appointments') {
      apptCall += 1;
      if (apptCall === 1) return makeSelectChain({ data: fx.futureAppts ?? [] });
      if (apptCall === 2) return makeSelectChain({ data: fx.inProgressAppts ?? [] });
      return makeSelectChain({ data: null, count: fx.remainingCount ?? 0 });
    }
    if (table === 'hub_boarding_reservations') {
      return makeSelectChain({ data: fx.boarding ?? [] });
    }
    if (table === 'hub_grooming_sessions') {
      return makeSelectChain({ data: fx.grooming ?? [] });
    }
    if (table === 'hub_surgeries') {
      return makeSelectChain({ data: fx.surgeries ?? [] });
    }
    if (table === 'hub_service_types') {
      return makeSelectChain({ data: { name: 'Banho' } });
    }
    if (table === 'hub_appointment_services') {
      return makeSelectChain({ data: [] });
    }
    return makeSelectChain({ data: [] });
  });
}

describe('cancelFutureOpsAfterPetDeath', () => {
  beforeEach(() => {
    applyCancelMock.mockReset();
    syncSurgeryMock.mockReset();
    fromMock.mockReset();
    applyCancelMock.mockResolvedValue({
      cancelledIds: [APPT_FUTURE],
      cascadedLegIds: [],
      cancelledEncounterIds: [],
      comandaEffects: [],
    });
    syncSurgeryMock.mockResolvedValue(undefined);
  });

  it('cancela futuros, sincroniza cirurgia e lista boarding/in_progress', async () => {
    const futureIso = new Date(Date.now() + 3_600_000).toISOString();
    const progressIso = new Date(Date.now() - 600_000).toISOString();

    mockTables({
      futureAppts: [
        {
          id: APPT_FUTURE,
          starts_at: futureIso,
          status: 'confirmed',
          hub_service_type_id: ST_BANHO,
        },
      ],
      inProgressAppts: [
        {
          id: APPT_PROGRESS,
          starts_at: progressIso,
          status: 'checked_in',
          hub_service_type_id: ST_BANHO,
        },
      ],
      boarding: [
        {
          id: BOARDING,
          status: 'reserved',
          expected_check_in: futureIso,
          expected_check_out: futureIso,
        },
        {
          id: BOARDING_PREP,
          status: 'checkout_preparing',
          expected_check_in: progressIso,
          expected_check_out: futureIso,
        },
      ],
    });

    const pending = await cancelFutureOpsAfterPetDeath(CLINIC, PET);

    expect(applyCancelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC,
        appointmentIds: [APPT_FUTURE],
        terminalStatus: 'cancelled',
        waiveReason: 'Cancelamento automático por óbito do pet',
      }),
    );
    expect(syncSurgeryMock).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC, appointmentId: APPT_FUTURE }),
    );
    expect(pending.cancelled_appointments).toBe(1);
    expect(pending.cancelled_appointments_list[0]?.id).toBe(APPT_FUTURE);
    expect(pending.pending_review.some((i) => i.id === APPT_PROGRESS)).toBe(true);
    expect(pending.pending_review.filter((i) => i.kind === 'boarding_reservation')).toHaveLength(2);
    expect(pending.pending_review.some((i) => i.status === 'checkout_preparing')).toBe(true);
    expect(pending.active_boarding_reservations).toBe(2);
  });

  it('inclui grooming_session e surgery_scheduled no pending_review', async () => {
    const when = new Date(Date.now() + 3_600_000).toISOString();
    mockTables({
      grooming: [
        {
          id: GROOMING,
          grooming_stage: 'queued',
          hub_appointment_id: null,
          checked_in_at: when,
          created_at: when,
        },
      ],
      surgeries: [
        {
          id: SURGERY,
          status: 'scheduled',
          title: 'OVH',
          scheduled_at: when,
          hub_appointment_id: null,
          hub_encounter_id: null,
        },
        {
          id: 'skip-with-encounter',
          status: 'scheduled',
          title: 'Em curso',
          scheduled_at: when,
          hub_appointment_id: null,
          hub_encounter_id: 'enc-1',
        },
      ],
    });

    const pending = await cancelFutureOpsAfterPetDeath(CLINIC, PET);
    expect(applyCancelMock).not.toHaveBeenCalled();
    expect(pending.pending_review.some((i) => i.kind === 'grooming_session' && i.id === GROOMING)).toBe(
      true,
    );
    expect(pending.pending_review.some((i) => i.kind === 'surgery_scheduled' && i.id === SURGERY)).toBe(
      true,
    );
    expect(pending.pending_review.some((i) => i.id === 'skip-with-encounter')).toBe(false);
  });

  it('não chama cancel quando não há futuros elegíveis', async () => {
    mockTables({});
    const pending = await cancelFutureOpsAfterPetDeath(CLINIC, PET);
    expect(applyCancelMock).not.toHaveBeenCalled();
    expect(syncSurgeryMock).not.toHaveBeenCalled();
    expect(pending.cancelled_appointments).toBe(0);
    expect(pending.pending_review).toEqual([]);
  });
});
