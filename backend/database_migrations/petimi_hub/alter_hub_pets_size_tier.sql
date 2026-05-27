-- PetMi Hub — porte corporal do pet (matriz de preços: mini…gigante; filhote é só na matriz/agenda).
-- Idempotente. Executar depois de create_hub_pets_and_pet_guardians.sql.

ALTER TABLE public.hub_pets
  ADD COLUMN IF NOT EXISTS size_tier text;

COMMENT ON COLUMN public.hub_pets.size_tier IS 'Porte para precificação: mini | pequeno | medio | grande | gigante. NULL em legado até preencher.';

-- Backfill seguro para NOT NULL (valores alinhados ao CHECK)
UPDATE public.hub_pets
SET size_tier = 'medio'
WHERE size_tier IS NULL;

ALTER TABLE public.hub_pets
  DROP CONSTRAINT IF EXISTS hub_pets_size_tier_chk;

ALTER TABLE public.hub_pets
  ADD CONSTRAINT hub_pets_size_tier_chk
  CHECK (size_tier IN ('mini', 'pequeno', 'medio', 'grande', 'gigante'));

-- Tornar obrigatório após backfill
ALTER TABLE public.hub_pets
  ALTER COLUMN size_tier SET NOT NULL;
