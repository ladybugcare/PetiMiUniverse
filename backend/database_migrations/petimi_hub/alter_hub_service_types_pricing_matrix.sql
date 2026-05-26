-- PetMi Hub — matriz de precificação opcional por dimensão (porte, período, tipo de consulta, faixa de km).
-- Executar depois de `alter_hub_service_types_pricing.sql`.
-- `cost_amount` / `sale_amount` permanecem como preço de referência na listagem (sincronizados com o menor `sale_amount` dos tiers quando a matriz existe).

ALTER TABLE public.hub_service_types
  ADD COLUMN IF NOT EXISTS pricing_matrix jsonb NULL;

COMMENT ON COLUMN public.hub_service_types.pricing_matrix IS
  'JSON opcional: preços por dimensão num único serviço. Esquema: kind = porte | periodo | consulta | km_banda; ver docs/architecture/HUB_SERVICE_TYPES_PRICING_MATRIX.md. NULL = apenas custo/venda simples.';
