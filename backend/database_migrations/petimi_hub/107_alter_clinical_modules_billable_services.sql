-- Serviços cobráveis em cirurgia e internação (diária, procedimentos, medicação).
-- Pré-requisitos: 025k/025l/025s/025t (hospitalizações/cirurgias), 003 (service_types),
-- 012 (appointments), 015 (appointment_services), 008 (inventory).

-- Cirurgia ↔ slot de agenda (dedupe com hub_appointment_services)
ALTER TABLE public.hub_surgeries
  ADD COLUMN IF NOT EXISTS hub_appointment_id uuid
    REFERENCES public.hub_appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hub_surgeries_appointment
  ON public.hub_surgeries (hub_appointment_id)
  WHERE deleted_at IS NULL AND hub_appointment_id IS NOT NULL;

COMMENT ON COLUMN public.hub_surgeries.hub_appointment_id IS
  'Slot de agenda que originou a cirurgia (quando agendada pela recepção). Usado para dedupe de cobrança.';

-- Linhas cobráveis da cirurgia
CREATE TABLE IF NOT EXISTS public.hub_surgery_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  surgery_id uuid NOT NULL REFERENCES public.hub_surgeries(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_hub_surgery_services_surgery
  ON public.hub_surgery_services (surgery_id, sort_order)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_surgery_services_clinic
  ON public.hub_surgery_services (clinic_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_surgery_services_appt_svc
  ON public.hub_surgery_services (hub_appointment_service_id)
  WHERE deleted_at IS NULL AND hub_appointment_service_id IS NOT NULL;

COMMENT ON TABLE public.hub_surgery_services IS
  'Serviços cobráveis vinculados a uma cirurgia; alimentam a comanda do atendimento.';
COMMENT ON COLUMN public.hub_surgery_services.hub_appointment_service_id IS
  'Quando preenchido, a linha adota o snapshot da agenda (dedupe — não gera item novo na comanda).';
COMMENT ON COLUMN public.hub_surgery_services.billing_mode IS
  'charge = entra na comanda; included = registrado clinicamente sem cobrança.';

DROP TRIGGER IF EXISTS update_hub_surgery_services_updated_at ON public.hub_surgery_services;
CREATE TRIGGER update_hub_surgery_services_updated_at
  BEFORE UPDATE ON public.hub_surgery_services
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Diária padrão da internação
ALTER TABLE public.hub_hospitalizations
  ADD COLUMN IF NOT EXISTS daily_hub_service_type_id uuid
    REFERENCES public.hub_service_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS daily_unit_amount numeric(14, 2)
    CHECK (daily_unit_amount IS NULL OR daily_unit_amount >= 0),
  ADD COLUMN IF NOT EXISTS daily_includes_medication boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hub_hospitalizations.daily_hub_service_type_id IS
  'Serviço de diária (grupo internacao) escolhido na admissão.';
COMMENT ON COLUMN public.hub_hospitalizations.daily_unit_amount IS
  'Snapshot do valor da diária no momento da admissão.';
COMMENT ON COLUMN public.hub_hospitalizations.daily_includes_medication IS
  'Padrão da internação: medicações nascem como included (true) ou charge (false).';

-- Lançamentos cobráveis da internação (medicação, procedimento, material, etc.)
CREATE TABLE IF NOT EXISTS public.hub_hospitalization_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hospitalization_id uuid NOT NULL REFERENCES public.hub_hospitalizations(id) ON DELETE CASCADE,
  charge_kind text NOT NULL DEFAULT 'other'
    CHECK (charge_kind IN ('daily', 'medication', 'procedure', 'material', 'other')),
  hub_service_type_id uuid REFERENCES public.hub_service_types(id) ON DELETE SET NULL,
  hub_inventory_item_id uuid REFERENCES public.hub_inventory_items(id) ON DELETE SET NULL,
  hub_inventory_lot_id uuid REFERENCES public.hub_inventory_lots(id) ON DELETE SET NULL,
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
  service_date date,
  notes text,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_hosp_charges_hosp
  ON public.hub_hospitalization_charges (hospitalization_id, sort_order)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_hosp_charges_clinic
  ON public.hub_hospitalization_charges (clinic_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_hosp_charges_billable
  ON public.hub_hospitalization_charges (hospitalization_id)
  WHERE deleted_at IS NULL AND billing_mode = 'charge' AND price_status = 'confirmed';

COMMENT ON TABLE public.hub_hospitalization_charges IS
  'Itens cobráveis ou inclusos da internação (exceto diária automática, resolvida em runtime).';
COMMENT ON COLUMN public.hub_hospitalization_charges.billing_mode IS
  'charge = entra na comanda; included = registrado clinicamente sem cobrança.';

DROP TRIGGER IF EXISTS update_hub_hospitalization_charges_updated_at
  ON public.hub_hospitalization_charges;
CREATE TRIGGER update_hub_hospitalization_charges_updated_at
  BEFORE UPDATE ON public.hub_hospitalization_charges
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
