-- PetMi Hub — crédito do tutor / adiantamentos (Fase 5).
-- Pré-requisitos: clinics, hub_guardians, hub_comandas (opcional), hub_receivables (opcional), hub_cash_sessions (opcional).

CREATE TABLE IF NOT EXISTS public.hub_customer_credit_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.hub_guardians(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  comanda_id uuid REFERENCES public.hub_comandas(id) ON DELETE SET NULL,
  receivable_id uuid REFERENCES public.hub_receivables(id) ON DELETE SET NULL,
  payment_method text,
  cash_session_id uuid REFERENCES public.hub_cash_sessions(id) ON DELETE SET NULL,
  notes text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_customer_credit_guardian
  ON public.hub_customer_credit_movements (clinic_id, guardian_id, created_at DESC);

COMMENT ON TABLE public.hub_customer_credit_movements IS 'Movimentos de crédito do tutor (adiantamento, aplicação no checkout, estorno).';

-- Permite pagar recebível com saldo de crédito sem novo fluxo de caixa.
ALTER TABLE public.hub_payments
  DROP CONSTRAINT IF EXISTS hub_payments_payment_method_check;

ALTER TABLE public.hub_payments
  ADD CONSTRAINT hub_payments_payment_method_check CHECK (payment_method IN (
    'pix',
    'cash',
    'credit_card',
    'debit_card',
    'transfer',
    'payment_link',
    'customer_credit'
  ));

NOTIFY pgrst, 'reload schema';
