-- =============================================================================
-- Corrigir: column vets.onboarding_completed does not exist (onboarding vet)
-- =============================================================================
-- O backend (checkVetOnboarding / completeVetOnboarding / auth) usa estas
-- colunas. Este ficheiro aplica o equivalente a:
--   1) add_vet_onboarding_fields.sql
--   2) add_vet_approval_system.sql
-- em ordem, de forma idempotente onde possível.
--
-- Supabase → SQL Editor → colar → Run.
-- =============================================================================

-- ========== 1) add_vet_onboarding_fields.sql ==========
ALTER TABLE public.vets
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

ALTER TABLE public.vets
  ADD COLUMN IF NOT EXISTS crmv_file_url text;

ALTER TABLE public.vets
  ADD COLUMN IF NOT EXISTS service_regions text[] DEFAULT '{}'::text[];

ALTER TABLE public.vets
  ADD COLUMN IF NOT EXISTS experience_year integer;

ALTER TABLE public.vets
  DROP CONSTRAINT IF EXISTS vets_experience_year_check;

ALTER TABLE public.vets
  ADD CONSTRAINT vets_experience_year_check
  CHECK (
    experience_year IS NULL
    OR (
      experience_year >= 1980
      AND experience_year <= EXTRACT(YEAR FROM CURRENT_DATE)::integer
    )
  );

CREATE INDEX IF NOT EXISTS idx_vets_onboarding_completed
  ON public.vets (onboarding_completed)
  WHERE onboarding_completed = false;

CREATE INDEX IF NOT EXISTS idx_vets_service_regions
  ON public.vets USING GIN (service_regions);

COMMENT ON COLUMN public.vets.onboarding_completed IS 'Indica se o veterinário completou o onboarding';
COMMENT ON COLUMN public.vets.crmv_file_url IS 'URL do arquivo CRMV no Supabase Storage';
COMMENT ON COLUMN public.vets.service_regions IS 'Array de regiões/cidades onde o veterinário atende';
COMMENT ON COLUMN public.vets.experience_year IS 'Ano de início da experiência profissional (1980–ano atual)';

UPDATE public.vets
SET onboarding_completed = false
WHERE onboarding_completed IS NULL;

-- ========== 2) add_vet_approval_system.sql ==========
-- Remover constraint antiga do status (nome pode variar entre ambientes)
ALTER TABLE public.vets DROP CONSTRAINT IF EXISTS vets_approval_status_check;

ALTER TABLE public.vets
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending';

UPDATE public.vets
SET approval_status = 'pending'
WHERE approval_status IS NULL;

-- CHECK alinhado com add_vet_approval_system.sql
ALTER TABLE public.vets
  ADD CONSTRAINT vets_approval_status_check
  CHECK (
    approval_status IN (
      'pending',
      'pending_approval',
      'approved',
      'rejected',
      'pending_review'
    )
  );

ALTER TABLE public.vets
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users (id);

ALTER TABLE public.vets
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.vets
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.vets
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users (id);

ALTER TABLE public.vets
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

UPDATE public.vets
SET approval_status = 'pending_approval'
WHERE onboarding_completed = true
  AND (approval_status = 'pending' OR approval_status IS NULL);

CREATE INDEX IF NOT EXISTS idx_vets_approval_status
  ON public.vets (approval_status)
  WHERE approval_status = 'pending_approval';

CREATE INDEX IF NOT EXISTS idx_vets_approved_by
  ON public.vets (approved_by)
  WHERE approved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vets_reviewed_by
  ON public.vets (reviewed_by)
  WHERE reviewed_by IS NOT NULL;

COMMENT ON COLUMN public.vets.approval_status IS 'Status de aprovação do cadastro (pending, pending_approval, approved, rejected, pending_review)';

-- ========== Verificação ==========
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vets' AND column_name = 'onboarding_completed') AS col_onboarding_completed,
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vets' AND column_name = 'approval_status') AS col_approval_status;

SELECT 'fix_vet_onboarding_schema_supabase.sql concluído.' AS status;
