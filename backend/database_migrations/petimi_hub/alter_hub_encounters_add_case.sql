-- PetMi Hub — vincula hub_encounters a hub_clinical_cases (Fase 1 Clínica).
-- Pré-requisitos: create_hub_clinical_cases.sql já aplicado.
-- hub_case_id começa NULLABLE para permitir backfill sem downtime.
-- Após backfill (backfill_hub_clinical_cases.sql), aplicar alter_hub_encounters_case_not_null.sql.

ALTER TABLE public.hub_encounters
  ADD COLUMN IF NOT EXISTS hub_case_id uuid
    REFERENCES public.hub_clinical_cases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS encounter_type text NOT NULL DEFAULT 'consultation'
    CHECK (encounter_type IN ('consultation', 'return', 'emergency', 'procedure'));

CREATE INDEX IF NOT EXISTS idx_hub_encounters_clinic_case
  ON public.hub_encounters (clinic_id, hub_case_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.hub_encounters.hub_case_id IS 'Caso clínico ao qual este atendimento pertence. NOT NULL após backfill.';
COMMENT ON COLUMN public.hub_encounters.encounter_type IS 'consultation: consulta; return: retorno; emergency: urgência/emergência; procedure: procedimento avulso.';

NOTIFY pgrst, 'reload schema';
