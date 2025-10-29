-- Migration: Multi-Unit Clinic Management System with Roles and Permissions
-- Date: 2025-10-29
-- Description: Creates tables for units, clinic users, invitations, and audit logs

-- ========================================
-- 1. CREATE UNITS TABLE (Unidades/Filiais)
-- ========================================
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  cnpj text UNIQUE,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  phone text,
  technical_manager text,
  is_main boolean DEFAULT false,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_units_clinic_id ON units(clinic_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);

-- ========================================
-- 2. CREATE CLINIC_USERS TABLE (Usuários da Clínica com Roles)
-- ========================================
CREATE TABLE IF NOT EXISTS clinic_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL')),
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  invited_by uuid REFERENCES auth.users(id),
  invited_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_clinic_users_user_id ON clinic_users(user_id);
CREATE INDEX IF NOT EXISTS idx_clinic_users_clinic_id ON clinic_users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_users_unit_id ON clinic_users(unit_id);
CREATE INDEX IF NOT EXISTS idx_clinic_users_role ON clinic_users(role);

-- ========================================
-- 3. CREATE USER_INVITATIONS TABLE (Convites Pendentes)
-- ========================================
CREATE TABLE IF NOT EXISTS user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  unit_id uuid REFERENCES units(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL')),
  invited_by uuid REFERENCES auth.users(id) NOT NULL,
  token text UNIQUE NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON user_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON user_invitations(status);

-- ========================================
-- 4. CREATE AUDIT_LOGS TABLE (Histórico de Ações)
-- ========================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  clinic_id uuid REFERENCES clinics(id),
  unit_id uuid REFERENCES units(id),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic_id ON audit_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ========================================
-- 5. ALTER DEMANDS TABLE (Adicionar unit_id)
-- ========================================
ALTER TABLE demands
ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES units(id);

CREATE INDEX IF NOT EXISTS idx_demands_unit_id ON demands(unit_id);

-- ========================================
-- VERIFICATION QUERIES (Comentadas)
-- ========================================
-- SELECT table_name, column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name IN ('units', 'clinic_users', 'user_invitations', 'audit_logs')
-- ORDER BY table_name, ordinal_position;

