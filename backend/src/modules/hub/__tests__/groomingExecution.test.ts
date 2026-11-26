jest.mock('../../../config/supabase', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import { supabaseAdmin } from '../../../config/supabase';
import { ensureGroomingAppointmentLinesExecuted } from '../groomingExecution';
import { isGroomingServiceOperationallyDone } from '../groomingStages';

const fromMock = supabaseAdmin.from as jest.Mock;

describe('isGroomingServiceOperationallyDone', () => {
  it('Pronto, entregue e encerrado = serviço concluído', () => {
    expect(isGroomingServiceOperationallyDone('ready')).toBe(true);
    expect(isGroomingServiceOperationallyDone('delivered')).toBe(true);
    expect(isGroomingServiceOperationallyDone('closed')).toBe(true);
  });

  it('em atendimento / fila ainda não concluídos', () => {
    expect(isGroomingServiceOperationallyDone('in_service')).toBe(false);
    expect(isGroomingServiceOperationallyDone('queued')).toBe(false);
    expect(isGroomingServiceOperationallyDone('finishing')).toBe(false);
  });
});

describe('ensureGroomingAppointmentLinesExecuted', () => {
  const updateInMock = jest.fn().mockResolvedValue({ error: null });

  beforeEach(() => {
    fromMock.mockReset();
    updateInMock.mockClear();
  });

  it('marca só linhas banho_tosa sem executed_at', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'hub_appointments') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'appt-1', clinic_id: 'clinic-1' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'hub_appointment_services') {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                { id: 'line-done', hub_service_type_id: 'st-bath', executed_at: '2026-01-01T10:00:00Z' },
                { id: 'line-pending', hub_service_type_id: 'st-bath', executed_at: null },
                { id: 'line-clinica', hub_service_type_id: 'st-consult', executed_at: null },
              ],
              error: null,
            }),
          }),
          update: () => ({
            in: updateInMock,
          }),
        };
      }
      if (table === 'hub_service_types') {
        return {
          select: () => ({
            in: async () => ({
              data: [
                { id: 'st-bath', service_group: 'banho_tosa' },
                { id: 'st-consult', service_group: 'clinica' },
              ],
              error: null,
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    });

    const marked = await ensureGroomingAppointmentLinesExecuted({
      clinicId: 'clinic-1',
      appointmentId: 'appt-1',
      executedByStaffId: 'staff-1',
      at: '2026-11-26T15:00:00.000Z',
    });

    expect(marked).toBe(1);
    expect(updateInMock).toHaveBeenCalledWith('id', ['line-pending']);
  });

  it('sem appointmentId não faz nada', async () => {
    const marked = await ensureGroomingAppointmentLinesExecuted({
      clinicId: 'clinic-1',
      appointmentId: null,
    });
    expect(marked).toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
