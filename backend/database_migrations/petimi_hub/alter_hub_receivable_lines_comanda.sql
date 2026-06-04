-- PetMi Hub — linhas faturadas ligadas à comanda e ao item operacional.
-- Pré-requisitos: create_hub_comanda_items.sql, create_hub_financial_core.sql.

ALTER TABLE public.hub_receivable_lines
  ADD COLUMN IF NOT EXISTS comanda_id uuid REFERENCES public.hub_comandas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comanda_item_id uuid REFERENCES public.hub_comanda_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pet_id uuid REFERENCES public.hub_pets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hub_receivable_lines_comanda_item
  ON public.hub_receivable_lines (comanda_item_id)
  WHERE comanda_item_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
