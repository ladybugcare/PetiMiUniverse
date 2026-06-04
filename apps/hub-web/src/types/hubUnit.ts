export type HubUnit = {
  id: string;
  clinic_id: string;
  name: string;
  nickname?: string;
  is_main: boolean;
  status?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  created_at?: string | null;
};
