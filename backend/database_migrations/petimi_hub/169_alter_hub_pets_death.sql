-- Óbito do animal: metadados no pet (independente de deleted_at), desfecho estruturado
-- em encounter/surgery, auditoria append-only, timeline e RPCs atômicas.
-- Pré-requisito: 168_create_hub_clinical_term_templates.sql

-- ---------------------------------------------------------------------------
-- 1. hub_pets — campos de óbito
-- ---------------------------------------------------------------------------
ALTER TABLE public.hub_pets
  ADD COLUMN IF NOT EXISTS deceased_at timestamptz,
  ADD COLUMN IF NOT EXISTS death_type text,
  ADD COLUMN IF NOT EXISTS death_cause text,
  ADD COLUMN IF NOT EXISTS death_notes text,
  ADD COLUMN IF NOT EXISTS death_source text,
  ADD COLUMN IF NOT EXISTS death_ref_id uuid,
  ADD COLUMN IF NOT EXISTS death_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS death_recorded_by uuid,
  ADD COLUMN IF NOT EXISTS death_invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS death_invalidated_by uuid,
  ADD COLUMN IF NOT EXISTS death_invalidation_reason text;

ALTER TABLE public.hub_pets
  DROP CONSTRAINT IF EXISTS hub_pets_death_type_check;
ALTER TABLE public.hub_pets
  ADD CONSTRAINT hub_pets_death_type_check
  CHECK (death_type IS NULL OR death_type IN ('euthanasia', 'natural', 'accidental', 'other', 'unknown'));

ALTER TABLE public.hub_pets
  DROP CONSTRAINT IF EXISTS hub_pets_death_source_check;
ALTER TABLE public.hub_pets
  ADD CONSTRAINT hub_pets_death_source_check
  CHECK (death_source IS NULL OR death_source IN ('manual', 'encounter', 'surgery', 'hospitalization'));

CREATE INDEX IF NOT EXISTS idx_hub_pets_clinic_deceased_valid
  ON public.hub_pets (clinic_id)
  WHERE deceased_at IS NOT NULL AND death_invalidated_at IS NULL;

COMMENT ON COLUMN public.hub_pets.deceased_at IS 'Momento do óbito (clínico). Independente de deleted_at (arquivamento administrativo).';
COMMENT ON COLUMN public.hub_pets.death_type IS 'Classificação: euthanasia | natural | accidental | other | unknown.';
COMMENT ON COLUMN public.hub_pets.death_cause IS 'Causa clínica em texto livre (opcional).';
COMMENT ON COLUMN public.hub_pets.death_source IS 'Origem do registro: manual | encounter | surgery | hospitalization.';

-- ---------------------------------------------------------------------------
-- 2. Desfecho estruturado em encounter / surgery (sem novo status operacional)
-- ---------------------------------------------------------------------------
ALTER TABLE public.hub_encounters
  ADD COLUMN IF NOT EXISTS clinical_outcome text;

ALTER TABLE public.hub_encounters
  DROP CONSTRAINT IF EXISTS hub_encounters_clinical_outcome_check;
ALTER TABLE public.hub_encounters
  ADD CONSTRAINT hub_encounters_clinical_outcome_check
  CHECK (clinical_outcome IS NULL OR clinical_outcome IN ('death'));

ALTER TABLE public.hub_surgeries
  ADD COLUMN IF NOT EXISTS clinical_outcome text;

ALTER TABLE public.hub_surgeries
  DROP CONSTRAINT IF EXISTS hub_surgeries_clinical_outcome_check;
ALTER TABLE public.hub_surgeries
  ADD CONSTRAINT hub_surgeries_clinical_outcome_check
  CHECK (clinical_outcome IS NULL OR clinical_outcome IN ('death'));

-- ---------------------------------------------------------------------------
-- 3. Auditoria append-only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hub_pet_death_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('recorded', 'corrected', 'invalidated')),
  before jsonb,
  after jsonb,
  reason text,
  death_source text,
  death_ref_id uuid,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_pet_death_audit_pet
  ON public.hub_pet_death_audit (clinic_id, pet_id, created_at DESC);

COMMENT ON TABLE public.hub_pet_death_audit IS 'Auditoria append-only de registro, correção e invalidação de óbito do pet.';

