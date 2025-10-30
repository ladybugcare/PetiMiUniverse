-- ========================================
-- Migration: Migrar Clínicas Existentes para Fluxo de Aprovação
-- Date: 2025-10-29
-- Description: Atualiza clínicas, unidades e clinic_users existentes para status 'active'
--              para não bloquear usuários atuais do sistema
-- ========================================

-- Atualizar todas as clínicas existentes para 'active'
-- (não queremos bloquear usuários atuais)
UPDATE clinics 
SET status = 'active' 
WHERE status IS NULL OR status = 'pending_unit';

-- Atualizar todas as unidades existentes para 'approved'
UPDATE units 
SET status = 'approved' 
WHERE status = 'active' OR status IS NULL;

-- Ativar todos clinic_users existentes
UPDATE clinic_users 
SET status = 'active' 
WHERE status = 'pending_activation' OR status = 'pending' OR status IS NULL;

-- Mensagem de sucesso
SELECT 'Migration migrate_existing_clinics_to_approval_flow.sql concluída com sucesso!' as status;
SELECT 
  (SELECT COUNT(*) FROM clinics WHERE status = 'active') as clinicas_ativas,
  (SELECT COUNT(*) FROM units WHERE status = 'approved') as unidades_aprovadas,
  (SELECT COUNT(*) FROM clinic_users WHERE status = 'active') as usuarios_ativos;

