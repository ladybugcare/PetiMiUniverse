import { apiRequest } from '@petimi/web-core';

const base = '/api/hub/clinical/term-templates';

export const HUB_TERM_CATEGORIES = [
  'castracao',
  'anestesia',
  'internacao',
  'eutanasia',
  'outro',
] as const;

export type HubTermCategory = (typeof HUB_TERM_CATEGORIES)[number];

export const HUB_TERM_CATEGORY_LABELS: Record<HubTermCategory, string> = {
  castracao: 'Castração',
  anestesia: 'Anestesia',
  internacao: 'Internação',
  eutanasia: 'Eutanásia',
  outro: 'Outro',
};

export type HubClinicalTermTemplate = {
  id: string;
  clinic_id: string;
  title: string;
  category: HubTermCategory;
  description?: string | null;
  file_name: string;
  storage_path: string;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  is_active: boolean;
  sort_order: number;
  uploaded_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type PatchHubClinicalTermTemplatePayload = {
  clinic_id: string;
  title?: string;
  category?: HubTermCategory;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
};

export function formatTermFileSize(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const hubClinicalTermTemplatesApi = {
  list(clinicId: string, opts?: { includeInactive?: boolean }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.includeInactive) q.set('include_inactive', 'true');
    return apiRequest(`${base}?${q}`) as Promise<{
      term_templates: HubClinicalTermTemplate[];
      schema_ready?: boolean;
      migration_hint?: string;
    }>;
  },

  upload(params: {
    clinicId: string;
    file: File;
    title: string;
    category: HubTermCategory;
    description?: string | null;
    is_active?: boolean;
    sort_order?: number;
  }) {
    const fd = new FormData();
    fd.append('file', params.file);
    fd.append('clinic_id', params.clinicId);
    fd.append('title', params.title);
    fd.append('category', params.category);
    if (params.description) fd.append('description', params.description);
    if (params.is_active != null) fd.append('is_active', String(params.is_active));
    if (params.sort_order != null) fd.append('sort_order', String(params.sort_order));
    // multipart ainda não foi parseado no requirePermission — clinic_id precisa ir na query.
    const q = new URLSearchParams({ clinic_id: params.clinicId });
    return apiRequest(`${base}/upload?${q}`, { method: 'POST', body: fd }) as Promise<{
      term_template: HubClinicalTermTemplate;
    }>;
  },

  patch(id: string, payload: PatchHubClinicalTermTemplatePayload) {
    return apiRequest(`${base}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ term_template: HubClinicalTermTemplate }>;
  },

  remove(id: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${base}/${encodeURIComponent(id)}?${q}`, {
      method: 'DELETE',
    }) as Promise<{ ok: boolean; id: string }>;
  },
};
