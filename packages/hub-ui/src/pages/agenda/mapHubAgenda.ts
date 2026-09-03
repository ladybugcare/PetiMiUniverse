import type { HubAppointment } from '../../api/hubAgendaApi';
import type { AgendaAppointment, AgendaStatus } from './agendaModel';
import { computeDisplayServiceLabel } from './agendaModel';
import type { NewAppointmentInitial } from './NewAppointmentModal';
import { KNOWN_SERVICE_GROUP_SLUGS, type HubServiceGroupValue } from '../../utils/serviceTypeSlug';

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
  // Cor do card segue o grupo de serviço (Configurações → Grupos), não a cor do profissional na agenda.
  const agendaColor = st?.group_color ?? st?.agenda_color ?? null;

  const serviceNames =
    row.services && row.services.length > 0
      ? row.services.map((s) => s.service_type?.name ?? '').filter(Boolean).join(' + ')
      : (st?.name ?? 'Serviço');

  const serviceName = row.title ?? (serviceNames || 'Serviço');

  const services = (row.services ?? []).map((s) => ({
    id: s.id,
    hub_service_type_id: s.hub_service_type_id,
    name: s.service_type?.name ?? '',
    durationMin: s.duration_minutes,
    saleAmount: s.sale_amount_applied ?? null,
    isAddon: Boolean(s.service_type?.is_addon),
    serviceGroup: parseGroup(s.service_type?.service_group),
  }));

  const primaryGroup = parseGroup(st?.service_group);
  const serviceGroups = (() => {
    const groups: HubServiceGroupValue[] = [];
    const seen = new Set<string>();
    for (const s of services) {
      const g = s.serviceGroup ?? primaryGroup;
      if (seen.has(g)) continue;
      seen.add(g);
      groups.push(g);
    }
    if (groups.length === 0) groups.push(primaryGroup);
    return groups;
  })();

  const petName = pet?.name ?? '—';

  const saleParts = services
    .map((s) => s.saleAmount)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const saleTotal = saleParts.length > 0 ? saleParts.reduce((a, b) => a + b, 0) : null;

  const baseAppt: Omit<AgendaAppointment, 'displayServiceLabel' | 'isRecurring' | 'pickupPackage'> = {
    id: row.id,
    serviceName,
    group: parseGroup(st?.service_group),
    agendaColor,
    professionalId: row.hub_staff_member_id,
    professionalName: staff?.full_name ?? 'Não atribuído',
    resourceLabel: row.resource_label?.trim() || '—',
    unitName: un?.name ?? '—',
    unitId: row.unit_id,
    care_location_kind: row.care_location_kind,
    hub_partner_clinic_id: row.hub_partner_clinic_id ?? null,
    partnerClinic: row.partner_clinic ?? null,
    petName,
    guardianName: gu?.full_name ?? '—',
    petId: row.pet_id,
    guardianId: row.guardian_id,
    start: new Date(row.starts_at),
    end: new Date(row.ends_at),
    status: row.status as AgendaStatus,
    notes: row.notes ?? undefined,
    description: row.description ?? undefined,
    financial_notes: row.financial_notes ?? undefined,
    saleTotal,
    conflict: false,
    appointment_kind: row.appointment_kind,
    hub_service_type_id: row.hub_service_type_id,
    series_id: row.series_id ?? undefined,
    parent_appointment_id: row.parent_appointment_id ?? null,
    title: row.title ?? undefined,
    services,
    serviceGroups,
    hubEncounterId: (row as { hub_encounter_id?: string | null }).hub_encounter_id ?? null,
    hubEncounterStatus: (row as { hub_encounter_status?: string | null }).hub_encounter_status ?? null,
    financial_adjustment_pending:
      (row as { financial_adjustment_pending?: boolean }).financial_adjustment_pending ?? false,
    comanda_id: (row as { comanda_id?: string | null }).comanda_id ?? null,
    pricing_porte_tier: row.pricing_porte_tier ?? null,
    pricing_coat_type: row.pricing_coat_type ?? null,
    visit_group_id: row.visit_group_id ?? null,
  };

  return {
    ...baseAppt,
    saleTotal,
    displayServiceLabel: computeDisplayServiceLabel({ ...baseAppt, petName }),
    isRecurring: Boolean(row.series_id),
    pickupPackage: null,
  };
}

/** Pré-preenche o formulário de edição a partir de um agendamento da agenda. */
export function mapAgendaToAppointmentInitial(appt: AgendaAppointment): NewAppointmentInitial {
  const mainServices = (appt.services ?? []).filter((s) => !s.isAddon);
  const addonServices = (appt.services ?? []).filter((s) => s.isAddon);

  return {
    date: toYmd(appt.start),
    starts_at: appt.start.toISOString(),
    ends_at: appt.end.toISOString(),
    hub_staff_member_id: appt.professionalId,
    resource_label: appt.resourceLabel !== '—' ? appt.resourceLabel : null,
    guardian_id: appt.guardianId ?? null,
    guardian_name: appt.guardianName !== '—' ? appt.guardianName : null,
    pet_id: appt.petId ?? null,
    pet_name: appt.petName !== '—' ? appt.petName : null,
    title: appt.title ?? appt.serviceName ?? null,
    notes: appt.notes ?? null,
    financial_notes: appt.financial_notes ?? null,
    status: appt.status,
    pricing_porte_tier: appt.pricing_porte_tier ?? null,
    pricing_coat_type: appt.pricing_coat_type ?? null,
    services: mainServices.map((s) => ({
      hub_service_type_id: s.hub_service_type_id,
      name: s.name,
      duration_minutes: s.durationMin,
    })),
    addon_services: addonServices.map((s) => ({
      hub_service_type_id: s.hub_service_type_id,
      name: s.name,
      duration_minutes: s.durationMin,
    })),
  };
}
