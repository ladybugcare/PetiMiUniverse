import { apiJson } from './api';
import { E2E_GUARDIAN, E2E_PET } from './users';

type ServiceType = {
  id: string;
  name: string;
  service_group: string;
  allow_scheduling?: boolean;
  deleted_at?: string | null;
  active?: boolean;
};

type Guardian = {
  id: string;
  full_name: string;
  tax_id?: string | null;
};

type Pet = {
  id: string;
  name: string;
};

type DayBoardItem = {
  appointment_id: string;
  pet?: { name?: string | null } | null;
};

type AppointmentRow = {
  id: string;
  title?: string | null;
  notes?: string | null;
  parent_appointment_id?: string | null;
  series_id?: string | null;
  starts_at?: string;
  ends_at?: string;
};

export const E2E_AGENDA_TITLES = {
  multi: '[E2E] Banho + Tosa',
  series: '[E2E] Série semanal',
  seriesLt: '[E2E] Série L&T',
  extraBlock: '[E2E] Com bloco extra',
  caixaClinic: '[E2E] Consulta caixa',
} as const;

export function todayYmdSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** ISO-8601 weekday: 1 = segunda … 7 = domingo, no calendário de São Paulo. */
export function isoWeekdaySaoPaulo(ymd: string): number {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  const utcDay = d.getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

export function addDaysYmdSaoPaulo(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  d.setTime(d.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function saoPauloIso(ymd: string, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${ymd}T${hh}:${mm}:00-03:00`;
}

async function ensureServiceType(
  token: string,
  clinicId: string,
  existing: ServiceType[],
  spec: { name: string; service_group: string; duration: number },
): Promise<ServiceType> {
  const found = existing.find(
    (t) =>
      t.name === spec.name &&
      t.active !== false &&
      !t.deleted_at &&
      t.allow_scheduling !== false,
  );
  if (found) return found;

  const created = await apiJson<{ service_type: ServiceType }>('/api/hub/service-types', {
    method: 'POST',
    token,
    body: {
      clinic_id: clinicId,
      name: spec.name,
      service_group: spec.service_group,
      cost_amount: 10,
      sale_amount: 40,
      default_duration_minutes: spec.duration,
      allow_scheduling: true,
      pickup_price_scope: spec.service_group === 'leva_traz' ? 'round_trip' : undefined,
    },
  });
  existing.push(created.service_type);
  return created.service_type;
}

export async function ensureServiceCatalog(token: string, clinicId: string) {
  const listed = await apiJson<{ service_types?: ServiceType[] }>(
    `/api/hub/service-types?clinic_id=${encodeURIComponent(clinicId)}`,
    { token },
  );
  const existing = listed.service_types || [];
  const bath = await ensureServiceType(token, clinicId, existing, {
    name: 'Banho E2E',
    service_group: 'banho_tosa',
    duration: 60,
  });
  const tosa = await ensureServiceType(token, clinicId, existing, {
    name: 'Tosa E2E',
    service_group: 'banho_tosa',
    duration: 30,
  });
  const pickup = await ensureServiceType(token, clinicId, existing, {
    name: 'Leva e Traz E2E',
    service_group: 'leva_traz',
    duration: 30,
  });
  const clinic = await ensureServiceType(token, clinicId, existing, {
    name: 'Consulta E2E',
    service_group: 'clinica',
    duration: 30,
  });
  return { bathId: bath.id, tosaId: tosa.id, pickupId: pickup.id, clinicId: clinic.id };
}

export async function ensureGuardianPet(
  token: string,
  clinicId: string,
): Promise<{ guardianId: string; petId: string }> {
  const listed = await apiJson<{ guardians?: Guardian[] }>(
    `/api/hub/guardians?clinic_id=${encodeURIComponent(clinicId)}`,
    { token },
  );
  let guardian = (listed.guardians || []).find(
    (g) => g.full_name === E2E_GUARDIAN.fullName || g.tax_id === E2E_GUARDIAN.taxId,
  );

  if (!guardian) {
    const created = await apiJson<{ guardian: Guardian }>('/api/hub/guardians', {
      method: 'POST',
      token,
      body: {
        clinic_id: clinicId,
        full_name: E2E_GUARDIAN.fullName,
        phone: '11987654321',
        tax_id: E2E_GUARDIAN.taxId,
        client_kind: 'individual',
        email: 'e2e.maria.tutor@example.com',
        street: 'Rua E2E dos Tutores',
        street_number: '200',
        district: 'Vila Teste',
        city: 'São Paulo',
        state: 'SP',
        postal_code: '01310100',
      },
    });
    guardian = created.guardian;
  }

  const pets = await apiJson<{ pets?: Pet[] }>(
    `/api/hub/pets?clinic_id=${encodeURIComponent(clinicId)}`,
    { token },
  );
  let pet = (pets.pets || []).find((p) => p.name === E2E_PET.name);

  if (!pet) {
    const created = await apiJson<{ pet: Pet }>('/api/hub/pets', {
      method: 'POST',
      token,
      body: {
        clinic_id: clinicId,
        name: E2E_PET.name,
        species: 'Cão',
        breed: 'SRD',
        size_tier: 'grande',
        sex: 'M',
        birth_date: '2022-01-15',
        primary_guardian_id: guardian.id,
      },
    });
    pet = created.pet;
  }

  return { guardianId: guardian.id, petId: pet.id };
}

export async function listAppointmentsInRange(
  token: string,
  clinicId: string,
  fromYmd: string,
  toYmdExclusive: string,
): Promise<AppointmentRow[]> {
  const listed = await apiJson<{ appointments?: AppointmentRow[] }>(
    `/api/hub/appointments?clinic_id=${encodeURIComponent(clinicId)}` +
      `&from=${encodeURIComponent(saoPauloIso(fromYmd, 0, 0))}` +
      `&to=${encodeURIComponent(saoPauloIso(toYmdExclusive, 0, 0))}`,
    { token },
  );
  return listed.appointments || [];
}

function findPrincipalWithTitle(rows: AppointmentRow[], title: string): AppointmentRow | undefined {
  return rows.find((a) => a.title === title && !a.parent_appointment_id);
}

function durationMinutes(row: AppointmentRow): number {
  if (!row.starts_at || !row.ends_at) return 0;
  return (new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60_000;
}

async function retireAppointment(token: string, clinicId: string, row: AppointmentRow) {
  const qs = row.series_id ? '?scope=all' : '';
  await apiJson(`/api/hub/appointments/${row.id}${qs}`, {
    method: 'PATCH',
    token,
    body: { clinic_id: clinicId, deleted: true },
  });
}

async function createAppointment(
  token: string,
  body: Record<string, unknown>,
) {
  try {
    await apiJson('/api/hub/appointments', { method: 'POST', token, body });
  } catch (e) {
    const title = typeof body.title === 'string' ? body.title : '(sem título)';
    throw new Error(`Falha ao criar agendamento ${title}: ${(e as Error).message}`);
  }
}

export async function ensureTodayPickupAppointment(
  token: string,
  clinicId: string,
  unitId: string,
  guardianId: string,
  petId: string,
  schedulingServiceId: string,
  pickupServiceId: string,
) {
  const ymd = todayYmdSaoPaulo();
  const board = await apiJson<{ items?: DayBoardItem[] }>(
    `/api/hub/pickup/day-board?clinic_id=${encodeURIComponent(clinicId)}&date=${ymd}`,
    { token },
  );
  const already = (board.items || []).some((i) => i.pet?.name === E2E_PET.name);
  if (already) return;

  await createAppointment(token, {
    clinic_id: clinicId,
    unit_id: unitId,
    hub_service_type_id: schedulingServiceId,
    pet_id: petId,
    guardian_id: guardianId,
    starts_at: saoPauloIso(ymd, 14, 0),
    ends_at: saoPauloIso(ymd, 15, 0),
    status: 'confirmed',
    notes: '[e2e] agendamento com leva e traz',
    with_pickup_route_before: {
      starts_at: saoPauloIso(ymd, 13, 0),
      ends_at: saoPauloIso(ymd, 13, 30),
    },
    with_pickup_route_after: {
      starts_at: saoPauloIso(ymd, 15, 0),
      ends_at: saoPauloIso(ymd, 15, 30),
    },
    pickup_route_pricing: {
      hub_service_type_id: pickupServiceId,
      pricing_variant: {},
    },
  });
}

type AgendaCatalog = { bathId: string; tosaId: string; pickupId: string; clinicId?: string };

export async function ensureAgendaScenarios(
  token: string,
  clinicId: string,
  unitId: string,
  guardianId: string,
  petId: string,
  catalog: AgendaCatalog,
) {
  const ymd = todayYmdSaoPaulo();
  const weekday = isoWeekdaySaoPaulo(ymd);
  const dayRows = await listAppointmentsInRange(token, clinicId, ymd, addDaysYmdSaoPaulo(ymd, 1));

  const weekly = {
    kind: 'weekly' as const,
    interval_value: 1,
    days_of_week: [weekday],
    occurrences: 4,
  };

  const needCreate = async (title: string): Promise<boolean> => {
    const existing = findPrincipalWithTitle(dayRows, title);
    if (!existing) return true;
    if (durationMinutes(existing) >= 50) return false;
    await retireAppointment(token, clinicId, existing);
    return true;
  };

  if (await needCreate(E2E_AGENDA_TITLES.multi)) {
    await createAppointment(token, {
      clinic_id: clinicId,
      unit_id: unitId,
      hub_service_type_id: catalog.bathId,
      pet_id: petId,
      guardian_id: guardianId,
      starts_at: saoPauloIso(ymd, 10, 0),
      ends_at: saoPauloIso(ymd, 11, 0),
      status: 'confirmed',
      title: E2E_AGENDA_TITLES.multi,
      notes: '[e2e] multi',
      services: [
        { hub_service_type_id: catalog.bathId, duration_minutes: 60 },
        { hub_service_type_id: catalog.tosaId, duration_minutes: 30 },
      ],
    });
  }

  if (await needCreate(E2E_AGENDA_TITLES.series)) {
    await createAppointment(token, {
      clinic_id: clinicId,
      unit_id: unitId,
      hub_service_type_id: catalog.bathId,
      pet_id: petId,
      guardian_id: guardianId,
      starts_at: saoPauloIso(ymd, 16, 0),
      ends_at: saoPauloIso(ymd, 17, 0),
      status: 'confirmed',
      title: E2E_AGENDA_TITLES.series,
      notes: '[e2e] série semanal',
      services: [{ hub_service_type_id: catalog.bathId, duration_minutes: 60 }],
      recurrence: weekly,
    });
  }

  if (await needCreate(E2E_AGENDA_TITLES.seriesLt)) {
    await createAppointment(token, {
      clinic_id: clinicId,
      unit_id: unitId,
      hub_service_type_id: catalog.bathId,
      pet_id: petId,
      guardian_id: guardianId,
      starts_at: saoPauloIso(ymd, 11, 30),
      ends_at: saoPauloIso(ymd, 12, 30),
      status: 'confirmed',
      title: E2E_AGENDA_TITLES.seriesLt,
      notes: '[e2e] série L&T',
      services: [{ hub_service_type_id: catalog.bathId, duration_minutes: 60 }],
      recurrence: weekly,
      with_pickup_route_before: {
        starts_at: saoPauloIso(ymd, 11, 0),
        ends_at: saoPauloIso(ymd, 11, 30),
      },
      with_pickup_route_after: {
        starts_at: saoPauloIso(ymd, 12, 30),
        ends_at: saoPauloIso(ymd, 13, 0),
      },
      pickup_route_pricing: {
        hub_service_type_id: catalog.pickupId,
        pricing_variant: {},
      },
    });
  }

  if (await needCreate(E2E_AGENDA_TITLES.extraBlock)) {
    await createAppointment(token, {
      clinic_id: clinicId,
      unit_id: unitId,
      hub_service_type_id: catalog.bathId,
      pet_id: petId,
      guardian_id: guardianId,
      starts_at: saoPauloIso(ymd, 9, 0),
      ends_at: saoPauloIso(ymd, 10, 0),
      status: 'confirmed',
      title: E2E_AGENDA_TITLES.extraBlock,
      notes: '[e2e] bloco extra',
      services: [{ hub_service_type_id: catalog.bathId, duration_minutes: 60 }],
      extra_blocks: [
        {
          starts_at: saoPauloIso(ymd, 17, 0),
          ends_at: saoPauloIso(ymd, 17, 30),
          services: [{ hub_service_type_id: catalog.tosaId, duration_minutes: 30 }],
        },
      ],
    });
  }
}

/** Agendamento clínico do dia para o day board do Caixa (segunda origem além do banho). */
export async function ensureCaixaClinicAppointment(
  token: string,
  clinicId: string,
  unitId: string,
  guardianId: string,
  petId: string,
  clinicServiceId: string,
) {
  const ymd = todayYmdSaoPaulo();
  const dayRows = await listAppointmentsInRange(token, clinicId, ymd, addDaysYmdSaoPaulo(ymd, 1));
  const existing = findPrincipalWithTitle(dayRows, E2E_AGENDA_TITLES.caixaClinic);
  if (existing) return;

  await createAppointment(token, {
    clinic_id: clinicId,
    unit_id: unitId,
    hub_service_type_id: clinicServiceId,
    pet_id: petId,
    guardian_id: guardianId,
    starts_at: saoPauloIso(ymd, 12, 0),
    ends_at: saoPauloIso(ymd, 12, 30),
    status: 'confirmed',
    title: E2E_AGENDA_TITLES.caixaClinic,
    notes: '[e2e] consulta para day board do caixa',
    services: [{ hub_service_type_id: clinicServiceId, duration_minutes: 30 }],
  });
}
