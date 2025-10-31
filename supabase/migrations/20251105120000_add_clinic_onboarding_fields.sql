-- ========================================
-- Migration: Add onboarding tracking columns for clinic users
-- Date: 2025-11-05
-- Description: Tracks primeiro login e conclusão do fluxo inicial da clínica
-- ========================================

ALTER TABLE clinic_users
  ADD COLUMN IF NOT EXISTS first_login_at timestamp with time zone;

ALTER TABLE clinic_users
  ADD COLUMN IF NOT EXISTS first_login_completed_at timestamp with time zone;

ALTER TABLE clinic_users
  ADD COLUMN IF NOT EXISTS onboarding_state jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_clinic_users_first_login_completed
  ON clinic_users(first_login_completed_at);

-- Mensagem de sucesso para facilitar debugging
SELECT 'Migration add_clinic_onboarding_fields.sql executada com sucesso!' AS status;
