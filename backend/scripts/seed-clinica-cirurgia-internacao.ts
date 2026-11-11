/**
 * Seed: cenários de Clínica — Cirurgia e Internação (dia de hoje).
 *
 * Cirurgia:
 * - 1 agendada (hoje à tarde)
 * - 1 em andamento
 * - 1 concluída (manhã)
 *
 * Internação:
 * - 1 ativa em leito
 * - 1 com alta (discharged)
 * - 1 transferida (sem leito ainda — para testar alocação)
 *
 * Também garante tipos de serviço (cirurgia / diária de internação) e 2 leitos.
 * Profissional padrão: Diana Paixão (override com SEED_VET_NAME).
 *
 * A cada execução, soft-deleta o que o seed criou antes e remonta o cenário.
 *
 * Uso (na pasta backend):
 *   npm run seed:clinica-cirurgia-internacao
 *
 * Opcional:
 *   SEED_CLINIC_ID=…  SEED_UNIT_ID=…
 */
import { supabaseAdmin } from '../src/config/supabase';

const clinicId = process.env.SEED_CLINIC_ID || '0429cf37-6bcd-4179-82c3-e97a881dd1ac';
const unitId = process.env.SEED_UNIT_ID || 'ecac77a0-7bb2-4571-9f71-70faafd482f3';

const MARKER = 'seed-clinica-cirurgia-internacao';
const PREFIX = '[Demo Clínica]';

type PetSpec = { name: string; breed: string; size_tier: string; coat_type: string; sex: 'M' | 'F' };

type SurgeryScenario = {
  kind: 'surgery';
  label: string;
  pet: PetSpec;
  title: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  /** Minutos relativos a agora no horário agendado. */
  scheduledInMin: number;
  anesthetic_risk?: 'I' | 'II' | 'III' | 'E';
  note?: string;
};

type HospitalizationScenario = {
  kind: 'hospitalization';
  label: string;
  pet: PetSpec;
  status: 'active' | 'discharged';
  /** Dias relativos a hoje (SP) para admissão. */
  admittedDayOffset: number;
  admittedHour: number;
  reason: string;
  assignBed?: boolean;
  bedCode?: string;
  note?: string;
};

type Scenario = SurgeryScenario | HospitalizationScenario;

const SCENARIOS: Scenario[] = [
  {
    kind: 'surgery',
    label: 'Cirurgia agendada',
    pet: { name: `${PREFIX} Amora`, breed: 'Poodle', size_tier: 'pequeno', coat_type: 'longo', sex: 'F' },
    title: 'Ovariohisterectomia',
    status: 'scheduled',
    scheduledInMin: 180,
    anesthetic_risk: 'II',
    note: 'Jejum desde 22h.',
  },
  {
    kind: 'surgery',
    label: 'Cirurgia em andamento',
    pet: { name: `${PREFIX} Spike`, breed: 'Bulldog Francês', size_tier: 'medio', coat_type: 'curto', sex: 'M' },
    title: 'Remoção de nódulo cutâneo',
    status: 'in_progress',
    scheduledInMin: -40,
    anesthetic_risk: 'II',
    note: 'Intra-op em curso.',
  },
  {
    kind: 'surgery',
    label: 'Cirurgia concluída',
    pet: { name: `${PREFIX} Frete`, breed: 'Golden Retriever', size_tier: 'grande', coat_type: 'medio', sex: 'M' },
    title: 'Orquiectomia',
    status: 'completed',
    scheduledInMin: -240,
    anesthetic_risk: 'I',
    note: 'Alta cirúrgica liberada.',
  },
  {
    kind: 'hospitalization',
    label: 'Internação ativa (com leito)',
    pet: { name: `${PREFIX} Melancia`, breed: 'SRD', size_tier: 'medio', coat_type: 'curto', sex: 'F' },
    status: 'active',
    admittedDayOffset: -1,
    admittedHour: 18,
    reason: 'Gastroenterite — fluidoterapia',
    assignBed: true,
    bedCode: 'L1',
    note: 'Monitorar vômitos e diurese.',
  },
  {
    kind: 'hospitalization',
    label: 'Internação aguardando leito',
    pet: { name: `${PREFIX} Cacau`, breed: 'Labrador', size_tier: 'grande', coat_type: 'curto', sex: 'M' },
    status: 'active',
    admittedDayOffset: 0,
    admittedHour: 9,
    reason: 'Pós-operatório — observação',
    assignBed: false,
    note: 'Alocar leito no painel.',
  },
  {
    kind: 'hospitalization',
    label: 'Internação com alta',
    pet: { name: `${PREFIX} Jade`, breed: 'Shih Tzu', size_tier: 'pequeno', coat_type: 'longo', sex: 'F' },
    status: 'discharged',
    admittedDayOffset: -3,
    admittedHour: 10,
    reason: 'Pneumonia — tratamento concluído',
    assignBed: true,
    bedCode: 'L2',
    note: 'Alta liberada hoje de manhã.',
  },
];

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: sem retorno`);
  return res.data;
}

function minutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString();
}

/** YYYY-MM-DD em America/Sao_Paulo. */
function ymdSaoPaulo(dayOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** ISO com offset fixo -03:00 (horário de Brasília). */
function slotBr(dayOffset: number, hour: number, minute = 0): string {
  const ymd = ymdSaoPaulo(dayOffset);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${ymd}T${hh}:${mm}:00-03:00`;
}

