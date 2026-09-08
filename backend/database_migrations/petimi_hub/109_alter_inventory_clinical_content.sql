-- Conteúdo por embalagem (ex.: 10 ml por frasco) + snapshot de consumo na medicação clínica.
-- Executar depois de 008 (inventory) e 105 (medication administrations).

ALTER TABLE public.hub_inventory_items
  ADD COLUMN IF NOT EXISTS content_qty numeric(14,4),
  ADD COLUMN IF NOT EXISTS content_unit text;

COMMENT ON COLUMN public.hub_inventory_items.content_qty IS
  'Quantidade de conteúdo em 1 unidade de estoque (ex.: 10 para frasco de 10 ml).';
COMMENT ON COLUMN public.hub_inventory_items.content_unit IS
  'Unidade do conteúdo (ex.: ml, g, Dose). Quando preenchido, a baixa clínica usa esta unidade e converte para unit_label.';

ALTER TABLE public.hub_inventory_items
  DROP CONSTRAINT IF EXISTS hub_inventory_items_content_qty_check;
ALTER TABLE public.hub_inventory_items
  ADD CONSTRAINT hub_inventory_items_content_qty_check
  CHECK (content_qty IS NULL OR content_qty > 0);

ALTER TABLE public.hub_encounter_medication_administrations
  ADD COLUMN IF NOT EXISTS quantity_unit text,
  ADD COLUMN IF NOT EXISTS stock_qty numeric(14,4);

COMMENT ON COLUMN public.hub_encounter_medication_administrations.quantity_unit IS
  'Unidade digitada na consulta (ex.: ml).';
COMMENT ON COLUMN public.hub_encounter_medication_administrations.stock_qty IS
  'Quantidade efetivamente baixada na unidade de estoque do item (após conversão).';
