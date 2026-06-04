-- ========================================
-- Migration: Adicionar status 'pending_clinic' em clinic_users
-- Date: 2025-11-06
-- Description: Adiciona status para usuários que ainda não criaram sua clínica
-- ========================================

-- Remover constraint antiga de status
ALTER TABLE clinic_users 
DROP CONSTRAINT IF EXISTS clinic_users_status_check;

-- Adicionar nova constraint com status pending_clinic
ALTER TABLE clinic_users 
ADD CONSTRAINT clinic_users_status_check 
CHECK (status IN (
  'pending_clinic',    -- ✅ NOVO: Usuário aguardando criar clínica (sem clinic_id ainda)
  'pending_activation', -- Aguardando ativação
  'pending',           -- Pendente (outros casos)
  'active',            -- Ativo
  'inactive'           -- Inativo
));

-- Mensagem de sucesso
SELECT 'Migration add_pending_clinic_status.sql concluída com sucesso!' as status;

