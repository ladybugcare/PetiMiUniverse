-- Escopo do valor cadastrado em serviços Leva e Traz:
--   round_trip = preço ida+volta (cada perna = metade; uma perna = metade)
--   per_leg    = preço por perna (ida+volta = 2×)

ALTER TABLE hub_service_types
  ADD COLUMN IF NOT EXISTS pickup_price_scope text NOT NULL DEFAULT 'round_trip';

ALTER TABLE hub_service_types
  DROP CONSTRAINT IF EXISTS hub_service_types_pickup_price_scope_check;

ALTER TABLE hub_service_types
  ADD CONSTRAINT hub_service_types_pickup_price_scope_check
  CHECK (pickup_price_scope IN ('round_trip', 'per_leg'));

COMMENT ON COLUMN hub_service_types.pickup_price_scope IS
  'Para leva_traz: round_trip = valor cadastrado é ida+volta; per_leg = valor por perna.';
