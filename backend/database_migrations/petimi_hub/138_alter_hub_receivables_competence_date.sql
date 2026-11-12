-- Data de competência explícita (nullable). NÃO backfill a partir de created_at.
-- Pré-requisitos: 035_create_hub_financial_core.sql

ALTER TABLE public.hub_receivables
  ADD COLUMN IF NOT EXISTS competence_date date;

COMMENT ON COLUMN public.hub_receivables.competence_date IS
  'Competência contábil informada; NULL = sem competência. Nunca inferir de created_at.';

NOTIFY pgrst, 'reload schema';
