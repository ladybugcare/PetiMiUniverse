import {
  clearConfirmationsForTests,
  createConfirmation,
  consumeConfirmation,
} from '../confirmationStore';

describe('confirmationStore', () => {
  beforeEach(() => {
    clearConfirmationsForTests();
    process.env.PETMI_ACTION_CONFIRMATIONS_DB = 'false';
  });

  it('consome confirmation válida uma vez', async () => {
    const payload = { encounter_id: 'e1', anamnesis: { history: 'vómito' } };
    const rec = await createConfirmation({
      userId: 'u',
      clinicId: 'c',
      unitId: 'un',
      actionId: 'clinical.confirm_save_anamnesis',
      payload,
    });

    const ok = await consumeConfirmation({
      confirmationId: rec.id,
      userId: 'u',
      clinicId: 'c',
      unitId: 'un',
      actionId: 'clinical.confirm_save_anamnesis',
      payload,
    });
    expect(ok.ok).toBe(true);

    const again = await consumeConfirmation({
      confirmationId: rec.id,
      userId: 'u',
      clinicId: 'c',
      unitId: 'un',
      actionId: 'clinical.confirm_save_anamnesis',
      payload,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('consumed');
  });

  it('rejeita payload alterado', async () => {
    const payload = { encounter_id: 'e1', anamnesis: { history: 'a' } };
    const rec = await createConfirmation({
      userId: 'u',
      clinicId: 'c',
      unitId: 'un',
      actionId: 'clinical.confirm_save_anamnesis',
      payload,
    });
    const bad = await consumeConfirmation({
      confirmationId: rec.id,
      userId: 'u',
      clinicId: 'c',
      unitId: 'un',
      actionId: 'clinical.confirm_save_anamnesis',
      payload: { ...payload, anamnesis: { history: 'b' } },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('mismatch');
  });
});
