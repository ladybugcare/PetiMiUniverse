-- PetMi Hub — preços especiais (pet / tutor / plano família) com aprovação.
-- Pré-requisitos: clinics, hub_guardians, hub_pets, hub_service_types, hub_appointment_services (015).

CREATE TABLE IF NOT EXISTS public.hub_special_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('pet', 'guardian', 'family_plan')),
  guardian_id uuid REFERENCES public.hub_guardians(id) ON DELETE CASCADE,
  pet_id uuid REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  hub_service_type_id uuid NOT NULL REFERENCES public.hub_service_types(id) ON DELETE CASCADE,
  -- pet/guardian: valor cobrado por ocorrência; family_plan: valor TOTAL do grupo (rateio por pet).
  sale_amount numeric(12, 2) NOT NULL CHECK (sale_amount >= 0),
  cost_amount numeric(12, 2) CHECK (cost_amount IS NULL OR cost_amount >= 0),
  notes text,
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'active', 'inactive')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  -- Snapshot do sale_amount de referência do catálogo quando o acordo foi criado/ajustado.
  catalog_sale_at_set numeric(12, 2),
  -- Se true, ao subir o catálogo o sale_amount sobe pelo mesmo delta (não sobe sozinho se false).
  auto_track_catalog boolean NOT NULL DEFAULT false,
  -- Marcado quando o catálogo mudou e auto_track_catalog = false (aviso para reajustar).
  needs_catalog_review boolean NOT NULL DEFAULT false,
  valid_from date,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_special_prices_scope_refs CHECK (
    (scope = 'pet' AND pet_id IS NOT NULL AND guardian_id IS NOT NULL)
    OR (scope = 'guardian' AND pet_id IS NULL AND guardian_id IS NOT NULL)
    OR (scope = 'family_plan' AND pet_id IS NULL AND guardian_id IS NOT NULL)
  ),
  CONSTRAINT hub_special_prices_valid_range CHECK (
    valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from
  )
);

CREATE TABLE IF NOT EXISTS public.hub_special_price_pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  special_price_id uuid NOT NULL REFERENCES public.hub_special_prices(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (special_price_id, pet_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_special_prices_clinic_status
  ON public.hub_special_prices (clinic_id, status);

CREATE INDEX IF NOT EXISTS idx_hub_special_prices_pet_service
  ON public.hub_special_prices (clinic_id, pet_id, hub_service_type_id)
  WHERE pet_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_special_prices_guardian_service
  ON public.hub_special_prices (clinic_id, guardian_id, hub_service_type_id)
  WHERE guardian_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_special_price_pets_pet
  ON public.hub_special_price_pets (pet_id);

-- Um acordo ativo por pet×serviço (scope pet).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_special_prices_active_pet
  ON public.hub_special_prices (clinic_id, pet_id, hub_service_type_id)
  WHERE status = 'active' AND scope = 'pet';

-- Um acordo ativo por tutor×serviço (scope guardian).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_special_prices_active_guardian
  ON public.hub_special_prices (clinic_id, guardian_id, hub_service_type_id)
  WHERE status = 'active' AND scope = 'guardian';

-- Um plano família ativo por tutor×serviço.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_special_prices_active_family
  ON public.hub_special_prices (clinic_id, guardian_id, hub_service_type_id)
  WHERE status = 'active' AND scope = 'family_plan';

DROP TRIGGER IF EXISTS update_hub_special_prices_updated_at ON public.hub_special_prices;
CREATE TRIGGER update_hub_special_prices_updated_at
  BEFORE UPDATE ON public.hub_special_prices
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Auditoria leve na linha do agendamento.
ALTER TABLE public.hub_appointment_services
  ADD COLUMN IF NOT EXISTS pricing_source text
    CHECK (pricing_source IS NULL OR pricing_source IN (
      'catalog', 'special_pet', 'special_guardian', 'special_family', 'manual'
    ));

ALTER TABLE public.hub_appointment_services
  ADD COLUMN IF NOT EXISTS special_price_id uuid
    REFERENCES public.hub_special_prices(id) ON DELETE SET NULL;

COMMENT ON TABLE public.hub_special_prices IS
  'Acordos de preço por pet, tutor ou plano família (valor total + pets membros). Aprovação por CADMIN/financeiro.';
COMMENT ON TABLE public.hub_special_price_pets IS
  'Pets membros de um plano família (hub_special_prices.scope = family_plan).';
COMMENT ON COLUMN public.hub_special_prices.sale_amount IS
  'Pet/tutor: valor por ocorrência. Plano família: total do grupo (rateio igualitário por pet membro).';
COMMENT ON COLUMN public.hub_special_prices.auto_track_catalog IS
  'Se true, ao aumentar o preço de catálogo o sale_amount sobe pelo mesmo delta em R$.';
COMMENT ON COLUMN public.hub_special_prices.needs_catalog_review IS
  'True quando o catálogo mudou e auto_track_catalog=false — aviso para reajustar manualmente.';

NOTIFY pgrst, 'reload schema';
