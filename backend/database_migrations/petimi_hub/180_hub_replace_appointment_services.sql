-- Substituição atômica das linhas de serviço de um agendamento (delete + insert).
-- Usado no patch de série para não deixar ocorrência sem serviço se o insert falhar.
-- Pré-requisitos: hub_appointment_services (013 + snapshots 015/019/030/099).

CREATE OR REPLACE FUNCTION public.hub_replace_appointment_services(
  p_appointment_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_row jsonb;
  v_count int := 0;
BEGIN
  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'appointment_id obrigatório' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.hub_appointment_services
  WHERE appointment_id = p_appointment_id;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('ok', true, 'inserted', 0);
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public.hub_appointment_services (
      appointment_id,
      hub_service_type_id,
      duration_minutes,
      order_index,
      pricing_porte_tier_applied,
      pricing_coat_type_applied,
      cost_amount_applied,
      sale_amount_applied,
      pricing_variant,
      pricing_source,
      special_price_id
    ) VALUES (
      p_appointment_id,
      (v_row->>'hub_service_type_id')::uuid,
      (v_row->>'duration_minutes')::int,
      COALESCE((v_row->>'order_index')::int, v_count),
      NULLIF(v_row->>'pricing_porte_tier_applied', ''),
      NULLIF(v_row->>'pricing_coat_type_applied', ''),
      CASE WHEN v_row ? 'cost_amount_applied' AND v_row->>'cost_amount_applied' IS NOT NULL
        THEN (v_row->>'cost_amount_applied')::numeric ELSE NULL END,
      CASE WHEN v_row ? 'sale_amount_applied' AND v_row->>'sale_amount_applied' IS NOT NULL
        THEN (v_row->>'sale_amount_applied')::numeric ELSE NULL END,
      CASE WHEN v_row ? 'pricing_variant' THEN v_row->'pricing_variant' ELSE NULL END,
      NULLIF(v_row->>'pricing_source', ''),
      CASE WHEN v_row ? 'special_price_id' AND NULLIF(v_row->>'special_price_id', '') IS NOT NULL
        THEN (v_row->>'special_price_id')::uuid ELSE NULL END
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', v_count);
END;
$$;

COMMENT ON FUNCTION public.hub_replace_appointment_services(uuid, jsonb) IS
  'Delete + insert atômico de hub_appointment_services para um appointment_id.';

NOTIFY pgrst, 'reload schema';
