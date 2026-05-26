import type { HubAppointment } from '../../api/hubAgendaApi';
import type { AgendaAppointment, AgendaStatus } from './agendaModel';
import { KNOWN_SERVICE_GROUP_SLUGS, type HubServiceGroupValue } from '../../utils/serviceTypeSlug';

function parseGroup(raw: string | undefined | null): HubServiceGroupValue {
  const g = raw ?? 'outros';
  return KNOWN_SERVICE_GROUP_SLUGS.has(g as HubServiceGroupValue) ? (g as HubServiceGroupValue) : 'outros';
}

export function mapHubAppointmentToAgenda(row: HubAppointment): AgendaAppointment {
  const st = row.service_type;
  const staff = row.staff_member;
  const pet = row.pet;
  const gu = row.guardian;
  const un = row.unit;
  const agendaColor = staff?.agenda_color ?? st?.agenda_color ?? null;

  const serviceNames =
    row.services && row.services.length > 0
      ? row.services.map((s) => s.service_type?.name ?? '').filter(Boolean).join(' + ')
      : (st?.name ?? 'Serviço');

  const serviceName = row.title ?? (serviceNames || 'Serviço');

  return {
    id: row.id,
    serviceName,
    group: parseGroup(st?.service_group),
    agendaColor,
    professionalId: row.hub_staff_member_id,
    professionalName: staff?.full_name ?? 'Não atribuído',
    resourceLabel: row.resource_label?.trim() || '—',
    unitName: un?.name ?? '—',
    petName: pet?.name ?? '—',
    guardianName: gu?.full_name ?? '—',
    start: new Date(row.starts_at),
    end: new Date(row.ends_at),
    status: row.status as AgendaStatus,
    notes: row.notes ?? undefined,
    conflict: false,
    appointment_kind: row.appointment_kind,
    hub_service_type_id: row.hub_service_type_id,
    series_id: row.series_id ?? undefined,
    title: row.title ?? undefined,
    services: (row.services ?? []).map((s) => ({
      id: s.id,
      hub_service_type_id: s.hub_service_type_id,
      name: s.service_type?.name ?? '',
      durationMin: s.duration_minutes,
    })),
  };
}
