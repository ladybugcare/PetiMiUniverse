-- ========================================
-- Migration: Sistema de Aprovação de Veterinários
-- Date: 2025-01-30
-- Description: Adiciona campos e constraints para sistema de aprovação de veterinários pelo admin
-- ========================================

-- Adicionar coluna approval_status se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending' 
  CHECK (approval_status IN ('pending', 'pending_approval', 'approved', 'rejected', 'pending_review'));

-- Adicionar coluna approved_by se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

-- Adicionar coluna approved_at se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

-- Adicionar coluna rejection_reason se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Adicionar coluna reviewed_by se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id);

-- Adicionar coluna reviewed_at se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone;

-- Atualizar registros existentes: se onboarding_completed = true e approval_status = 'pending', mudar para 'pending_approval'
UPDATE vets
SET approval_status = 'pending_approval'
WHERE onboarding_completed = true AND approval_status = 'pending';

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_vets_approval_status ON vets(approval_status) WHERE approval_status = 'pending_approval';
CREATE INDEX IF NOT EXISTS idx_vets_approved_by ON vets(approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vets_reviewed_by ON vets(reviewed_by) WHERE reviewed_by IS NOT NULL;

-- Comentários nas colunas
COMMENT ON COLUMN vets.approval_status IS 'Status de aprovação: pending (aguardando onboarding), pending_approval (aguardando aprovação admin), approved (aprovado), rejected (rejeitado), pending_review (aguardando ajustes)';
COMMENT ON COLUMN vets.approved_by IS 'ID do admin que aprovou o veterinário';
COMMENT ON COLUMN vets.approved_at IS 'Data e hora da aprovação';
COMMENT ON COLUMN vets.rejection_reason IS 'Motivo da rejeição (se aplicável)';
COMMENT ON COLUMN vets.reviewed_by IS 'ID do admin que revisou o veterinário';
COMMENT ON COLUMN vets.reviewed_at IS 'Data e hora da revisão';

-- Verificação de sucesso
SELECT 'Migration add_vet_approval_system.sql concluída com sucesso!' as status;
SELECT 
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'approval_status') as approval_status_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'approved_by') as approved_by_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'approved_at') as approved_at_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'rejection_reason') as rejection_reason_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'reviewed_by') as reviewed_by_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'reviewed_at') as reviewed_at_exists;

