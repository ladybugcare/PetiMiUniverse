import { arrivalPendingAppointmentIds, planCustody, reconcileHandoffRows } from '../receptionCustody';

function snap(partial: Partial<Parameters<typeof planCustody>[0]> = {}) {
  return {
    petId: 'pet-1',
    dayYmd: '2026-11-06',
    nowIso: '2026-11-06T15:00:00.000Z',
    appointments: [],
    groomingSessions: [],
    extras: [],
    encounters: [],
    hospitalizations: [],
    surgeries: [],
    boarding: [],
    legs: [],
    unresolvedArrivals: [],
    ...partial,
  };
}

describe('planCustody', () => {
  it('banho pronto sem transporte e sem estadia vira retirada no balcão', () => {
    const plan = planCustody(
      snap({
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
      }),
    );
    expect(plan.closeGroomingSessionIds).toEqual([]);
    expect(plan.handoffs.map((h) => h.kind)).toEqual(['retirada_balcao']);
    expect(plan.handoffs[0].source_id).toBe('s1');
    expect(JSON.stringify(plan)).not.toMatch(/amount|saldo|price/i);
  });

  it('pet em hotel ou creche fecha o banho e não gera retirada', () => {
    const plan = planCustody(
      snap({
        boarding: [{ id: 'b1', unit_id: 'u1', status: 'checked_in' }],
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
      }),
    );
    expect(plan.closeGroomingSessionIds).toEqual(['s1']);
    expect(plan.handoffs.some((h) => h.kind === 'retirada_balcao')).toBe(false);
  });

  it('entrega com motorista não cria tarefa; concluída fecha o banho', () => {
    const ready = {
      id: 's1',
      unit_id: 'u1',
      guardian_id: 'g1',
      hub_appointment_id: 'a1',
      grooming_stage: 'ready' as const,
      ready_at: '2026-11-06T14:00:00.000Z',
    };
    const waiting = planCustody(
      snap({
        groomingSessions: [ready],
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
      }),
    );
    expect(waiting.handoffs).toEqual([]);
    expect(waiting.closeGroomingSessionIds).toEqual([]);

    const done = planCustody(
      snap({
        groomingSessions: [ready],
        legs: [
          {
            parent_appointment_id: 'a1',
            appointment_status: 'done',
            direction: 'delivery',
            stop_status: 'completed',
            route_id: 'r1',
            driver_id: 'd1',
          },
        ],
      }),
    );
    expect(done.closeGroomingSessionIds).toEqual(['s1']);
    expect(done.handoffs).toEqual([]);
  });

  it('perna de volta sem motorista vira embarque', () => {
    const plan = planCustody(
      snap({
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
        legs: [
          {
            parent_appointment_id: 'a1',
            appointment_status: 'confirmed',
            direction: 'delivery',
            stop_status: 'pending',
            route_id: null,
            driver_id: null,
          },
        ],
      }),
    );
    expect(plan.handoffs.map((h) => h.kind)).toEqual(['embarque']);
  });

  it('consulta concluída com internação ativa não libera o pet', () => {
    const plan = planCustody(
      snap({
        encounters: [
          {
            id: 'e1',
            unit_id: 'u1',
            guardian_id: 'g1',
            hub_appointment_id: 'a1',
            status: 'completed',
            completed_at: '2026-11-06T14:00:00.000Z',
          },
        ],
        hospitalizations: [
          {
            id: 'h1',
            unit_id: 'u1',
            guardian_id: 'g1',
            hub_appointment_id: 'a2',
            status: 'active',
            discharged_at: null,
          },
        ],
      }),
    );
    expect(plan.handoffs.filter((h) => h.kind === 'retirada_balcao')).toEqual([]);
  });

  it('alta gera retirada; óbito não gera', () => {
    const alta = planCustody(
      snap({
        hospitalizations: [
          {
            id: 'h1',
            unit_id: 'u1',
            guardian_id: 'g1',
            hub_appointment_id: 'a1',
            status: 'discharged',
            discharged_at: '2026-11-06T16:00:00.000Z',
          },
        ],
      }),
    );
    expect(alta.handoffs.map((h) => h.context.label)).toEqual(['Alta']);

    const obito = planCustody(
      snap({
        hospitalizations: [
          {
            id: 'h1',
            unit_id: 'u1',
            guardian_id: 'g1',
            hub_appointment_id: 'a1',
            status: 'death',
            discharged_at: '2026-11-06T16:00:00.000Z',
          },
        ],
      }),
    );
    expect(obito.handoffs).toEqual([]);
  });

  it('outro serviço aberto no dia bloqueia a retirada', () => {
    const plan = planCustody(
      snap({
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
        appointments: [
          {
            id: 'a2',
            unit_id: 'u1',
            guardian_id: 'g1',
            status: 'confirmed',
            appointment_kind: 'standard',
            starts_at: '2026-11-06T18:00:00.000Z',
            service_group: 'clinica',
            service_name: 'Consulta',
            parent_appointment_id: null,
          },
        ],
      }),
    );
    expect(plan.handoffs.some((h) => h.kind === 'retirada_balcao')).toBe(false);
    expect(plan.handoffs.some((h) => h.kind === 'chegada')).toBe(true);
  });

  it('agendamento cancelado não mantém retirada do banho', () => {
    const plan = planCustody(
      snap({
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
        appointments: [
          {
            id: 'a1',
            unit_id: 'u1',
            guardian_id: 'g1',
            status: 'cancelled',
            appointment_kind: 'standard',
            starts_at: '2026-11-06T13:00:00.000Z',
            service_group: 'banho_tosa',
            service_name: 'Banho',
            parent_appointment_id: null,
          },
        ],
      }),
    );
    expect(plan.handoffs.filter((h) => h.kind === 'retirada_balcao')).toEqual([]);
    expect(plan.closeGroomingSessionIds).toEqual([]);
  });

  it('pedido de extra e chegada do tutor entram na fila', () => {
    const plan = planCustody(
      snap({
        appointments: [
          {
            id: 'a1',
            unit_id: 'u1',
            guardian_id: 'g1',
            status: 'confirmed',
            appointment_kind: 'standard',
            starts_at: '2026-11-06T12:00:00.000Z',
            service_group: 'banho_tosa',
            service_name: 'Banho',
            parent_appointment_id: null,
          },
        ],
        extras: [
          {
            event_id: 'ev1',
            session_id: 's1',
            unit_id: 'u1',
            guardian_id: 'g1',
            created_at: '2026-11-06T13:00:00.000Z',
            hub_service_type_id: 'st1',
            extra_name: 'Hidratação',
          },
        ],
      }),
    );
    expect(plan.handoffs.map((h) => h.kind).sort()).toEqual(['autorizar_extra', 'chegada']);
  });
});

