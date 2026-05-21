-- =============================================================================
-- Cadastro público de clínica (POST /clinics) — corrigir clinic_users
-- =============================================================================
-- Sintomas:
--   - "null value in column clinic_id violates not-null constraint"
--   - ou erro de CHECK em status ao usar 'pending_clinic'
--
-- Execute no Supabase SQL Editor (ordem abaixo é segura e idempotente).
-- Depois: voltar a tentar o cadastro na app ou POST /clinics.
-- =============================================================================

-- 1) clinic_id pode ser NULL até existir a primeira unidade/clínica
ALTER TABLE public.clinic_users
  ALTER COLUMN clinic_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'clinic_users'
      AND constraint_name = 'clinic_users_clinic_id_fkey'
  ) THEN
    ALTER TABLE public.clinic_users
      ADD CONSTRAINT clinic_users_clinic_id_fkey
      FOREIGN KEY (clinic_id) REFERENCES public.clinics (id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clinic_users_clinic_id_null
  ON public.clinic_users (clinic_id)
  WHERE clinic_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_clinic_users_pending_clinic
  ON public.clinic_users (status, clinic_id)
  WHERE clinic_id IS NULL;

-- 2) Status pending_clinic (signup novo fluxo)
ALTER TABLE public.clinic_users
  DROP CONSTRAINT IF EXISTS clinic_users_status_check;

ALTER TABLE public.clinic_users
  ADD CONSTRAINT clinic_users_status_check
  CHECK (status IN (
    'pending_clinic',
    'pending_activation',
    'pending',
    'active',
    'inactive'
  ));

SELECT 'fix_clinic_public_signup_clinic_users.sql aplicado.' AS status;
