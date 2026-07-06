import type { HubStaffAccessRole, HubStaffMember } from '../../api/hubStaffApi';
import { professionalKindFromJobTitle } from '../../constants/hubJobFunctions';
import { parseStaffSpecialties, staffSpecialtiesForApi } from '../../utils/staffSpecialties';
import { formatBrPhoneFromApi } from '../../utils/formatBrPhone';

export const HUB_ACCESS_ROLE_OPTIONS: { value: HubStaffAccessRole; label: string }[] = [
  { value: 'CADMIN', label: 'Administrador' },
  { value: 'CMANAGER', label: 'Gerente / Financeiro' },
  { value: 'CASSISTANT', label: 'Recepção' },
  { value: 'CVET_INTERNAL', label: 'Veterinário (perfil interno)' },
  { value: 'CGROOMER', label: 'Banho e Tosa' },
  { value: 'CFINANCE', label: 'Financeiro' },
];

export const WEEKDAY_OPTS: { bit: number; label: string }[] = [
  { bit: 1, label: 'Seg' },
  { bit: 2, label: 'Ter' },
  { bit: 3, label: 'Qua' },
  { bit: 4, label: 'Qui' },
  { bit: 5, label: 'Sex' },
  { bit: 6, label: 'Sáb' },
  { bit: 0, label: 'Dom' },
];

export type HubStaffFormState = {
  full_name: string;
  display_name: string;
  photo_url: string;
  phone: string;
  whatsapp_phone: string;
  email: string;
  birth_date: string;
  job_title: string;
  specialties: string[];
  crmv: string;
  crmv_uf: string;
  internal_notes: string;
  active: boolean;
  has_hub_access: boolean;
  hub_access_email: string;
  hub_access_role: HubStaffAccessRole | '';
  accepts_appointments: boolean;
  available_days: number[];
  work_start: string;
  work_end: string;
  break_minutes: string;
  default_unit_id: string;
  agenda_color: string;
  service_type_ids: string[];
};

export const emptyStaffForm = (): HubStaffFormState => ({
  full_name: '',
  display_name: '',
  photo_url: '',
  phone: '',
  whatsapp_phone: '',
  email: '',
  birth_date: '',
  job_title: '',
  specialties: [],
  crmv: '',
  crmv_uf: '',
  internal_notes: '',
  active: true,
  has_hub_access: false,
  hub_access_email: '',
  hub_access_role: '',
  accepts_appointments: false,
  available_days: [],
  work_start: '09:00',
  work_end: '18:00',
  break_minutes: '',
  default_unit_id: '',
  agenda_color: '#3B82F6',
  service_type_ids: [],
});

function parseDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((n) => typeof n === 'number' && n >= 0 && n <= 6) as number[];
}

function parseWorkHours(raw: unknown): { start: string; end: string } {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const s = typeof o.default_start === 'string' ? o.default_start : '09:00';
    const e = typeof o.default_end === 'string' ? o.default_end : '18:00';
    return { start: s, end: e };
  }
  return { start: '09:00', end: '18:00' };
}

function isoDateOnlyFromApi(raw: string | null | undefined): string {
  if (raw == null || raw === '') return '';
  const s = String(raw);
  const d = s.length >= 10 ? s.slice(0, 10) : s;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}

export function staffFormFromRow(m: HubStaffMember, activeServiceTypeIds?: Set<string>): HubStaffFormState {
  const wh = parseWorkHours(m.work_hours);
  const linkedIds = (m.service_types ?? []).map((s: { id: string }) => s.id);
  const service_type_ids =
    activeServiceTypeIds != null && activeServiceTypeIds.size > 0
      ? linkedIds.filter((id: string) => activeServiceTypeIds.has(id))
      : linkedIds;
  return {
    full_name: m.full_name,
    display_name: m.display_name ?? '',
    photo_url: m.photo_url ?? '',
    phone: formatBrPhoneFromApi(m.phone),
    whatsapp_phone: formatBrPhoneFromApi(m.whatsapp_phone),
    email: m.email ?? '',
    birth_date: isoDateOnlyFromApi(m.birth_date),
    job_title: m.job_title,
    specialties: parseStaffSpecialties(m.specialties),
    crmv: m.crmv ?? '',
    crmv_uf: m.crmv_uf ?? '',
    internal_notes: m.internal_notes ?? '',
    active: m.active,
    has_hub_access: m.has_hub_access,
    hub_access_email: m.hub_access_email ?? '',
    hub_access_role: (m.hub_access_role as HubStaffAccessRole) ?? '',
    accepts_appointments: m.accepts_appointments,
    available_days: parseDays(m.available_days),
    work_start: wh.start,
    work_end: wh.end,
    break_minutes: m.break_minutes != null ? String(m.break_minutes) : '',
    default_unit_id: m.default_unit_id ?? '',
    agenda_color: m.agenda_color || '#3B82F6',
    service_type_ids,
  };
}

export function buildStaffPayload(clinicId: string, form: HubStaffFormState, isVetJobTitle: boolean): Record<string, unknown> {
  const breakM = form.break_minutes.trim();
  const breakNum = breakM === '' ? null : Number(breakM);
  const jt = form.job_title.trim();
  return {
    clinic_id: clinicId,
    full_name: form.full_name.trim(),
    display_name: form.display_name.trim() || null,
    photo_url: form.photo_url.trim() || null,
    phone: form.phone.trim() || null,
    whatsapp_phone: form.whatsapp_phone.trim() || null,
    email: form.email.trim() || null,
    birth_date: form.birth_date.trim() || null,
    job_title: jt,
    professional_kind: professionalKindFromJobTitle(form.job_title),
    specialties: staffSpecialtiesForApi(form.specialties),
    crmv: isVetJobTitle ? form.crmv.trim() || null : null,
    crmv_uf: isVetJobTitle ? form.crmv_uf.trim().toUpperCase() || null : null,
    internal_notes: form.internal_notes.trim() || null,
    active: form.active,
    has_hub_access: form.has_hub_access,
    hub_access_email: form.has_hub_access ? form.hub_access_email.trim() || null : null,
    hub_access_role: form.has_hub_access && form.hub_access_role ? form.hub_access_role : null,
    accepts_appointments: form.accepts_appointments,
    available_days: form.available_days.length ? form.available_days : null,
    work_hours: { default_start: form.work_start, default_end: form.work_end },
    break_minutes: breakNum != null && Number.isFinite(breakNum) ? breakNum : null,
    default_unit_id: form.default_unit_id || null,
    agenda_color: form.agenda_color.trim() || null,
    service_type_ids: form.service_type_ids,
  };
}

export function inviteReadyHint(form: HubStaffFormState): string | null {
  if (!form.has_hub_access) return null;
  if (!form.hub_access_email.trim()) return 'Informe o e-mail de acesso para enviar o convite.';
  if (!form.hub_access_role) return 'Selecione o perfil de permissão.';
  if (!form.default_unit_id) return 'Selecione a unidade padrão na seção Agenda.';
  return null;
}