describe('planCustody — falha no Leva e Traz', () => {
  const ready = {
    id: 's1',
    unit_id: 'u1',
    guardian_id: 'g1',
    hub_appointment_id: 'a1',
    grooming_stage: 'ready' as const,
    ready_at: '2026-11-06T14:00:00.000Z',
  };
  const failedDelivery = {
    parent_appointment_id: 'a1',
    appointment_status: 'in_progress',
    direction: 'delivery' as const,
    stop_status: 'failed',
    route_id: 'r1',
    driver_id: 'd1',
    failure_outcome: 'return_to_clinic' as const,
  };
  const failure = {
    stop_id: 'st1',
    unit_id: 'u1',
    guardian_id: 'g1',
    direction: 'delivery' as const,
    appointment_id: 'leg1',
    route_id: 'r1',
    failure_reason: 'Tutor ausente',
    failed_at: '2026-11-06T15:00:00.000Z',
  };

  it('pet ainda voltando segura a saída e não abre tarefa', () => {
    const plan = planCustody(
      snap({
        groomingSessions: [ready],
        legs: [failedDelivery],
        failedReturns: [{ ...failure, returned_at: null }],
      }),
    );
    expect(plan.handoffs).toEqual([]);
  });

  it('retorno concluído abre lt_falha no lugar da retirada', () => {
    const plan = planCustody(
      snap({
        groomingSessions: [ready],
        legs: [failedDelivery],
        failedReturns: [{ ...failure, returned_at: '2026-11-06T15:30:00.000Z' }],
      }),
    );
    expect(plan.handoffs.map((h) => h.kind)).toEqual(['lt_falha']);
    expect(plan.handoffs[0].source_id).toBe('st1');
    expect(plan.handoffs[0].context.failure_reason).toBe('Tutor ausente');
  });

  it('tutor vai buscar (falha resolvida) volta a gerar retirada no balcão', () => {
    const plan = planCustody(snap({ groomingSessions: [ready], legs: [failedDelivery] }));
    expect(plan.handoffs.map((h) => h.kind)).toEqual(['retirada_balcao']);
  });

  it('novo Leva e Traz sem rota gera embarque', () => {
    const plan = planCustody(
      snap({
        groomingSessions: [ready],
        legs: [
          failedDelivery,
          {
            parent_appointment_id: 'a1',
            appointment_status: 'confirmed',
            direction: 'delivery',
            stop_status: 'pending',
            route_id: null,
            driver_id: null,
          },
        ],
      }),
    );
    expect(plan.handoffs.map((h) => h.kind)).toEqual(['embarque']);
  });

  it('coleta que falhou com pet a bordo não vira "tutor traz"', () => {
    const plan = planCustody(
      snap({
        appointments: [
          {
            id: 'a1',
            unit_id: 'u1',
            guardian_id: 'g1',
            status: 'confirmed',
            appointment_kind: 'standard',
            starts_at: '2026-11-06T16:00:00.000Z',
            service_group: 'banho_tosa',
            service_name: 'Banho',
            parent_appointment_id: null,
          },
        ],
        legs: [{ ...failedDelivery, direction: 'pickup' }],
      }),
    );
    expect(plan.handoffs.some((h) => h.kind === 'chegada')).toBe(false);
  });

  it('lt_falha resolvida não é reaberta', () => {
    const desired = planCustody(
      snap({ failedReturns: [{ ...failure, returned_at: '2026-11-06T15:30:00.000Z' }] }),
    ).handoffs;
    const out = reconcileHandoffRows(
      [
        {
          id: 'h1',
          kind: 'lt_falha',
          source_type: 'pickup_stop',
          source_id: 'st1',
          status: 'done',
          resolved_at: '2026-11-06T15:40:00.000Z',
          context: desired[0].context,
        },
      ],
      desired,
      '2026-11-06',
    );
    expect(out.insert).toEqual([]);
  });
});

