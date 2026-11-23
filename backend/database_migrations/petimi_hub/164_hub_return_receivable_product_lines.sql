-- Etapa A: devolução atômica por linhas + teto financeiro compartilhado.
-- Pré-requisitos: 161 (hub_post_payment), 162 (return events), 163 (reverse fecha refunded).
-- Additivo: colunas com default; RPC nova; grants restritos a service_role.

-- ---------------------------------------------------------------------------
-- 1) Schema: snapshot comercial + acumulado devolvido
-- ---------------------------------------------------------------------------
ALTER TABLE public.hub_receivables
  ADD COLUMN IF NOT EXISTS net_amount_at_sale numeric(14, 2),
  ADD COLUMN IF NOT EXISTS returned_amount numeric(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.hub_receivables
  DROP CONSTRAINT IF EXISTS hub_receivables_returned_amount_check;
ALTER TABLE public.hub_receivables
  ADD CONSTRAINT hub_receivables_returned_amount_check CHECK (returned_amount >= 0);

ALTER TABLE public.hub_receivables
  DROP CONSTRAINT IF EXISTS hub_receivables_net_amount_at_sale_check;
ALTER TABLE public.hub_receivables
  ADD CONSTRAINT hub_receivables_net_amount_at_sale_check
  CHECK (net_amount_at_sale IS NULL OR net_amount_at_sale >= 0);

COMMENT ON COLUMN public.hub_receivables.net_amount_at_sale IS
  'Snapshot do líquido vigente na finalização da venda. Imutável após 1º pagamento ou 1ª devolução.';
COMMENT ON COLUMN public.hub_receivables.returned_amount IS
  'Acumulado comercial devolvido (linhas). final_amount + returned_amount ≈ net_amount_at_sale.';

-- Backfill seguro: sem evidência de devolução, líquido = final atual.
UPDATE public.hub_receivables r
SET net_amount_at_sale = r.final_amount
WHERE r.net_amount_at_sale IS NULL
  AND r.deleted_at IS NULL
  AND COALESCE(r.returned_amount, 0) = 0
  AND NOT EXISTS (
    SELECT 1 FROM public.hub_product_return_events e WHERE e.receivable_id = r.id
  );

-- Com eventos de devolução e returned_amount ainda 0: reconstruir a partir das linhas devolvidas.
UPDATE public.hub_receivables r
SET
  returned_amount = s.ret,
  net_amount_at_sale = COALESCE(r.net_amount_at_sale, round(r.final_amount + s.ret, 2))
FROM (
  SELECT e.receivable_id, round(COALESCE(SUM(l.line_total), 0), 2) AS ret
  FROM public.hub_product_return_events e
  JOIN public.hub_receivable_lines l ON l.id = e.receivable_line_id
  GROUP BY e.receivable_id
) s
WHERE r.id = s.receivable_id
  AND r.deleted_at IS NULL
  AND COALESCE(r.returned_amount, 0) = 0
  AND s.ret > 0;

-- ---------------------------------------------------------------------------
-- 2) Idempotência de pedidos de devolução
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hub_product_return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  receivable_id uuid NOT NULL REFERENCES public.hub_receivables(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  payload_hash text NOT NULL,
  response jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_hub_product_return_requests_clinic_key UNIQUE (clinic_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_hub_product_return_requests_receivable
  ON public.hub_product_return_requests (clinic_id, receivable_id, created_at DESC);

COMMENT ON TABLE public.hub_product_return_requests IS
  'Idempotência atômica de devolução por linhas (clinic_id + idempotency_key).';

-- ---------------------------------------------------------------------------
-- 3) Linhas vinculadas a adjustments de refund (anti double-count por linha)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hub_financial_adjustment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  adjustment_id uuid NOT NULL REFERENCES public.hub_financial_adjustments(id) ON DELETE CASCADE,
  receivable_id uuid NOT NULL REFERENCES public.hub_receivables(id) ON DELETE CASCADE,
  receivable_line_id uuid NOT NULL REFERENCES public.hub_receivable_lines(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_hub_fin_adj_line_once UNIQUE (receivable_line_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_fin_adj_lines_adjustment
  ON public.hub_financial_adjustment_lines (adjustment_id);

COMMENT ON TABLE public.hub_financial_adjustment_lines IS
  'Vínculo adjustment↔linha (refund comercial). UNIQUE por linha impede 2º refund da mesma linha.';

-- ---------------------------------------------------------------------------
-- 4) Helpers de saldo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hub_sum_posted_payments(p_receivable_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT round(COALESCE(SUM(amount), 0), 2)
  FROM public.hub_payments
  WHERE receivable_id = p_receivable_id
    AND status = 'posted';
$$;

CREATE OR REPLACE FUNCTION public.hub_sum_line_refund_adjustments(p_receivable_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  -- Refunds de linha (payment_id null). Não inclui refunds de payment reverse
  -- (já refletidos ao tirar o payment de posted).
  SELECT round(COALESCE(SUM(amount), 0), 2)
  FROM public.hub_financial_adjustments
  WHERE receivable_id = p_receivable_id
    AND adjustment_type = 'refund'
    AND payment_id IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.hub_resolve_net_amount_at_sale(p_rec public.hub_receivables)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_net numeric(14,2);
  v_from_events numeric(14,2);
BEGIN
  IF p_rec.net_amount_at_sale IS NOT NULL THEN
    RETURN round(p_rec.net_amount_at_sale, 2);
  END IF;

  -- Legado sem snapshot: só reconstrói com evidência confiável.
  IF COALESCE(p_rec.returned_amount, 0) = 0 THEN
    SELECT round(COALESCE(SUM(l.line_total), 0), 2) INTO v_from_events
    FROM public.hub_product_return_events e
    JOIN public.hub_receivable_lines l ON l.id = e.receivable_line_id
    WHERE e.receivable_id = p_rec.id;
    IF COALESCE(v_from_events, 0) <= 0.009 THEN
      RETURN round(p_rec.final_amount, 2);
    END IF;
    RETURN round(p_rec.final_amount + v_from_events, 2);
  END IF;

  RETURN round(p_rec.final_amount + COALESCE(p_rec.returned_amount, 0), 2);
END;
$$;

-- Congela snapshot na 1ª mutação financeira relevante (pagamento).
CREATE OR REPLACE FUNCTION public.hub_freeze_net_amount_at_sale(p_receivable_id uuid)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_rec public.hub_receivables%ROWTYPE;
  v_net numeric(14,2);
BEGIN
  SELECT * INTO v_rec FROM public.hub_receivables WHERE id = p_receivable_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebível não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_rec.net_amount_at_sale IS NOT NULL THEN
    RETURN v_rec.net_amount_at_sale;
  END IF;
  v_net := public.hub_resolve_net_amount_at_sale(v_rec);
  UPDATE public.hub_receivables
  SET net_amount_at_sale = v_net
  WHERE id = p_receivable_id
    AND net_amount_at_sale IS NULL;
  RETURN v_net;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Recalc alinhado a final vigente (mantém cancelled/refunded)
-- ---------------------------------------------------------------------------
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

  v_paid := public.hub_sum_posted_payments(p_receivable_id);

  IF v_final <= 0.009 THEN
    -- Líquido zerado: se houve dinheiro ou já havia refund de linha → refunded; senão cancelled.
    IF v_paid > 0.009 OR public.hub_sum_line_refund_adjustments(p_receivable_id) > 0.009 THEN
      v_next := 'refunded';
    ELSE
      v_next := 'cancelled';
    END IF;
  ELSIF v_paid <= 0.009 THEN
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

-- ---------------------------------------------------------------------------
-- 6) hub_post_payment: congela snapshot; grants restritos
-- ---------------------------------------------------------------------------
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
  v_paid numeric(14,2);
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

  -- Congela snapshot do líquido na 1ª entrada de caixa.
  IF v_rec.net_amount_at_sale IS NULL THEN
    PERFORM public.hub_freeze_net_amount_at_sale(p_receivable_id);
    SELECT * INTO v_rec FROM public.hub_receivables WHERE id = p_receivable_id;
  END IF;

  -- Lock payments do recebível (ordem canônica).
  PERFORM 1 FROM public.hub_payments
  WHERE receivable_id = p_receivable_id
  FOR UPDATE;

  v_paid := public.hub_sum_posted_payments(p_receivable_id);
  v_remaining := round(v_rec.final_amount - v_paid, 2);
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

-- ---------------------------------------------------------------------------
-- 7) hub_reverse_payment: bloqueia se houver devolução parcial insegura
-- ---------------------------------------------------------------------------
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

  SELECT * INTO v_rec
  FROM public.hub_receivables
  WHERE id = v_pay.receivable_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebível não encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- Devolução parcial: anular/reembolsar o payment integral gera saldo incoerente.
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

  -- Crédito do tutor na mesma TX quando reembolso de payment feito com customer_credit
  -- ou método de saída é customer_credit.
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

COMMENT ON FUNCTION public.hub_reverse_payment IS
  'Anula ou reembolsa payment posted atomicamente. Bloqueia se devolução parcial tornar o saldo incoerente. Reembolso sem posted fecha como refunded.';

-- ---------------------------------------------------------------------------
-- 8) RPC principal: hub_return_receivable_product_lines
-- ---------------------------------------------------------------------------
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
      SELECT id, status INTO v_open_session, v_session_status
      FROM public.hub_cash_sessions
      WHERE clinic_id = p_clinic_id
        AND unit_id = v_rec.unit_id
        AND status = 'open'
      ORDER BY opened_at DESC
      LIMIT 1;

      IF v_open_session IS NOT NULL THEN
        INSERT INTO public.hub_cash_movements (
          clinic_id, cash_session_id, movement_type, amount, notes, created_by_user_id
        ) VALUES (
          p_clinic_id, v_open_session, 'withdrawal', v_financial_now,
          'Reembolso devolução de produto: ' || v_notes, p_user_id
        );
      ELSE
        v_warning := 'Reembolso em dinheiro registrado sem sessão de caixa aberta — ajuste a gaveta manualmente se necessário.';
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
  'Devolução atômica por linhas: estoque + ajuste comercial/financeiro + crédito/caixa na mesma TX. Idempotente.';

-- Confirma física legado: SECURITY DEFINER + search_path
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
SECURITY DEFINER
SET search_path = public
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

-- ---------------------------------------------------------------------------
-- 9) Grants: somente service_role (backend). Revoga PUBLIC/anon/authenticated.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.hub_post_payment(
  uuid, uuid, numeric, text, uuid, uuid, integer, timestamptz, timestamptz, text,
  uuid, numeric, numeric, text, text, text, uuid, numeric, numeric, numeric
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hub_post_payment(
  uuid, uuid, numeric, text, uuid, uuid, integer, timestamptz, timestamptz, text,
  uuid, numeric, numeric, text, text, text, uuid, numeric, numeric, numeric
) TO service_role;

REVOKE ALL ON FUNCTION public.hub_reverse_payment(
  uuid, uuid, uuid, text, text, text, date
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hub_reverse_payment(
  uuid, uuid, uuid, text, text, text, date
) TO service_role;

REVOKE ALL ON FUNCTION public.hub_confirm_receivable_product_return(
  uuid, uuid, text, text, uuid, uuid[]
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hub_confirm_receivable_product_return(
  uuid, uuid, text, text, uuid, uuid[]
) TO service_role;

REVOKE ALL ON FUNCTION public.hub_return_receivable_product_lines(
  uuid, uuid, uuid, text, text, uuid[], text, date, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hub_return_receivable_product_lines(
  uuid, uuid, uuid, text, text, uuid[], text, date, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.hub_recalc_receivable_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_recalc_receivable_status(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.hub_sum_posted_payments(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_sum_posted_payments(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.hub_sum_line_refund_adjustments(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_sum_line_refund_adjustments(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.hub_freeze_net_amount_at_sale(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_freeze_net_amount_at_sale(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
