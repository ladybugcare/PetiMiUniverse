-- ========================================
-- Migration: Fix units_status_check constraint
-- Date: 2025-01-XX
-- Description: Atualiza a constraint de status da tabela units para incluir todos os status necessários
-- ========================================

-- Remove a constraint antiga
ALTER TABLE units 
DROP CONSTRAINT IF EXISTS units_status_check;

-- Adiciona a nova constraint com todos os status necessários
ALTER TABLE units 
ADD CONSTRAINT units_status_check 
CHECK (status IN (
  'active',           -- Unidade ativa
  'inactive',         -- Unidade inativa
  'pending_review',   -- Aguardando revisão/aprovação
  'approved',         -- Aprovada
  'rejected'          -- Rejeitada
));

-- Mensagem de sucesso
SELECT 'Migration fix_units_status_constraint.sql concluída com sucesso!' as status;