describe('reconcileHandoffRows', () => {
  const desired = {
    kind: 'retirada_balcao' as const,
    source_type: 'grooming_session',
    source_id: 's1',
    pet_id: 'pet-1',
    guardian_id: 'g1',
    unit_id: 'u1',
    opened_at: '2026-11-06T14:00:00.000Z',
    context: { label: 'Banho', ready_at: '2026-11-06T14:00:00.000Z' },
  };

  it('não duplica handoff aberto', () => {
    const existing = [
      {
        id: 'h1',
        kind: 'retirada_balcao' as const,
        source_type: 'grooming_session',
        source_id: 's1',
        status: 'open' as const,
        resolved_at: null,
        context: desired.context,
      },
    ];
    const out = reconcileHandoffRows(existing, [desired], '2026-11-06');
    expect(out.insert).toEqual([]);
    expect(out.cancelIds).toEqual([]);
  });

  it('não reabre retirada já entregue depois do pronto', () => {
    const existing = [
      {
        id: 'h1',
        kind: 'retirada_balcao' as const,
        source_type: 'grooming_session',
        source_id: 's1',
        status: 'done' as const,
        resolved_at: '2026-11-06T15:00:00.000Z',
        context: desired.context,
      },
    ];
    const out = reconcileHandoffRows(existing, [desired], '2026-11-06');
    expect(out.insert).toEqual([]);
  });

  it('cancela aberto quando o pronto é desfeito', () => {
    const existing = [
      {
        id: 'h1',
        kind: 'retirada_balcao' as const,
        source_type: 'grooming_session',
        source_id: 's1',
        status: 'open' as const,
        resolved_at: null,
        context: desired.context,
      },
    ];
    const out = reconcileHandoffRows(existing, [], '2026-11-06');
    expect(out.cancelIds).toEqual(['h1']);
  });

  it('troca de transporte cancela a retirada que deixou de valer', () => {
    const existing = [
      {
        id: 'h1',
        kind: 'retirada_balcao' as const,
        source_type: 'grooming_session',
        source_id: 's1',
        status: 'open' as const,
        resolved_at: null,
        context: desired.context,
      },
    ];
    const embarque = { ...desired, kind: 'embarque' as const };
    const out = reconcileHandoffRows(existing, [embarque], '2026-11-06');
    expect(out.cancelIds).toEqual(['h1']);
    expect(out.insert.map((h) => h.kind)).toEqual(['embarque']);
  });

  it('cancela chegada de outro dia quando o banho já não espera a recepção', () => {
    const existing = [
      {
        id: 'h-old',
        kind: 'chegada' as const,
        source_type: 'appointment',
        source_id: 'a-old',
        status: 'open' as const,
        resolved_at: null,
        context: { label: 'Banho', starts_at: '2026-11-03T13:00:00.000Z', appointment_id: 'a-old' },
      },
    ];
    const out = reconcileHandoffRows(existing, [], '2026-11-06', {
      preserveChegadaSourceIds: new Set(),
    });
    expect(out.cancelIds).toEqual(['h-old']);
  });

  it('preserva chegada futura ainda pendente ao sincronizar outro dia', () => {
    const existing = [
      {
        id: 'h-future',
        kind: 'chegada' as const,
        source_type: 'appointment',
        source_id: 'a-future',
        status: 'open' as const,
        resolved_at: null,
        context: { label: 'Banho', starts_at: '2026-11-08T13:00:00.000Z', appointment_id: 'a-future' },
      },
    ];
    const out = reconcileHandoffRows(existing, [], '2026-11-06', {
      preserveChegadaSourceIds: new Set(['a-future']),
    });
    expect(out.cancelIds).toEqual([]);
  });
});

