-- PetMi Hub — linhas de produto em recebíveis e baixa de estoque.
-- Permite adicionar produtos de estoque em cobranças existentes sem criar um PDV avulso.

ALTER TABLE public.hub_receivable_lines
  DROP CONSTRAINT IF EXISTS hub_receivable_lines_line_kind_check;

ALTER TABLE public.hub_receivable_lines
  ADD CONSTRAINT hub_receivable_lines_line_kind_check CHECK (line_kind IN (
    'appointment_service',
    'grooming_extra',
    'quote_line',
    'manual',
    'product'
  ));

ALTER TABLE public.hub_receivable_lines
  ADD COLUMN IF NOT EXISTS hub_inventory_item_id uuid REFERENCES public.hub_inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hub_inventory_lot_id uuid REFERENCES public.hub_inventory_lots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hub_receivable_lines_inventory_item
  ON public.hub_receivable_lines (hub_inventory_item_id)
  WHERE hub_inventory_item_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
