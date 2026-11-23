-- Etapa A (complemento): teto de pagamento e status usam pago líquido efetivo.
-- net_paid = posted − Σ refunds de linha (payment_id IS NULL).
-- Evita crédito/AR fictício quando há reembolso parcial sem reverse do payment.
-- Pré-requisito: 164.

CREATE OR REPLACE FUNCTION public.hub_sum_line_refund_adjustments(p_receivable_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(COALESCE(SUM(amount), 0), 2)
  FROM public.hub_financial_adjustments
  WHERE receivable_id = p_receivable_id
    AND adjustment_type = 'refund'
    AND payment_id IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.hub_net_paid_effective(p_receivable_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(
    GREATEST(
      0,
      public.hub_sum_posted_payments(p_receivable_id)
        - public.hub_sum_line_refund_adjustments(p_receivable_id)
    ),
    2
  );
$$;

CREATE OR REPLACE FUNCTION public.hub_recalc_receivable_status(p_receivable_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_final numeric(14,2);
  v_status text;
  v_net_paid numeric(14,2);
  v_next text;
BEGIN
  SELECT final_amount, status INTO v_final, v_status
  FROM public.hub_receivables
  WHERE id = p_receivable_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebível não encontrado';
  END IF;

  IF v_status IN ('cancelled', 'refunded') THEN
    RETURN v_status;
  END IF;

  v_net_paid := public.hub_net_paid_effective(p_receivable_id);

  IF v_final <= 0.009 THEN
    IF v_net_paid > 0.009
       OR public.hub_sum_line_refund_adjustments(p_receivable_id) > 0.009
       OR public.hub_sum_posted_payments(p_receivable_id) > 0.009
    THEN
      v_next := 'refunded';
    ELSE
      v_next := 'cancelled';
    END IF;
  ELSIF v_net_paid <= 0.009 THEN
    v_next := 'pending';
  ELSIF v_net_paid >= v_final - 0.009 THEN
    v_next := 'paid';
  ELSE
    v_next := 'partially_paid';
  END IF;

  UPDATE public.hub_receivables SET status = v_next WHERE id = p_receivable_id;
  RETURN v_next;
END;
$$;

-- Substitui só o trecho de teto em hub_post_payment via REPLACE completo
-- (mantém assinatura e comportamento; remaining = final − net_paid).
CREATE OR REPLACE FUNCTION public.hub_post_payment(
  p_clinic_id uuid,
  p_receivable_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_created_by_user_id uuid DEFAULT NULL,
  p_cash_session_id uuid DEFAULT NULL,
  p_installments integer DEFAULT 1,
  p_payment_date timestamptz DEFAULT now(),
  p_effective_payment_date timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_tendered_amount numeric DEFAULT NULL,
  p_change_amount numeric DEFAULT NULL,
  p_posting_kind text DEFAULT 'operational',
  p_payment_timing text DEFAULT 'on_checkout',
  p_correction_reason text DEFAULT NULL,
  p_corrected_by_user_id uuid DEFAULT NULL,
  p_card_fee_rate_percent numeric DEFAULT NULL,
  p_card_fee_amount numeric DEFAULT NULL,
  p_net_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.hub_receivables%ROWTYPE;
  v_net_paid numeric(14,2);
  v_remaining numeric(14,2);
  v_amount numeric(14,2);
  v_pay public.hub_payments%ROWTYPE;
  v_status text;
  v_eff timestamptz;
  v_installments integer;
BEGIN
  v_amount := round(p_amount::numeric, 2);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido' USING ERRCODE = 'P0001';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_pay
    FROM public.hub_payments
    WHERE clinic_id = p_clinic_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      IF v_pay.receivable_id IS DISTINCT FROM p_receivable_id
         OR v_pay.payment_method IS DISTINCT FROM p_payment_method
         OR abs(v_pay.amount - v_amount) > 0.02 THEN
        RAISE EXCEPTION 'idempotency_key já usada com payload diferente' USING ERRCODE = 'P0001';
      END IF;
      v_status := public.hub_recalc_receivable_status(p_receivable_id);
      RETURN jsonb_build_object(
        'ok', true,
        'replayed', true,
        'payment', to_jsonb(v_pay),
        'receivable_status', v_status
      );
    END IF;
  END IF;

  SELECT * INTO v_rec
  FROM public.hub_receivables
  WHERE id = p_receivable_id
    AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebível não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_rec.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Recebível não aceita pagamentos neste estado' USING ERRCODE = 'P0001';
  END IF;

  IF v_rec.net_amount_at_sale IS NULL THEN
    PERFORM public.hub_freeze_net_amount_at_sale(p_receivable_id);
    SELECT * INTO v_rec FROM public.hub_receivables WHERE id = p_receivable_id;
  END IF;

  PERFORM 1 FROM public.hub_payments
  WHERE receivable_id = p_receivable_id
  FOR UPDATE;

  v_net_paid := public.hub_net_paid_effective(p_receivable_id);
  v_remaining := round(v_rec.final_amount - v_net_paid, 2);
  IF v_amount > v_remaining + 0.02 THEN
    RAISE EXCEPTION 'Valor excede o saldo em aberto (%)', to_char(v_remaining, 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  v_eff := COALESCE(p_effective_payment_date, p_payment_date, now());
  v_installments := GREATEST(1, LEAST(99, COALESCE(p_installments, 1)));
  IF p_payment_method = 'debit_card' THEN
    v_installments := 1;
  END IF;

  INSERT INTO public.hub_payments (
    clinic_id, receivable_id, cash_session_id, amount, payment_method, installments,
    payment_date, effective_payment_date, notes, created_by_user_id, status, posting_kind,
    idempotency_key, tendered_amount, change_amount, payment_timing, correction_reason,
    corrected_by_user_id, card_fee_rate_percent, card_fee_amount, net_amount
  ) VALUES (
    p_clinic_id, p_receivable_id, p_cash_session_id, v_amount, p_payment_method, v_installments,
    COALESCE(p_payment_date, now()), v_eff, p_notes, p_created_by_user_id, 'posted',
    COALESCE(p_posting_kind, 'operational'), p_idempotency_key, p_tendered_amount, p_change_amount,
    COALESCE(NULLIF(trim(p_payment_timing), ''), 'on_checkout'), p_correction_reason,
    p_corrected_by_user_id, p_card_fee_rate_percent, p_card_fee_amount, p_net_amount
  )
  RETURNING * INTO v_pay;

  v_status := public.hub_recalc_receivable_status(p_receivable_id);

  RETURN jsonb_build_object(
    'ok', true,
    'replayed', false,
    'payment', to_jsonb(v_pay),
    'receivable_status', v_status
  );
EXCEPTION
  WHEN unique_violation THEN
    IF p_idempotency_key IS NOT NULL THEN
      SELECT * INTO v_pay
      FROM public.hub_payments
      WHERE clinic_id = p_clinic_id
        AND idempotency_key = p_idempotency_key
      LIMIT 1;
      IF FOUND THEN
        IF v_pay.receivable_id IS DISTINCT FROM p_receivable_id
           OR v_pay.payment_method IS DISTINCT FROM p_payment_method
           OR abs(v_pay.amount - v_amount) > 0.02 THEN
          RAISE EXCEPTION 'idempotency_key já usada com payload diferente' USING ERRCODE = 'P0001';
        END IF;
        v_status := public.hub_recalc_receivable_status(p_receivable_id);
        RETURN jsonb_build_object(
          'ok', true,
          'replayed', true,
          'payment', to_jsonb(v_pay),
          'receivable_status', v_status
        );
      END IF;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.hub_net_paid_effective(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_net_paid_effective(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.hub_sum_line_refund_adjustments(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_sum_line_refund_adjustments(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.hub_recalc_receivable_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_recalc_receivable_status(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.hub_post_payment(
  uuid, uuid, numeric, text, uuid, uuid, integer, timestamptz, timestamptz, text,
  uuid, numeric, numeric, text, text, text, uuid, numeric, numeric, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_post_payment(
  uuid, uuid, numeric, text, uuid, uuid, integer, timestamptz, timestamptz, text,
  uuid, numeric, numeric, text, text, text, uuid, numeric, numeric, numeric
) TO service_role;

COMMENT ON FUNCTION public.hub_net_paid_effective IS
  'Pago líquido efetivo = posted − refunds de linha (sem double-count de payment reversed).';

NOTIFY pgrst, 'reload schema';
