-- PetMi Hub — variante de preço em itens de pacote e saldos (ex.: escova própria vs escova nova).
-- Pré-requisitos: 074_create_hub_package_items.sql, 076_alter_hub_customer_package_balances_v2.sql.

ALTER TABLE public.hub_package_items
  ADD COLUMN IF NOT EXISTS pricing_variant jsonb;

COMMENT ON COLUMN public.hub_package_items.pricing_variant IS
  'Opção de preço escolhida na composição do pacote (personalizado, consulta, período, km). Null = sem variante explícita.';

ALTER TABLE public.hub_customer_package_balances
  ADD COLUMN IF NOT EXISTS pricing_variant jsonb;

COMMENT ON COLUMN public.hub_customer_package_balances.pricing_variant IS
  'Variante de preço herdada do item do pacote na compra; usada para casar consumo com a opção correta.';

DROP INDEX IF EXISTS uniq_hub_package_items_package_service;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_package_items_package_service_variant
  ON public.hub_package_items (package_id, hub_service_type_id, COALESCE(pricing_variant::text, ''));

NOTIFY pgrst, 'reload schema';
