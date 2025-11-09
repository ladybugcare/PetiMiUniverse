// Unit types for multi-unit clinic management

export interface Unit {
  id: string;
  clinic_id: string;
  name: string;
  nickname?: string;
  cnpj?: string;
  address: string;
  city: string;
  state: string;
  phone?: string;
  technical_manager?: string;
  is_main: boolean;
  status: 'active' | 'inactive' | 'pending_review' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export type Role = 'CADMIN' | 'CMANAGER' | 'CASSISTANT' | 'CVET_INTERNAL';

export interface ClinicUser {
  id: string;
  user_id: string;
  clinic_id: string;
  unit_id?: string;
  role: Role;
  status: 'active' | 'inactive' | 'pending';
  invited_by?: string;
  invited_at?: string;
  accepted_at?: string;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
  };
  unit?: Unit;
  clinic?: any;
}

export interface UserInvitation {
  id: string;
  email: string;
  clinic_id: string;
  unit_id: string;
  role: Role;
  invited_by: string;
  token: string;
  expires_at: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  created_at: string;
}

export interface CreateUnitData {
  clinic_id: string;
  name: string;
  nickname?: string;
  cnpj?: string;
  address: string;
  city: string;
  state: string;
  phone?: string;
  technical_manager?: string;
  is_main?: boolean;
}

export interface UpdateUnitData {
  name?: string;
  nickname?: string;
  cnpj?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  technical_manager?: string;
}

export interface InviteUserData {
  email: string;
  clinic_id: string;
  unit_id: string;
  role: Role;
}

