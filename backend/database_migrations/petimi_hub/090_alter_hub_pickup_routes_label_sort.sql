-- PetMi Hub — Rótulo e ordem do dia em hub_pickup_routes (fila multi-lote).
-- Pré-requisitos: 012c_create_hub_pickup_routes.

ALTER TABLE public.hub_pickup_routes
  ADD COLUMN IF NOT EXISTS label text;

ALTER TABLE public.hub_pickup_routes
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.hub_pickup_routes.label IS
  'Rótulo operacional do turno/lote (ex.: Manhã, Tarde, Lote 1).';

COMMENT ON COLUMN public.hub_pickup_routes.sort_order IS
  'Ordem da rota na fila do dia do motorista (menor = primeiro).';

CREATE INDEX IF NOT EXISTS idx_hub_pickup_routes_driver_day_order
  ON public.hub_pickup_routes (driver_staff_id, route_date, sort_order)
  WHERE driver_staff_id IS NOT NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
