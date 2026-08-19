-- Ponto de partida do motorista na rota de Leva e Traz.
-- start_kind = clinic → endereço resolvido da unidade (se houver) ou da clínica
-- start_kind = custom → endereço informado na criação/edição

ALTER TABLE public.hub_pickup_routes
  ADD COLUMN IF NOT EXISTS start_kind text NOT NULL DEFAULT 'clinic';

ALTER TABLE public.hub_pickup_routes
  ADD COLUMN IF NOT EXISTS start_address text;

ALTER TABLE public.hub_pickup_routes
  ADD COLUMN IF NOT EXISTS start_lat double precision;

ALTER TABLE public.hub_pickup_routes
  ADD COLUMN IF NOT EXISTS start_lng double precision;

ALTER TABLE public.hub_pickup_routes
  DROP CONSTRAINT IF EXISTS hub_pickup_routes_start_kind_check;

ALTER TABLE public.hub_pickup_routes
  ADD CONSTRAINT hub_pickup_routes_start_kind_check
  CHECK (start_kind IN ('clinic', 'custom'));

COMMENT ON COLUMN public.hub_pickup_routes.start_kind IS
  'clinic = endereço da clínica/unidade; custom = endereço informado na rota.';
COMMENT ON COLUMN public.hub_pickup_routes.start_address IS
  'Snapshot textual do ponto de partida (exibição e mapa).';
COMMENT ON COLUMN public.hub_pickup_routes.start_lat IS
  'Latitude geocodificada do ponto de partida (opcional).';
COMMENT ON COLUMN public.hub_pickup_routes.start_lng IS
  'Longitude geocodificada do ponto de partida (opcional).';
