import type { AgendaAppointment } from './agendaModel';
import type { NewAppointmentInitial } from './NewAppointmentModal';

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Blocos filhos vinculados ao agendamento principal (não exibir como card separado na grade). */
export function isExtraBlockChildHiddenFromGrid(
  appt: Pick<AgendaAppointment, 'parent_appointment_id'>,
): boolean {
  return Boolean(appt.parent_appointment_id);
}

/** Localiza blocos adicionais de um agendamento principal (por vínculo ou heurística legada). */
export function findExtraBlockChildren(
  parent: AgendaAppointment,
  all: AgendaAppointment[],
): AgendaAppointment[] {
  const byParent = all.filter((a) => a.parent_appointment_id === parent.id);
  if (byParent.length > 0) {
    return byParent.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  const day = toYmd(parent.start);
  return all
    .filter(
      (a) =>
        a.id !== parent.id &&
        !a.parent_appointment_id &&
        a.appointment_kind === 'standard' &&
        a.petId === parent.petId &&
        a.guardianId === parent.guardianId &&
        toYmd(a.start) === day &&
        a.start.getTime() >= parent.end.getTime() &&
        (parent.series_id ? a.series_id === parent.series_id : true),
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function mapExtraBlocksToInitial(
  children: AgendaAppointment[],
): NonNullable<NewAppointmentInitial['extra_blocks']> {
  return children.map((child) => ({
    appointment_id: child.id,
    starts_at: child.start.toISOString(),
    ends_at: child.end.toISOString(),
    hub_staff_member_id: child.professionalId,
    resource_label: child.resourceLabel !== '—' ? child.resourceLabel : null,
    title: child.title ?? null,
    notes: child.notes ?? null,
    services: (child.services ?? []).map((s) => ({
      hub_service_type_id: s.hub_service_type_id,
      name: s.name,
      duration_minutes: s.durationMin,
    })),
  }));
}
