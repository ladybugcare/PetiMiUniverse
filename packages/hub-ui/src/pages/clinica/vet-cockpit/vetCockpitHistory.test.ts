import { describe, expect, it } from 'vitest';
import type { HubEncounter, HubHospitalization, HubSurgery } from '../../../api/hubClinicalApi';
import { buildCockpitHistoryRows, filterCockpitHistoryRows } from './cockpitHistoryRows';

const now = new Date('2026-09-07T15:00:00.000-03:00');

function encounter(partial: Partial<HubEncounter>): HubEncounter {
  return {
    id: 'e1',
    clinic_id: 'c1',
    unit_id: null,
    pet_id: 'p1',
    guardian_id: null,
    hub_appointment_id: null,
    hub_staff_member_id: null,
    hub_case_id: 'case-1',
    encounter_type: 'consultation',
    status: 'completed',
    chief_complaint: 'Tosse',
    summary_notes: null,
    anamnesis: {},
    physical_exam: {},
    diagnosis: {},
    started_at: '2026-09-07T12:00:00.000Z',
    completed_at: '2026-09-07T13:00:00.000Z',
    pet: { id: 'p1', name: 'Luna' },
    ...partial,
  };
}

describe('buildCockpitHistoryRows', () => {
  it('junta atendimentos, cirurgias e internações encerradas e ordena do mais recente', () => {
    const rows = buildCockpitHistoryRows({
      encounters: [encounter({})],
      surgeries: [
        {
          id: 's1',
          clinic_id: 'c1',
          title: 'Castração',
          status: 'completed',
          pet_id: 'p2',
          completed_at: '2026-09-07T14:00:00.000Z',
          hub_pets: { name: 'Thor' },
        } as HubSurgery,
      ],
      hospitalizations: [
        {
          id: 'h1',
          pet_id: 'p3',
          status: 'discharged',
          discharged_at: '2026-09-06T10:00:00.000Z',
          reason: 'Pós-op',
          hub_pets: { name: 'Mel' },
        } as HubHospitalization,
      ],
    });
    expect(rows.map((r) => r.kind)).toEqual(['surgery', 'encounter', 'hospitalization']);
    expect(rows[0]?.title).toBe('Castração');
  });

  it('ignora itens ainda abertos', () => {
    const rows = buildCockpitHistoryRows({
      encounters: [encounter({ status: 'in_progress' })],
      surgeries: [{ id: 's1', status: 'scheduled', title: 'Piômetra', pet_id: 'p1' } as HubSurgery],
      hospitalizations: [{ id: 'h1', status: 'active', pet_id: 'p1' } as HubHospitalization],
    });
    expect(rows).toHaveLength(0);
  });
});

describe('filterCockpitHistoryRows', () => {
  const rows = buildCockpitHistoryRows({
    encounters: [encounter({})],
    surgeries: [
      {
        id: 's1',
        clinic_id: 'c1',
        title: 'Castração',
        status: 'completed',
        pet_id: 'p2',
        completed_at: '2026-08-01T14:00:00.000Z',
        hub_pets: { name: 'Thor' },
      } as HubSurgery,
    ],
    hospitalizations: [],
  });

  it('filtra por tipo e busca', () => {
    expect(filterCockpitHistoryRows(rows, { kind: 'surgery', query: '', period: '30d', now })).toHaveLength(0);
    expect(filterCockpitHistoryRows(rows, { kind: 'encounter', query: 'luna', period: '7d', now })).toHaveLength(1);
    expect(filterCockpitHistoryRows(rows, { kind: 'all', query: 'tosse', period: 'today', now })).toHaveLength(1);
  });
});
