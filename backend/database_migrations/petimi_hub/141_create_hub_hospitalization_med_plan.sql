-- PetMi Hub — Plano de medicação da internação (prescrição ativa + doses do dia).
-- Domínio próprio (≠ hub_prescriptions / receita ambulatorial).
-- Pré-requisitos: 025k, 025r, 107 (charges), moddatetime.

-- ── Ordens (identidade estável) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hub_hospitalization_med_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hospitalization_id uuid NOT NULL REFERENCES public.hub_hospitalizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'completed', 'cancelled')),
  current_version_id uuid,
  prescribed_by_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  preferred_hub_inventory_item_id uuid REFERENCES public.hub_inventory_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_hosp_med_orders_hosp
  ON public.hub_hospitalization_med_orders (hospitalization_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_hub_hosp_med_orders_clinic
  ON public.hub_hospitalization_med_orders (clinic_id, status);

DROP TRIGGER IF EXISTS update_hub_hosp_med_orders_updated_at ON public.hub_hospitalization_med_orders;
CREATE TRIGGER update_hub_hosp_med_orders_updated_at
  BEFORE UPDATE ON public.hub_hospitalization_med_orders
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE public.hub_hospitalization_med_orders IS
  'Ordem lógica de medicação na internação (cadeia de versões). Não é receita ambulatorial.';

-- ── Versões imutáveis ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hub_hospitalization_med_order_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.hub_hospitalization_med_orders(id) ON DELETE CASCADE,
  version_no integer NOT NULL DEFAULT 1 CHECK (version_no >= 1),
  medication_name text NOT NULL,
  presentation text,
  concentration text,
  dose_value numeric(14, 4) NOT NULL CHECK (dose_value > 0),
  dose_unit text NOT NULL,
  route text,
  schedule_kind text NOT NULL CHECK (schedule_kind IN ('fixed_times', 'interval')),
  times text[] NOT NULL DEFAULT '{}',
  interval_hours numeric(6, 2) CHECK (interval_hours IS NULL OR interval_hours > 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  instructions text,
  billing_mode text NOT NULL DEFAULT 'included'
    CHECK (billing_mode IN ('charge', 'included')),
  hub_service_type_id uuid REFERENCES public.hub_service_types(id) ON DELETE SET NULL,
  unit_amount numeric(14, 2) CHECK (unit_amount IS NULL OR unit_amount >= 0),
  prescribed_by_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  prescribed_at timestamptz NOT NULL DEFAULT now(),
  change_reason text,
  supersedes_version_id uuid REFERENCES public.hub_hospitalization_med_order_versions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_hosp_med_order_versions_unique UNIQUE (order_id, version_no),
  CONSTRAINT hub_hosp_med_order_versions_schedule_chk CHECK (
    (schedule_kind = 'fixed_times' AND coalesce(array_length(times, 1), 0) >= 1 AND interval_hours IS NULL)
    OR (schedule_kind = 'interval' AND interval_hours IS NOT NULL)
  ),
  CONSTRAINT hub_hosp_med_order_versions_ends_chk CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT hub_hosp_med_order_versions_change_chk CHECK (
    version_no = 1 OR (change_reason IS NOT NULL AND length(trim(change_reason)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_hub_hosp_med_order_versions_order
  ON public.hub_hospitalization_med_order_versions (order_id, version_no DESC);

ALTER TABLE public.hub_hospitalization_med_orders
  DROP CONSTRAINT IF EXISTS hub_hosp_med_orders_current_version_fk;
ALTER TABLE public.hub_hospitalization_med_orders
  ADD CONSTRAINT hub_hosp_med_orders_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES public.hub_hospitalization_med_order_versions(id)
  ON DELETE SET NULL;

COMMENT ON TABLE public.hub_hospitalization_med_order_versions IS
  'Snapshot imutável da ordem de medicação. Alteração = nova versão.';

-- ── Doses materializadas ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hub_hospitalization_med_doses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hospitalization_id uuid NOT NULL REFERENCES public.hub_hospitalizations(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.hub_hospitalization_med_orders(id) ON DELETE CASCADE,
  order_version_id uuid NOT NULL REFERENCES public.hub_hospitalization_med_order_versions(id) ON DELETE RESTRICT,
  task_date date NOT NULL,
  scheduled_for timestamptz NOT NULL,
  plan_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'administered', 'not_administered', 'cancelled')),
  not_administered_reason_code text
    CHECK (
      not_administered_reason_code IS NULL
      OR not_administered_reason_code IN (
        'recusou', 'vomito', 'via_indisponivel', 'medicamento_indisponivel',
        'prescritor_suspendeu', 'outro'
      )
    ),
  not_administered_notes text,
  administered_at timestamptz,
  administered_by_user_id uuid,
  administered_by_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  notes text,
  hospitalization_event_id uuid UNIQUE REFERENCES public.hub_hospitalization_events(id) ON DELETE SET NULL,
  hospitalization_charge_id uuid UNIQUE REFERENCES public.hub_hospitalization_charges(id) ON DELETE SET NULL,
  hub_inventory_item_id uuid REFERENCES public.hub_inventory_items(id) ON DELETE SET NULL,
  hub_inventory_lot_id uuid REFERENCES public.hub_inventory_lots(id) ON DELETE SET NULL,
  stock_movement_id uuid,
  cancelled_reason text
    CHECK (
      cancelled_reason IS NULL
      OR cancelled_reason IN ('superseded_schedule', 'order_suspended', 'discharge', 'order_cancelled')
    ),
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_hosp_med_doses_not_admin_chk CHECK (
    status <> 'not_administered'
    OR (
      not_administered_reason_code IS NOT NULL
      AND (
        not_administered_reason_code <> 'outro'
        OR (not_administered_notes IS NOT NULL AND length(trim(not_administered_notes)) > 0)
      )
    )
  ),
  CONSTRAINT hub_hosp_med_doses_admin_chk CHECK (
    status <> 'administered' OR administered_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_hosp_med_doses_plan_key_date
  ON public.hub_hospitalization_med_doses (hospitalization_id, plan_key, task_date);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_hosp_med_doses_idempotency
  ON public.hub_hospitalization_med_doses (clinic_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_hosp_med_doses_day
  ON public.hub_hospitalization_med_doses (hospitalization_id, task_date, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_hub_hosp_med_doses_pending
  ON public.hub_hospitalization_med_doses (hospitalization_id, status, scheduled_for)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS update_hub_hosp_med_doses_updated_at ON public.hub_hospitalization_med_doses;
CREATE TRIGGER update_hub_hosp_med_doses_updated_at
  BEFORE UPDATE ON public.hub_hospitalization_med_doses
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE public.hub_hospitalization_med_doses IS
  'Doses do plano de medicação da internação. Administrar cria evento (+ charge se couber) via RPC.';

-- ── RPC atômico de confirmação ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hub_complete_hospitalization_med_dose(
  p_dose_id uuid,
  p_clinic_id uuid,
  p_actor_user_id uuid,
  p_outcome text,
  p_administered_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_reason_code text DEFAULT NULL,
  p_reason_notes text DEFAULT NULL,
  p_staff_member_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_dose public.hub_hospitalization_med_doses%ROWTYPE;
  v_hosp_status text;
  v_version public.hub_hospitalization_med_order_versions%ROWTYPE;
  v_event_id uuid;
  v_charge_id uuid;
  v_payload jsonb;
  v_service_date date;
  v_unit numeric(14, 2);
  v_dosage text;
BEGIN
  IF p_outcome NOT IN ('administered', 'not_administered') THEN
    RAISE EXCEPTION 'outcome inválido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dose
  FROM public.hub_hospitalization_med_doses
  WHERE id = p_dose_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dose não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    IF v_dose.idempotency_key IS NOT NULL AND v_dose.idempotency_key = p_idempotency_key
       AND v_dose.status IN ('administered', 'not_administered') THEN
      RETURN jsonb_build_object(
        'dose', to_jsonb(v_dose),
        'idempotent', true,
        'event_id', v_dose.hospitalization_event_id,
        'charge_id', v_dose.hospitalization_charge_id
      );
    END IF;
  END IF;

  IF v_dose.status IN ('administered', 'not_administered') THEN
    IF v_dose.status = p_outcome THEN
      RETURN jsonb_build_object(
        'dose', to_jsonb(v_dose),
        'idempotent', true,
        'event_id', v_dose.hospitalization_event_id,
        'charge_id', v_dose.hospitalization_charge_id
      );
    END IF;
    RAISE EXCEPTION 'Dose já finalizada com outro resultado' USING ERRCODE = 'P0001';
  END IF;

  IF v_dose.status = 'cancelled' THEN
    RAISE EXCEPTION 'Dose cancelada' USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_hosp_status
  FROM public.hub_hospitalizations
  WHERE id = v_dose.hospitalization_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Internação não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_hosp_status <> 'active' THEN
    RAISE EXCEPTION 'Internação não está ativa' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_version
  FROM public.hub_hospitalization_med_order_versions
  WHERE id = v_dose.order_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Versão da ordem não encontrada' USING ERRCODE = 'P0002';
  END IF;

  v_dosage := trim(to_char(v_version.dose_value, 'FM9999999990.####') || ' ' || v_version.dose_unit);

  IF p_outcome = 'not_administered' THEN
    IF p_reason_code IS NULL OR p_reason_code NOT IN (
      'recusou', 'vomito', 'via_indisponivel', 'medicamento_indisponivel',
      'prescritor_suspendeu', 'outro'
    ) THEN
      RAISE EXCEPTION 'Motivo de não administração obrigatório' USING ERRCODE = '22023';
    END IF;
    IF p_reason_code = 'outro' AND (p_reason_notes IS NULL OR length(trim(p_reason_notes)) = 0) THEN
      RAISE EXCEPTION 'Observação obrigatória quando o motivo é outro' USING ERRCODE = '22023';
    END IF;

    UPDATE public.hub_hospitalization_med_doses SET
      status = 'not_administered',
      not_administered_reason_code = p_reason_code,
      not_administered_notes = NULLIF(trim(coalesce(p_reason_notes, '')), ''),
      notes = NULLIF(trim(coalesce(p_notes, '')), ''),
      administered_by_user_id = p_actor_user_id,
      administered_by_staff_id = p_staff_member_id,
      idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
      updated_at = now()
    WHERE id = v_dose.id
    RETURNING * INTO v_dose;

    RETURN jsonb_build_object(
      'dose', to_jsonb(v_dose),
      'idempotent', false,
      'event_id', NULL,
      'charge_id', NULL
    );
  END IF;

  -- administered
  v_payload := jsonb_build_object(
    'medication_name', v_version.medication_name,
    'dosage', v_dosage,
    'dose_value', v_version.dose_value,
    'dose_unit', v_version.dose_unit,
    'presentation', v_version.presentation,
    'concentration', v_version.concentration,
    'route', v_version.route,
    'med_dose_id', v_dose.id,
    'med_order_id', v_dose.order_id,
    'med_order_version_id', v_dose.order_version_id,
    'scheduled_for', v_dose.scheduled_for,
    'administered_at', coalesce(p_administered_at, now()),
    'notes', NULLIF(trim(coalesce(p_notes, '')), ''),
    'billing_mode', v_version.billing_mode
  );

  INSERT INTO public.hub_hospitalization_events (
    hospitalization_id, kind, recorded_at, payload, hub_staff_member_id
  ) VALUES (
    v_dose.hospitalization_id,
    'medication',
    coalesce(p_administered_at, now()),
    v_payload,
    p_staff_member_id
  )
  RETURNING id INTO v_event_id;

  v_service_date := (coalesce(p_administered_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
  v_unit := coalesce(v_version.unit_amount, 0);

  INSERT INTO public.hub_hospitalization_charges (
    clinic_id,
    hospitalization_id,
    charge_kind,
    hub_service_type_id,
    service_name,
    quantity,
    unit_amount,
    pricing_source,
    price_status,
    proposed_by_user_id,
    approved_by_user_id,
    approved_at,
    billing_mode,
    service_date,
    notes,
    sort_order
  ) VALUES (
    p_clinic_id,
    v_dose.hospitalization_id,
    'medication',
    v_version.hub_service_type_id,
    v_version.medication_name,
    1,
    CASE WHEN v_version.billing_mode = 'included' THEN 0 ELSE v_unit END,
    CASE WHEN v_version.hub_service_type_id IS NOT NULL THEN 'catalog' ELSE 'manual' END,
    'confirmed',
    p_actor_user_id,
    p_actor_user_id,
    now(),
    v_version.billing_mode,
    v_service_date,
    v_dosage,
    0
  )
  RETURNING id INTO v_charge_id;

  UPDATE public.hub_hospitalization_med_doses SET
    status = 'administered',
    administered_at = coalesce(p_administered_at, now()),
    administered_by_user_id = p_actor_user_id,
    administered_by_staff_id = p_staff_member_id,
    notes = NULLIF(trim(coalesce(p_notes, '')), ''),
    hospitalization_event_id = v_event_id,
    hospitalization_charge_id = v_charge_id,
    idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
    updated_at = now()
  WHERE id = v_dose.id AND status = 'pending'
  RETURNING * INTO v_dose;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conflito ao confirmar dose' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'dose', to_jsonb(v_dose),
    'idempotent', false,
    'event_id', v_event_id,
    'charge_id', v_charge_id
  );
END;
$$;

COMMENT ON FUNCTION public.hub_complete_hospitalization_med_dose IS
  'Confirma dose (administrado / não administrado) com FOR UPDATE; cria evento+charge só se administrado.';

NOTIFY pgrst, 'reload schema';