async function cleanupPrevious() {
  const now = new Date().toISOString();

  const { data: oldAppts } = await supabaseAdmin
    .from('hub_appointments')
    .select('id')
    .eq('clinic_id', clinicId)
    .like('notes', `%${MARKER}%`)
    .is('deleted_at', null);
  const apptIds = (oldAppts ?? []).map((a: { id: string }) => a.id);

  const { data: oldSurgeries } = await supabaseAdmin
    .from('hub_surgeries')
    .select('id, hub_encounter_id, hub_case_id, hub_appointment_id')
    .eq('clinic_id', clinicId)
    .like('team_notes', `%${MARKER}%`)
    .is('deleted_at', null);

  const { data: oldHosp } = await supabaseAdmin
    .from('hub_hospitalizations')
    .select('id, hub_encounter_id, hub_case_id, hub_appointment_id, hub_hospital_bed_id')
    .eq('clinic_id', clinicId)
    .like('admission_notes', `%${MARKER}%`)
    .is('deleted_at', null);

  const surgeryIds = (oldSurgeries ?? []).map((s: { id: string }) => s.id);
  const hospIds = (oldHosp ?? []).map((h: { id: string }) => h.id);
  const encounterIds = Array.from(
    new Set(
      [...(oldSurgeries ?? []), ...(oldHosp ?? [])]
        .map((r: { hub_encounter_id?: string | null }) => r.hub_encounter_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const caseIds = Array.from(
    new Set(
      [...(oldSurgeries ?? []), ...(oldHosp ?? [])]
        .map((r: { hub_case_id?: string | null }) => r.hub_case_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const linkedApptIds = Array.from(
    new Set(
      [
        ...apptIds,
        ...(oldSurgeries ?? []).map((s: { hub_appointment_id?: string | null }) => s.hub_appointment_id),
        ...(oldHosp ?? []).map((h: { hub_appointment_id?: string | null }) => h.hub_appointment_id),
      ].filter((id): id is string => Boolean(id)),
    ),
  );
  const bedIds = Array.from(
    new Set(
      (oldHosp ?? [])
        .map((h: { hub_hospital_bed_id?: string | null }) => h.hub_hospital_bed_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (surgeryIds.length > 0) {
    await supabaseAdmin.from('hub_surgery_services').update({ deleted_at: now }).in('surgery_id', surgeryIds);
    await supabaseAdmin.from('hub_surgeries').update({ deleted_at: now }).in('id', surgeryIds);
  }
  if (hospIds.length > 0) {
    await supabaseAdmin.from('hub_hospitalization_daily_notes').delete().in('hospitalization_id', hospIds);
    await supabaseAdmin.from('hub_hospitalizations').update({ deleted_at: now }).in('id', hospIds);
  }
  if (encounterIds.length > 0) {
    await supabaseAdmin.from('hub_encounters').update({ deleted_at: now }).in('id', encounterIds);
  }
  if (caseIds.length > 0) {
    await supabaseAdmin.from('hub_clinical_cases').update({ deleted_at: now }).in('id', caseIds);
  }
  if (linkedApptIds.length > 0) {
    await supabaseAdmin.from('hub_appointments').update({ deleted_at: now }).in('id', linkedApptIds);
  }
  if (bedIds.length > 0) {
    await supabaseAdmin.from('hub_hospital_beds').update({ status: 'available' }).in('id', bedIds);
  }

  console.log(
    `Limpeza: ${surgeryIds.length} cirurgia(s), ${hospIds.length} internação(ões), ${linkedApptIds.length} agendamento(s).`,
  );
}

async function ensureServiceType(
  group: 'cirurgia' | 'internacao',
  preferredCodes: string[],
  createSpec: { code: string; name: string; sale_amount: number; agenda_color: string },
): Promise<{ id: string; name: string }> {
  const rows = must(
    await supabaseAdmin
      .from('hub_service_types')
      .select('id, name, code')
      .eq('clinic_id', clinicId)
      .eq('service_group', group)
      .eq('is_addon', false)
      .is('deleted_at', null),
    `tipos ${group}`,
  ) as { id: string; name: string; code: string }[];

  for (const code of preferredCodes) {
    const hit = rows.find((r) => r.code === code);
    if (hit) return hit;
  }
  if (rows[0]) return rows[0];

  const created = must(
    await supabaseAdmin
      .from('hub_service_types')
      .insert({
        clinic_id: clinicId,
        code: createSpec.code,
        name: createSpec.name,
        service_group: group,
        sale_amount: createSpec.sale_amount,
        cost_amount: Math.round(createSpec.sale_amount * 0.35),
        allow_scheduling: true,
        is_addon: false,
        agenda_color: createSpec.agenda_color,
        internal_notes: MARKER,
      })
      .select('id, name')
      .single(),
    `criar tipo ${group}`,
  ) as { id: string; name: string };
  console.log(`Tipo de serviço criado (${group}):`, created.name);
  return created;
}

async function ensureVet(): Promise<{ id: string; full_name: string }> {
  const preferredName = process.env.SEED_VET_NAME || 'Diana Paixão';
  const { data: preferred } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id, full_name')
    .eq('clinic_id', clinicId)
    .ilike('full_name', preferredName)
    .eq('active', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (preferred) {
    console.log('Veterinária:', (preferred as { full_name: string }).full_name);
    return preferred as { id: string; full_name: string };
  }

  const fallbackName = `${PREFIX} Dra. Helena Vet`;
  const { data: existing } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id, full_name')
    .eq('clinic_id', clinicId)
    .eq('full_name', fallbackName)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return existing as { id: string; full_name: string };

  const created = must(
    await supabaseAdmin
      .from('hub_staff_members')
      .insert({
        clinic_id: clinicId,
        full_name: fallbackName,
        job_title: 'Médica Veterinária',
        professional_kind: 'vet',
        active: true,
        accepts_appointments: true,
        default_unit_id: unitId,
        operational_areas: ['clinica', 'cirurgia', 'internacao'],
        agenda_color: '#2e7d32',
        internal_notes: MARKER,
      })
      .select('id, full_name')
      .single(),
    'veterinária',
  ) as { id: string; full_name: string };
  console.log(`Veterinária criada (fallback; ${preferredName} não encontrada):`, created.full_name);
  return created;
}

async function ensureGuardian(): Promise<string> {
  const name = `${PREFIX} Paula Mendes`;
  const { data: existing } = await supabaseAdmin
    .from('hub_guardians')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('full_name', name)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const created = must(
    await supabaseAdmin
      .from('hub_guardians')
      .insert({
        clinic_id: clinicId,
        full_name: name,
        phone: '11990001122',
        email: 'paula.clinica.demo@example.com',
        notes: MARKER,
        client_status: 'active',
      })
      .select('id')
      .single(),
    'tutora',
  ) as { id: string };
  console.log('Tutora criada:', name);
  return created.id;
}

async function ensurePet(spec: PetSpec, guardianId: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('hub_pets')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('name', spec.name)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const pet = must(
    await supabaseAdmin
      .from('hub_pets')
      .insert({ clinic_id: clinicId, species: 'Cão', notes: MARKER, ...spec })
      .select('id')
      .single(),
    `pet ${spec.name}`,
  ) as { id: string };

  must(
    await supabaseAdmin
      .from('hub_pet_guardians')
      .insert({ pet_id: pet.id, guardian_id: guardianId, role: 'primary' })
      .select('id')
      .single(),
    `vínculo ${spec.name}`,
  );
  return pet.id;
}

async function ensureBed(code: string, label: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('hub_hospital_beds')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('code', code)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const created = must(
    await supabaseAdmin
      .from('hub_hospital_beds')
      .insert({
        clinic_id: clinicId,
        unit_id: unitId,
        code,
        label,
        status: 'available',
      })
      .select('id')
      .single(),
    `leito ${code}`,
  ) as { id: string };
  console.log(`Leito criado: ${code} (${label})`);
  return created.id;
}

async function createCaseAndEncounter(args: {
  petId: string;
  guardianId: string;
  staffId: string;
  serviceTypeId: string | null;
  title: string;
  complaint: string;
  appointmentId?: string | null;
}): Promise<{ caseId: string; encounterId: string }> {
  const clinicalCase = must(
    await supabaseAdmin
      .from('hub_clinical_cases')
      .insert({
        clinic_id: clinicId,
        unit_id: unitId,
        pet_id: args.petId,
        guardian_id_snapshot: args.guardianId,
        primary_veterinarian_id: args.staffId,
        title: args.title,
        status: 'active',
        opened_at: new Date().toISOString(),
      })
      .select('id')
      .single(),
    `caso ${args.title}`,
  ) as { id: string };

  const encounter = must(
    await supabaseAdmin
      .from('hub_encounters')
      .insert({
        clinic_id: clinicId,
        unit_id: unitId,
        pet_id: args.petId,
        guardian_id: args.guardianId,
        hub_case_id: clinicalCase.id,
        hub_appointment_id: args.appointmentId ?? null,
        hub_staff_member_id: args.staffId,
        hub_service_type_id: args.serviceTypeId,
        encounter_type: 'procedure',
        status: 'in_progress',
        chief_complaint: args.complaint,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single(),
    `atendimento ${args.title}`,
  ) as { id: string };

  return { caseId: clinicalCase.id, encounterId: encounter.id };
}

async function seedSurgery(
  sc: SurgeryScenario,
  args: {
    guardianId: string;
    staffId: string;
    staffName: string;
    serviceType: { id: string; name: string };
  },
) {
  const petId = await ensurePet(sc.pet, args.guardianId);
  const scheduledAt = minutesFromNow(sc.scheduledInMin);
  const endsAt = minutesFromNow(sc.scheduledInMin + 90);
  const apptStatus =
    sc.status === 'scheduled' ? 'confirmed' : sc.status === 'in_progress' ? 'in_progress' : 'done';

  const appt = must(
    await supabaseAdmin
      .from('hub_appointments')
      .insert({
        clinic_id: clinicId,
        unit_id: unitId,
        hub_service_type_id: args.serviceType.id,
        hub_staff_member_id: args.staffId,
        pet_id: petId,
        guardian_id: args.guardianId,
        starts_at: scheduledAt,
        ends_at: endsAt,
        status: apptStatus,
        appointment_kind: 'standard',
        title: `Cirurgia: ${sc.title}`,
        notes: `${MARKER} — ${sc.label}${sc.note ? ` · ${sc.note}` : ''}`,
      })
      .select('id')
      .single(),
    `agendamento cirurgia ${sc.pet.name}`,
  ) as { id: string };

  const { error: lineErr } = await supabaseAdmin.from('hub_appointment_services').insert({
    appointment_id: appt.id,
    hub_service_type_id: args.serviceType.id,
    duration_minutes: 90,
    order_index: 0,
  });
  if (lineErr) console.log(`Aviso: linha de serviço (${lineErr.message}).`);

  const { caseId, encounterId } = await createCaseAndEncounter({
    petId,
    guardianId: args.guardianId,
    staffId: args.staffId,
    serviceTypeId: args.serviceType.id,
    title: sc.title,
    complaint: `Cirurgia: ${sc.title}`,
    appointmentId: appt.id,
  });

  const startedAt = sc.status !== 'scheduled' ? minutesFromNow(sc.scheduledInMin + 5) : null;
  const completedAt = sc.status === 'completed' ? minutesFromNow(sc.scheduledInMin + 75) : null;

  const surgery = must(
    await supabaseAdmin
      .from('hub_surgeries')
      .insert({
        clinic_id: clinicId,
        unit_id: unitId,
        pet_id: petId,
        guardian_id: args.guardianId,
        hub_case_id: caseId,
        hub_encounter_id: encounterId,
        hub_appointment_id: appt.id,
        hub_staff_member_id: args.staffId,
        title: sc.title,
        status: sc.status,
        scheduled_at: scheduledAt,
        started_at: startedAt,
        completed_at: completedAt,
        discharge_at: completedAt,
        anesthetic_risk: sc.anesthetic_risk ?? null,
        pre_op: { fasting_hours: 8, notes: sc.note ?? null },
        procedure: sc.status === 'scheduled' ? {} : { anesthesia_type: 'inalatória', duration_min: 60 },
        team: [{ role: 'surgeon', name: args.staffName }],
        materials: [{ item: 'Fio Vicryl 2-0', quantity: 1 }],
        post_op: sc.status === 'completed' ? { recovery_notes: 'Estável', restrictions: 'Colar elizabetano 7 dias' } : {},
        team_notes: `${MARKER} — ${sc.label}`,
        post_op_notes: sc.status === 'completed' ? sc.note ?? null : null,
      })
      .select('id')
      .single(),
    `cirurgia ${sc.pet.name}`,
  ) as { id: string };

  const { error: svcErr } = await supabaseAdmin.from('hub_surgery_services').insert({
    clinic_id: clinicId,
    surgery_id: surgery.id,
    hub_service_type_id: args.serviceType.id,
    service_name: args.serviceType.name,
    quantity: 1,
    unit_amount: 850,
    pricing_source: 'catalog',
    price_status: 'confirmed',
    billing_mode: 'charge',
    sort_order: 0,
  });
  if (svcErr) console.log(`Aviso: serviço de cirurgia (${svcErr.message}).`);

  console.log(`  Cirurgia  ${sc.pet.name.padEnd(24)} ${sc.status.padEnd(12)} ${sc.title}`);
}

async function seedHospitalization(
  sc: HospitalizationScenario,
  args: {
    guardianId: string;
    staffId: string;
    serviceType: { id: string; name: string };
    beds: Record<string, string>;
  },
) {
  const petId = await ensurePet(sc.pet, args.guardianId);
  const admittedAt = slotBr(sc.admittedDayOffset, sc.admittedHour, 0);
  const bedId = sc.assignBed && sc.bedCode ? args.beds[sc.bedCode] : null;

  const appt = must(
    await supabaseAdmin
      .from('hub_appointments')
      .insert({
        clinic_id: clinicId,
        unit_id: unitId,
        hub_service_type_id: args.serviceType.id,
        hub_staff_member_id: args.staffId,
        pet_id: petId,
        guardian_id: args.guardianId,
        starts_at: admittedAt,
        ends_at: slotBr(sc.admittedDayOffset, sc.admittedHour + 1, 0),
        status: sc.status === 'active' ? 'in_progress' : 'done',
        appointment_kind: 'clinical_walk_in',
        title: sc.reason,
        notes: `${MARKER} — ${sc.label}${sc.note ? ` · ${sc.note}` : ''}`,
      })
      .select('id')
      .single(),
    `agendamento internação ${sc.pet.name}`,
  ) as { id: string };

  const { caseId, encounterId } = await createCaseAndEncounter({
    petId,
    guardianId: args.guardianId,
    staffId: args.staffId,
    serviceTypeId: args.serviceType.id,
    title: sc.reason,
    complaint: sc.reason,
    appointmentId: appt.id,
  });

  const dischargedAt = sc.status === 'discharged' ? slotBr(0, 9, 30) : null;

  must(
    await supabaseAdmin
      .from('hub_hospitalizations')
      .insert({
        clinic_id: clinicId,
        unit_id: unitId,
        pet_id: petId,
        guardian_id: args.guardianId,
        hub_case_id: caseId,
        hub_encounter_id: encounterId,
        hub_appointment_id: appt.id,
        hub_hospital_bed_id: bedId,
        hub_staff_member_id: args.staffId,
        status: sc.status,
        admitted_at: admittedAt,
        discharged_at: dischargedAt,
        reason: sc.reason,
        admission_notes: `${MARKER} — ${sc.label}${sc.note ? ` · ${sc.note}` : ''}`,
        discharge_notes: sc.status === 'discharged' ? 'Alta clínica liberada.' : null,
        daily_hub_service_type_id: args.serviceType.id,
        daily_unit_amount: 220,
        daily_includes_medication: false,
      })
      .select('id')
      .single(),
    `internação ${sc.pet.name}`,
  );

  if (bedId && sc.status === 'active') {
    await supabaseAdmin.from('hub_hospital_beds').update({ status: 'occupied' }).eq('id', bedId);
  } else if (bedId && sc.status === 'discharged') {
    await supabaseAdmin.from('hub_hospital_beds').update({ status: 'available' }).eq('id', bedId);
  }

  console.log(
    `  Internação ${sc.pet.name.padEnd(24)} ${sc.status.padEnd(12)} ${bedId ? sc.bedCode : 'sem leito'} · ${sc.reason}`,
  );
}

async function main() {
  console.log(`Clínica: ${clinicId}`);
  console.log(`Unidade: ${unitId}`);
  console.log(`Marcador: ${MARKER}`);
  console.log(`Hoje (SP): ${ymdSaoPaulo(0)}`);

  await cleanupPrevious();

  const surgeryType = await ensureServiceType('cirurgia', ['cirurgia', 'cirurgia_showcase'], {
    code: 'cirurgia_seed',
    name: 'Cirurgia',
    sale_amount: 850,
    agenda_color: '#c62828',
  });
  const hospType = await ensureServiceType('internacao', ['internacao', 'diaria_internacao', 'internacao_showcase'], {
    code: 'internacao_seed',
    name: 'Diária de internação',
    sale_amount: 220,
    agenda_color: '#6a1b9a',
  });
  console.log(`Serviços: cirurgia=${surgeryType.name}, internação=${hospType.name}`);

  const staff = await ensureVet();
  const guardianId = await ensureGuardian();
  const beds = {
    L1: await ensureBed(`${PREFIX} L1`, 'Leito demo 1'),
    L2: await ensureBed(`${PREFIX} L2`, 'Leito demo 2'),
  };

  console.log('\nCenários:');
  for (const sc of SCENARIOS) {
    if (sc.kind === 'surgery') {
      await seedSurgery(sc, {
        guardianId,
        staffId: staff.id,
        staffName: staff.full_name,
        serviceType: surgeryType,
      });
    } else {
      await seedHospitalization(sc, { guardianId, staffId: staff.id, serviceType: hospType, beds });
    }
  }

  console.log(`\nPronto. Abra /hub/clinica (Cirurgias / Internações) na unidade de teste.`);
  console.log(`Profissional: ${staff.full_name}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
