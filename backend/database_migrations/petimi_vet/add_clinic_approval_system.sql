-- ========================================
-- Migration: Sistema de Aprovação de Clínicas
-- Date: 2025-10-29
-- Description: Adiciona status e constraints para sistema de aprovação de clínicas e unidades
-- ========================================

-- Adicionar coluna status à tabela clinics
ALTER TABLE clinics 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Atualizar clínicas existentes para 'active' (não bloquear usuários atuais)
UPDATE clinics SET status = 'active' WHERE status IS NULL;

-- Adicionar constraint
ALTER TABLE clinics 
DROP CONSTRAINT IF EXISTS clinics_status_check;

ALTER TABLE clinics 
ADD CONSTRAINT clinics_status_check 
CHECK (status IN ('pending_unit', 'pending_approval', 'active', 'suspended', 'rejected'));

-- Atualizar units para incluir novos status
ALTER TABLE units 
DROP CONSTRAINT IF EXISTS units_status_check;

ALTER TABLE units 
ADD CONSTRAINT units_status_check 
CHECK (status IN ('active', 'inactive', 'pending_review', 'approved', 'rejected'));

-- Adicionar pending_activation em clinic_users
ALTER TABLE clinic_users 
DROP CONSTRAINT IF EXISTS clinic_users_status_check;

ALTER TABLE clinic_users 
ADD CONSTRAINT clinic_users_status_check 
CHECK (status IN ('active', 'inactive', 'pending', 'pending_activation'));

-- Adicionar campos de auditoria em units
ALTER TABLE units
ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_clinics_status ON clinics(status);
CREATE INDEX IF NOT EXISTS idx_units_status_pending ON units(status) WHERE status = 'pending_review';

-- Mensagem de sucesso
SELECT 'Migration add_clinic_approval_system.sql concluída com sucesso!' as status;

