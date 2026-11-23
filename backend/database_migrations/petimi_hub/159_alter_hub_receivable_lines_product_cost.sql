-- PetMi Hub — snapshot de custo unitário na venda de produto (margem/COGS).
-- Pré-requisito: 042_alter_hub_receivable_lines_product.sql.

ALTER TABLE public.hub_receivable_lines
  ADD COLUMN IF NOT EXISTS unit_cost_amount numeric(14, 2);

COMMENT ON COLUMN public.hub_receivable_lines.unit_cost_amount IS
  'Custo unitário do produto no momento da venda (snapshot). NULL em linhas não-produto ou vendas antigas.';

NOTIFY pgrst, 'reload schema';
