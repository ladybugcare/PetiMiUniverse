import { apiRequest } from '@petimi/web-core';

export type ReceptionHandoffKind =
  | 'chegada'
  | 'autorizar_extra'
  | 'encaminhar'
  | 'retirada_balcao'
  | 'embarque';

export type ReceptionHandoffStatus = 'open' | 'done' | 'cancelled';

export type ReceptionResolveAction =
  | 'entreguei'
  | 'embarquei'
  | 'chegou'
  | 'autorizar'
  | 'dispensar'
  | 'recebi';

export type ReceptionContext = {
  label?: string;
  starts_at?: string | null;
  ready_at?: string | null;
  hub_service_type_id?: string | null;
  session_id?: string | null;
  appointment_id?: string | null;
  extra_name?: string | null;
};

export type ReceptionBoardItem = {
  id: string;
  kind: ReceptionHandoffKind;
  source_type: string;
  source_id: string;
  status: ReceptionHandoffStatus;
  context: ReceptionContext;
  opened_at: string;
  resolved_at: string | null;
  resolution: string | null;
  pet: { id: string | null; name: string };
  guardian: { id: string | null; full_name: string; phone: string | null } | null;
};

export type ReceptionCue = {
  key: string;
  label: string;
  detail?: string;
};

export type ReceptionHandoffDetail = Omit<ReceptionBoardItem, 'pet' | 'guardian'> & {
  unit_id: string | null;
  unit_name: string | null;
  pet: {
    id: string | null;
    name: string;
    species: string | null;
    breed: string | null;
    size_tier: string | null;
    birth_date: string | null;
    coat_type: string | null;
    avatar_url: string | null;
    notes: string | null;
  };
  guardian: {
    id: string | null;
    full_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  origin: { key: string; label: string; href: string };
  cues: ReceptionCue[];
  next_step: string | null;
  is_late: boolean;
  /** `null` = usuário sem acesso ao caixa/financeiro; não mostrar aviso. */
  charge_pending: boolean | null;
};

export const hubReceptionApi = {
  board(clinicId: string, unitId: string, dateYmd: string) {
    const q = new URLSearchParams({ clinic_id: clinicId, unit_id: unitId, date: dateYmd });
    return apiRequest(`/api/hub/reception/board?${q}`) as Promise<{ date: string; items: ReceptionBoardItem[] }>;
  },
  detail(id: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`/api/hub/reception/handoffs/${encodeURIComponent(id)}?${q}`) as Promise<ReceptionHandoffDetail>;
  },
  resolve(id: string, clinicId: string, action: ReceptionResolveAction) {
    return apiRequest(`/api/hub/reception/handoffs/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ clinic_id: clinicId, action }),
    }) as Promise<{ ok: true }>;
  },
};
