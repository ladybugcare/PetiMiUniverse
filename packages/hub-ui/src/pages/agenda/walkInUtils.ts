import type { HubAppointmentKind } from '../../api/hubAgendaApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import {
  isOperationalClinicalGroup,
  normalizeServiceGroupSlug,
  OPERATIONAL_GROOMING_SERVICE_GROUP,
} from '../../utils/serviceTypeSlug';
import type { AgendaAppointment } from './agendaModel';

const WALK_IN_KINDS = new Set<HubAppointmentKind>([
  'walk_in',
  'clinical_walk_in',
  'clinical_emergency',
]);

export function isWalkInAppointmentKind(kind: string | null | undefined): boolean {
  return !!kind && WALK_IN_KINDS.has(kind as HubAppointmentKind);
}

export function resolveWalkInAppointmentKind(
  serviceTypes: HubServiceType[],
  serviceTypeIds: string[],
  isEmergency: boolean,
): HubAppointmentKind {
  const groups = serviceTypeIds.map((id) => {
    const st = serviceTypes.find((t) => t.id === id);
    return normalizeServiceGroupSlug(st?.service_group);
  });
  const isClinical = groups.some((g) => isOperationalClinicalGroup(g));
  if (isClinical) {
    return isEmergency ? 'clinical_emergency' : 'clinical_walk_in';
  }
  return 'walk_in';
}

export type OperationalModule = 'clinical' | 'grooming' | 'boarding';

export function resolveOperationalModuleForAppointment(
  appt: Pick<AgendaAppointment, 'group' | 'serviceGroups'>,
): OperationalModule | null {
  const groups = appt.serviceGroups?.length ? appt.serviceGroups : [appt.group];
  const slugs = groups.map((g) => normalizeServiceGroupSlug(g));
  if (slugs.some((g) => isOperationalClinicalGroup(g))) return 'clinical';
  if (slugs.some((g) => g === OPERATIONAL_GROOMING_SERVICE_GROUP)) return 'grooming';
  if (slugs.some((g) => g === 'hotel' || g === 'creche')) return 'boarding';
  return null;
}

export function operationalOpenLabel(module: OperationalModule): string {
  switch (module) {
    case 'clinical':
      return 'Iniciar atendimento';
    case 'grooming':
      return 'Abrir na fila B&T';
    case 'boarding':
      return 'Abrir reserva';
    default:
      return 'Abrir operação';
  }
}