-- ---------------------------------------------------------------------------
-- 4. Timeline — novos event_types (inclui tipos já usados no Zod e óbito)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'hub_clinical_timeline_events'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%event_type%'
  LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.hub_clinical_timeline_events DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.hub_clinical_timeline_events
  ADD CONSTRAINT hub_clinical_timeline_events_event_type_check
  CHECK (event_type IN (
    'encounter_created',
    'encounter_completed',
    'encounter_amended',
    'exam_requested',
    'exam_result_received',
    'exam_order_issued',
    'exam_order_revoked',
    'specialist_referral_requested',
    'specialist_referral_issued',
    'prescription_issued',
    'vaccination_applied',
    'hospitalization_started',
    'hospitalization_discharged',
    'hospitalization_death',
    'hospitalization_transferred',
    'surgery_performed',
    'return_scheduled',
    'note',
    'pet_death_recorded',
    'pet_death_corrected',
    'pet_death_invalidated'
  ));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hub_pet_has_valid_death(p_pet public.hub_pets)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_pet.deceased_at IS NOT NULL AND p_pet.death_invalidated_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.hub_pet_death_snapshot(p_pet public.hub_pets)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'deceased_at', p_pet.deceased_at,
    'death_type', p_pet.death_type,
    'death_cause', p_pet.death_cause,
    'death_notes', p_pet.death_notes,
    'death_source', p_pet.death_source,
    'death_ref_id', p_pet.death_ref_id,
    'death_recorded_at', p_pet.death_recorded_at,
    'death_recorded_by', p_pet.death_recorded_by,
    'death_invalidated_at', p_pet.death_invalidated_at,
    'death_invalidated_by', p_pet.death_invalidated_by,
    'death_invalidation_reason', p_pet.death_invalidation_reason,
    'deleted_at', p_pet.deleted_at
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC hub_register_pet_death
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hub_register_pet_death(
  p_clinic_id uuid,
  p_pet_id uuid,
  p_deceased_at timestamptz,
  p_death_type text,
  p_death_source text,
  p_death_cause text DEFAULT NULL,
  p_death_notes text DEFAULT NULL,
  p_death_ref_id uuid DEFAULT NULL,
  p_archive boolean DEFAULT false,
  p_actor_user_id uuid DEFAULT NULL,
  p_hub_case_id uuid DEFAULT NULL,
  p_hub_encounter_id uuid DEFAULT NULL,
  p_created_by_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_pet public.hub_pets%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_ref_ok boolean := true;
  v_rows int;
BEGIN
  IF p_clinic_id IS NULL OR p_pet_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id e pet_id são obrigatórios' USING ERRCODE = 'P0001';
  END IF;
  IF p_deceased_at IS NULL THEN
    RAISE EXCEPTION 'deceased_at é obrigatório' USING ERRCODE = 'P0001';
  END IF;
  IF p_deceased_at > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'Data de óbito não pode ser futura' USING ERRCODE = 'P0001';
  END IF;
  IF p_death_type IS NULL OR p_death_type NOT IN ('euthanasia', 'natural', 'accidental', 'other', 'unknown') THEN
    RAISE EXCEPTION 'death_type inválido' USING ERRCODE = 'P0001';
  END IF;
  IF p_death_source IS NULL OR p_death_source NOT IN ('manual', 'encounter', 'surgery', 'hospitalization') THEN
    RAISE EXCEPTION 'death_source inválido' USING ERRCODE = 'P0001';
  END IF;
  IF p_death_source <> 'manual' AND p_death_ref_id IS NULL THEN
    RAISE EXCEPTION 'death_ref_id obrigatório para origem clínica' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_pet
  FROM public.hub_pets
  WHERE id = p_pet_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pet não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF public.hub_pet_has_valid_death(v_pet) THEN
    RAISE EXCEPTION 'already_deceased' USING ERRCODE = 'P0001';
  END IF;

  -- Valida vínculo do registro clínico de origem
  IF p_death_source = 'encounter' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.hub_encounters e
      WHERE e.id = p_death_ref_id AND e.clinic_id = p_clinic_id AND e.pet_id = p_pet_id AND e.deleted_at IS NULL
    ) INTO v_ref_ok;
  ELSIF p_death_source = 'surgery' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.hub_surgeries s
      WHERE s.id = p_death_ref_id AND s.clinic_id = p_clinic_id AND s.pet_id = p_pet_id
    ) INTO v_ref_ok;
  ELSIF p_death_source = 'hospitalization' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.hub_hospitalizations h
      WHERE h.id = p_death_ref_id AND h.clinic_id = p_clinic_id AND h.pet_id = p_pet_id
    ) INTO v_ref_ok;
  END IF;

  IF NOT v_ref_ok THEN
    RAISE EXCEPTION 'Registro clínico de origem inválido para este pet' USING ERRCODE = 'P0001';
  END IF;

  v_before := public.hub_pet_death_snapshot(v_pet);

  UPDATE public.hub_pets
  SET
    deceased_at = p_deceased_at,
    death_type = p_death_type,
    death_cause = NULLIF(trim(COALESCE(p_death_cause, '')), ''),
    death_notes = NULLIF(trim(COALESCE(p_death_notes, '')), ''),
    death_source = p_death_source,
    death_ref_id = p_death_ref_id,
    death_recorded_at = now(),
    death_recorded_by = p_actor_user_id,
    death_invalidated_at = NULL,
    death_invalidated_by = NULL,
    death_invalidation_reason = NULL,
    deleted_at = CASE
      WHEN p_archive AND deleted_at IS NULL THEN now()
      ELSE deleted_at
    END,
    updated_at = now()
  WHERE id = p_pet_id
    AND clinic_id = p_clinic_id
    AND (deceased_at IS NULL OR death_invalidated_at IS NOT NULL);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'already_deceased' USING ERRCODE = 'P0001';
  END IF;

  -- Desfecho clínico estruturado (não auto-completa status operacional)
  IF p_death_source = 'encounter' THEN
    UPDATE public.hub_encounters
    SET clinical_outcome = 'death', updated_at = now()
    WHERE id = p_death_ref_id AND clinic_id = p_clinic_id AND pet_id = p_pet_id;
  ELSIF p_death_source = 'surgery' THEN
    UPDATE public.hub_surgeries
    SET clinical_outcome = 'death', updated_at = now()
    WHERE id = p_death_ref_id AND clinic_id = p_clinic_id AND pet_id = p_pet_id;
  ELSIF p_death_source = 'hospitalization' THEN
    UPDATE public.hub_hospitalizations
    SET
      status = 'death',
      discharged_at = COALESCE(discharged_at, now()),
      discharge_notes = COALESCE(NULLIF(trim(COALESCE(p_death_notes, '')), ''), discharge_notes),
      updated_at = now()
    WHERE id = p_death_ref_id
      AND clinic_id = p_clinic_id
      AND pet_id = p_pet_id
      AND status = 'active';
  END IF;

  SELECT * INTO v_pet FROM public.hub_pets WHERE id = p_pet_id;
  v_after := public.hub_pet_death_snapshot(v_pet);

  INSERT INTO public.hub_pet_death_audit (
    clinic_id, pet_id, action, before, after, reason, death_source, death_ref_id, actor_user_id
  ) VALUES (
    p_clinic_id, p_pet_id, 'recorded', v_before, v_after, NULL, p_death_source, p_death_ref_id, p_actor_user_id
  );

  INSERT INTO public.hub_clinical_timeline_events (
    clinic_id, pet_id, hub_case_id, hub_encounter_id,
    event_type, ref_type, ref_id, title, body, event_at, created_by
  ) VALUES (
    p_clinic_id,
    p_pet_id,
    p_hub_case_id,
    COALESCE(p_hub_encounter_id, CASE WHEN p_death_source = 'encounter' THEN p_death_ref_id ELSE NULL END),
    'pet_death_recorded',
    CASE p_death_source
      WHEN 'manual' THEN 'pet'
      ELSE p_death_source
    END,
    COALESCE(p_death_ref_id, p_pet_id),
    'Óbito registrado',
    NULLIF(trim(COALESCE(p_death_notes, p_death_cause, '')), ''),
    p_deceased_at,
    p_created_by_staff_id
  );

  IF p_death_source = 'hospitalization' THEN
    INSERT INTO public.hub_clinical_timeline_events (
      clinic_id, pet_id, hub_case_id, hub_encounter_id,
      event_type, ref_type, ref_id, title, body, event_at, created_by
    ) VALUES (
      p_clinic_id,
      p_pet_id,
      p_hub_case_id,
      p_hub_encounter_id,
      'hospitalization_death',
      'hospitalization',
      p_death_ref_id,
      'Óbito — internação encerrada',
      NULLIF(trim(COALESCE(p_death_notes, '')), ''),
      COALESCE(p_deceased_at, now()),
      p_created_by_staff_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'pet', to_jsonb(v_pet),
    'archived', (v_pet.deleted_at IS NOT NULL)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC hub_correct_pet_death
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hub_correct_pet_death(
  p_clinic_id uuid,
  p_pet_id uuid,
  p_reason text,
  p_deceased_at timestamptz DEFAULT NULL,
  p_death_type text DEFAULT NULL,
  p_death_cause text DEFAULT NULL,
  p_death_notes text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_created_by_staff_id uuid DEFAULT NULL,
  p_hub_case_id uuid DEFAULT NULL,
  p_hub_encounter_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_pet public.hub_pets%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Justificativa obrigatória para correção' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_pet
  FROM public.hub_pets
  WHERE id = p_pet_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pet não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.hub_pet_has_valid_death(v_pet) THEN
    RAISE EXCEPTION 'Pet não possui óbito válido para corrigir' USING ERRCODE = 'P0001';
  END IF;

  IF p_deceased_at IS NOT NULL AND p_deceased_at > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'Data de óbito não pode ser futura' USING ERRCODE = 'P0001';
  END IF;
  IF p_death_type IS NOT NULL AND p_death_type NOT IN ('euthanasia', 'natural', 'accidental', 'other', 'unknown') THEN
    RAISE EXCEPTION 'death_type inválido' USING ERRCODE = 'P0001';
  END IF;

  v_before := public.hub_pet_death_snapshot(v_pet);

  UPDATE public.hub_pets
  SET
    deceased_at = COALESCE(p_deceased_at, deceased_at),
    death_type = COALESCE(p_death_type, death_type),
    death_cause = CASE
      WHEN p_death_cause IS NULL THEN death_cause
      ELSE NULLIF(trim(p_death_cause), '')
    END,
    death_notes = CASE
      WHEN p_death_notes IS NULL THEN death_notes
      ELSE NULLIF(trim(p_death_notes), '')
    END,
    updated_at = now()
  WHERE id = p_pet_id AND clinic_id = p_clinic_id;

  SELECT * INTO v_pet FROM public.hub_pets WHERE id = p_pet_id;
  v_after := public.hub_pet_death_snapshot(v_pet);

  INSERT INTO public.hub_pet_death_audit (
    clinic_id, pet_id, action, before, after, reason, death_source, death_ref_id, actor_user_id
  ) VALUES (
    p_clinic_id, p_pet_id, 'corrected', v_before, v_after, trim(p_reason),
    v_pet.death_source, v_pet.death_ref_id, p_actor_user_id
  );

  INSERT INTO public.hub_clinical_timeline_events (
    clinic_id, pet_id, hub_case_id, hub_encounter_id,
    event_type, ref_type, ref_id, title, body, event_at, created_by
  ) VALUES (
    p_clinic_id, p_pet_id, p_hub_case_id, p_hub_encounter_id,
    'pet_death_corrected', 'pet', p_pet_id,
    'Óbito corrigido', trim(p_reason), now(), p_created_by_staff_id
  );

  RETURN jsonb_build_object('ok', true, 'pet', to_jsonb(v_pet));
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. RPC hub_invalidate_pet_death
-- Sugestão B: hospitalização ainda em death exige amendment_status (discharged|transferred).
-- Limpa clinical_outcome em encounter/surgery.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hub_invalidate_pet_death(
  p_clinic_id uuid,
  p_pet_id uuid,
  p_reason text,
  p_actor_user_id uuid DEFAULT NULL,
  p_created_by_staff_id uuid DEFAULT NULL,
  p_amendment_status text DEFAULT NULL,
  p_hub_case_id uuid DEFAULT NULL,
  p_hub_encounter_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_pet public.hub_pets%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Justificativa obrigatória para invalidação' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_pet
  FROM public.hub_pets
  WHERE id = p_pet_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pet não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.hub_pet_has_valid_death(v_pet) THEN
    RAISE EXCEPTION 'Pet não possui óbito válido para invalidar' USING ERRCODE = 'P0001';
  END IF;

  IF v_pet.death_source = 'hospitalization' AND v_pet.death_ref_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.hub_hospitalizations h
      WHERE h.id = v_pet.death_ref_id
        AND h.clinic_id = p_clinic_id
        AND h.status = 'death'
    ) THEN
      IF p_amendment_status IS NULL OR p_amendment_status NOT IN ('discharged', 'transferred') THEN
        RAISE EXCEPTION 'amendment_status obrigatório (discharged|transferred) para invalidar óbito de internação'
          USING ERRCODE = 'P0001';
      END IF;
      UPDATE public.hub_hospitalizations
      SET
        status = p_amendment_status,
        discharge_notes = COALESCE(discharge_notes, '') || E'\n[Invalidação de óbito] ' || trim(p_reason),
        updated_at = now()
      WHERE id = v_pet.death_ref_id AND clinic_id = p_clinic_id;
    END IF;
  END IF;

  IF v_pet.death_source = 'encounter' AND v_pet.death_ref_id IS NOT NULL THEN
    UPDATE public.hub_encounters
    SET clinical_outcome = NULL, updated_at = now()
    WHERE id = v_pet.death_ref_id AND clinic_id = p_clinic_id AND pet_id = p_pet_id;
  ELSIF v_pet.death_source = 'surgery' AND v_pet.death_ref_id IS NOT NULL THEN
    UPDATE public.hub_surgeries
    SET clinical_outcome = NULL, updated_at = now()
    WHERE id = v_pet.death_ref_id AND clinic_id = p_clinic_id AND pet_id = p_pet_id;
  END IF;

  v_before := public.hub_pet_death_snapshot(v_pet);

  UPDATE public.hub_pets
  SET
    death_invalidated_at = now(),
    death_invalidated_by = p_actor_user_id,
    death_invalidation_reason = trim(p_reason),
    updated_at = now()
  WHERE id = p_pet_id AND clinic_id = p_clinic_id;

  SELECT * INTO v_pet FROM public.hub_pets WHERE id = p_pet_id;
  v_after := public.hub_pet_death_snapshot(v_pet);

  INSERT INTO public.hub_pet_death_audit (
    clinic_id, pet_id, action, before, after, reason, death_source, death_ref_id, actor_user_id
  ) VALUES (
    p_clinic_id, p_pet_id, 'invalidated', v_before, v_after, trim(p_reason),
    v_pet.death_source, v_pet.death_ref_id, p_actor_user_id
  );

  INSERT INTO public.hub_clinical_timeline_events (
    clinic_id, pet_id, hub_case_id, hub_encounter_id,
    event_type, ref_type, ref_id, title, body, event_at, created_by
  ) VALUES (
    p_clinic_id, p_pet_id, p_hub_case_id, p_hub_encounter_id,
    'pet_death_invalidated', 'pet', p_pet_id,
    'Óbito invalidado', trim(p_reason), now(), p_created_by_staff_id
  );

  RETURN jsonb_build_object('ok', true, 'pet', to_jsonb(v_pet));
END;
$$;

COMMENT ON FUNCTION public.hub_register_pet_death IS 'Registra óbito do pet de forma atômica (metadados + desfecho clínico + audit + timeline).';
COMMENT ON FUNCTION public.hub_correct_pet_death IS 'Corrige metadados de óbito válido com justificativa e auditoria.';
COMMENT ON FUNCTION public.hub_invalidate_pet_death IS 'Invalida óbito válido; emenda desfecho clínico de origem quando aplicável.';

-- Inventário (sem backfill): internações death cujo pet ainda não tem óbito válido.
-- SELECT h.clinic_id, count(*) AS hospitalizations_death_without_pet_death
-- FROM hub_hospitalizations h
-- JOIN hub_pets p ON p.id = h.pet_id
-- WHERE h.status = 'death'
--   AND (p.deceased_at IS NULL OR p.death_invalidated_at IS NOT NULL)
-- GROUP BY h.clinic_id;

NOTIFY pgrst, 'reload schema';