describe('planCustody chegada vs banho', () => {
  const confirmedBanho = {
    id: 'a1',
    unit_id: 'u1',
    guardian_id: 'g1',
    status: 'confirmed',
    appointment_kind: 'standard' as const,
    starts_at: '2026-11-06T13:00:00.000Z',
    service_group: 'banho_tosa',
    service_name: 'Banho',
    parent_appointment_id: null,
  };

  it('não abre chegada se a sessão de banho já está em andamento ou pronta', () => {
    for (const stage of ['queued', 'in_service', 'ready'] as const) {
      const plan = planCustody(
        snap({
          appointments: [confirmedBanho],
          groomingSessions: [
            {
              id: 's1',
              unit_id: 'u1',
              guardian_id: 'g1',
              hub_appointment_id: 'a1',
              grooming_stage: stage,
              ready_at: stage === 'ready' ? '2026-11-06T14:00:00.000Z' : null,
            },
          ],
        }),
      );
      expect(plan.handoffs.some((h) => h.kind === 'chegada')).toBe(false);
    }
  });

  it('arrivalPendingAppointmentIds exclui agendamento já avançado no salão', () => {
    const ids = arrivalPendingAppointmentIds(
      snap({
        appointments: [confirmedBanho],
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
      }),
    );
    expect(ids.has('a1')).toBe(false);
  });
});
