/**
 * Escolha da ação operacional do painel de conferência do Caixa
 * (por origin_type + permissões). Sem I/O.
 */

import type { CaixaCarryoverConferenceKind } from './hubComandaEditUtils';

export type CaixaConferencePermissions = {
  canAppointmentsWrite: boolean;
  canGroomingManage: boolean;
  canClinicWrite: boolean;
  canMarkExecution: boolean;
  canCreateReceivable: boolean;
};

export type CaixaConferenceOperationalAction =
  | 'conclude_appointment'
  | 'advance_grooming'
  | 'complete_encounter'
  | 'open_module'
  | 'none';

export type CaixaConferenceActionPlan = {
  operationalAction: CaixaConferenceOperationalAction;
  operationalLabel: string | null;
  operationalHint: string;
  showMarkExecution: boolean;
  showCharge: boolean;
  /** Mostrar botão Enviar ao financeiro (pode estar desabilitado). */
  showHandoff: boolean;
  /** true só quando a conferência está pronta para leave_pending. */
  handoffEnabled: boolean;
  handoffDisabledReason: string | null;
  moduleHref: string | null;
};

const EXECUTION_ORIGINS = new Set([
  'appointment',
  'grooming_session',
  'encounter',
  'hospitalization',
]);

export function supportsMarkExecutionOrigin(originType: string): boolean {
  return EXECUTION_ORIGINS.has(String(originType ?? ''));
}

export function resolveCaixaConferenceActionPlan(input: {
  originType: string;
  conferenceKind: CaixaCarryoverConferenceKind;
  permissions: CaixaConferencePermissions;
  moduleHref: string | null;
}): CaixaConferenceActionPlan {
  const ot = String(input.originType ?? '');
  const { conferenceKind, permissions, moduleHref } = input;
  const showMarkExecution =
    permissions.canMarkExecution &&
    supportsMarkExecutionOrigin(ot) &&
    (conferenceKind === 'needs_executor' || conferenceKind === 'ready' || conferenceKind === 'operational_incomplete');

  const showCharge = permissions.canCreateReceivable;
  const showHandoff = permissions.canCreateReceivable;
  const handoffEnabled = permissions.canCreateReceivable && conferenceKind === 'ready';
  const handoffDisabledReason = !permissions.canCreateReceivable
    ? null
    : conferenceKind === 'needs_executor'
      ? 'Marque o executor antes de enviar ao financeiro.'
      : conferenceKind === 'operational_incomplete'
        ? 'Conclua a operação antes de enviar ao financeiro.'
        : null;

  const handoffFields = {
    showCharge,
    showHandoff,
    handoffEnabled,
    handoffDisabledReason,
  };

  if (conferenceKind === 'ready') {
    return {
      operationalAction: 'none',
      operationalLabel: null,
      operationalHint: 'Operação ok — pode cobrar ou enviar ao financeiro.',
      showMarkExecution: permissions.canMarkExecution && supportsMarkExecutionOrigin(ot),
      ...handoffFields,
      moduleHref: null,
    };
  }

  if (conferenceKind === 'needs_executor') {
    return {
      operationalAction: 'none',
      operationalLabel: null,
      operationalHint: 'Falta marcar quem executou o serviço (comissões).',
      showMarkExecution: permissions.canMarkExecution && supportsMarkExecutionOrigin(ot),
      ...handoffFields,
      moduleHref: null,
    };
  }

  // operational_incomplete
  if (ot === 'appointment' && permissions.canAppointmentsWrite) {
    return {
      operationalAction: 'conclude_appointment',
      operationalLabel: 'Concluir na agenda',
      operationalHint: 'Marca o agendamento como concluído (done) sem sair do caixa.',
      showMarkExecution,
      ...handoffFields,
      moduleHref: moduleHref,
    };
  }
  if (ot === 'grooming_session' && permissions.canGroomingManage) {
    return {
      operationalAction: 'advance_grooming',
      operationalLabel: 'Avançar Banho & Tosa até Pronto',
      operationalHint: 'Avança a sessão do salão até o estágio Pronto (faturável).',
      showMarkExecution,
      ...handoffFields,
      moduleHref: moduleHref,
    };
  }
  if (ot === 'encounter' && permissions.canClinicWrite) {
    return {
      operationalAction: 'complete_encounter',
      operationalLabel: 'Finalizar atendimento clínico',
      operationalHint: 'Conclui o atendimento clínico vinculado à comanda.',
      showMarkExecution,
      ...handoffFields,
      moduleHref: moduleHref,
    };
  }

  const boarding = ot === 'boarding_reservation';
  return {
    operationalAction: 'open_module',
    operationalLabel: moduleHref ? 'Abrir módulo operacional' : null,
    operationalHint: boarding
      ? 'Hotel & Creche: o check-out precisa ser feito no módulo operacional.'
      : 'Sem permissão para concluir aqui — abra o módulo operacional ou peça a quem opera.',
    showMarkExecution,
    ...handoffFields,
    moduleHref,
  };
}
