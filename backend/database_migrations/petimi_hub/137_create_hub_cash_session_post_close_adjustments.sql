-- Impactos após fechamento: não mutam expected_balance / difference_amount da sessão.
-- Pré-requisitos: 035 (cash sessions/payments), 134, 135

CREATE TABLE IF NOT EXISTS public.hub_cash_session_post_close_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  cash_session_id uuid NOT NULL REFERENCES public.hub_cash_sessions(id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES public.hub_payments(id) ON DELETE RESTRICT,
  adjustment_id uuid REFERENCES public.hub_financial_adjustments(id) ON DELETE SET NULL,
  adjustment_type text NOT NULL CHECK (adjustment_type IN (
    'reversal_impact',
    'refund_impact',
    'manual_correction'
  )),
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  reason text NOT NULL,
  effective_date date NOT NULL DEFAULT (timezone('America/Sao_Paulo', now()))::date,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_cash_post_close_session
  ON public.hub_cash_session_post_close_adjustments (cash_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hub_cash_post_close_payment
  ON public.hub_cash_session_post_close_adjustments (payment_id)
  WHERE payment_id IS NOT NULL;

COMMENT ON TABLE public.hub_cash_session_post_close_adjustments IS
  'Ajustes após fechamento da gaveta; o snapshot da sessão permanece imutável.';

NOTIFY pgrst, 'reload schema';
