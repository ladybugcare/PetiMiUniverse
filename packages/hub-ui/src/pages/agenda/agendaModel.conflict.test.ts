import { describe, expect, it } from 'vitest';
import { computeOverlapConflictIds, type AgendaAppointment } from './agendaModel';

function appt(
  partial: Partial<AgendaAppointment> &
    Pick<AgendaAppointment, 'id' | 'start' | 'end'> & {
      professionalId?: string | null;
      resourceLabel?: string;
      hubResourceId?: string | null;
    },
): AgendaAppointment {
  return {
    serviceName: 'Banho',
    group: 'banho_tosa',
    agendaColor: null,
    professionalId: partial.professionalId ?? null,
    professionalName: 'Prof',
    resourceLabel: partial.resourceLabel ?? '—',
    hubResourceId: partial.hubResourceId ?? null,
    unitName: 'Unidade',
    petName: 'Rex',
    guardianName: 'Tutor',
    status: 'confirmed',
    ...partial,
  };
}

describe('computeOverlapConflictIds', () => {
  const t10 = new Date('2026-03-10T10:00:00');
  const t11 = new Date('2026-03-10T11:00:00');
  const t12 = new Date('2026-03-10T12:00:00');

  it('marca overlap do mesmo profissional', () => {
    const ids = computeOverlapConflictIds(
      [
        appt({ id: 'a', professionalId: 'ana', start: t10, end: t11 }),
        appt({ id: 'b', professionalId: 'ana', start: new Date('2026-03-10T10:30:00'), end: t12 }),
      ],
      'resource',
    );
    expect([...ids].sort()).toEqual(['a', 'b']);
  });

  it('não marca profissionais diferentes sem recurso em comum (vista recurso / balde Sem recurso)', () => {
    const ids = computeOverlapConflictIds(
      [
        appt({ id: 'a', professionalId: 'ana', resourceLabel: '—', start: t10, end: t11 }),
        appt({ id: 'b', professionalId: 'bruno', resourceLabel: '—', start: t10, end: t11 }),
        appt({ id: 'c', professionalId: 'carla', start: t10, end: t11 }),
      ],
      'resource',
    );
    expect(ids.size).toBe(0);
  });

  it('marca overlap do mesmo recurso por id', () => {
    const ids = computeOverlapConflictIds(
      [
        appt({
          id: 'a',
          professionalId: 'ana',
          hubResourceId: 'r1',
          resourceLabel: 'Banheira 1',
          start: t10,
          end: t11,
        }),
        appt({
          id: 'b',
          professionalId: 'bruno',
          hubResourceId: 'r1',
          resourceLabel: 'Nome antigo',
          start: new Date('2026-03-10T10:30:00'),
          end: t12,
        }),
      ],
      'professional',
    );
    expect([...ids].sort()).toEqual(['a', 'b']);
  });

  it('marca overlap do mesmo resource_label sem id', () => {
    const ids = computeOverlapConflictIds([
      appt({ id: 'a', resourceLabel: 'Banheira 1', start: t10, end: t11 }),
      appt({ id: 'b', resourceLabel: 'Banheira 1', start: t10, end: t11 }),
    ]);
    expect([...ids].sort()).toEqual(['a', 'b']);
  });

  it('ignora recurso já liberado', () => {
    const ids = computeOverlapConflictIds([
      appt({
        id: 'a',
        hubResourceId: 'r1',
        resourceLabel: 'Banheira 1',
        resourceReleasedAt: '2026-03-10T10:15:00Z',
        start: t10,
        end: t11,
      }),
      appt({
        id: 'b',
        hubResourceId: 'r1',
        resourceLabel: 'Banheira 1',
        start: t10,
        end: t11,
      }),
    ]);
    expect(ids.size).toBe(0);
  });

  it('não marca horários adjacentes', () => {
    const ids = computeOverlapConflictIds([
      appt({ id: 'a', professionalId: 'ana', start: t10, end: t11 }),
      appt({ id: 'b', professionalId: 'ana', start: t11, end: t12 }),
    ]);
    expect(ids.size).toBe(0);
  });

  it('ignora cancelados', () => {
    const ids = computeOverlapConflictIds([
      appt({ id: 'a', professionalId: 'ana', start: t10, end: t11, status: 'cancelled' }),
      appt({ id: 'b', professionalId: 'ana', start: t10, end: t11 }),
    ]);
    expect(ids.size).toBe(0);
  });

  it('ignora faltas (no_show)', () => {
    const ids = computeOverlapConflictIds([
      appt({ id: 'a', professionalId: 'ana', start: t10, end: t11, status: 'no_show' }),
      appt({ id: 'b', professionalId: 'ana', start: t10, end: t11 }),
    ]);
    expect(ids.size).toBe(0);
  });
});
