-- ========================================
-- Migration: Corrigir onboarding_completed NULL em vets antigos
-- Date: 2025-01-30
-- Description: Atualiza vets criados antes da migration que têm onboarding_completed = NULL
--              para false, garantindo que eles sejam redirecionados para onboarding
-- ========================================

-- Atualizar vets antigos que têm onboarding_completed = NULL
UPDATE vets 
SET onboarding_completed = false 
WHERE onboarding_completed IS NULL;

-- Atualizar approval_status para 'pending' se for NULL
UPDATE vets 
SET approval_status = 'pending' 
WHERE approval_status IS NULL;

-- Verificação
SELECT 'Migration fix_vets_onboarding_completed_null.sql concluída com sucesso!' as status;

-- Verificar quantos vets foram atualizados
SELECT 
  COUNT(*) FILTER (WHERE onboarding_completed = false) as vets_pending_onboarding,
  COUNT(*) FILTER (WHERE onboarding_completed = true) as vets_completed_onboarding,
  COUNT(*) FILTER (WHERE approval_status = 'pending') as vets_pending_approval,
  COUNT(*) FILTER (WHERE approval_status = 'approved') as vets_approved
FROM vets;

