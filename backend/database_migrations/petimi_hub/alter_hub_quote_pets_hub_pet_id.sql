-- PetMi Hub — liga pet do orçamento ao hub_pets após conversão (comanda multi-pet).
-- Pré-requisitos: create_hub_prospects_and_quotes.sql, hub_pets.

ALTER TABLE public.hub_quote_pets
  ADD COLUMN IF NOT EXISTS hub_pet_id uuid REFERENCES public.hub_pets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hub_quote_pets_hub_pet
  ON public.hub_quote_pets (hub_pet_id)
  WHERE hub_pet_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
