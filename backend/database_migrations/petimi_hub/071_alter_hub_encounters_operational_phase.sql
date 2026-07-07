-- PetMi Hub — fase operacional do atendimento (fluxo de exames no consultório).
-- Pré-requisito: 025b_create_hub_encounters.sql

ALTER TABLE public.hub_encounters
  ADD COLUMN IF NOT EXISTS operational_phase text
  CHECK (operational_phase IS NULL OR operational_phase IN ('awaiting_exams', 'exams_returned'));

COMMENT ON COLUMN public.hub_encounters.operational_phase IS
  'Sub-estado operacional durante in_progress: awaiting_exams (Em exames), exams_returned (Retornou dos exames).';

CREATE INDEX IF NOT EXISTS idx_hub_encounters_operational_phase
  ON public.hub_encounters (clinic_id, operational_phase)
  WHERE operational_phase IS NOT NULL AND deleted_at IS NULL;
