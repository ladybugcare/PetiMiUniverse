import { describe, expect, it } from 'vitest';
import { manualAppointmentStatusError } from '../hubAppointmentManualStatus';

describe('manualAppointmentStatusError', () => {
  it('permite create com status operacional', () => {
    expect(manualAppointmentStatusError('confirmed', { mode: 'create' })).toBeNull();
    expect(manualAppointmentStatusError('checked_in', { mode: 'create' })).toBeNull();
  });

  it('rejeita create com done ou paid', () => {
    expect(manualAppointmentStatusError('done', { mode: 'create' })).toMatch(/finalizado ou pago/i);
    expect(manualAppointmentStatusError('paid', { mode: 'create' })).toMatch(/Pago só após quitação/i);
  });

  it('rejeita patch para paid', () => {
    expect(
      manualAppointmentStatusError('paid', { mode: 'patch', currentStatus: 'checked_in' }),
    ).toMatch(/Pago só após quitação/i);
  });

  it('permite patch done só a partir de checked_in / in_progress', () => {
    expect(
      manualAppointmentStatusError('done', { mode: 'patch', currentStatus: 'checked_in' }),
    ).toBeNull();
    expect(
      manualAppointmentStatusError('done', { mode: 'patch', currentStatus: 'in_progress' }),
    ).toBeNull();
    expect(
      manualAppointmentStatusError('done', { mode: 'patch', currentStatus: 'confirmed' }),
    ).toMatch(/Finalizado/i);
  });

  it('ignora status ausente', () => {
    expect(manualAppointmentStatusError(undefined, { mode: 'patch' })).toBeNull();
    expect(manualAppointmentStatusError(null, { mode: 'create' })).toBeNull();
  });
});
