import { describe, expect, it } from 'vitest';
import {
  aggregateAgendaStats,
  aggregateBoarding,
  aggregateClinicDayBoard,
  aggregateGroomingDayBoard,
  aggregatePickup,
} from './todayOpsAggregate';

describe('todayOpsAggregate', () => {
  it('soma agenda por grupo', () => {
    const r = aggregateAgendaStats([
      { service_group: 'clinica', label: 'Clínica', count: 3 },
      { service_group: 'banho_tosa', label: 'Banho', count: 2 },
    ]);
    expect(r.total).toBe(5);
    expect(r.by_group).toHaveLength(2);
  });

  it('classifica fila clínica', () => {
    const r = aggregateClinicDayBoard([
      { kind: 'encounter', status: 'waiting' },
      { kind: 'encounter', status: 'in_progress' },
      { kind: 'appointment_slot', appointment_status: 'done' },
      { kind: 'appointment_slot', appointment_status: 'confirmed' },
    ] as never);
    expect(r).toEqual({ waiting: 2, in_progress: 1, done: 1, total: 4 });
  });

  it('agrega grooming por estágio', () => {
    const r = aggregateGroomingDayBoard([
      { grooming_stage: 'queued' },
      { grooming_stage: 'in_service' },
      { grooming_stage: 'ready' },
      { grooming_stage: 'closed' },
    ] as never);
    expect(r.waiting).toBe(1);
    expect(r.in_service).toBe(1);
    expect(r.ready).toBe(1);
    expect(r.by_stage.closed).toBe(1);
  });

  it('combina ocupação e day-board de hotel', () => {
    const r = aggregateBoarding(
      {
        hotel: { current: 4, max: 6, over_capacity: false },
        daycare: { current: 2, max: 2, over_capacity: false },
      },
      [{ boarding_stage: 'reserved' }, { boarding_stage: 'checked_in' }, { boarding_stage: 'checked_out' }] as never,
    );
    expect(r.hotel.current).toBe(4);
    expect(r.checkins_today).toBe(2);
  });

  it('conta rotas e paradas pendentes', () => {
    const r = aggregatePickup(
      [
        { id: '1', clinic_id: 'c', route_date: '2026-10-08', status: 'planned' },
        { id: '2', clinic_id: 'c', route_date: '2026-10-08', status: 'cancelled' },
        {
          id: '3',
          clinic_id: 'c',
          route_date: '2026-10-08',
          status: 'in_progress',
          driver_staff_id: 'd1',
        },
      ] as never,
      [
        { appointment_id: 'a', appointment_kind: 'pickup_route', direction: 'pickup', starts_at: '', ends_at: '', status: 'confirmed', stop_status: 'pending' },
        { appointment_id: 'b', appointment_kind: 'pickup_route', direction: 'pickup', starts_at: '', ends_at: '', status: 'done', stop_status: 'completed' },
      ] as never,
    );
    expect(r.routes).toBe(2);
    expect(r.stops_pending).toBe(1);
    expect(r.routes_without_driver).toBe(1);
  });
});
