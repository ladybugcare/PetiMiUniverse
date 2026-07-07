-- PetMi Hub — Rotas e paradas de Leva e Traz (Fases 2 e 3).
-- Pré-requisitos: clinics, units, hub_staff_members, hub_pets, hub_guardians, hub_appointments, moddatetime.
-- Executar no Supabase SQL Editor.

-- ─── hub_pickup_routes ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hub_pickup_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  route_date date NOT NULL,
  driver_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  vehicle_label text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned',
    'in_progress',
    'done',
    'cancelled'
  )),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_pickup_routes_clinic_date
  ON public.hub_pickup_routes (clinic_id, route_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_pickup_routes_clinic_status
  ON public.hub_pickup_routes (clinic_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_pickup_routes_driver
  ON public.hub_pickup_routes (driver_staff_id, route_date)
  WHERE driver_staff_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE public.hub_pickup_routes IS 'Rota operacional de Leva e Traz por dia/unidade; agrupa paradas (hub_pickup_stops) e atribui motorista.';

DROP TRIGGER IF EXISTS update_hub_pickup_routes_updated_at ON public.hub_pickup_routes;
CREATE TRIGGER update_hub_pickup_routes_updated_at
  BEFORE UPDATE ON public.hub_pickup_routes
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- ─── hub_pickup_stops ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hub_pickup_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_pickup_route_id uuid REFERENCES public.hub_pickup_routes(id) ON DELETE CASCADE,
  hub_appointment_id uuid REFERENCES public.hub_appointments(id) ON DELETE SET NULL,
  pet_id uuid REFERENCES public.hub_pets(id) ON DELETE SET NULL,
  guardian_id uuid REFERENCES public.hub_guardians(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('pickup', 'delivery')),
  address_snapshot jsonb,
  sequence integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'en_route',
    'arrived',
    'completed',
    'failed'
  )),
  planned_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uma perna pickup_route em no máximo uma rota ativa.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_pickup_stops_appointment_active
  ON public.hub_pickup_stops (hub_appointment_id)
  WHERE hub_appointment_id IS NOT NULL AND hub_pickup_route_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_pickup_stops_route
  ON public.hub_pickup_stops (hub_pickup_route_id, sequence)
  WHERE hub_pickup_route_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_pickup_stops_clinic_status
  ON public.hub_pickup_stops (clinic_id, status);

COMMENT ON TABLE public.hub_pickup_stops IS 'Parada individual de uma rota L&T; ligada à perna hub_appointments pickup_route de origem. direction=pickup (coleta antes do serviço) | delivery (entrega após serviço).';

DROP TRIGGER IF EXISTS update_hub_pickup_stops_updated_at ON public.hub_pickup_stops;
CREATE TRIGGER update_hub_pickup_stops_updated_at
  BEFORE UPDATE ON public.hub_pickup_stops
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
