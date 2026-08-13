-- PetMi Hub — Adiciona status 'in_transit' em hub_pickup_stops.
-- 'in_transit' modela o passo "pet a bordo / a caminho da clínica" em coletas (direction=pickup).
-- Executar no Supabase SQL Editor.

ALTER TABLE public.hub_pickup_stops
  DROP CONSTRAINT IF EXISTS hub_pickup_stops_status_check;

ALTER TABLE public.hub_pickup_stops
  ADD CONSTRAINT hub_pickup_stops_status_check
  CHECK (status IN ('pending', 'en_route', 'arrived', 'in_transit', 'completed', 'failed'));

-- Índice único de parada solta por agendamento (hub_pickup_route_id IS NULL).
-- Garante no máximo uma parada solta ativa por perna.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_pickup_stops_appointment_loose
  ON public.hub_pickup_stops (hub_appointment_id)
  WHERE hub_appointment_id IS NOT NULL AND hub_pickup_route_id IS NULL;

NOTIFY pgrst, 'reload schema';
