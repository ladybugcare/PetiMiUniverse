-- PetMi Hub — despesas operacionais por unidade (Fase 2 financeiro).
-- Pré-requisitos: clinics, units, moddatetime (opcional).

CREATE TABLE IF NOT EXISTS public.hub_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  category text NOT NULL CHECK (category IN (
    'supplies',
    'services',
    'utilities',
    'payroll',
    'rent',
    'marketing',
    'other'
  )),
  description text NOT NULL,
  expense_date date NOT NULL DEFAULT (CURRENT_DATE),
  payment_method text CHECK (payment_method IS NULL OR payment_method IN (
    'pix',
    'cash',
    'credit_card',
    'debit_card',
    'transfer',
    'payment_link',
    'other'
  )),
  notes text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_expenses_clinic_unit_date
  ON public.hub_expenses (clinic_id, unit_id, expense_date DESC);

COMMENT ON TABLE public.hub_expenses IS 'Despesas da unidade; visão fluxo de caixa e dashboard gerencial.';

NOTIFY pgrst, 'reload schema';
