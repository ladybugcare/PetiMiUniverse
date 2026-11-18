-- PetMi Hub — impede internações ativas duplicadas (mesmo pet ou mesmo leito).
-- Pré-requisitos: 025k_create_hub_hospitalizations.sql, 025s_alter_hub_hospitalizations_fase7.sql.

-- Um pet não pode ter duas internações ativas na mesma clínica.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_hospitalizations_pet_active
  ON public.hub_hospitalizations (clinic_id, pet_id)
  WHERE deleted_at IS NULL AND status = 'active';

-- Um leito não pode estar ocupado por duas internações ativas.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_hospitalizations_bed_active
  ON public.hub_hospitalizations (clinic_id, hub_hospital_bed_id)
  WHERE deleted_at IS NULL
    AND status = 'active'
    AND hub_hospital_bed_id IS NOT NULL;

COMMENT ON INDEX public.uniq_hub_hospitalizations_pet_active IS
  'Garante no máximo uma internação ativa por pet/clínica (concorrência e retries).';
COMMENT ON INDEX public.uniq_hub_hospitalizations_bed_active IS
  'Garante no máximo uma internação ativa por leito/clínica.';
