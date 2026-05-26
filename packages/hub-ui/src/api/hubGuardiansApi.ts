import { apiRequest } from '@petimi/web-core';

const basePath = '/api/hub/guardians';

export type HubClientKind = 'individual' | 'company';
export type HubClientStatus = 'active' | 'inactive';

export interface HubGuardianPet {
  id: string;
  name: string;
  species: string;
  role: 'primary' | 'secondary';
}

export interface HubGuardian {
  id: string;
  clinic_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  client_kind: HubClientKind;
  legal_name: string | null;
  birth_date: string | null;
  sex: 'M' | 'F' | 'U' | null;
  tax_id: string | null;
  id_doc_type: string | null;
  id_doc_number: string | null;
  lead_source: string | null;
  postal_code: string | null;
  state: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
  client_status: HubClientStatus;
  /** Preenchido na listagem e após update */
  pets?: HubGuardianPet[];
}

export interface HubGuardianStats {
  total: number;
  active_operational: number;
  new_this_month: number;
  with_pets: number;
  pct_active: number;
  pct_with_pets: number;
}

export type HubGuardianCreatePayload = {
  clinic_id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  client_kind?: HubClientKind;
  legal_name?: string | null;
  birth_date?: string | null;
  sex?: 'M' | 'F' | 'U' | null;
  tax_id?: string | null;
  id_doc_type?: string | null;
  id_doc_number?: string | null;
  lead_source?: string | null;
  postal_code?: string | null;
  state?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
  street_number?: string | null;
  complement?: string | null;
  client_status?: HubClientStatus;
};

export type HubGuardianUpdatePayload = {
  clinic_id: string;
  full_name?: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  archived?: boolean;
  client_kind?: HubClientKind;
  legal_name?: string | null;
  birth_date?: string | null;
  sex?: 'M' | 'F' | 'U' | null;
  tax_id?: string | null;
  id_doc_type?: string | null;
  id_doc_number?: string | null;
  lead_source?: string | null;
  postal_code?: string | null;
  state?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
  street_number?: string | null;
  complement?: string | null;
  client_status?: HubClientStatus;
};

function listUrl(
  clinicId: string,
  bustCache: boolean,
  opts?: { kind?: 'individual' | 'company' | 'all'; status?: 'active' | 'inactive' | 'all'; q?: string }
): string {
  const q = new URLSearchParams({ clinic_id: clinicId });
  if (bustCache) q.set('_', String(Date.now()));
  if (opts?.kind && opts.kind !== 'all') q.set('kind', opts.kind);
  if (opts?.status && opts.status !== 'all') q.set('status', opts.status);
  if (opts?.q?.trim()) q.set('q', opts.q.trim());
  return `${basePath}?${q.toString()}`;
}

function normalizeGuardian(raw: Record<string, unknown>, pets?: HubGuardianPet[]): HubGuardian {
  return {
    id: String(raw.id),
    clinic_id: String(raw.clinic_id),
    full_name: String(raw.full_name ?? ''),
    phone: (raw.phone as string | null) ?? null,
    email: (raw.email as string | null) ?? null,
    notes: (raw.notes as string | null) ?? null,
    created_at: String(raw.created_at ?? ''),
    updated_at: String(raw.updated_at ?? ''),
    deleted_at: (raw.deleted_at as string | null) ?? null,
    client_kind: (raw.client_kind as HubClientKind) || 'individual',
    legal_name: (raw.legal_name as string | null) ?? null,
    birth_date: (raw.birth_date as string | null) ?? null,
    sex: (raw.sex as 'M' | 'F' | 'U' | null) ?? null,
    tax_id: (raw.tax_id as string | null) ?? null,
    id_doc_type: (raw.id_doc_type as string | null) ?? null,
    id_doc_number: (raw.id_doc_number as string | null) ?? null,
    lead_source: (raw.lead_source as string | null) ?? null,
    postal_code: (raw.postal_code as string | null) ?? null,
    state: (raw.state as string | null) ?? null,
    city: (raw.city as string | null) ?? null,
    district: (raw.district as string | null) ?? null,
    street: (raw.street as string | null) ?? null,
    street_number: (raw.street_number as string | null) ?? null,
    complement: (raw.complement as string | null) ?? null,
    client_status: (raw.client_status as HubClientStatus) || 'active',
    pets: pets ?? (raw.pets as HubGuardianPet[] | undefined),
  };
}

export const hubGuardiansApi = {
  async list(
    clinicId: string,
    bustCache = false,
    opts?: { kind?: 'individual' | 'company' | 'all'; status?: 'active' | 'inactive' | 'all'; q?: string }
  ): Promise<{ guardians: HubGuardian[] }> {
    const res = (await apiRequest(listUrl(clinicId, bustCache, opts))) as {
      guardians: Record<string, unknown>[];
    };
    const guardians = (res.guardians || []).map((g) => {
      const pets = (g.pets as HubGuardianPet[] | undefined) ?? [];
      const { pets: _, ...rest } = g;
      return normalizeGuardian(rest, pets);
    });
    return { guardians };
  },

  async stats(clinicId: string): Promise<{ stats: HubGuardianStats }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${basePath}/stats?${q.toString()}`) as Promise<{ stats: HubGuardianStats }>;
  },

  async getById(
    id: string,
    clinicId: string
  ): Promise<{ guardian: HubGuardian; pets: HubGuardianPet[] }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    const res = (await apiRequest(`${basePath}/${id}?${q.toString()}`)) as {
      guardian: Record<string, unknown>;
      pets: HubGuardianPet[];
    };
    return {
      guardian: normalizeGuardian(res.guardian, res.pets ?? []),
      pets: res.pets ?? [],
    };
  },

  async create(payload: HubGuardianCreatePayload): Promise<{ guardian: HubGuardian; pets: HubGuardianPet[] }> {
    const res = (await apiRequest(basePath, {
      method: 'POST',
      body: JSON.stringify(payload),
    })) as { guardian: Record<string, unknown>; pets?: HubGuardianPet[] };
    return {
      guardian: normalizeGuardian(res.guardian, res.pets ?? []),
      pets: res.pets ?? [],
    };
  },

  async update(
    id: string,
    payload: HubGuardianUpdatePayload
  ): Promise<{ guardian: HubGuardian; pets: HubGuardianPet[] }> {
    const res = (await apiRequest(`${basePath}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })) as { guardian: Record<string, unknown>; pets?: HubGuardianPet[] };
    return {
      guardian: normalizeGuardian(res.guardian, res.pets ?? []),
      pets: res.pets ?? [],
    };
  },
};
