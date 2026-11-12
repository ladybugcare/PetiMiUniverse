-- RPCs atômicos do ledger financeiro (FOR UPDATE).
-- Pré-requisitos: 134–138.
-- A aplicação Node também espelha a regra em TS (mocks/testes); em produção preferir estas funções.

CREATE OR REPLACE FUNCTION public.hub_recalc_receivable_status(p_receivable_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_final numeric(14,2);
  v_status text;
  v_paid numeric(14,2);
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

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.hub_payments
  WHERE receivable_id = p_receivable_id
    AND status = 'posted';

  IF v_paid <= 0.009 THEN
    v_next := 'pending';
  ELSIF v_paid >= v_final - 0.009 THEN
    v_next := 'paid';
  ELSE
    v_next := 'partially_paid';
  END IF;

  UPDATE public.hub_receivables SET status = v_next WHERE id = p_receivable_id;
  RETURN v_next;
END;
$$;

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
AS $$
DECLARE
  v_pay public.hub_payments%ROWTYPE;
  v_adj_id uuid;
  v_adj_type text;
  v_session_status text;
  v_warning text := NULL;
  v_rec_status text;
  v_post_type text;
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

  v_rec_status := public.hub_recalc_receivable_status(v_pay.receivable_id);

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

COMMENT ON FUNCTION public.hub_reverse_payment IS
  'Anula (payment_reversal) ou reembolsa (refund) um pagamento posted de forma atômica. Nunca DELETE.';

NOTIFY pgrst, 'reload schema';
