-- Fechamento automático de caixa (overdue): flag auto_closed + RPCs atômicos.
-- Pré-requisitos: 035 (hub_cash_sessions / movements / payments), 044 (credit movements), 136 (posting_kind).

ALTER TABLE public.hub_cash_sessions
  ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hub_cash_sessions.auto_closed IS
  'true quando a sessão foi fechada pelo job automático (sem contagem física da gaveta).';

-- Lista sessões open com dia civil de abertura (America/Sao_Paulo) anterior a hoje.
CREATE OR REPLACE FUNCTION public.hub_list_overdue_open_cash_sessions(
  p_clinic_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  clinic_id uuid,
  unit_id uuid,
  opening_balance numeric,
  opened_at timestamptz,
  status text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.id,
    s.clinic_id,
    s.unit_id,
    s.opening_balance,
    s.opened_at,
    s.status
  FROM public.hub_cash_sessions s
  WHERE s.status = 'open'
    AND (p_clinic_id IS NULL OR s.clinic_id = p_clinic_id)
    AND (s.opened_at AT TIME ZONE 'America/Sao_Paulo')::date
        < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
  ORDER BY s.opened_at ASC;
$$;

COMMENT ON FUNCTION public.hub_list_overdue_open_cash_sessions IS
  'Sessões de caixa open com opened_at em dia civil SP anterior a hoje (candidatas ao auto-close).';

-- Fecha sessão de forma atômica (FOR UPDATE). closing_balance NULL = usar expected (auto).
CREATE OR REPLACE FUNCTION public.hub_close_cash_session_atomic(
  p_session_id uuid,
  p_clinic_id uuid,
  p_closing_balance numeric DEFAULT NULL,
  p_auto_closed boolean DEFAULT false,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_sess public.hub_cash_sessions%ROWTYPE;
  v_cash_in numeric(14,2) := 0;
  v_credit_in numeric(14,2) := 0;
  v_deposits numeric(14,2) := 0;
  v_withdrawals numeric(14,2) := 0;
  v_expected numeric(14,2);
  v_closing numeric(14,2);
  v_diff numeric(14,2);
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_sess
  FROM public.hub_cash_sessions
  WHERE id = p_session_id
    AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_sess.status IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'already_closed',
      'cash_session', to_jsonb(v_sess)
    );
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_cash_in
  FROM public.hub_payments
  WHERE clinic_id = p_clinic_id
    AND cash_session_id = p_session_id
    AND payment_method = 'cash'
    AND status = 'posted'
    AND posting_kind = 'operational';

  BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_credit_in
    FROM public.hub_customer_credit_movements
    WHERE clinic_id = p_clinic_id
      AND cash_session_id = p_session_id
      AND direction = 'in'
      AND payment_method = 'cash';
  EXCEPTION
    WHEN undefined_table THEN
      v_credit_in := 0;
  END;

  SELECT
    COALESCE(SUM(CASE WHEN movement_type = 'deposit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN movement_type = 'withdrawal' THEN amount ELSE 0 END), 0)
  INTO v_deposits, v_withdrawals
  FROM public.hub_cash_movements
  WHERE clinic_id = p_clinic_id
    AND cash_session_id = p_session_id;

  v_expected := round((COALESCE(v_sess.opening_balance, 0) + v_cash_in + v_credit_in + v_deposits - v_withdrawals)::numeric, 2);

  IF p_closing_balance IS NULL THEN
    v_closing := v_expected;
    v_diff := 0;
  ELSE
    v_closing := round(p_closing_balance::numeric, 2);
    v_diff := round((v_closing - v_expected)::numeric, 2);
  END IF;

  UPDATE public.hub_cash_sessions
  SET
    status = 'closed',
    closed_at = v_now,
    closing_balance = v_closing,
    expected_balance = v_expected,
    difference_amount = v_diff,
    auto_closed = COALESCE(p_auto_closed, false),
    notes = p_notes
  WHERE id = p_session_id
    AND status = 'open'
  RETURNING * INTO v_sess;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_closed');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'reason', 'closed',
    'cash_session', to_jsonb(v_sess)
  );
END;
$$;

COMMENT ON FUNCTION public.hub_close_cash_session_atomic IS
  'Fecha hub_cash_sessions com FOR UPDATE; closing_balance NULL usa expected (auto-close).';

NOTIFY pgrst, 'reload schema';
