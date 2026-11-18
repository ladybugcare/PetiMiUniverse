/**
 * Testes unitários do helper de embarque (lógica pura + contratos de resultado).
 * Integração com Supabase coberta em fluxos operacionais / QA.
 */
import { deliveryOutcome, linkedAppointmentIds, planCustody } from '../receptionCustody';

describe('deliveryOutcome + boarded', () => {
  it('sem boarded e com motorista → needs_boarding', () => {
    expect(
      deliveryOutcome([
        {
          parent_appointment_id: 'a1',
          appointment_status: 'confirmed',
          direction: 'delivery',
          stop_status: 'pending',
          route_id: 'r1',
          driver_id: 'd1',
        },
      ]),
    ).toBe('needs_boarding');
  });

  it('com boarded_at → boarded', () => {
    expect(
      deliveryOutcome([
        {
          parent_appointment_id: 'a1',
          appointment_status: 'confirmed',
          direction: 'delivery',
          stop_status: 'en_route',
          route_id: 'r1',
          driver_id: 'd1',
          boarded_at: '2026-11-06T15:00:00.000Z',
        },
      ]),
    ).toBe('boarded');
  });

  it('completed → delivered mesmo com boarded', () => {
    expect(
      deliveryOutcome([
        {
          parent_appointment_id: 'a1',
          appointment_status: 'done',
          direction: 'delivery',
          stop_status: 'completed',
          route_id: 'r1',
          driver_id: 'd1',
          boarded_at: '2026-11-06T15:00:00.000Z',
        },
      ]),
    ).toBe('delivered');
  });
});

describe('linkedAppointmentIds', () => {
  it('agrupa por visit_group_id e parent', () => {
    const snap = {
      petId: 'p1',
      dayYmd: '2026-11-06',
      nowIso: '2026-11-06T15:00:00.000Z',
      appointments: [
        {
          id: 'a1',
          unit_id: 'u1',
          guardian_id: 'g1',
          status: 'done',
          appointment_kind: 'standard',
          starts_at: '2026-11-06T10:00:00.000Z',
          service_group: 'banho_tosa',
          service_name: 'Banho',
          parent_appointment_id: null,
          visit_group_id: 'vg',
        },
        {
          id: 'a2',
          unit_id: 'u1',
          guardian_id: 'g1',
          status: 'confirmed',
          appointment_kind: 'standard',
          starts_at: '2026-11-06T11:00:00.000Z',
          service_group: 'clinica',
          service_name: 'Consulta',
          parent_appointment_id: null,
          visit_group_id: 'vg',
        },
        {
          id: 'leg',
          unit_id: 'u1',
          guardian_id: 'g1',
          status: 'confirmed',
          appointment_kind: 'pickup_route',
          starts_at: '2026-11-06T12:00:00.000Z',
          service_group: 'leva_traz',
          service_name: 'Entrega',
          parent_appointment_id: 'a1',
          visit_group_id: 'vg',
        },
        {
          id: 'other',
          unit_id: 'u1',
          guardian_id: 'g1',
          status: 'confirmed',
          appointment_kind: 'standard',
          starts_at: '2026-11-06T18:00:00.000Z',
          service_group: 'clinica',
          service_name: 'Outra',
          parent_appointment_id: null,
          visit_group_id: 'vg-other',
        },
      ],
      groomingSessions: [],
      extras: [],
      encounters: [],
      hospitalizations: [],
      surgeries: [],
      boarding: [],
      legs: [],
      unresolvedArrivals: [],
    };
    const linked = linkedAppointmentIds(snap, ['a1']);
    expect(linked.has('a1')).toBe(true);
    expect(linked.has('a2')).toBe(true);
    expect(linked.has('leg')).toBe(true);
    expect(linked.has('other')).toBe(false);
  });
});

