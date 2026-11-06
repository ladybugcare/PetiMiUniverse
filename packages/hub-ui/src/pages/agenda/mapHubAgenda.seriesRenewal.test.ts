import { describe, expect, it } from 'vitest';
import type { HubSeriesEndingSoon } from '../../api/hubAgendaApi';
import type { AgendaAppointment } from './agendaModel';
import { buildDuplicateAppointmentInitial, buildSeriesRenewalInitial, nextSeriesOccurrenceStart } from './mapHubAgenda';

const series: HubSeriesEndingSoon = {
  series_id: 's1',
  remaining_count: 2,
  last_starts_at: '2026-09-10T13:00:00.000Z',
  kind: 'weekly',
  interval_value: 1,
  days_of_week: [4],
  day_of_month: null,
  until_date: null,
  occurrences: 8,
  sample_appointment_id: 'a1',
  pet_id: 'p1',
  guardian_id: 'g1',
  title: 'Banho',
};

describe('nextSeriesOccurrenceStart', () => {
  it('avança uma semana na série semanal', () => {
    const last = new Date('2026-09-10T13:00:00.000Z');
    expect(nextSeriesOccurrenceStart(last, 'weekly', 1).toISOString()).toBe('2026-09-17T13:00:00.000Z');
  });

  it('avança duas semanas na série quinzenal', () => {
    const last = new Date('2026-09-10T13:00:00.000Z');
    expect(nextSeriesOccurrenceStart(last, 'weekly', 2).toISOString()).toBe('2026-09-24T13:00:00.000Z');
    expect(nextSeriesOccurrenceStart(last, 'biweekly', 1).toISOString()).toBe('2026-09-24T13:00:00.000Z');
  });
});

function appointment(partial: Partial<AgendaAppointment> & Pick<AgendaAppointment, 'id' | 'start' | 'end'>): AgendaAppointment {
  return {
    serviceName: 'Banho',
    group: 'banho_tosa',
    agendaColor: null,
    professionalId: 'staff-1',
    professionalName: 'Ana',
    resourceLabel: 'Mesa 1',
    unitName: 'Unidade',
    petName: 'Thor',
    guardianName: 'Maria',
    status: 'done',
    petId: 'pet-1',
    guardianId: 'guardian-1',
    hub_service_type_id: 'svc-1',
    notes: 'Chega molhado',
    financial_notes: 'Desconto combinado',
    pricing_porte_tier: 'grande',
    pricing_coat_type: 'curto',
    services: [
      {
        id: 'line-1',
        hub_service_type_id: 'svc-1',
        name: 'Banho',
        durationMin: 60,
      },
    ],
    ...partial,
  };
}

describe('buildDuplicateAppointmentInitial', () => {
  it('copia tutor, pet, serviço e horário e abre como confirmado', () => {
    const source = appointment({
      id: 'appt-1',
      start: new Date('2026-11-06T12:00:00.000Z'),
      end: new Date('2026-11-06T13:00:00.000Z'),
    });
    const extra = appointment({
      id: 'appt-extra',
      start: new Date('2026-11-06T13:00:00.000Z'),
      end: new Date('2026-11-06T13:30:00.000Z'),
      parent_appointment_id: 'appt-1',
      services: [
        {
          id: 'line-2',
          hub_service_type_id: 'svc-2',
          name: 'Tosa',
          durationMin: 30,
        },
      ],
    });

    const initial = buildDuplicateAppointmentInitial(source, [extra]);

    expect(initial.status).toBe('confirmed');
    expect(initial.guardian_id).toBe('guardian-1');
    expect(initial.pet_id).toBe('pet-1');
    expect(initial.pet_name).toBe('Thor');
    expect(initial.hub_staff_member_id).toBe('staff-1');
    expect(initial.resource_label).toBe('Mesa 1');
    expect(initial.notes).toBe('Chega molhado');
    expect(initial.pricing_porte_tier).toBe('grande');
    expect(initial.services).toEqual([
      {
        hub_service_type_id: 'svc-1',
        name: 'Banho',
        duration_minutes: 60,
        pricing_variant: null,
      },
    ]);
    expect(initial.extra_blocks).toEqual([
      expect.objectContaining({
        hub_staff_member_id: 'staff-1',
        services: [expect.objectContaining({ hub_service_type_id: 'svc-2', name: 'Tosa' })],
      }),
    ]);
    expect(initial.extra_blocks?.[0]).not.toHaveProperty('appointment_id');
  });
});

describe('buildSeriesRenewalInitial', () => {
  it('sugere recorrência da série original e data após o último slot', () => {
    const initial = buildSeriesRenewalInitial(series, null);
    expect(initial.suggest_recurrence).toEqual({
      occurrences: 8,
      kind: 'weekly',
      interval_value: 1,
    });
    expect(initial.starts_at).toBe('2026-09-17T13:00:00.000Z');
    expect(initial.pet_id).toBe('p1');
    expect(initial.guardian_id).toBe('g1');
  });
});
