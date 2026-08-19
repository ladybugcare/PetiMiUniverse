-- PetMi Hub — Parada sintética de retorno à clínica (clinic_return).
-- Pré-requisitos: 012c_create_hub_pickup_routes, 083_alter_hub_pickup_stops_in_transit.

ALTER TABLE public.hub_pickup_stops
  DROP CONSTRAINT IF EXISTS hub_pickup_stops_direction_check;

ALTER TABLE public.hub_pickup_stops
  ADD CONSTRAINT hub_pickup_stops_direction_check
  CHECK (direction IN ('pickup', 'delivery', 'clinic_return'));

COMMENT ON COLUMN public.hub_pickup_stops.direction IS
  'pickup = coleta; delivery = entrega; clinic_return = desembarque/retorno à unidade (sem agendamento).';

NOTIFY pgrst, 'reload schema';
