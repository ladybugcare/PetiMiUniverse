-- PetMi Hub — núcleo financeiro: recebíveis, linhas, ajustes, pagamentos, caixa.
-- Pré-requisitos: clinics, units, hub_guardians, hub_staff_members, hub_service_types, moddatetime.
-- Executar antes de alter_hub_financial_waive_quote_billing.sql (item seguinte no README).

CREATE TABLE IF NOT EXISTS public.hub_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  guardian_id uuid REFERENCES public.hub_guardians(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (source_type IN (
    'grooming_session',
    'encounter',
    'quote',
    'appointment',
    'manual'
  )),
  source_id uuid NOT NULL,
  original_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (original_amount >= 0),
  final_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (final_amount >= 0),
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'partially_paid',
    'paid',
    'cancelled',
    'refunded'
  )),
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_receivables_active_source
  ON public.hub_receivables (clinic_id, source_type, source_id)
  WHERE deleted_at IS NULL AND status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_hub_receivables_clinic_unit_status
  ON public.hub_receivables (clinic_id, unit_id, status)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_receivables IS 'Valor a receber; criado apenas após ação «Gerar cobrança» na UI.';

DROP TRIGGER IF EXISTS update_hub_receivables_updated_at ON public.hub_receivables;
CREATE TRIGGER update_hub_receivables_updated_at
  BEFORE UPDATE ON public.hub_receivables
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

CREATE TABLE IF NOT EXISTS public.hub_receivable_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  receivable_id uuid NOT NULL REFERENCES public.hub_receivables(id) ON DELETE CASCADE,
  line_kind text NOT NULL CHECK (line_kind IN (
    'appointment_service',
    'grooming_extra',
    'quote_line',
    'manual'
  )),
  source_line_id uuid,
  hub_service_type_id uuid REFERENCES public.hub_service_types(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(12, 4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_sale_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (unit_sale_amount >= 0),
  line_total numeric(14, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_receivable_lines_receivable
  ON public.hub_receivable_lines (receivable_id, sort_order);

CREATE TABLE IF NOT EXISTS public.hub_financial_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  receivable_id uuid NOT NULL REFERENCES public.hub_receivables(id) ON DELETE CASCADE,
  adjustment_type text NOT NULL CHECK (adjustment_type IN (
    'discount',
    'credit',
    'write_off',
    'refund',
    'manual_adjustment'
  )),
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  reason text NOT NULL,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_financial_adjustments_receivable
  ON public.hub_financial_adjustments (receivable_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.hub_cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  opened_by_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_balance numeric(14, 2) NOT NULL DEFAULT 0,
  closed_at timestamptz,
  closing_balance numeric(14, 2),
  expected_balance numeric(14, 2),
  difference_amount numeric(14, 2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_cash_sessions_unit_open
  ON public.hub_cash_sessions (unit_id)
  WHERE status = 'open';

DROP TRIGGER IF EXISTS update_hub_cash_sessions_updated_at ON public.hub_cash_sessions;
CREATE TRIGGER update_hub_cash_sessions_updated_at
  BEFORE UPDATE ON public.hub_cash_sessions
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

CREATE TABLE IF NOT EXISTS public.hub_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  cash_session_id uuid NOT NULL REFERENCES public.hub_cash_sessions(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN (
    'withdrawal',
    'deposit',
    'opening_adjustment'
  )),
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  notes text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_cash_movements_session
  ON public.hub_cash_movements (cash_session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.hub_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  receivable_id uuid NOT NULL REFERENCES public.hub_receivables(id) ON DELETE RESTRICT,
  cash_session_id uuid REFERENCES public.hub_cash_sessions(id) ON DELETE SET NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN (
    'pix',
    'cash',
    'credit_card',
    'debit_card',
    'transfer',
    'payment_link'
  )),
  installments smallint NOT NULL DEFAULT 1 CHECK (installments >= 1),
  payment_date timestamptz NOT NULL DEFAULT now(),
  external_reference text,
  notes text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_payments_receivable
  ON public.hub_payments (receivable_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_hub_payments_clinic_date
  ON public.hub_payments (clinic_id, payment_date DESC);

NOTIFY pgrst, 'reload schema';
