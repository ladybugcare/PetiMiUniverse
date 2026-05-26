-- ========================================
-- Migration: Adicionar campo role à tabela clinics
-- Date: 2025-01-31
-- Description: Adiciona campo role para permitir diferentes tipos/níveis de clínicas
-- ========================================

-- Adicionar coluna role se não existir
ALTER TABLE clinics
ADD COLUMN IF NOT EXISTS role text DEFAULT 'standard' CHECK (role IN ('standard', 'premium', 'partner'));

-- Atualizar registros existentes para 'standard' se role for NULL
UPDATE clinics
SET role = 'standard'
WHERE role IS NULL;

-- Criar índice para melhor performance em consultas filtradas por role
CREATE INDEX IF NOT EXISTS idx_clinics_role ON clinics(role);

-- Comentário na coluna
COMMENT ON COLUMN clinics.role IS 'Role/tipo da clínica: standard (padrão), premium (premium), partner (parceiro)';

