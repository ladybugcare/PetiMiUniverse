-- Serviços cobráveis lançados durante a consulta (grupo clinica).
-- Espelha hub_surgery_services (107). Pedido de exame (PDF) permanece não cobrável.
-- Pré-requisitos: hub_encounters, hub_service_types, hub_appointment_services.

CREATE TABLE IF NOT EXISTS public.hub_encounter_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_encounter_id uuid NOT NULL REFERENCES public.hub_encounters(id) ON DELETE CASCADE,
  hub_service_type_id uuid NOT NULL REFERENCES public.hub_service_types(id) ON DELETE RESTRICT,
  hub_appointment_service_id uuid REFERENCES public.hub_appointment_services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  quantity numeric(12, 4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (unit_amount >= 0),
  pricing_source text NOT NULL DEFAULT 'catalog'
    CHECK (pricing_source IN ('catalog', 'manual', 'special_pet', 'special_guardian', 'special_family')),
  price_status text NOT NULL DEFAULT 'confirmed'
    CHECK (price_status IN ('confirmed', 'pending_approval')),
  proposed_by_user_id uuid,
  approved_by_user_id uuid,
  approved_at timestamptz,
  billing_mode text NOT NULL DEFAULT 'charge'
    CHECK (billing_mode IN ('charge', 'included')),
  notes text,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_encounter_services_encounter
  ON public.hub_encounter_services (hub_encounter_id, sort_order)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_encounter_services_clinic
  ON public.hub_encounter_services (clinic_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_encounter_services_appt_svc
  ON public.hub_encounter_services (hub_appointment_service_id)
  WHERE deleted_at IS NULL AND hub_appointment_service_id IS NOT NULL;

COMMENT ON TABLE public.hub_encounter_services IS
  'Serviços do grupo clinica lançados no atendimento; alimentam a comanda (origin_type encounter_service).';
COMMENT ON COLUMN public.hub_encounter_services.hub_appointment_service_id IS
  'Quando preenchido, a linha adota o snapshot da agenda (dedupe — não gera item novo na comanda).';
COMMENT ON COLUMN public.hub_encounter_services.billing_mode IS
  'charge = entra na comanda; included = registrado clinicamente sem cobrança.';

DROP TRIGGER IF EXISTS update_hub_encounter_services_updated_at ON public.hub_encounter_services;
CREATE TRIGGER update_hub_encounter_services_updated_at
  BEFORE UPDATE ON public.hub_encounter_services
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
