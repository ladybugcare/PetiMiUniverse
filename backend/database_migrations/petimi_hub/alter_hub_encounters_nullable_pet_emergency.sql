-- PetMi Hub — permite urgência sem pet/tutor/caso até identificação posterior.
-- Pré-requisitos: create_hub_encounters.sql, alter_hub_encounters_add_case.sql.
--
-- Contexto: atendimentos de emergência podem ser abertos sem pet cadastrado.
-- O pet/tutor deve ser vinculado antes de finalizar o atendimento ou abrir comanda.
-- hub_case_id volta a ser nullable para comportar a janela sem identificação.

ALTER TABLE public.hub_encounters
  ALTER COLUMN pet_id DROP NOT NULL;

-- Remove NOT NULL de hub_case_id caso tenha sido aplicado por alter_hub_encounters_case_not_null.sql.
-- Idempotente: falha silenciosamente se a coluna já for nullable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'hub_encounters'
      AND column_name  = 'hub_case_id'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.hub_encounters
      ALTER COLUMN hub_case_id DROP NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.hub_encounters.pet_id IS
  'Pet atendido. Nullable para atendimentos de emergência abertos sem identificação prévia; obrigatório para finalização e abertura de comanda.';
COMMENT ON COLUMN public.hub_encounters.hub_case_id IS
  'Caso clínico do episódio. Nullable enquanto o atendimento de emergência ainda não foi identificado.';

NOTIFY pgrst, 'reload schema';
