-- PetMi Hub — Internações avançadas: vínculo ao caso e status ampliado (Fase 7 Clínica).
-- Pré-requisitos: create_hub_hospitalizations.sql, create_hub_clinical_cases.sql.

ALTER TABLE public.hub_hospitalizations
  ADD COLUMN IF NOT EXISTS hub_case_id uuid
    REFERENCES public.hub_clinical_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reason text;

-- Amplia constraint de status para incluir death e transferred
-- (pode precisar de DROP + ADD se a constraint existir com nome fixo)
ALTER TABLE public.hub_hospitalizations
  DROP CONSTRAINT IF EXISTS hub_hospitalizations_status_check;

ALTER TABLE public.hub_hospitalizations
  ADD CONSTRAINT hub_hospitalizations_status_check
    CHECK (status IN ('active', 'discharged', 'death', 'transferred', 'cancelled'));

COMMENT ON COLUMN public.hub_hospitalizations.hub_case_id IS 'Caso clínico ao qual esta internação pertence.';
COMMENT ON COLUMN public.hub_hospitalizations.reason IS 'Motivo da internação (texto livre).';

NOTIFY pgrst, 'reload schema';
