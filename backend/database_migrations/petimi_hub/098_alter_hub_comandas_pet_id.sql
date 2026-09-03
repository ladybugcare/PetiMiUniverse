-- PetMi Hub — pet de contexto na comanda (manual / pacote / origem com um pet).
-- Pré-requisito: 039_create_hub_comandas.sql, 002_create_hub_pets_and_pet_guardians.sql.

ALTER TABLE public.hub_comandas
  ADD COLUMN IF NOT EXISTS pet_id uuid REFERENCES public.hub_pets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hub_comandas_clinic_pet
  ON public.hub_comandas (clinic_id, pet_id)
  WHERE deleted_at IS NULL AND pet_id IS NOT NULL;

COMMENT ON COLUMN public.hub_comandas.pet_id IS
  'Pet de contexto da comanda (ex.: aberta pelo perfil do pet). Itens podem ter pet_id próprio; NULL = só tutor / multi-pet.';

NOTIFY pgrst, 'reload schema';
