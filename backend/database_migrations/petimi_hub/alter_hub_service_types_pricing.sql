-- PetMi Hub — precificação por tipo de serviço (custo e venda; margem é derivada na aplicação).
-- Executar depois de `alter_hub_service_types_catalog.sql`.

ALTER TABLE public.hub_service_types
  ADD COLUMN IF NOT EXISTS cost_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.hub_service_types
  DROP CONSTRAINT IF EXISTS hub_service_types_pricing_nonneg_chk;

ALTER TABLE public.hub_service_types
  ADD CONSTRAINT hub_service_types_pricing_nonneg_chk
  CHECK (cost_amount >= 0 AND sale_amount >= 0);

COMMENT ON COLUMN public.hub_service_types.cost_amount IS 'Valor de custo unitário em BRL (Real brasileiro).';
COMMENT ON COLUMN public.hub_service_types.sale_amount IS 'Valor de venda unitário em BRL (Real brasileiro).';
