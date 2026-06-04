-- PetMi Hub — torna hub_case_id NOT NULL em hub_encounters (Fase 1 Clínica).
-- Executar SOMENTE após confirmar que o backfill está completo:
--   SELECT COUNT(*) FROM hub_encounters WHERE hub_case_id IS NULL AND deleted_at IS NULL;
-- Deve retornar 0. Encounters soft-deletados (deleted_at IS NOT NULL) podem permanecer com NULL.

-- Verifica órfãos antes de prosseguir
DO $$
DECLARE
  orphan_count bigint;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.hub_encounters
  WHERE hub_case_id IS NULL
    AND deleted_at IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Backfill incompleto: % atendimentos ativos ainda sem hub_case_id. Execute backfill_hub_clinical_cases.sql antes de continuar.', orphan_count;
  END IF;
END $$;

ALTER TABLE public.hub_encounters
  ALTER COLUMN hub_case_id SET NOT NULL;

NOTIFY pgrst, 'reload schema';
