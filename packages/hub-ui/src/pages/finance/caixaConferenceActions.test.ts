import { describe, expect, it } from 'vitest';
import {
  resolveCaixaConferenceActionPlan,
  supportsMarkExecutionOrigin,
  type CaixaConferencePermissions,
} from './caixaConferenceActions';

const allPerms: CaixaConferencePermissions = {
  canAppointmentsWrite: true,
  canGroomingManage: true,
  canClinicWrite: true,
  canMarkExecution: true,
  canCreateReceivable: true,
};

const noOps: CaixaConferencePermissions = {
  ...allPerms,
  canAppointmentsWrite: false,
  canGroomingManage: false,
  canClinicWrite: false,
};

describe('supportsMarkExecutionOrigin', () => {
  it('aceita origens com linhas de execução', () => {
    expect(supportsMarkExecutionOrigin('appointment')).toBe(true);
    expect(supportsMarkExecutionOrigin('grooming_session')).toBe(true);
    expect(supportsMarkExecutionOrigin('encounter')).toBe(true);
    expect(supportsMarkExecutionOrigin('hospitalization')).toBe(true);
  });

  it('rejeita boarding/manual', () => {
    expect(supportsMarkExecutionOrigin('boarding_reservation')).toBe(false);
    expect(supportsMarkExecutionOrigin('manual')).toBe(false);
  });
});

describe('resolveCaixaConferenceActionPlan — origem cancelada', () => {
  it('sem pagamento: anular; sem cobrar/enviar/executor', () => {
    const plan = resolveCaixaConferenceActionPlan({
      originType: 'appointment',
      conferenceKind: 'origin_cancelled',
      permissions: allPerms,
      moduleHref: null,
      paidTotal: 0,
    });
    expect(plan.operationalAction).toBe('void_comanda');
    expect(plan.showCharge).toBe(false);
    expect(plan.showHandoff).toBe(false);
    expect(plan.showMarkExecution).toBe(false);
  });

  it('com pagamento: resolver ajuste', () => {
    const plan = resolveCaixaConferenceActionPlan({
      originType: 'appointment',
      conferenceKind: 'origin_cancelled',
      permissions: allPerms,
      moduleHref: null,
      paidTotal: 50,
    });
    expect(plan.operationalAction).toBe('resolve_cancellation');
  });

  it('sem permissão de recebível: nenhuma ação', () => {
    const plan = resolveCaixaConferenceActionPlan({
      originType: 'appointment',
      conferenceKind: 'origin_cancelled',
      permissions: { ...allPerms, canCreateReceivable: false },
      moduleHref: null,
    });
    expect(plan.operationalAction).toBe('none');
  });
});

describe('resolveCaixaConferenceActionPlan', () => {
  it('pronta: sem ação operacional; permite handoff e executor', () => {
    const plan = resolveCaixaConferenceActionPlan({
      originType: 'appointment',
      conferenceKind: 'ready',
      permissions: allPerms,
      moduleHref: '/hub/agenda?appointment_id=x',
    });
    expect(plan.operationalAction).toBe('none');
    expect(plan.showHandoff).toBe(true);
    expect(plan.handoffEnabled).toBe(true);
    expect(plan.showMarkExecution).toBe(true);
    expect(plan.showCharge).toBe(true);
  });

  it('falta executor: mostra handoff desabilitado + execução', () => {
    const plan = resolveCaixaConferenceActionPlan({
      originType: 'appointment',
      conferenceKind: 'needs_executor',
      permissions: allPerms,
      moduleHref: '/hub/agenda?appointment_id=x&mark_execution=1',
    });
    expect(plan.operationalAction).toBe('none');
    expect(plan.showMarkExecution).toBe(true);
    expect(plan.showHandoff).toBe(true);
    expect(plan.handoffEnabled).toBe(false);
    expect(plan.handoffDisabledReason).toMatch(/executor/i);
  });

  it('operação incompleta: appointment → concluir com appointments.write', () => {
    const plan = resolveCaixaConferenceActionPlan({
      originType: 'appointment',
      conferenceKind: 'operational_incomplete',
      permissions: allPerms,
      moduleHref: '/hub/agenda?appointment_id=x',
    });
    expect(plan.operationalAction).toBe('conclude_appointment');
    expect(plan.operationalLabel).toMatch(/Concluir/i);
  });

  it('operação incompleta: grooming → avançar com queue.manage', () => {
    const plan = resolveCaixaConferenceActionPlan({
      originType: 'grooming_session',
      conferenceKind: 'operational_incomplete',
      permissions: allPerms,
      moduleHref: '/hub/banho-tosa',
    });
    expect(plan.operationalAction).toBe('advance_grooming');
  });

  it('operação incompleta: encounter → complete com clinic.write', () => {
    const plan = resolveCaixaConferenceActionPlan({
      originType: 'encounter',
      conferenceKind: 'operational_incomplete',
      permissions: allPerms,
      moduleHref: '/hub/clinica',
    });
    expect(plan.operationalAction).toBe('complete_encounter');
  });

  it('sem permissão operacional → open_module', () => {
    const plan = resolveCaixaConferenceActionPlan({
      originType: 'appointment',
      conferenceKind: 'operational_incomplete',
      permissions: noOps,
      moduleHref: '/hub/agenda?appointment_id=x',
    });
    expect(plan.operationalAction).toBe('open_module');
    expect(plan.moduleHref).toContain('/hub/agenda');
  });

  it('boarding: nunca conclui no caixa', () => {
    const plan = resolveCaixaConferenceActionPlan({
      originType: 'boarding_reservation',
      conferenceKind: 'operational_incomplete',
      permissions: allPerms,
      moduleHref: '/hub/hotel-creche',
    });
    expect(plan.operationalAction).toBe('open_module');
    expect(plan.operationalHint).toMatch(/Hotel/i);
    expect(plan.showMarkExecution).toBe(false);
  });

  it('sem receivables.create: não cobra nem handoff', () => {
    const plan = resolveCaixaConferenceActionPlan({
      originType: 'appointment',
      conferenceKind: 'ready',
      permissions: { ...allPerms, canCreateReceivable: false },
      moduleHref: null,
    });
    expect(plan.showCharge).toBe(false);
    expect(plan.showHandoff).toBe(false);
    expect(plan.handoffEnabled).toBe(false);
  });

  it('operação incompleta: handoff visível mas desabilitado', () => {
    const plan = resolveCaixaConferenceActionPlan({
      originType: 'appointment',
      conferenceKind: 'operational_incomplete',
      permissions: allPerms,
      moduleHref: '/hub/agenda?appointment_id=x',
    });
    expect(plan.showHandoff).toBe(true);
    expect(plan.handoffEnabled).toBe(false);
    expect(plan.handoffDisabledReason).toMatch(/opera/i);
  });
});
