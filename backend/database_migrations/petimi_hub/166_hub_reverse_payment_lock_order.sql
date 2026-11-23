-- Ordem canônica de locks: receivable → payments (alinha com hub_return / hub_post).
-- Elimina corrida return × reverse em que ambos commitavam.

CREATE OR REPLACE FUNCTION public.hub_reverse_payment(
  p_payment_id uuid,
  p_clinic_id uuid,
  p_user_id uuid,
  p_reason text,
  p_mode text DEFAULT 'payment_reversal',
  p_refund_method text DEFAULT NULL,
  p_refund_effective_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay public.hub_payments%ROWTYPE;
  v_rec public.hub_receivables%ROWTYPE;
  v_receivable_id uuid;
  v_adj_id uuid;
  v_adj_type text;
  v_session_status text;
  v_warning text := NULL;
  v_rec_status text;
  v_post_type text;
  v_paid numeric(14,2);
  v_projected numeric(14,2);
BEGIN
  IF p_mode NOT IN ('payment_reversal', 'refund') THEN
    RAISE EXCEPTION 'mode inválido';
  END IF;
  IF length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Motivo obrigatório (mín. 3 caracteres)';
  END IF;
  IF p_mode = 'refund' THEN
    IF p_refund_method IS NULL OR p_refund_effective_date IS NULL THEN
      RAISE EXCEPTION 'Reembolso exige refund_method e refund_effective_date';
    END IF;
  END IF;

  -- Lookup sem lock para descobrir o recebível (ordem canônica).
  SELECT receivable_id INTO v_receivable_id
  FROM public.hub_payments
  WHERE id = p_payment_id AND clinic_id = p_clinic_id;

  IF v_receivable_id IS NULL THEN
    RAISE EXCEPTION 'Pagamento não encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- 1) Lock recebível
  SELECT * INTO v_rec
  FROM public.hub_receivables
  WHERE id = v_receivable_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebível não encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- 2) Lock payment
  SELECT * INTO v_pay
  FROM public.hub_payments
  WHERE id = p_payment_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_pay.status = 'reversed' THEN
    RAISE EXCEPTION 'Pagamento já estornado' USING ERRCODE = 'P0001';
  END IF;

  -- Devolução parcial: bloquear reverse integral que reabra saldo incoerente.
  IF COALESCE(v_rec.returned_amount, 0) > 0.009 THEN
    v_paid := public.hub_sum_posted_payments(v_pay.receivable_id);
    v_projected := round(v_paid - v_pay.amount, 2);
    IF v_projected < v_rec.final_amount - 0.009 THEN
      RAISE EXCEPTION
        'Há devolução parcial de produtos neste recebível. Não é possível anular/reembolsar este pagamento por completo sem incoerência de saldo. Devolva os itens restantes pela devolução de mercadoria.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_mode = 'refund' AND p_refund_method = 'customer_credit' AND v_rec.guardian_id IS NULL THEN
    RAISE EXCEPTION
      'Recebível sem tutor — não é possível reembolsar em crédito. Escolha Pix, dinheiro ou outra forma.'
      USING ERRCODE = 'P0001';
  END IF;

  v_adj_type := CASE WHEN p_mode = 'refund' THEN 'refund' ELSE 'payment_reversal' END;

  INSERT INTO public.hub_financial_adjustments (
    clinic_id, receivable_id, payment_id, adjustment_type, amount, reason,
    created_by_user_id, refund_method, refund_effective_date
  ) VALUES (
    p_clinic_id,
    v_pay.receivable_id,
    v_pay.id,
    v_adj_type,
    v_pay.amount,
    trim(p_reason),
    p_user_id,
    CASE WHEN p_mode = 'refund' THEN p_refund_method ELSE NULL END,
    CASE WHEN p_mode = 'refund' THEN p_refund_effective_date ELSE NULL END
  )
  RETURNING id INTO v_adj_id;

  UPDATE public.hub_payments SET
    status = 'reversed',
    reversed_at = now(),
    reversed_by_user_id = p_user_id,
    reversal_reason = trim(p_reason),
    reversal_mode = p_mode,
    reversal_adjustment_id = v_adj_id
  WHERE id = v_pay.id;

  IF v_pay.payment_method = 'cash' AND v_pay.cash_session_id IS NOT NULL THEN
    SELECT status INTO v_session_status
    FROM public.hub_cash_sessions
    WHERE id = v_pay.cash_session_id AND clinic_id = p_clinic_id;

    IF v_session_status = 'closed' THEN
      v_post_type := CASE WHEN p_mode = 'refund' THEN 'refund_impact' ELSE 'reversal_impact' END;
      INSERT INTO public.hub_cash_session_post_close_adjustments (
        clinic_id, cash_session_id, payment_id, adjustment_id, adjustment_type,
        amount, reason, effective_date, created_by_user_id
      ) VALUES (
        p_clinic_id,
        v_pay.cash_session_id,
        v_pay.id,
        v_adj_id,
        v_post_type,
        v_pay.amount,
        trim(p_reason),
        COALESCE(p_refund_effective_date, (timezone('America/Sao_Paulo', now()))::date),
        p_user_id
      );
      v_warning := 'Pagamento em dinheiro de caixa já fechado; snapshot da sessão preservado — ajuste pós-fechamento registrado.';
    END IF;
  END IF;

  IF p_mode = 'refund' AND (
    v_pay.payment_method = 'customer_credit' OR p_refund_method = 'customer_credit'
  ) THEN
    IF v_rec.guardian_id IS NULL THEN
      RAISE EXCEPTION
        'Recebível sem tutor — não é possível reembolsar em crédito.'
        USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.hub_customer_credit_movements (
      clinic_id, guardian_id, direction, amount, reason,
      comanda_id, receivable_id, payment_method, cash_session_id, notes, created_by_user_id
    ) VALUES (
      p_clinic_id, v_rec.guardian_id, 'in', v_pay.amount,
      'Reembolso de pagamento: ' || trim(p_reason),
      v_rec.comanda_id, v_pay.receivable_id, NULL, NULL,
      'Estorno/reembolso com crédito do tutor', p_user_id
    );
  END IF;

  v_rec_status := public.hub_recalc_receivable_status(v_pay.receivable_id);

  IF p_mode = 'refund' AND v_rec_status = 'pending' THEN
    v_paid := public.hub_sum_posted_payments(v_pay.receivable_id);
    IF v_paid <= 0.009 THEN
      UPDATE public.hub_receivables
      SET status = 'refunded'
      WHERE id = v_pay.receivable_id
        AND status = 'pending';
      v_rec_status := 'refunded';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'receivable_id', v_pay.receivable_id,
    'receivable_status', v_rec_status,
    'adjustment_id', v_adj_id,
    'reversal_mode', p_mode,
    'warning', v_warning
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hub_reverse_payment(
  uuid, uuid, uuid, text, text, text, date
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_reverse_payment(
  uuid, uuid, uuid, text, text, text, date
) TO service_role;

COMMENT ON FUNCTION public.hub_reverse_payment IS
  'Anula/reembolsa payment com lock receivable→payment (anti race com devolução de linhas).';

NOTIFY pgrst, 'reload schema';
