-- PetMi Hub — cobrança agrupada (lote persistente com link/PDF públicos).
-- Pré-requisitos: hub_guardians, hub_receivables, clinics, units.

CREATE TABLE IF NOT EXISTS public.hub_charge_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.hub_guardians(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  due_date date,
  public_token text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partially_paid', 'paid', 'cancelled')),
  total_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  cancelled_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT hub_charge_bundles_public_token_unique UNIQUE (public_token)
);

CREATE INDEX IF NOT EXISTS idx_hub_charge_bundles_clinic_guardian
  ON public.hub_charge_bundles (clinic_id, guardian_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_charge_bundles_clinic_status
  ON public.hub_charge_bundles (clinic_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_charge_bundles IS
  'Lote de cobranças enviadas ao tutor (PDF + link público únicos). Histórico persistente para baixa posterior.';

CREATE TABLE IF NOT EXISTS public.hub_charge_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.hub_charge_bundles(id) ON DELETE CASCADE,
  receivable_id uuid NOT NULL REFERENCES public.hub_receivables(id) ON DELETE RESTRICT,
  sort_order int NOT NULL DEFAULT 0,
  CONSTRAINT hub_charge_bundle_items_bundle_receivable_unique UNIQUE (bundle_id, receivable_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_charge_bundle_items_receivable
  ON public.hub_charge_bundle_items (receivable_id);

COMMENT ON TABLE public.hub_charge_bundle_items IS
  'Recebíveis incluídos num lote de cobrança agrupada.';

NOTIFY pgrst, 'reload schema';
