-- Devolução física de produtos: auditoria sem distorcer saldo + reentrada atômica.
-- Pré-requisitos: 008 (hub_stock_movements), 035 (hub_receivables/lines), 161 (padrão RPC).

-- Evento auditável (sellable e unsellable). Unsellable NÃO gera movimento de saldo.
CREATE TABLE IF NOT EXISTS public.hub_product_return_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  receivable_id uuid NOT NULL REFERENCES public.hub_receivables(id) ON DELETE CASCADE,
  receivable_line_id uuid NOT NULL REFERENCES public.hub_receivable_lines(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.hub_inventory_items(id) ON DELETE RESTRICT,
  lot_id uuid REFERENCES public.hub_inventory_lots(id) ON DELETE SET NULL,
  qty numeric(14,4) NOT NULL CHECK (qty > 0),
  condition text NOT NULL CHECK (condition IN ('sellable', 'unsellable')),
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_hub_product_return_line UNIQUE (clinic_id, receivable_line_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_product_return_events_receivable
  ON public.hub_product_return_events (clinic_id, receivable_id, created_at DESC);

COMMENT ON TABLE public.hub_product_return_events IS
  'Devolução física confirmada por linha de recebível. sellable implica adjustment_in; unsellable só audita (não aumenta disponível).';

-- Idempotência de movimentos com referência (anti race TOCTOU no insert TS).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_stock_movements_clinic_type_ref
  ON public.hub_stock_movements (clinic_id, movement_type, reference_type, reference_id)
  WHERE reference_id IS NOT NULL AND reference_type IS NOT NULL;

-- Confirma devolução física de todas (ou subset) das linhas de produto — atômico.
CREATE OR REPLACE FUNCTION public.hub_confirm_receivable_product_return(
  p_clinic_id uuid,
  p_receivable_id uuid,
  p_condition text,
  p_reason text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_line_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_rec public.hub_receivables%ROWTYPE;
  v_line public.hub_receivable_lines%ROWTYPE;
  v_existing public.hub_product_return_events%ROWTYPE;
  v_event_id uuid;
  v_mov_id uuid;
  v_restored int := 0;
  v_skipped int := 0;
  v_unsellable int := 0;
  v_events jsonb := '[]'::jsonb;
  v_notes text;
BEGIN
  IF p_condition IS NULL OR p_condition NOT IN ('sellable', 'unsellable') THEN
    RAISE EXCEPTION 'condition inválida (sellable|unsellable)' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_rec
  FROM public.hub_receivables
  WHERE id = p_receivable_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebível não encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_notes := COALESCE(NULLIF(trim(p_reason), ''), 'Devolução física confirmada');

  FOR v_line IN
    SELECT *
    FROM public.hub_receivable_lines
    WHERE receivable_id = p_receivable_id
      AND clinic_id = p_clinic_id
      AND line_kind = 'product'
      AND hub_inventory_item_id IS NOT NULL
      AND hub_inventory_lot_id IS NOT NULL
      AND quantity > 0
      AND (p_line_ids IS NULL OR id = ANY (p_line_ids))
    ORDER BY sort_order NULLS LAST, created_at NULLS LAST, id
  LOOP
    SELECT * INTO v_existing
    FROM public.hub_product_return_events
    WHERE clinic_id = p_clinic_id
      AND receivable_line_id = v_line.id;

    IF FOUND THEN
      IF v_existing.condition IS DISTINCT FROM p_condition THEN
        RAISE EXCEPTION
          'Linha % já devolvida como %',
          v_line.id,
          v_existing.condition
          USING ERRCODE = 'P0001';
      END IF;
      v_skipped := v_skipped + 1;
      IF p_condition = 'unsellable' THEN
        v_unsellable := v_unsellable + 1;
      END IF;
      v_events := v_events || jsonb_build_array(jsonb_build_object(
        'id', v_existing.id,
        'receivable_line_id', v_line.id,
        'condition', v_existing.condition,
        'replayed', true
      ));
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.hub_product_return_events (
        clinic_id, receivable_id, receivable_line_id, item_id, lot_id, qty,
        condition, reason, created_by
      ) VALUES (
        p_clinic_id, p_receivable_id, v_line.id, v_line.hub_inventory_item_id, v_line.hub_inventory_lot_id,
        v_line.quantity, p_condition, v_notes, p_created_by
      )
      RETURNING id INTO v_event_id;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT * INTO v_existing
        FROM public.hub_product_return_events
        WHERE clinic_id = p_clinic_id AND receivable_line_id = v_line.id;
        IF FOUND AND v_existing.condition IS NOT DISTINCT FROM p_condition THEN
          v_skipped := v_skipped + 1;
          IF p_condition = 'unsellable' THEN
            v_unsellable := v_unsellable + 1;
          END IF;
          v_events := v_events || jsonb_build_array(jsonb_build_object(
            'id', v_existing.id,
            'receivable_line_id', v_line.id,
            'condition', v_existing.condition,
            'replayed', true
          ));
          CONTINUE;
        END IF;
        RAISE;
    END;

    IF p_condition = 'unsellable' THEN
      v_unsellable := v_unsellable + 1;
      v_events := v_events || jsonb_build_array(jsonb_build_object(
        'id', v_event_id,
        'receivable_line_id', v_line.id,
        'condition', 'unsellable',
        'replayed', false
      ));
      CONTINUE;
    END IF;

    -- sellable: reentra disponível (adjustment_in), idempotente por referência.
    BEGIN
      INSERT INTO public.hub_stock_movements (
        clinic_id, item_id, lot_id, movement_type, qty, unit_cost, notes,
        reference_type, reference_id, created_by
      ) VALUES (
        p_clinic_id,
        v_line.hub_inventory_item_id,
        v_line.hub_inventory_lot_id,
        'adjustment_in',
        v_line.quantity,
        v_line.unit_cost_amount,
        v_notes,
        'hub_receivable_product_restock',
        v_line.id,
        p_created_by
      )
      RETURNING id INTO v_mov_id;
      v_restored := v_restored + 1;
    EXCEPTION
      WHEN unique_violation THEN
        v_skipped := v_skipped + 1;
        SELECT id INTO v_mov_id
        FROM public.hub_stock_movements
        WHERE clinic_id = p_clinic_id
          AND movement_type = 'adjustment_in'
          AND reference_type = 'hub_receivable_product_restock'
          AND reference_id = v_line.id
        LIMIT 1;
    END;

    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'id', v_event_id,
      'receivable_line_id', v_line.id,
      'condition', 'sellable',
      'movement_id', v_mov_id,
      'replayed', false
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'restored', v_restored,
    'skipped', v_skipped,
    'unsellable', v_unsellable,
    'events', v_events
  );
END;
$$;

COMMENT ON FUNCTION public.hub_confirm_receivable_product_return IS
  'Confirma devolução física por linha (FOR UPDATE no recebível). sellable → adjustment_in; unsellable → só auditoria.';

GRANT EXECUTE ON FUNCTION public.hub_confirm_receivable_product_return(
  uuid, uuid, text, text, uuid, uuid[]
) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
