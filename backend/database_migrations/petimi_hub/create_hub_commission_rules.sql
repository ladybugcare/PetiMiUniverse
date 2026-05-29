-- PetMi Hub — regras de comissão por tipo de serviço (Fase 3 financeiro).
-- Pré-requisitos: clinics, hub_service_types, moddatetime.

CREATE TABLE IF NOT EXISTS public.hub_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_service_type_id uuid NOT NULL REFERENCES public.hub_service_types(id) ON DELETE CASCADE,
  basis text NOT NULL CHECK (basis IN (
    'percent_of_sale',
    'fixed_per_sale'
  )),
  /** percent_of_sale: 0–100. fixed_per_sale: valor em BRL por linha de recebível (não multiplica pela quantidade). */
  rate numeric(14, 4) NOT NULL CHECK (rate >= 0),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_commission_rules_clinic_service_active
  ON public.hub_commission_rules (clinic_id, hub_service_type_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_commission_rules_clinic
  ON public.hub_commission_rules (clinic_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_commission_rules IS 'Comissão por hub_service_type_id; cálculo sobre linhas de hub_receivable_lines.';

DROP TRIGGER IF EXISTS update_hub_commission_rules_updated_at ON public.hub_commission_rules;
CREATE TRIGGER update_hub_commission_rules_updated_at
  BEFORE UPDATE ON public.hub_commission_rules
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
