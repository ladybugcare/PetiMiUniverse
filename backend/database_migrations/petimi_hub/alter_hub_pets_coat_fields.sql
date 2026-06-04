-- PetMi Hub — cor e pelagem estruturadas no cadastro de pets.
-- Idempotente. Executar depois de create_hub_pets_and_pet_guardians.sql.

ALTER TABLE public.hub_pets
  ADD COLUMN IF NOT EXISTS coat_color text,
  ADD COLUMN IF NOT EXISTS coat_type text;

COMMENT ON COLUMN public.hub_pets.coat_color IS 'Cor principal / descrição livre da pelagem (ex.: caramelo, preto e branco).';
COMMENT ON COLUMN public.hub_pets.coat_type IS 'Tipo de pelagem para precificação: curto | medio | longo | duplo | encaracolado | sem_pelo | outro. NULL em legado até preencher.';

ALTER TABLE public.hub_pets
  DROP CONSTRAINT IF EXISTS hub_pets_coat_type_chk;

ALTER TABLE public.hub_pets
  ADD CONSTRAINT hub_pets_coat_type_chk
  CHECK (
    coat_type IS NULL
    OR coat_type IN ('curto', 'medio', 'longo', 'duplo', 'encaracolado', 'sem_pelo', 'outro')
  );
