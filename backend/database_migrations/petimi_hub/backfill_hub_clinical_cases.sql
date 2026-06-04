-- PetMi Hub — backfill 1:1 de casos clínicos para atendimentos legados (Fase 1 Clínica).
-- Executar UMA vez após create_hub_clinical_cases.sql e alter_hub_encounters_add_case.sql.
-- Idempotente: só processa encounters com hub_case_id IS NULL.
-- Regra: 1 caso por encounter (sem agrupamento por janela temporal).
-- Após este script, executar alter_hub_encounters_case_not_null.sql somente se:
--   SELECT COUNT(*) FROM hub_encounters WHERE hub_case_id IS NULL AND deleted_at IS NULL;
-- retornar 0.

DO $$
DECLARE
  enc RECORD;
  new_case_id uuid;
  case_status text;
BEGIN
  FOR enc IN
    SELECT
      id,
      clinic_id,
      unit_id,
      pet_id,
      guardian_id,
      hub_staff_member_id,
      chief_complaint,
      started_at,
      completed_at,
      created_at,
      status
    FROM public.hub_encounters
    WHERE hub_case_id IS NULL
      AND deleted_at IS NULL
    ORDER BY created_at ASC
  LOOP
    -- Mapeia status do encounter para status do caso
    CASE enc.status
      WHEN 'completed'  THEN case_status := 'resolved';
      WHEN 'cancelled'  THEN case_status := 'cancelled';
      ELSE                   case_status := 'active';
    END CASE;

    INSERT INTO public.hub_clinical_cases (
      clinic_id,
      unit_id,
      pet_id,
      guardian_id_snapshot,
      primary_veterinarian_id,
      title,
      status,
      opened_at,
      closed_at
    ) VALUES (
      enc.clinic_id,
      enc.unit_id,
      enc.pet_id,
      enc.guardian_id,
      enc.hub_staff_member_id,
      COALESCE(NULLIF(TRIM(enc.chief_complaint), ''), 'Atendimento'),
      case_status,
      COALESCE(enc.started_at, enc.created_at),
      CASE WHEN enc.status IN ('completed', 'cancelled') THEN enc.completed_at ELSE NULL END
    )
    RETURNING id INTO new_case_id;

    UPDATE public.hub_encounters
      SET hub_case_id = new_case_id
    WHERE id = enc.id;

  END LOOP;

  RAISE NOTICE 'Backfill concluído. Verifique: SELECT COUNT(*) FROM hub_encounters WHERE hub_case_id IS NULL AND deleted_at IS NULL;';
END $$;

NOTIFY pgrst, 'reload schema';