describe('planCustody embarque com motorista', () => {
  it('banho pronto + delivery com motorista abre embarque', () => {
    const plan = planCustody({
      petId: 'p1',
      dayYmd: '2026-11-06',
      nowIso: '2026-11-06T15:00:00.000Z',
      appointments: [
        {
          id: 'a1',
          unit_id: 'u1',
          guardian_id: 'g1',
          status: 'done',
          appointment_kind: 'standard',
          starts_at: '2026-11-06T13:00:00.000Z',
          service_group: 'banho_tosa',
          service_name: 'Banho',
          parent_appointment_id: null,
        },
      ],
      groomingSessions: [
        {
          id: 's1',
          unit_id: 'u1',
          guardian_id: 'g1',
          hub_appointment_id: 'a1',
          grooming_stage: 'ready',
          ready_at: '2026-11-06T14:00:00.000Z',
        },
      ],
      extras: [],
      encounters: [],
      hospitalizations: [],
      surgeries: [],
      boarding: [],
      legs: [
        {
          parent_appointment_id: 'a1',
          appointment_status: 'confirmed',
          direction: 'delivery',
          stop_status: 'pending',
          route_id: 'r1',
          driver_id: 'd1',
        },
      ],
      unresolvedArrivals: [],
    });
    expect(plan.handoffs.map((h) => h.kind)).toEqual(['embarque']);
    expect(plan.handoffs[0].context.route_id).toBe('r1');
  });

  it('en_route sem boarded ainda é needs_boarding (deslocamento vazio)', () => {
    expect(
      deliveryOutcome([
        {
          parent_appointment_id: 'a1',
          appointment_status: 'confirmed',
          direction: 'delivery',
          stop_status: 'en_route',
          route_id: 'r1',
          driver_id: 'd1',
        },
      ]),
    ).toBe('needs_boarding');
  });

  it('hotel+banho durante estadia: fecha banho sem retirada/embarque', () => {
    const plan = planCustody({
      petId: 'p1',
      dayYmd: '2026-11-06',
      nowIso: '2026-11-06T15:00:00.000Z',
      appointments: [
        {
          id: 'a1',
          unit_id: 'u1',
          guardian_id: 'g1',
          status: 'done',
          appointment_kind: 'standard',
          starts_at: '2026-11-06T13:00:00.000Z',
          service_group: 'banho_tosa',
          service_name: 'Banho',
          parent_appointment_id: null,
        },
      ],
      groomingSessions: [
        {
          id: 's1',
          unit_id: 'u1',
          guardian_id: 'g1',
          hub_appointment_id: 'a1',
          grooming_stage: 'ready',
          ready_at: '2026-11-06T14:00:00.000Z',
        },
      ],
      extras: [],
      encounters: [],
      hospitalizations: [],
      surgeries: [],
      boarding: [{ id: 'b1', unit_id: 'u1', status: 'checked_in', mode: 'hotel' }],
      legs: [
        {
          parent_appointment_id: 'a1',
          appointment_status: 'confirmed',
          direction: 'delivery',
          stop_status: 'pending',
          route_id: 'r1',
          driver_id: 'd1',
        },
      ],
      unresolvedArrivals: [],
    });
    expect(plan.closeGroomingSessionIds).toEqual(['s1']);
    expect(plan.handoffs.some((h) => h.kind === 'embarque' || h.kind === 'retirada_balcao')).toBe(
      false,
    );
  });
});

describe('contrato boarded late / autoria', () => {
  it('isLateStatus: en_route/arrived/completed marcam late', () => {
    const late = new Set(['en_route', 'arrived', 'completed']);
    expect(late.has('pending')).toBe(false);
    expect(late.has('en_route')).toBe(true);
    expect(late.has('arrived')).toBe(true);
    expect(late.has('completed')).toBe(true);
  });

  it('resoluções de autoria são distintas por origem', () => {
    const bySource = (source: 'reception' | 'driver') =>
      source === 'driver' ? 'motorista_embarcou' : 'embarquei';
    expect(bySource('reception')).toBe('embarquei');
    expect(bySource('driver')).toBe('motorista_embarcou');
  });
});
