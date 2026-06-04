import { apiRequest } from '@petimi/web-core';

const basePath = '/api/hub/staff';

export type HubProfessionalKind =
  | 'vet'
  | 'groomer'
  | 'bather'
  | 'reception'
  | 'driver'
  | 'caretaker'
  | 'assistant'
  | 'other';

export type HubStaffAccessRole = 'CADMIN' | 'CMANAGER' | 'CASSISTANT' | 'CVET_INTERNAL' | 'CGROOMER' | 'CFINANCE';

export interface HubStaffServiceTypeRef {
  id: string;
  name: string;
  code: string;
}

export interface HubStaffMember {
  id: string;
  clinic_id: string;
  full_name: string;
  display_name: string | null;
  photo_url: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  email: string | null;
  birth_date?: string | null;
  job_title: string;
  professional_kind: HubProfessionalKind;
  specialties: string | null;
  crmv: string | null;
  crmv_uf: string | null;
  internal_notes: string | null;
  active: boolean;
  has_hub_access: boolean;
  hub_access_email: string | null;
  hub_access_role: HubStaffAccessRole | null;
  accepts_appointments: boolean;
  available_days: unknown;
  work_hours: unknown;
  break_minutes: number | null;
  default_unit_id: string | null;
  agenda_color: string | null;
  clinic_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  service_types?: HubStaffServiceTypeRef[];
  services_summary?: string | null;
  default_unit_name?: string | null;
  /** Placeholder até existir API de agenda no Hub. */
  next_appointments_count?: number;
}

export type HubStaffListMeta = {
  next_appointments_placeholder?: boolean;
  inactive_hidden_from_new_scheduling?: boolean;
};

function listUrl(clinicId: string, opts?: { search?: string; active_only?: boolean }): string {
  const q = new URLSearchParams({ clinic_id: clinicId });
  if (opts?.search) q.set('search', opts.search);
  if (opts?.active_only) q.set('active_only', 'true');
  return `${basePath}?${q.toString()}`;
}

export const hubStaffApi = {
  async list(
    clinicId: string,
    opts?: { search?: string; active_only?: boolean }
  ): Promise<{ staff: HubStaffMember[]; meta?: HubStaffListMeta }> {
    return apiRequest(listUrl(clinicId, opts)) as Promise<{ staff: HubStaffMember[]; meta?: HubStaffListMeta }>;
  },

  async get(id: string, clinicId: string): Promise<{ staff: HubStaffMember }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${basePath}/${encodeURIComponent(id)}?${q.toString()}`) as Promise<{ staff: HubStaffMember }>;
  },

  async create(payload: Record<string, unknown>): Promise<{ staff: HubStaffMember }> {
    return apiRequest(basePath, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ staff: HubStaffMember }>;
  },

  async patch(id: string, payload: Record<string, unknown>): Promise<{ staff: HubStaffMember }> {
    return apiRequest(`${basePath}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ staff: HubStaffMember }>;
  },

  async sendInvite(id: string, clinicId: string): Promise<{ invitation: Record<string, unknown> }> {
    return apiRequest(`${basePath}/${encodeURIComponent(id)}/invite`, {
      method: 'POST',
      body: JSON.stringify({ clinic_id: clinicId }),
    }) as Promise<{ invitation: Record<string, unknown> }>;
  },

  /** Upload de foto (PNG/JPG/WEBP, máx. 5 MB). Devolve URL pública para `photo_url`. */
  async uploadPhoto(clinicId: string, file: File): Promise<{ url: string; path?: string }> {
    const fd = new FormData();
    fd.append('photo', file);
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${basePath}/photo?${q.toString()}`, {
      method: 'POST',
      body: fd,
    }) as Promise<{ url: string; path?: string }>;
  },
};
