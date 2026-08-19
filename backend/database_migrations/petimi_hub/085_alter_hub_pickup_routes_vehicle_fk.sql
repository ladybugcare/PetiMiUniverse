-- PetMi Hub — Vincula veículo e caixa às rotas/paradas de Leva e Traz.
-- Pré-requisitos: 084_create_hub_pickup_vehicles.sql

-- Adiciona FK de veículo em hub_pickup_routes.
-- vehicle_label permanece para compatibilidade com rotas antigas; será preenchido
-- automaticamente pelo backend quando vehicle_id for fornecido.
ALTER TABLE public.hub_pickup_routes
  ADD COLUMN IF NOT EXISTS vehicle_id uuid
    REFERENCES public.hub_pickup_vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hub_pickup_routes_vehicle
  ON public.hub_pickup_routes (vehicle_id)
  WHERE vehicle_id IS NOT NULL;

COMMENT ON COLUMN public.hub_pickup_routes.vehicle_id IS
  'Veículo cadastrado usado na rota. Quando preenchido, vehicle_label é derivado do nome do veículo.';

-- Adiciona atribuição de caixa de transporte por parada.
ALTER TABLE public.hub_pickup_stops
  ADD COLUMN IF NOT EXISTS cage_id uuid
    REFERENCES public.hub_transport_cages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hub_pickup_stops.cage_id IS
  'Caixa de transporte em que o pet será acomodado nesta parada.';

NOTIFY pgrst, 'reload schema';
