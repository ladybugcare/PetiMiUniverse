-- PetMi Hub — faturamento periódico de séries de agendamento.
-- Pré-requisitos: 013 (hub_appointment_series / hub_appointments / hub_appointment_services), 039 (hub_comandas).

-- ── Regras de cobrança na série ─────────────────────────────────────────────
ALTER TABLE public.hub_appointment_series
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'per_occurrence'
    CHECK (billing_mode IN ('per_occurrence', 'periodic_invoice'));

ALTER TABLE public.hub_appointment_series
  ADD COLUMN IF NOT EXISTS invoice_cycle text
    CHECK (invoice_cycle IS NULL OR invoice_cycle IN ('calendar_month'));

ALTER TABLE public.hub_appointment_series
  ADD COLUMN IF NOT EXISTS invoice_issue_rule text
    CHECK (invoice_issue_rule IS NULL OR invoice_issue_rule IN ('fixed_day', 'first_business_day'));

ALTER TABLE public.hub_appointment_series
  ADD COLUMN IF NOT EXISTS invoice_issue_day int
    CHECK (invoice_issue_day IS NULL OR (invoice_issue_day >= 1 AND invoice_issue_day <= 28));

ALTER TABLE public.hub_appointment_series
  ADD COLUMN IF NOT EXISTS invoice_due_rule text
    CHECK (invoice_due_rule IS NULL OR invoice_due_rule IN ('same_day', 'plus_days', 'fixed_day'));

ALTER TABLE public.hub_appointment_series
  ADD COLUMN IF NOT EXISTS invoice_due_day int
    CHECK (invoice_due_day IS NULL OR (invoice_due_day >= 1 AND invoice_due_day <= 28));

ALTER TABLE public.hub_appointment_series
  ADD COLUMN IF NOT EXISTS invoice_due_plus_days int
    CHECK (invoice_due_plus_days IS NULL OR invoice_due_plus_days >= 0);

COMMENT ON COLUMN public.hub_appointment_series.billing_mode IS
  'per_occurrence: cada dia no caixa; periodic_invoice: uma fatura por ciclo mensal.';

-- ── Faturas da série ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hub_series_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  series_id uuid NOT NULL REFERENCES public.hub_appointment_series(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  comanda_id uuid REFERENCES public.hub_comandas(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_issue'
    CHECK (status IN ('pending_issue', 'issued', 'cancelled')),
  total_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_series_invoices_period_ok CHECK (period_end >= period_start),
  CONSTRAINT uniq_hub_series_invoices_cycle UNIQUE (series_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_hub_series_invoices_clinic_issue
  ON public.hub_series_invoices (clinic_id, issue_date)
  WHERE status = 'pending_issue';

CREATE INDEX IF NOT EXISTS idx_hub_series_invoices_series
  ON public.hub_series_invoices (series_id, status);

CREATE TABLE IF NOT EXISTS public.hub_series_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_invoice_id uuid NOT NULL REFERENCES public.hub_series_invoices(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.hub_appointments(id) ON DELETE CASCADE,
  appointment_service_id uuid REFERENCES public.hub_appointment_services(id) ON DELETE SET NULL,
  sale_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (sale_amount >= 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (series_invoice_id, appointment_id, appointment_service_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_series_invoice_items_appointment
  ON public.hub_series_invoice_items (appointment_id);

CREATE INDEX IF NOT EXISTS idx_hub_series_invoice_items_appt_service
  ON public.hub_series_invoice_items (appointment_service_id)
  WHERE appointment_service_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_hub_series_invoices_updated_at ON public.hub_series_invoices;
CREATE TRIGGER update_hub_series_invoices_updated_at
  BEFORE UPDATE ON public.hub_series_invoices
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Amplia origin_type de comanda para fatura de série.
DO $$
BEGIN
  ALTER TABLE public.hub_comandas DROP CONSTRAINT IF EXISTS hub_comandas_origin_type_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.hub_comandas
  ADD CONSTRAINT hub_comandas_origin_type_check CHECK (origin_type IN (
    'appointment',
    'grooming_session',
    'encounter',
    'quote',
    'boarding_reservation',
    'hotel_stay',
    'daycare',
    'transport',
    'package',
    'subscription',
    'series_invoice',
    'manual'
  ));

COMMENT ON TABLE public.hub_series_invoices IS
  'Fatura periódica de uma série (ciclo mensal): 1 comanda/recebível por período.';
COMMENT ON TABLE public.hub_series_invoice_items IS
  'Ocorrências/serviços cobertos por uma fatura de série.';

NOTIFY pgrst, 'reload schema';
