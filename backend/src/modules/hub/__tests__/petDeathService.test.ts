import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  hasValidPetDeath,
  isPetEligibleForNewOp,
  mapPetDeathRpcError,
  registerPetDeath,
  correctPetDeath,
  invalidatePetDeath,
} from '../petDeathService';

vi.mock('../../../config/supabase', () => {
  const rpc = vi.fn();
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'is', 'gt', 'not', 'in', 'gte', 'lte', 'order', 'limit', 'update']) {
    chain[m] = vi.fn(self);
  }
  chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  // Terminadores usados em cancelFutureOpsAfterPetDeath (thenable)
  Object.assign(chain, {
    then: (resolve: (v: unknown) => unknown) =>
      resolve({ data: [], count: 0, error: null }),
  });
  return {
    supabaseAdmin: {
      rpc,
      from: vi.fn(() => chain),
    },
  };
});

vi.mock('../hubAppointmentOperationalCancel', () => ({
  applyOperationalCancelToAppointments: vi.fn(async () => ({
    cancelledIds: [],
    cascadedLegIds: [],
    cancelledEncounterIds: [],
    comandaEffects: [],
  })),
  PET_DEATH_CANCEL_WAIVE: 'Cancelamento automático por óbito do pet',
}));

vi.mock('../hubSurgeryFromAppointment', () => ({
  syncSurgeryForAppointmentSafe: vi.fn(async () => undefined),
}));

import { supabaseAdmin } from '../../../config/supabase';

const CLINIC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const PET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001';
const REF = 'cccccccc-cccc-4ccc-8ccc-cccccccc0001';

describe('petDeathService helpers', () => {
  it('hasValidPetDeath exige deceased_at e sem invalidação', () => {
    expect(hasValidPetDeath({ deceased_at: null, death_invalidated_at: null })).toBe(false);
    expect(hasValidPetDeath({ deceased_at: '2026-01-01T00:00:00.000Z', death_invalidated_at: null })).toBe(true);
    expect(
      hasValidPetDeath({
        deceased_at: '2026-01-01T00:00:00.000Z',
        death_invalidated_at: '2026-01-02T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('isPetEligibleForNewOp bloqueia arquivado e falecido válido', () => {
    expect(isPetEligibleForNewOp({ deleted_at: null, deceased_at: null })).toBe(true);
    expect(isPetEligibleForNewOp({ deleted_at: '2026-01-01T00:00:00.000Z', deceased_at: null })).toBe(false);
    expect(
      isPetEligibleForNewOp({ deleted_at: null, deceased_at: '2026-01-01T00:00:00.000Z', death_invalidated_at: null }),
    ).toBe(false);
    expect(
      isPetEligibleForNewOp({
        deleted_at: null,
        deceased_at: '2026-01-01T00:00:00.000Z',
        death_invalidated_at: '2026-01-02T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('mapPetDeathRpcError reconhece already_deceased e amendment', () => {
    expect(mapPetDeathRpcError('already_deceased')).toMatchObject({
      code: 'already_deceased',
      status: 409,
    });
    expect(mapPetDeathRpcError('amendment_status obrigatório (discharged|transferred)')).toMatchObject({
      code: 'amendment_required',
      status: 400,
    });
    expect(mapPetDeathRpcError('Data de óbito não pode ser futura')).toMatchObject({
      code: 'future_death_date',
      status: 400,
    });
  });
});

describe('petDeathService RPC wrappers', () => {
  beforeEach(() => {
    vi.mocked(supabaseAdmin.rpc).mockReset();
  });

  it('registerPetDeath com e sem archive retorna pet', async () => {
    const petRow = {
      id: PET,
      clinic_id: CLINIC,
      deceased_at: '2026-03-01T12:00:00.000Z',
      death_type: 'euthanasia',
      death_invalidated_at: null,
      deleted_at: null,
    };
    vi.mocked(supabaseAdmin.rpc).mockResolvedValueOnce({
      data: { ok: true, pet: petRow, archived: false },
      error: null,
    } as never);

    const res = await registerPetDeath({
      clinic_id: CLINIC,
      pet_id: PET,
      deceased_at: '2026-03-01T12:00:00.000Z',
      death_type: 'euthanasia',
      death_source: 'manual',
      archive: false,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.pet.id).toBe(PET);
      expect(res.archived).toBe(false);
      expect(res.pending).toMatchObject({
        cancelled_appointments: 0,
        pending_review_count: 0,
        cancelled_appointments_list: [],
        pending_review: [],
      });
    }
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      'hub_register_pet_death',
      expect.objectContaining({ p_archive: false, p_death_source: 'manual' }),
    );
  });

  it('registerPetDeath duplicado → already_deceased', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'already_deceased' },
    } as never);

    const res = await registerPetDeath({
      clinic_id: CLINIC,
      pet_id: PET,
      deceased_at: '2026-03-01T12:00:00.000Z',
      death_type: 'natural',
      death_source: 'manual',
    });
    expect(res).toMatchObject({ ok: false, code: 'already_deceased', status: 409 });
  });

  it('registerPetDeath clínico sem ref falha na validação', async () => {
    const res = await registerPetDeath({
      clinic_id: CLINIC,
      pet_id: PET,
      deceased_at: '2026-03-01T12:00:00.000Z',
      death_type: 'euthanasia',
      death_source: 'encounter',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('registerPetDeath com origem clínica e ref', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValueOnce({
      data: {
        ok: true,
        pet: { id: PET, clinic_id: CLINIC, deceased_at: '2026-03-01T12:00:00.000Z', deleted_at: null },
        archived: false,
      },
      error: null,
    } as never);

    const res = await registerPetDeath({
      clinic_id: CLINIC,
      pet_id: PET,
      deceased_at: '2026-03-01T12:00:00.000Z',
      death_type: 'unknown',
      death_source: 'surgery',
      death_ref_id: REF,
      archive: false,
    });
    expect(res.ok).toBe(true);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      'hub_register_pet_death',
      expect.objectContaining({ p_death_source: 'surgery', p_death_ref_id: REF }),
    );
  });

  it('correctPetDeath exige reason e chama RPC', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValueOnce({
      data: { ok: true, pet: { id: PET, clinic_id: CLINIC, death_notes: 'corrigido' } },
      error: null,
    } as never);

    const res = await correctPetDeath({
      clinic_id: CLINIC,
      pet_id: PET,
      reason: 'Ajuste de horário',
      death_notes: 'corrigido',
    });
    expect(res.ok).toBe(true);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      'hub_correct_pet_death',
      expect.objectContaining({ p_reason: 'Ajuste de horário' }),
    );
  });

  it('invalidatePetDeath com amendment_status', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValueOnce({
      data: {
        ok: true,
        pet: {
          id: PET,
          clinic_id: CLINIC,
          deceased_at: '2026-03-01T12:00:00.000Z',
          death_invalidated_at: '2026-03-02T12:00:00.000Z',
        },
      },
      error: null,
    } as never);

    const res = await invalidatePetDeath({
      clinic_id: CLINIC,
      pet_id: PET,
      reason: 'Erro de registro clínico',
      amendment_status: 'discharged',
    });
    expect(res.ok).toBe(true);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      'hub_invalidate_pet_death',
      expect.objectContaining({ p_amendment_status: 'discharged' }),
    );
  });

  it('data futura é rejeitada antes da RPC', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const res = await registerPetDeath({
      clinic_id: CLINIC,
      pet_id: PET,
      deceased_at: future,
      death_type: 'natural',
      death_source: 'manual',
    });
    expect(res).toMatchObject({ ok: false, code: 'future_death_date', status: 400 });
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
});
