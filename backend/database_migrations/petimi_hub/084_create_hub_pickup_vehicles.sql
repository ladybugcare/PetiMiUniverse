-- PetMi Hub — Veículos e caixas de transporte do Leva e Traz.
-- Pré-requisitos: clinics.

-- ─── Veículos ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hub_pickup_vehicles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name            text NOT NULL,
  license_plate   text,
  color           text,
  capacity_animals int NOT NULL DEFAULT 1 CHECK (capacity_animals >= 1),
  has_cages       boolean NOT NULL DEFAULT false,
  active          boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_pickup_vehicles_clinic
  ON public.hub_pickup_vehicles (clinic_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE  public.hub_pickup_vehicles IS 'Frota de veículos usados no Leva e Traz.';
COMMENT ON COLUMN public.hub_pickup_vehicles.capacity_animals IS 'Capacidade total de animais quando não há caixas (has_cages = false).';
COMMENT ON COLUMN public.hub_pickup_vehicles.has_cages IS 'Indica se o veículo usa caixas de transporte; a capacidade real é calculada pela soma das caixas.';

CREATE OR REPLACE FUNCTION public.set_hub_pickup_vehicles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_hub_pickup_vehicles_updated_at
  BEFORE UPDATE ON public.hub_pickup_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_pickup_vehicles_updated_at();

-- ─── Caixas de transporte ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hub_transport_cages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.hub_pickup_vehicles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text,
  capacity   int NOT NULL DEFAULT 1 CHECK (capacity >= 1),
  sort_order int NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_transport_cages_vehicle
  ON public.hub_transport_cages (vehicle_id);

CREATE INDEX IF NOT EXISTS idx_hub_transport_cages_clinic
  ON public.hub_transport_cages (clinic_id);

COMMENT ON TABLE  public.hub_transport_cages IS 'Caixas de transporte vinculadas a um veículo.';
COMMENT ON COLUMN public.hub_transport_cages.capacity IS 'Quantos animais cabem nesta caixa.';
COMMENT ON COLUMN public.hub_transport_cages.color IS 'Cor da caixa em hex ou nome livre (ex.: #3B82F6, "azul").';

CREATE OR REPLACE FUNCTION public.set_hub_transport_cages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_hub_transport_cages_updated_at
  BEFORE UPDATE ON public.hub_transport_cages
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_transport_cages_updated_at();

NOTIFY pgrst, 'reload schema';
