-- Fix: devolução total em dinheiro não pode sangrar E reverter o payment cash (−2× na gaveta).
-- Sintoma QA: entrada some + Sangria −valor → gaveta −2× o reembolso (deveria voltar ao pré-venda).
-- Executar depois de 164_hub_return_receivable_product_lines.sql.

ALTER TABLE public.hub_cash_movements
  ADD COLUMN IF NOT EXISTS financial_adjustment_id uuid
    REFERENCES public.hub_financial_adjustments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hub_cash_movements_financial_adjustment
  ON public.hub_cash_movements (financial_adjustment_id)
  WHERE financial_adjustment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hub_return_receivable_product_lines(
  p_clinic_id uuid,
  p_receivable_id uuid,
  p_user_id uuid,
  p_reason text,
  p_condition text,
  p_line_ids uuid[],
  p_refund_method text DEFAULT NULL,
  p_refund_effective_date date DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.hub_receivables%ROWTYPE;
  v_line public.hub_receivable_lines%ROWTYPE;
  v_existing public.hub_product_return_events%ROWTYPE;
  v_req public.hub_product_return_requests%ROWTYPE;
  v_payload_hash text;
  v_sorted_ids uuid[];
  v_line_id uuid;
  v_commercial numeric(14,2) := 0;
  v_line_gross numeric(14,2);
  v_factor numeric;
  v_net numeric(14,2);
  v_posted numeric(14,2);
  v_line_refunds_before numeric(14,2);
  v_returned_before numeric(14,2);
  v_returned_after numeric(14,2);
  v_final_after numeric(14,2);
  v_overpay_target numeric(14,2);
  v_financial_now numeric(14,2);
  v_adj_id uuid := NULL;
  v_event_id uuid;
  v_mov_id uuid;
  v_restored int := 0;
  v_skipped int := 0;
  v_unsellable int := 0;
  v_status text;
  v_warning text := NULL;
  v_notes text;
  v_open_session uuid;
  v_session_status text;
  v_response jsonb;
  v_line_amounts jsonb := '[]'::jsonb;
  v_alloc numeric(14,2);
  v_pay public.hub_payments%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key obrigatória' USING ERRCODE = 'P0001';
  END IF;
  IF p_condition IS NULL OR p_condition NOT IN ('sellable', 'unsellable') THEN
    RAISE EXCEPTION 'condition inválida (sellable|unsellable)' USING ERRCODE = 'P0001';
  END IF;
  IF p_line_ids IS NULL OR coalesce(array_length(p_line_ids, 1), 0) < 1 THEN
    RAISE EXCEPTION 'Selecione ao menos um produto para devolver' USING ERRCODE = 'P0001';
  END IF;
  IF length(trim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Motivo obrigatório (mín. 3 caracteres)' USING ERRCODE = 'P0001';
  END IF;

  -- Normaliza payload para hash estável (sort + distinct)
  SELECT array_agg(x ORDER BY x) INTO v_sorted_ids
  FROM (SELECT DISTINCT unnest(p_line_ids) AS x) s;
  IF coalesce(array_length(v_sorted_ids, 1), 0) <> coalesce(array_length(p_line_ids, 1), 0) THEN
    RAISE EXCEPTION 'line_ids contém duplicatas' USING ERRCODE = 'P0001';
  END IF;

  v_payload_hash := md5(
    p_receivable_id::text || '|' || p_condition || '|' ||
    array_to_string(v_sorted_ids::text[], ',') || '|' ||
    coalesce(p_refund_method, '') || '|' ||
    coalesce(p_refund_effective_date::text, '') || '|' ||
    trim(p_reason)
  );

  -- Reserva atômica da chave (advisory + unique)
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_clinic_id::text || ':' || p_idempotency_key::text, 0)
  );

  SELECT * INTO v_req
  FROM public.hub_product_return_requests
  WHERE clinic_id = p_clinic_id
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_req.receivable_id IS DISTINCT FROM p_receivable_id THEN
      RAISE EXCEPTION
        'idempotency_key já usada em outro recebível'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_req.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION
        'idempotency_key já usada com payload diferente'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_req.response IS NOT NULL THEN
      RETURN v_req.response || jsonb_build_object('replayed', true);
    END IF;
    RAISE EXCEPTION 'Operação idempotente em andamento sem resposta' USING ERRCODE = 'P0001';
  END IF;

  -- 1) Lock recebível
  SELECT * INTO v_rec
  FROM public.hub_receivables
  WHERE id = p_receivable_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebível não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_rec.status = 'cancelled' THEN
    RAISE EXCEPTION 'Recebível cancelado — não é possível devolver produtos.' USING ERRCODE = 'P0001';
  END IF;

  -- Snapshot: exige evidência confiável
  v_net := public.hub_resolve_net_amount_at_sale(v_rec);
  IF v_rec.net_amount_at_sale IS NULL THEN
    -- Congela se reconstrutível; senão bloqueia operações novas com snapshot ambíguo
    IF EXISTS (
      SELECT 1 FROM public.hub_product_return_events e WHERE e.receivable_id = p_receivable_id
    ) AND COALESCE(v_rec.returned_amount, 0) = 0 AND v_rec.final_amount = v_rec.original_amount THEN
      -- Caso ambíguo típico pós-bug: não inventar para novo reembolso
      RAISE EXCEPTION
        'Recebível legado sem snapshot confiável de líquido na venda. Bloqueado para devolução automática; revise manualmente.'
        USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.hub_receivables
    SET net_amount_at_sale = v_net
    WHERE id = p_receivable_id AND net_amount_at_sale IS NULL;
    v_rec.net_amount_at_sale := v_net;
  ELSE
    v_net := round(v_rec.net_amount_at_sale, 2);
  END IF;

  -- 2) Lock payments
  PERFORM 1 FROM public.hub_payments WHERE receivable_id = p_receivable_id FOR UPDATE;

  v_posted := public.hub_sum_posted_payments(p_receivable_id);
  v_line_refunds_before := public.hub_sum_line_refund_adjustments(p_receivable_id);
  v_returned_before := round(COALESCE(v_rec.returned_amount, 0), 2);

  -- Valida linhas e soma comercial (rateio pelo desconto da venda)
  IF v_rec.original_amount > 0.009 THEN
    v_factor := v_net / v_rec.original_amount;
  ELSE
    v_factor := 1;
  END IF;

  FOREACH v_line_id IN ARRAY v_sorted_ids LOOP
    SELECT * INTO v_line
    FROM public.hub_receivable_lines
    WHERE id = v_line_id
      AND receivable_id = p_receivable_id
      AND clinic_id = p_clinic_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha % não encontrada nesta cobrança', v_line_id USING ERRCODE = 'P0002';
    END IF;
    IF v_line.line_kind IS DISTINCT FROM 'product' THEN
      RAISE EXCEPTION 'Só linhas de produto podem ser devolvidas' USING ERRCODE = 'P0001';
    END IF;
    IF v_line.hub_inventory_item_id IS NULL OR v_line.hub_inventory_lot_id IS NULL THEN
      RAISE EXCEPTION 'Produto sem vínculo de estoque — não é possível devolver' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_existing
    FROM public.hub_product_return_events
    WHERE clinic_id = p_clinic_id AND receivable_line_id = v_line.id;
    IF FOUND THEN
      RAISE EXCEPTION 'Um ou mais itens selecionados já foram devolvidos' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.hub_financial_adjustment_lines al
      WHERE al.receivable_line_id = v_line.id
    ) THEN
      RAISE EXCEPTION 'Linha já possui reembolso comercial registrado' USING ERRCODE = 'P0001';
    END IF;

    v_alloc := round(v_line.line_total * v_factor, 2);
    v_commercial := round(v_commercial + v_alloc, 2);
    v_line_amounts := v_line_amounts || jsonb_build_array(jsonb_build_object(
      'line_id', v_line.id,
      'amount', v_alloc,
      'item_id', v_line.hub_inventory_item_id,
      'lot_id', v_line.hub_inventory_lot_id,
      'qty', v_line.quantity,
      'unit_cost', v_line.unit_cost_amount
    ));
  END LOOP;

  IF round(v_returned_before + v_commercial, 2) > v_net + 0.009 THEN
    RAISE EXCEPTION 'Valor comercial devolvido excede o líquido da venda' USING ERRCODE = 'P0001';
  END IF;

  v_returned_after := round(v_returned_before + v_commercial, 2);
  v_final_after := round(GREATEST(0, v_net - v_returned_after), 2);
  v_overpay_target := round(GREATEST(0, v_posted - v_final_after), 2);
  v_financial_now := round(GREATEST(0, v_overpay_target - v_line_refunds_before), 2);

  IF v_financial_now > 0.009 THEN
    IF p_refund_method IS NULL OR p_refund_effective_date IS NULL THEN
      RAISE EXCEPTION
        'Há valor financeiro a devolver (R$ %). Informe a forma e a data do reembolso.',
        to_char(v_financial_now, 'FM999999990.00')
        USING ERRCODE = 'P0001';
    END IF;
    IF p_refund_method = 'customer_credit' AND v_rec.guardian_id IS NULL THEN
      RAISE EXCEPTION
        'Recebível sem tutor — não é possível reembolsar em crédito. Escolha Pix, dinheiro ou outra forma.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_notes := COALESCE(NULLIF(trim(p_reason), ''), 'Devolução de mercadoria');

  -- Adjustment financeiro (só se houver caixa/crédito a devolver)
  IF v_financial_now > 0.009 THEN
    INSERT INTO public.hub_financial_adjustments (
      clinic_id, receivable_id, payment_id, adjustment_type, amount, reason,
      created_by_user_id, refund_method, refund_effective_date
    ) VALUES (
      p_clinic_id, p_receivable_id, NULL, 'refund', v_financial_now,
      'Devolução de produto: ' || v_notes,
      p_user_id, p_refund_method, p_refund_effective_date
    )
    RETURNING id INTO v_adj_id;

    -- Crédito tutor na mesma TX
    IF p_refund_method = 'customer_credit' THEN
      INSERT INTO public.hub_customer_credit_movements (
        clinic_id, guardian_id, direction, amount, reason,
        comanda_id, receivable_id, payment_method, cash_session_id, notes, created_by_user_id
      ) VALUES (
        p_clinic_id, v_rec.guardian_id, 'in', v_financial_now,
        'Reembolso por devolução de produto: ' || v_notes,
        v_rec.comanda_id, p_receivable_id, NULL, NULL,
        'Devolução de mercadoria — crédito do tutor', p_user_id
      );
    ELSIF p_refund_method = 'cash' THEN
      -- Gaveta: sangria (withdrawal) só enquanto o payment cash permanece posted
      -- (devolução parcial). Se a venda zera neste TX, o soft-reverse do payment
      -- já remove o cash_in — gravar withdrawal aqui descontaria em dobro (−2×).
      IF v_final_after > 0.009 THEN
        SELECT id, status INTO v_open_session, v_session_status
        FROM public.hub_cash_sessions
        WHERE clinic_id = p_clinic_id
          AND unit_id = v_rec.unit_id
          AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1;

        IF v_open_session IS NOT NULL THEN
          INSERT INTO public.hub_cash_movements (
            clinic_id, cash_session_id, movement_type, amount, notes,
            created_by_user_id, financial_adjustment_id
          ) VALUES (
            p_clinic_id, v_open_session, 'withdrawal', v_financial_now,
            'Reembolso devolução de produto: ' || v_notes, p_user_id, v_adj_id
          );
        ELSE
          v_warning := 'Reembolso em dinheiro registrado sem sessão de caixa aberta — ajuste a gaveta manualmente se necessário.';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Vínculo comercial por linha (sempre, para auditoria e UNIQUE)
  IF v_adj_id IS NULL AND v_commercial > 0.009 THEN
    -- Adjustment comercial 0 financeiro: ainda registra adjustment com amount=commercial
    -- para rastreio? Preferimos adjustment só quando financial>0; linhas comerciais
    -- usam return events. Para UNIQUE anti double-count sem adjustment financeiro,
    -- criamos adjustment amount=0? CHECK amount>0 pode existir — verificar.
    -- Em vez disso: adjustment com amount = commercial e refund_method null quando financial=0
    -- NÃO: isso distorceria sum_line_refunds. Usar amount = financial apenas.
    -- Anti double-count fica em hub_product_return_events UNIQUE.
    NULL;
  END IF;

  IF v_adj_id IS NOT NULL THEN
    INSERT INTO public.hub_financial_adjustment_lines (
      clinic_id, adjustment_id, receivable_id, receivable_line_id, amount
    )
    SELECT
      p_clinic_id,
      v_adj_id,
      p_receivable_id,
      (elem->>'line_id')::uuid,
      -- Rateia o financeiro proporcional ao comercial da linha
      CASE WHEN v_commercial > 0.009
        THEN round(v_financial_now * ((elem->>'amount')::numeric / v_commercial), 2)
        ELSE 0
      END
    FROM jsonb_array_elements(v_line_amounts) elem;
  END IF;

  -- Eventos de estoque + movements
  FOR v_line IN
    SELECT l.*
    FROM public.hub_receivable_lines l
    WHERE l.id = ANY (v_sorted_ids)
    ORDER BY l.sort_order NULLS LAST, l.created_at NULLS LAST, l.id
  LOOP
    INSERT INTO public.hub_product_return_events (
      clinic_id, receivable_id, receivable_line_id, item_id, lot_id, qty,
      condition, reason, created_by
    ) VALUES (
      p_clinic_id, p_receivable_id, v_line.id, v_line.hub_inventory_item_id, v_line.hub_inventory_lot_id,
      v_line.quantity, p_condition, v_notes, p_user_id
    )
    RETURNING id INTO v_event_id;

    IF p_condition = 'unsellable' THEN
      v_unsellable := v_unsellable + 1;
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.hub_stock_movements (
        clinic_id, item_id, lot_id, movement_type, qty, unit_cost, notes,
        reference_type, reference_id, created_by
      ) VALUES (
        p_clinic_id, v_line.hub_inventory_item_id, v_line.hub_inventory_lot_id,
        'adjustment_in', v_line.quantity, v_line.unit_cost_amount, v_notes,
        'hub_receivable_product_restock', v_line.id, p_user_id
      )
      RETURNING id INTO v_mov_id;
      v_restored := v_restored + 1;
    EXCEPTION
      WHEN unique_violation THEN
        v_skipped := v_skipped + 1;
    END;
  END LOOP;

  -- Atualiza recebível: NÃO muta original_amount
  UPDATE public.hub_receivables
  SET
    returned_amount = v_returned_after,
    final_amount = v_final_after,
    net_amount_at_sale = COALESCE(net_amount_at_sale, v_net)
  WHERE id = p_receivable_id;

  -- Soft-reverse payments restantes quando líquido zera (sem 2º adjustment de valor)
  IF v_final_after <= 0.009 AND v_posted > 0.009 THEN
    FOR v_pay IN
      SELECT * FROM public.hub_payments
      WHERE receivable_id = p_receivable_id AND status = 'posted'
      FOR UPDATE
    LOOP
      UPDATE public.hub_payments SET
        status = 'reversed',
        reversed_at = now(),
        reversed_by_user_id = p_user_id,
        reversal_reason = 'Venda zerada após devolução de produtos: ' || v_notes,
        reversal_mode = 'refund',
        reversal_adjustment_id = v_adj_id
      WHERE id = v_pay.id;
    END LOOP;
    v_posted := 0;

    -- Anula sangrias de reembolso cash já lançadas nesta venda (devoluções parciais
    -- anteriores). O reverse do payment cash já tirou o valor de Entradas; manter
    -- as sangrias deixaria a gaveta em −2× o reembolsado.
    DELETE FROM public.hub_cash_movements m
    USING public.hub_financial_adjustments a
    WHERE m.financial_adjustment_id = a.id
      AND a.clinic_id = p_clinic_id
      AND a.receivable_id = p_receivable_id
      AND a.adjustment_type = 'refund'
      AND a.refund_method = 'cash'
      AND a.payment_id IS NULL
      AND m.movement_type = 'withdrawal';

    -- Legado (movimentos sem financial_adjustment_id): remove sangrias de reembolso
    -- na(s) sessão(ões) do pagamento cash desta cobrança, batendo valor com adjustments.
    DELETE FROM public.hub_cash_movements m
    WHERE m.movement_type = 'withdrawal'
      AND m.financial_adjustment_id IS NULL
      AND m.notes LIKE 'Reembolso devolução de produto:%'
      AND m.cash_session_id IN (
        SELECT DISTINCT p.cash_session_id
        FROM public.hub_payments p
        WHERE p.receivable_id = p_receivable_id
          AND p.payment_method = 'cash'
          AND p.cash_session_id IS NOT NULL
      )
      AND m.amount IN (
        SELECT a.amount
        FROM public.hub_financial_adjustments a
        WHERE a.clinic_id = p_clinic_id
          AND a.receivable_id = p_receivable_id
          AND a.adjustment_type = 'refund'
          AND a.refund_method = 'cash'
          AND a.payment_id IS NULL
      );
  END IF;

  -- Status
  IF v_final_after <= 0.009 THEN
    IF v_posted > 0.009 OR v_line_refunds_before > 0.009 OR v_financial_now > 0.009
       OR EXISTS (
         SELECT 1 FROM public.hub_payments
         WHERE receivable_id = p_receivable_id AND status = 'reversed'
       )
    THEN
      v_status := 'refunded';
    ELSE
      v_status := 'cancelled';
    END IF;
    UPDATE public.hub_receivables SET status = v_status WHERE id = p_receivable_id;
  ELSE
    v_status := public.hub_recalc_receivable_status(p_receivable_id);
  END IF;

  IF p_condition = 'unsellable' AND v_unsellable > 0 THEN
    v_warning := coalesce(v_warning || ' ', '') ||
      format('Devolução registrada sem reentrada ao disponível (%s linha(s)).', v_unsellable);
  ELSIF v_restored > 0 OR v_skipped > 0 THEN
    v_warning := coalesce(v_warning || ' ', '') ||
      format('Estoque reentrado (%s nova(s), %s já registrada(s)).', v_restored, v_skipped);
  END IF;
  IF v_financial_now > 0.009 THEN
    v_warning := coalesce(v_warning || ' ', '') ||
      format('Reembolso financeiro de R$ %s (comercial devolvido R$ %s).',
        to_char(v_financial_now, 'FM999999990.00'),
        to_char(v_commercial, 'FM999999990.00'));
  ELSIF v_commercial > 0.009 THEN
    v_warning := coalesce(v_warning || ' ', '') ||
      format('Devolução comercial de R$ %s sem reembolso financeiro (saldo a receber ajustado).',
        to_char(v_commercial, 'FM999999990.00'));
  END IF;

  v_response := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'receivable_status', v_status,
    'commercial_returned', v_commercial,
    'refund_amount', v_financial_now,
    'financial_refund', v_financial_now,
    'balance_due', round(GREATEST(0, v_final_after - public.hub_sum_posted_payments(p_receivable_id)), 2),
    'final_amount', v_final_after,
    'returned_amount', v_returned_after,
    'adjustment_id', v_adj_id,
    'stock_restored', v_restored,
    'stock_unsellable', v_unsellable,
    'stock_skipped', v_skipped,
    'warning', v_warning
  );

  INSERT INTO public.hub_product_return_requests (
    clinic_id, receivable_id, idempotency_key, payload_hash, response, created_by_user_id
  ) VALUES (
    p_clinic_id, p_receivable_id, p_idempotency_key, v_payload_hash, v_response, p_user_id
  );

  RETURN v_response;
END;
$$;


COMMENT ON FUNCTION public.hub_return_receivable_product_lines IS
  'Devolução por linhas de produto + reembolso financeiro. Cash: withdrawal só em parcial; ao zerar a venda, reverse do payment remove cash_in e anula sangrias de reembolso vinculadas (anti double-count na gaveta).';

REVOKE ALL ON FUNCTION public.hub_return_receivable_product_lines(
  uuid, uuid, uuid, text, text, uuid[], text, date, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_return_receivable_product_lines(
  uuid, uuid, uuid, text, text, uuid[], text, date, uuid
) TO service_role;

NOTIFY pgrst, 'reload schema';
