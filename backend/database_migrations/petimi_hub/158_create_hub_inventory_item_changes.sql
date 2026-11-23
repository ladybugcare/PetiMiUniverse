-- PetMi Hub — auditoria de alterações no cadastro de itens de estoque.
-- Pré-requisito: 008_create_hub_inventory.sql.

CREATE TABLE IF NOT EXISTS public.hub_inventory_item_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.hub_inventory_items(id) ON DELETE CASCADE,
  field text NOT NULL
    CHECK (field IN (
      'cost_amount',
      'sale_amount',
      'min_stock_qty',
      'active',
      'name',
      'deleted_at'
    )),
  old_value jsonb,
  new_value jsonb,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_inventory_item_changes_item
  ON public.hub_inventory_item_changes (item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hub_inventory_item_changes_clinic
  ON public.hub_inventory_item_changes (clinic_id, created_at DESC);

COMMENT ON TABLE public.hub_inventory_item_changes IS
  'Auditoria de alterações de cadastro/preço do item de estoque. Não é fonte de verdade do saldo.';

NOTIFY pgrst, 'reload schema';
