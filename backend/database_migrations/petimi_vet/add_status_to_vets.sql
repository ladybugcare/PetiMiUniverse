-- ========================================
-- Migration: Adicionar campo status à tabela vets
-- Date: 2025-01-30
-- Description: Adiciona campo status para permitir controle de ativação/desativação de veterinários
-- ========================================

-- Adicionar coluna status se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active', 'inactive'));

-- Atualizar registros existentes para 'active' se status for NULL
UPDATE vets
SET status = 'active'
WHERE status IS NULL;

-- Criar índice para melhor performance em consultas filtradas por status
CREATE INDEX IF NOT EXISTS idx_vets_status ON vets(status);

-- Comentário na coluna
COMMENT ON COLUMN vets.status IS 'Status do veterinário: active (ativo) ou inactive (inativo)';

