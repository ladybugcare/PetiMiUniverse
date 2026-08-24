-- PetMi Hub — Histórico de transições de status das paradas L&T (monitoramento inferido).
-- Pré-requisitos: 012c_create_hub_pickup_routes, clinics, hub_staff_members.

CREATE TABLE IF NOT EXISTS public.hub_pickup_stop_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id            uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_pickup_stop_id   uuid NOT NULL REFERENCES public.hub_pickup_stops(id) ON DELETE CASCADE,
  hub_pickup_route_id  uuid REFERENCES public.hub_pickup_routes(id) ON DELETE SET NULL,
  from_status          text,
  to_status            text NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  actor_staff_id       uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_hub_pickup_stop_events_route_time
  ON public.hub_pickup_stop_events (hub_pickup_route_id, recorded_at)
  WHERE hub_pickup_route_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_pickup_stop_events_stop_time
  ON public.hub_pickup_stop_events (hub_pickup_stop_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_hub_pickup_stop_events_clinic
  ON public.hub_pickup_stop_events (clinic_id, recorded_at);

COMMENT ON TABLE public.hub_pickup_stop_events IS
  'Log de mudanças de status em hub_pickup_stops para histórico operacional (monitoramento sem GPS).';

COMMENT ON COLUMN public.hub_pickup_stop_events.from_status IS
  'Status anterior; null na criação da parada.';

COMMENT ON COLUMN public.hub_pickup_stop_events.to_status IS
  'Novo status após a transição.';

NOTIFY pgrst, 'reload schema';
