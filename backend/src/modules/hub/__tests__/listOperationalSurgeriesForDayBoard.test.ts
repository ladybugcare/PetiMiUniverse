jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());

import {
  configureSupabaseMock,
} from '../../../__tests__/helpers/supabaseTestDouble';
import { TEST_CLINIC_ID, TEST_GUARDIAN_ID, TEST_PET_ID } from '../../../__tests__/helpers/mockAuth';
import { listOperationalSurgeriesForDayBoard } from '../hubSurgeryFromAppointment';

const STAFF_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FROM = '2026-11-27T03:00:00.000Z';
const TO = '2026-11-28T03:00:00.000Z';

function surgery(partial: Record<string, unknown>) {
  return {
    id: partial.id,
    clinic_id: TEST_CLINIC_ID,
    title: partial.title ?? 'Cirurgia',
    status: partial.status,
    scheduled_at: partial.scheduled_at ?? null,
    started_at: partial.started_at ?? null,
    completed_at: partial.completed_at ?? null,
    discharge_at: partial.discharge_at ?? null,
    clinical_outcome: partial.clinical_outcome ?? null,
    pet_id: TEST_PET_ID,
    guardian_id: TEST_GUARDIAN_ID,
    hub_staff_member_id: STAFF_ID,
    hub_appointment_id: partial.hub_appointment_id ?? null,
    hub_encounter_id: partial.hub_encounter_id ?? null,
    deleted_at: null,
  };
}

describe('listOperationalSurgeriesForDayBoard', () => {
  it('inclui completed sem discharge_at e exclui com alta ou óbito', async () => {
    configureSupabaseMock({
      tables: {
        hub_surgeries: [
          surgery({
            id: 's-scheduled',
            status: 'scheduled',
            scheduled_at: '2026-11-27T15:00:00.000Z',
            title: 'Agendada do dia',
          }),
          surgery({
            id: 's-active',
            status: 'in_progress',
            started_at: '2026-11-26T10:00:00.000Z',
            title: 'Em andamento',
          }),
          surgery({
            id: 's-pending',
            status: 'completed',
            completed_at: '2026-11-27T16:00:00.000Z',
            discharge_at: null,
            title: 'Concluída sem alta',
          }),
          surgery({
            id: 's-discharged',
            status: 'completed',
            completed_at: '2026-11-27T12:00:00.000Z',
            discharge_at: '2026-11-27T17:00:00.000Z',
            title: 'Com alta',
          }),
          surgery({
            id: 's-death',
            status: 'completed',
            completed_at: '2026-11-27T14:00:00.000Z',
            discharge_at: null,
            clinical_outcome: 'death',
            title: 'Óbito',
          }),
        ],
      },
    });

    const rows = await listOperationalSurgeriesForDayBoard({
      clinicId: TEST_CLINIC_ID,
      from: FROM,
      to: TO,
      staffMemberId: STAFF_ID,
    });

    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual(['s-active', 's-pending', 's-scheduled']);
    const pending = rows.find((r) => r.id === 's-pending');
    expect(pending?.discharge_at).toBeNull();
    expect(pending?.status).toBe('completed');
  });
});
