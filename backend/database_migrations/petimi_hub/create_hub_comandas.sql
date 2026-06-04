-- PetMi Hub — comandas (consumo operacional por tutor; checkout gera 1..N recebíveis).
-- Pré-requisitos: clinics, units, hub_guardians, moddatetime.

CREATE TABLE IF NOT EXISTS public.hub_comandas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  guardian_id uuid NOT NULL REFERENCES public.hub_guardians(id) ON DELETE RESTRICT,
  origin_type text NOT NULL CHECK (origin_type IN (
    'appointment',
    'grooming_session',
    'encounter',
    'quote',
    'hotel_stay',
    'daycare',
    'transport',
    'package',
    'subscription',
    'manual'
  )),
  origin_id uuid,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada', 'cancelada')),
  subtotal_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  discount_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_comandas_active_origin
  ON public.hub_comandas (clinic_id, origin_type, origin_id)
  WHERE deleted_at IS NULL AND status <> 'cancelada' AND origin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_comandas_clinic_guardian_status
  ON public.hub_comandas (clinic_id, guardian_id, status)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_comandas IS 'Comanda por tutor; itens em hub_comanda_items; liquidação em hub_receivables (1:N).';

DROP TRIGGER IF EXISTS update_hub_comandas_updated_at ON public.hub_comandas;
CREATE TRIGGER update_hub_comandas_updated_at
  BEFORE UPDATE ON public.hub_comandas
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
