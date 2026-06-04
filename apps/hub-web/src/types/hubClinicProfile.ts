export type HubClinicProfile = {
  id: string;
  name?: string | null;
  cnpj?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  description?: string | null;
  photo_url?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type HubUnitProfile = {
  id: string;
  clinic_id: string;
  name?: string | null;
  nickname?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  technical_manager?: string | null;
  is_main?: boolean | null;
  status?: string | null;
  created_at?: string | null;
};
